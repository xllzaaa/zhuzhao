/**
 * App Logs Repository (Phase 9)
 *
 * 写入 / 查询 / 清空本地诊断日志。
 *
 * 安全约束：
 * - 不允许写入 api_key / authorization / bearer / token / secret
 * - 调用方传入的 message / meta 必须先脱敏
 * - 不存储完整 LLM 原始响应
 */

import { query, execute } from "./base";
import { ulid, nowIso } from "@/lib/id";

export type LogLevel = "info" | "warn" | "error";

export type LogScope =
  | "intake"
  | "llm"
  | "reminder"
  | "markdown"
  | "settings"
  | "db"
  | "system";

export interface AppLogRow {
  id: string;
  created_at: string;
  level: LogLevel;
  scope: LogScope;
  message: string;
  meta_json: string | null;
}

/** 敏感关键词正则：用于脱敏 message 和 meta */
const SENSITIVE_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  { re: /sk-[A-Za-z0-9_\-]{8,}/g, replacement: "sk-***" },
  { re: /Bearer\s+[A-Za-z0-9_\-\.]+/gi, replacement: "Bearer ***" },
  { re: /(?:api[_-]?key|apikey)\s*[=:]\s*["']?[A-Za-z0-9_\-]{6,}["']?/gi, replacement: "api_key=***" },
  { re: /(?:authorization|auth[_-]?header)\s*[=:]\s*["']?[A-Za-z0-9_\-\.]{6,}["']?/gi, replacement: "authorization=***" },
  { re: /(?:secret|token|password)\s*[=:]\s*["']?[A-Za-z0-9_\-\.]{6,}["']?/gi, replacement: "***" },
];

/** 脱敏字符串中的敏感信息 */
export function sanitizeLogText(input: string): string {
  let out = input;
  for (const { re, replacement } of SENSITIVE_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** 截断过长字符串，避免单条日志过大 */
function truncate(input: string, max = 2000): string {
  if (input.length <= max) return input;
  return input.slice(0, max) + `...[truncated ${input.length - max} chars]`;
}

/** 写一条日志 */
export async function writeLog(
  level: LogLevel,
  scope: LogScope,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const id = ulid();
  const safeMessage = truncate(sanitizeLogText(message));
  const safeMeta = meta ? JSON.stringify(sanitizeMeta(meta)) : null;
  await execute(
    `INSERT INTO app_logs (id, created_at, level, scope, message, meta_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, nowIso(), level, scope, safeMessage, safeMeta],
  );
}

/** 递归脱敏 meta 对象 */
function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "string") {
      out[k] = sanitizeLogText(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitizeMeta(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** 查询最近 N 条日志（按时间倒序） */
export async function listRecent(limit = 200): Promise<AppLogRow[]> {
  return query<AppLogRow>(
    "SELECT id, created_at, level, scope, message, meta_json FROM app_logs ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

/** 按级别过滤查询 */
export async function listByLevel(
  level: LogLevel,
  limit = 200,
): Promise<AppLogRow[]> {
  return query<AppLogRow>(
    "SELECT id, created_at, level, scope, message, meta_json FROM app_logs WHERE level = ? ORDER BY created_at DESC LIMIT ?",
    [level, limit],
  );
}

/** 清空全部日志。返回删除行数。 */
export async function clearAllLogs(): Promise<number> {
  return execute("DELETE FROM app_logs");
}

/** 日志总数 */
export async function countLogs(): Promise<number> {
  const rows = await query<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM app_logs");
  return rows[0]?.cnt ?? 0;
}

/** 便捷函数：info 级别 */
export async function logInfo(
  scope: LogScope,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  return writeLog("info", scope, message, meta);
}

/** 便捷函数：warn 级别 */
export async function logWarn(
  scope: LogScope,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  return writeLog("warn", scope, message, meta);
}

/** 便捷函数：error 级别 */
export async function logError(
  scope: LogScope,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  return writeLog("error", scope, message, meta);
}
