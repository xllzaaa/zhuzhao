/**
 * Markdown Exporter (Phase 8)
 *
 * 把 SQLite 数据导出为 Markdown 文件到用户指定目录。
 *
 * 核心原则：
 * - SQLite 是 source of truth，Markdown 仅作为导出视图
 * - 不反向同步，不读取 Markdown 回写 SQLite
 * - 不泄露 API Key / Provider 配置
 * - 只覆盖带 ZHUZHAO_GENERATED_MARKER 的文件，不破坏用户文件
 * - 失败时 App 不崩，返回 Result
 */

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

import type { TaskRow, JournalEntryRow, IdeaRow, ReviewRow } from "@/types/db";
import {
  renderDailyMarkdown,
  renderJournalMarkdown,
  renderTasksMarkdown,
  renderIdeasMarkdown,
  renderIndexMarkdown,
  ZHUZHAO_GENERATED_MARKER,
} from "./renderer";
import {
  getByDate as getReviewByDate,
  listRecent as listRecentReviews,
} from "@/lib/repositories/review-repo";
import { listByDate as listJournalsByDate } from "@/lib/repositories/journal-repo";
import {
  listInbox as listTaskInbox,
  listActive as listTaskActive,
  listDelayed as listTaskDelayed,
  listDone as listTaskDone,
  listOverdue as listTaskOverdue,
} from "@/lib/repositories/task-repo";
import { listRecent as listRecentIdeas } from "@/lib/repositories/idea-repo";
import {
  getMarkdownSettings,
  updateMarkdownSettings,
  recordExportResult,
} from "@/lib/repositories/markdown-settings-repo";
import type { MarkdownSettings } from "@/lib/repositories/markdown-settings-repo";
import { logInfo, logWarn, logError } from "@/lib/repositories/log-repo";

// 重新导出，方便 UI 单点引入
export { getMarkdownSettings };
import { todayDate } from "@/lib/id";

// ---------------------------------------------------------------------------
// Rust 命令封装（Phase 9 起使用安全命令）
// ---------------------------------------------------------------------------

/**
 * 安全写入：仅允许写入 baseDir 之下的文件。
 * 调用 Rust 端 write_export_text_file，由 Rust 端 canonicalize + 敏感目录校验。
 */
async function writeTextFile(
  baseDir: string,
  path: string,
  content: string,
): Promise<string> {
  return invoke<string>("write_export_text_file", { baseDir, path, content });
}

/**
 * 安全读取：仅允许读取 baseDir 之下的文件。
 */
async function readTextFile(
  baseDir: string,
  path: string,
): Promise<string | null> {
  try {
    return await invoke<string>("read_export_text_file", { baseDir, path });
  } catch {
    return null;
  }
}

/**
 * 安全检查：路径是否存在且在 baseDir 之下。
 *
 * - 调用 Rust 端 path_exists_in_dir，由 Rust 校验路径必须落在 baseDir 下
 * - 不在 baseDir 下的路径返回 false（不报错，避免泄露信息）
 */
async function pathExists(baseDir: string, path: string): Promise<boolean> {
  return invoke<boolean>("path_exists_in_dir", { baseDir, path });
}

// ---------------------------------------------------------------------------
// 路径处理
// ---------------------------------------------------------------------------

/** 拼接路径（兼容 Windows / Unix 分隔符） */
function joinPath(...parts: string[]): string {
  const sep = parts[0].includes(":") || parts[0].startsWith("/") ? "/" : "\\";
  return parts
    .map((p, i) => {
      if (i === 0) return p.replace(/[\\/]+$/, "");
      return p.replace(/^[\\/]+|[\\/]+$/g, "");
    })
    .join(sep);
}

// ---------------------------------------------------------------------------
// 安全写入：保护用户文件
// ---------------------------------------------------------------------------

export type SafeWriteResult =
  | { ok: true; path: string; mode: "overwrite" | "created" }
  | { ok: true; path: string; mode: "bypass"; bypassPath: string }
  | { ok: false; error: string };

/**
 * 安全写入 Markdown 文件
 *
 * 规则：
 * 1. 目标文件不存在 → 直接创建
 * 2. 目标文件存在 + 包含 ZHUZHAO_GENERATED_MARKER → 覆盖
 * 3. 目标文件存在 + 不包含标记 → 写旁路文件 .zhuzhao.md，不覆盖用户文件
 *
 * Phase 9：所有写入均经过 Rust 端 validate_export_path 安全校验。
 *
 * @param baseDir 用户在 Settings 中保存的 exportDir（绝对路径）
 * @param filePath 完整目标路径，必须在 baseDir 之下
 * @param content 文件内容
 */
export async function safeWriteGeneratedFile(
  baseDir: string,
  filePath: string,
  content: string,
): Promise<SafeWriteResult> {
  try {
    const exists = await pathExists(baseDir, filePath);
    if (!exists) {
      await writeTextFile(baseDir, filePath, content);
      return { ok: true, path: filePath, mode: "created" };
    }

    const existing = await readTextFile(baseDir, filePath);
    if (existing !== null && existing.includes(ZHUZHAO_GENERATED_MARKER)) {
      await writeTextFile(baseDir, filePath, content);
      return { ok: true, path: filePath, mode: "overwrite" };
    }

    // 用户文件，不覆盖，写旁路
    const bypassPath = filePath.replace(/\.md$/i, ".zhuzhao.md");
    await writeTextFile(baseDir, bypassPath, content);
    return { ok: true, path: filePath, mode: "bypass", bypassPath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// 导出结果类型
// ---------------------------------------------------------------------------

export interface ExportResult {
  success: boolean;
  date?: string;
  files: Array<{ path: string; mode: "overwrite" | "created" | "bypass" }>;
  errors: string[];
}

function emptyResult(): ExportResult {
  return { success: true, files: [], errors: [] };
}

// ---------------------------------------------------------------------------
// 单项导出
// ---------------------------------------------------------------------------

/** 导出某天的 Daily Markdown（含总结、日记、任务、灵感） */
export async function exportDaily(date: string): Promise<ExportResult> {
  const result = emptyResult();
  result.date = date;

  const settings = await getMarkdownSettings();
  if (!settings.enabled || !settings.exportDir) {
    result.success = false;
    result.errors.push("Markdown 导出未启用或导出目录未设置");
    return result;
  }

  try {
    const [review, journals, ideas, tasksDone, tasksDelayed] = await Promise.all([
      getReviewByDate(date),
      listJournalsByDate(date),
      listRecentIdeas(100),
      queryTasksDoneOn(date),
      queryTasksDelayedOn(date),
    ]);

    // 过滤当天的 ideas（按 created_at 日期前缀）
    const dayIdeas = ideas.filter((i) => i.created_at.startsWith(date));

    const md = renderDailyMarkdown({
      date,
      review,
      journals,
      tasksDone,
      tasksDelayed,
      ideas: dayIdeas,
    });

    const filePath = joinPath(settings.exportDir, "Zhuzhao", "Daily", `${date}.md`);
    const writeResult = await safeWriteGeneratedFile(settings.exportDir, filePath, md);
    if (writeResult.ok) {
      result.files.push({ path: writeResult.path, mode: writeResult.mode });
    } else {
      result.success = false;
      result.errors.push(`Daily: ${writeResult.error}`);
    }
  } catch (err) {
    result.success = false;
    result.errors.push(
      `Daily: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return result;
}

/** 导出某天的 Journal Markdown */
export async function exportJournal(date: string): Promise<ExportResult> {
  const result = emptyResult();
  result.date = date;

  const settings = await getMarkdownSettings();
  if (!settings.enabled || !settings.exportDir) {
    result.success = false;
    result.errors.push("Markdown 导出未启用或导出目录未设置");
    return result;
  }

  try {
    const journals = await listJournalsByDate(date);
    const md = renderJournalMarkdown(date, journals);
    const filePath = joinPath(settings.exportDir, "Zhuzhao", "Journal", `${date}.md`);
    const writeResult = await safeWriteGeneratedFile(settings.exportDir, filePath, md);
    if (writeResult.ok) {
      result.files.push({ path: writeResult.path, mode: writeResult.mode });
    } else {
      result.success = false;
      result.errors.push(`Journal: ${writeResult.error}`);
    }
  } catch (err) {
    result.success = false;
    result.errors.push(
      `Journal: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return result;
}

/** 导出全部任务 Markdown */
export async function exportTasks(): Promise<ExportResult> {
  const result = emptyResult();

  const settings = await getMarkdownSettings();
  if (!settings.enabled || !settings.exportDir) {
    result.success = false;
    result.errors.push("Markdown 导出未启用或导出目录未设置");
    return result;
  }

  try {
    const [inbox, active, delayed, done, overdue] = await Promise.all([
      listTaskInbox(200),
      listTaskActive(200),
      listTaskDelayed(),
      listTaskDone(200),
      listTaskOverdue(),
    ]);

    const md = renderTasksMarkdown({ inbox, active, delayed, done, overdue });
    const filePath = joinPath(settings.exportDir, "Zhuzhao", "Tasks", "tasks.md");
    const writeResult = await safeWriteGeneratedFile(settings.exportDir, filePath, md);
    if (writeResult.ok) {
      result.files.push({ path: writeResult.path, mode: writeResult.mode });
    } else {
      result.success = false;
      result.errors.push(`Tasks: ${writeResult.error}`);
    }
  } catch (err) {
    result.success = false;
    result.errors.push(
      `Tasks: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return result;
}

/** 导出全部灵感 Markdown */
export async function exportIdeas(): Promise<ExportResult> {
  const result = emptyResult();

  const settings = await getMarkdownSettings();
  if (!settings.enabled || !settings.exportDir) {
    result.success = false;
    result.errors.push("Markdown 导出未启用或导出目录未设置");
    return result;
  }

  try {
    const ideas = await listRecentIdeas(500);
    const md = renderIdeasMarkdown(ideas);
    const filePath = joinPath(settings.exportDir, "Zhuzhao", "Ideas", "ideas.md");
    const writeResult = await safeWriteGeneratedFile(settings.exportDir, filePath, md);
    if (writeResult.ok) {
      result.files.push({ path: writeResult.path, mode: writeResult.mode });
    } else {
      result.success = false;
      result.errors.push(`Ideas: ${writeResult.error}`);
    }
  } catch (err) {
    result.success = false;
    result.errors.push(
      `Ideas: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return result;
}

/** 导出全部（Daily + Journal + Tasks + Ideas + Index） */
export async function exportAll(date?: string): Promise<ExportResult> {
  const targetDate = date ?? todayDate();
  const result = emptyResult();
  result.date = targetDate;

  const settings = await getMarkdownSettings();
  if (!settings.enabled || !settings.exportDir) {
    result.success = false;
    result.errors.push("Markdown 导出未启用或导出目录未设置");
    return result;
  }

  // 并行执行 4 个导出
  const [daily, journal, tasks, ideas] = await Promise.all([
    exportDaily(targetDate),
    exportJournal(targetDate),
    exportTasks(),
    exportIdeas(),
  ]);

  for (const r of [daily, journal, tasks, ideas]) {
    if (!r.success) result.success = false;
    result.files.push(...r.files);
    result.errors.push(...r.errors);
  }

  // 生成 Index.md
  try {
    const reviews = await listRecentReviews(60);
    const dates = reviews.map((r) => r.review_date).filter(Boolean);
    const uniqueDates = Array.from(new Set(dates)).sort().reverse();
    const indexMd = renderIndexMarkdown(uniqueDates);
    const indexPath = joinPath(settings.exportDir, "Zhuzhao", "Index.md");
    const writeResult = await safeWriteGeneratedFile(settings.exportDir, indexPath, indexMd);
    if (writeResult.ok) {
      result.files.push({ path: writeResult.path, mode: writeResult.mode });
    } else {
      result.success = false;
      result.errors.push(`Index: ${writeResult.error}`);
    }
  } catch (err) {
    result.success = false;
    result.errors.push(
      `Index: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 记录导出结果
  await recordExportResult(
    result.success,
    result.success
      ? `导出 ${result.files.length} 个文件`
      : `失败：${result.errors.join("; ")}`,
  );

  if (result.success) {
    void logInfo("markdown", `导出成功：${result.files.length} 个文件 date=${targetDate}`);
  } else {
    void logWarn("markdown", `导出失败：${result.errors.join("; ")}`, { date: targetDate });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 辅助查询：当天完成 / 当天延期
// ---------------------------------------------------------------------------

async function queryTasksDoneOn(date: string): Promise<TaskRow[]> {
  const all = await listTaskDone(500);
  return all.filter((t) => t.completed_at && t.completed_at.startsWith(date));
}

async function queryTasksDelayedOn(date: string): Promise<TaskRow[]> {
  const all = await listTaskDelayed();
  return all.filter((t) => t.updated_at.startsWith(date));
}

// ---------------------------------------------------------------------------
// UI 辅助：选择目录、打开目录
// ---------------------------------------------------------------------------

/** 弹出系统目录选择对话框 */
export async function pickExportDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择 Markdown 导出目录",
  });
  return typeof selected === "string" ? selected : null;
}

/** 在系统文件管理器中打开导出目录 */
export async function openExportDirectory(): Promise<void> {
  const settings = await getMarkdownSettings();
  if (!settings.exportDir) {
    toast.error("未设置导出目录");
    return;
  }
  try {
    await invoke<void>("open_directory", { path: settings.exportDir });
    void logInfo("markdown", "已打开导出目录");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error("打开目录失败", { description: msg });
    void logError("markdown", `打开导出目录失败：${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 整体导出操作（UI 调用入口）
// ---------------------------------------------------------------------------

export interface ExportOptions {
  /** 是否显示 toast 提示 */
  showToast?: boolean;
}

/** 导出今日全部，附带 toast 提示 */
export async function exportAllWithFeedback(
  date?: string,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const { showToast = true } = options;
  const result = await exportAll(date);

  if (!showToast) return result;

  if (result.success) {
    toast.success("Markdown 导出成功", {
      description: `已导出 ${result.files.length} 个文件到目录`,
    });
  } else {
    toast.error("Markdown 导出失败", {
      description: result.errors.join("\n"),
    });
  }
  return result;
}

/** 更新设置并提示 */
export async function saveMarkdownSettings(
  patch: Partial<MarkdownSettings>,
): Promise<MarkdownSettings> {
  const updated = await updateMarkdownSettings(patch);
  return updated;
}

// ---------------------------------------------------------------------------
// 仅用于类型导出
// ---------------------------------------------------------------------------

export type { MarkdownSettings };
export type { TaskRow, JournalEntryRow, IdeaRow, ReviewRow };
