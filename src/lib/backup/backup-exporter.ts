/**
 * JSON 备份导出器 (Phase 9)
 *
 * 把 SQLite 全部业务表导出为单个 JSON 文件，方便本地备份。
 *
 * 安全约束：
 * - **不导出 llm_providers.api_key**
 * - 不导出 Authorization / token / secret
 * - 不导出完整 LLM 原始响应（不查 ai_processing_results.summary 中可能包含的字段，但保留 summary）
 * - 仅写入用户在 Settings 中明确选择的目录
 * - 备份失败 App 不崩
 */

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { format } from "date-fns";

import { query } from "@/lib/repositories/base";
import { getMarkdownSettings } from "@/lib/repositories/markdown-settings-repo";
import type { AppLogRow } from "@/lib/repositories/log-repo";
import type {
  EventRow,
  AiProcessingResultRow,
  TaskRow,
  ReminderRow,
  JournalEntryRow,
  IdeaRow,
  ConversationRow,
  ConversationMessageRow,
  TopicRow,
  ProjectRow,
  UserProfileRow,
  AgentRuleRow,
  ReviewRow,
  LlmProviderRow,
} from "@/types/db";

// ---------------------------------------------------------------------------
// 备份类型
// ---------------------------------------------------------------------------

/** 备份文件结构 */
export interface ZhuzhaoBackup {
  metadata: {
    generated_by: "zhuzhao";
    exported_at: string; // ISO
    version: string;
    schema_version: number;
    notes: string;
  };
  data: {
    events: EventRow[];
    ai_processing_results: AiProcessingResultRow[];
    tasks: TaskRow[];
    reminders: ReminderRow[];
    journal_entries: JournalEntryRow[];
    ideas: IdeaRow[];
    conversations: ConversationRow[];
    conversation_messages: ConversationMessageRow[];
    topics: TopicRow[];
    projects: ProjectRow[];
    user_profiles: UserProfileRow[];
    agent_rules: AgentRuleRow[];
    reviews: ReviewRow[];
    /** llm_providers 不含 api_key */
    llm_providers: SafeLlmProviderRow[];
    app_settings: { key: string; value: string; updated_at: string }[];
    app_logs: AppLogRow[];
  };
}

/** 安全的 LlmProvider 行：api_key 和 base_url 永远为 null
 *
 * Phase 9 安全策略：
 * - api_key 必须脱敏（API 密钥不能进入备份文件）
 * - base_url 必须脱敏（私密 LLM 网关地址不能导出，例如内部代理 / 自建 endpoint）
 * - 仅保留 provider 名称 / 类型 / 模型 / 参数等非敏感配置，便于备份恢复后用户重新填写
 */
export interface SafeLlmProviderRow {
  id: string;
  name: string;
  provider_type: string;
  base_url: null; // 始终 null，不导出私密地址
  api_key: null; // 始终 null，不导出 API 密钥
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// 导出逻辑
// ---------------------------------------------------------------------------

const APP_VERSION = "v0.1.0";

/** 收集全部业务数据并构造备份对象 */
export async function buildBackupObject(): Promise<ZhuzhaoBackup> {
  // 并行查询所有表
  const [
    events,
    aiResults,
    tasks,
    reminders,
    journals,
    ideas,
    conversations,
    messages,
    topics,
    projects,
    userProfile,
    agentRules,
    reviews,
    llmProvidersRaw,
    appSettings,
    appLogs,
  ] = await Promise.all([
    query<EventRow>("SELECT * FROM events ORDER BY created_at ASC"),
    query<AiProcessingResultRow>("SELECT * FROM ai_processing_results ORDER BY created_at ASC"),
    query<TaskRow>("SELECT * FROM tasks ORDER BY created_at ASC"),
    query<ReminderRow>("SELECT * FROM reminders ORDER BY created_at ASC"),
    query<JournalEntryRow>("SELECT * FROM journal_entries ORDER BY created_at ASC"),
    query<IdeaRow>("SELECT * FROM ideas ORDER BY created_at ASC"),
    query<ConversationRow>("SELECT * FROM conversations ORDER BY created_at ASC"),
    query<ConversationMessageRow>("SELECT * FROM conversation_messages ORDER BY created_at ASC"),
    query<TopicRow>("SELECT * FROM topics ORDER BY created_at ASC"),
    query<ProjectRow>("SELECT * FROM projects ORDER BY created_at ASC"),
    query<UserProfileRow>("SELECT * FROM user_profiles ORDER BY updated_at ASC"),
    query<AgentRuleRow>("SELECT * FROM agent_rules ORDER BY created_at ASC"),
    query<ReviewRow>("SELECT * FROM reviews ORDER BY review_date DESC"),
    query<LlmProviderRow>("SELECT * FROM llm_providers ORDER BY created_at ASC"),
    query<{ key: string; value: string; updated_at: string }>(
      "SELECT key, value, updated_at FROM app_settings ORDER BY key ASC",
    ),
    query<AppLogRow>("SELECT * FROM app_logs ORDER BY created_at ASC"),
  ]);

  // **安全清洗：llm_providers 必须 strip api_key 和 base_url**
  //
  // - api_key：API 密钥，绝对不能进入备份文件
  // - base_url：私密 LLM 网关地址（如内部代理 / 自建 endpoint），不能导出
  // - 保留 name / provider_type / model 等非敏感字段，便于用户在恢复时识别配置
  const safeLlmProviders: SafeLlmProviderRow[] = llmProvidersRaw.map((p) => ({
    ...p,
    api_key: null,
    base_url: null,
  }));

  // **安全清洗：app_settings 中不应包含 api_key（实际上表里只有 markdown 配置）
  // 仍做一遍过滤，防止未来误存
  const safeAppSettings = appSettings.filter(
    (s) => !/api[_-]?key|secret|token|authorization/i.test(s.key),
  );

  // schema_version
  const schemaRows = await query<{ version: number }>(
    "SELECT MAX(version) AS version FROM schema_version",
  );
  const schemaVersion = schemaRows[0]?.version ?? 0;

  return {
    metadata: {
      generated_by: "zhuzhao",
      exported_at: new Date().toISOString(),
      version: APP_VERSION,
      schema_version: schemaVersion,
      notes:
        "本备份由烛照本地生成，未上传。llm_providers.api_key 和 base_url 已脱敏为 null。",
    },
    data: {
      events,
      ai_processing_results: aiResults,
      tasks,
      reminders,
      journal_entries: journals,
      ideas,
      conversations,
      conversation_messages: messages,
      topics,
      projects,
      user_profiles: userProfile,
      agent_rules: agentRules,
      reviews,
      llm_providers: safeLlmProviders,
      app_settings: safeAppSettings,
      app_logs: appLogs,
    },
  };
}

/** 安全文件名：YYYY-MM-DD_HHmm-zhuzhao-backup.json */
function buildBackupFileName(): string {
  const stamp = format(new Date(), "yyyy-MM-dd_HHmm");
  return `${stamp}-zhuzhao-backup.json`;
}

/**
 * 导出 JSON 备份到 Markdown 导出目录（复用安全写入命令）。
 *
 * 实际写入路径：{exportDir}/Zhuzhao/Backups/{filename}
 *
 * @returns 实际写入的完整路径，失败返回 null
 */
export async function exportJsonBackup(): Promise<string | null> {
  const settings = await getMarkdownSettings();
  if (!settings.exportDir) {
    toast.error("未设置导出目录", {
      description: "请先在 Markdown 导出设置中配置导出目录",
    });
    return null;
  }

  try {
    const backup = await buildBackupObject();
    const json = JSON.stringify(backup, null, 2);

    // 使用 invoke 直接调用 write_export_text_file 做安全写入
    // 文件路径拼接（前端拼好后传给 Rust 校验）
    const sep = settings.exportDir.includes(":") || settings.exportDir.startsWith("/") ? "/" : "\\";
    const safeDir = settings.exportDir.replace(/[\\/]+$/, "");
    const fileName = buildBackupFileName();
    const fullPath = `${safeDir}${sep}Zhuzhao${sep}Backups${sep}${fileName}`;

    const writtenPath = await invoke<string>("write_export_text_file", {
      baseDir: settings.exportDir,
      path: fullPath,
      content: json,
    });

    toast.success("JSON 备份已导出", {
      description: `写入：${fileName}`,
    });
    return writtenPath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error("JSON 备份失败", {
      description: msg,
    });
    return null;
  }
}

/**
 * 导出日志为单独 JSON 文件。
 *
 * @returns 实际写入的完整路径，失败返回 null
 */
export async function exportLogsJson(): Promise<string | null> {
  const settings = await getMarkdownSettings();
  if (!settings.exportDir) {
    toast.error("未设置导出目录");
    return null;
  }

  try {
    const logs = await query<AppLogRow>(
      "SELECT id, created_at, level, scope, message, meta_json FROM app_logs ORDER BY created_at ASC",
    );
    const payload = {
      metadata: {
        generated_by: "zhuzhao",
        exported_at: new Date().toISOString(),
        count: logs.length,
        notes: "本地诊断日志，已脱敏。不包含 api_key / authorization。",
      },
      logs,
    };
    const json = JSON.stringify(payload, null, 2);

    const sep = settings.exportDir.includes(":") || settings.exportDir.startsWith("/") ? "/" : "\\";
    const safeDir = settings.exportDir.replace(/[\\/]+$/, "");
    const stamp = format(new Date(), "yyyy-MM-dd_HHmm");
    const fileName = `${stamp}-zhuzhao-logs.json`;
    const fullPath = `${safeDir}${sep}Zhuzhao${sep}Backups${sep}${fileName}`;

    const writtenPath = await invoke<string>("write_export_text_file", {
      baseDir: settings.exportDir,
      path: fullPath,
      content: json,
    });

    toast.success("日志已导出", {
      description: `共 ${logs.length} 条`,
    });
    return writtenPath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error("日志导出失败", { description: msg });
    return null;
  }
}
