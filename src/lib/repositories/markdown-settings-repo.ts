/**
 * Markdown 导出设置 Repository (Phase 8)
 *
 * 存储到 app_settings 表（key-value），重启后保留。
 * 不存储 API Key / Provider 配置，仅存储导出配置。
 */

import { query, execute } from "./base";
import { nowIso } from "@/lib/id";

/** Markdown 导出设置 */
export interface MarkdownSettings {
  /** 是否启用 Markdown 导出 */
  enabled: boolean;
  /** 导出目录（绝对路径） */
  exportDir: string;
  /** 是否自动导出（在生成 daily summary 后自动导出） */
  autoExport: boolean;
  /** 最近一次导出时间 ISO */
  lastExportAt: string | null;
  /** 最近一次导出状态 */
  lastExportStatus: "success" | "failed" | null;
  /** 最近一次导出消息（失败原因或成功摘要） */
  lastExportMessage: string | null;
}

const KEYS = {
  enabled: "markdown.export.enabled",
  exportDir: "markdown.export.dir",
  autoExport: "markdown.export.auto",
  lastExportAt: "markdown.export.last_export_at",
  lastExportStatus: "markdown.export.last_export_status",
  lastExportMessage: "markdown.export.last_export_message",
} as const;

async function getValue(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    [key],
  );
  return rows.length > 0 ? rows[0].value : null;
}

async function setValue(key: string, value: string): Promise<void> {
  await execute(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()],
  );
}

/** 读取全部 Markdown 设置（未配置的用默认值） */
export async function getMarkdownSettings(): Promise<MarkdownSettings> {
  const [enabled, exportDir, autoExport, lastAt, lastStatus, lastMsg] = await Promise.all([
    getValue(KEYS.enabled),
    getValue(KEYS.exportDir),
    getValue(KEYS.autoExport),
    getValue(KEYS.lastExportAt),
    getValue(KEYS.lastExportStatus),
    getValue(KEYS.lastExportMessage),
  ]);
  return {
    enabled: enabled === "true",
    exportDir: exportDir ?? "",
    autoExport: autoExport === "true",
    lastExportAt: lastAt,
    lastExportStatus: lastStatus as MarkdownSettings["lastExportStatus"],
    lastExportMessage: lastMsg,
  };
}

/** 更新设置（部分更新） */
export async function updateMarkdownSettings(
  patch: Partial<MarkdownSettings>,
): Promise<MarkdownSettings> {
  const current = await getMarkdownSettings();
  const next: MarkdownSettings = { ...current, ...patch };

  const updates: Array<[string, string]> = [
    [KEYS.enabled, String(next.enabled)],
    [KEYS.exportDir, next.exportDir],
    [KEYS.autoExport, String(next.autoExport)],
  ];
  if (next.lastExportAt !== undefined) {
    updates.push([KEYS.lastExportAt, next.lastExportAt ?? ""]);
  }
  if (next.lastExportStatus !== undefined) {
    updates.push([KEYS.lastExportStatus, next.lastExportStatus ?? ""]);
  }
  if (next.lastExportMessage !== undefined) {
    updates.push([KEYS.lastExportMessage, next.lastExportMessage ?? ""]);
  }
  for (const [k, v] of updates) {
    await setValue(k, v);
  }
  return next;
}

/** 记录一次导出结果 */
export async function recordExportResult(
  success: boolean,
  message: string,
): Promise<void> {
  await updateMarkdownSettings({
    lastExportAt: nowIso(),
    lastExportStatus: success ? "success" : "failed",
    lastExportMessage: message,
  });
}
