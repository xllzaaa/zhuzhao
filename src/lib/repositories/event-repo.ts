/**
 * Event Repository
 * Event 是用户输入的最原始记录，所有处理的入口。
 * 详见 openspec/specs/zhuzhao-core/spec.md §4.3 events 表
 *
 * 不变量 INV-1：raw_content 永久保存，AI 不可修改
 */

import type { EventRow } from "@/types/db";
import type { EventSource, EventType } from "@/types/enums";
import { query, execute } from "./base";
import { ulid, nowIso } from "@/lib/id";

export interface CreateEventInput {
  source: EventSource;
  raw_content: string;
  event_type?: EventType;
  topic_id?: string | null;
  project_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function createEvent(input: CreateEventInput): Promise<EventRow> {
  const id = ulid();
  const created_at = nowIso();
  const event_type = input.event_type ?? "user_input";
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

  await execute(
    `INSERT INTO events (id, created_at, source, raw_content, event_type, ai_processed, topic_id, project_id, metadata)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      id,
      created_at,
      input.source,
      input.raw_content,
      event_type,
      input.topic_id ?? null,
      input.project_id ?? null,
      metadata,
    ],
  );

  return getById(id) as Promise<EventRow>;
}

export async function getById(id: string): Promise<EventRow | null> {
  const rows = await query<EventRow>("SELECT * FROM events WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function listRecent(limit = 20): Promise<EventRow[]> {
  return query<EventRow>(
    "SELECT * FROM events ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

export async function listToday(limit = 50): Promise<EventRow[]> {
  // ISO 日期前缀匹配（UTC 当日；UI 层可调）
  const todayPrefix = new Date().toISOString().slice(0, 10);
  return query<EventRow>(
    "SELECT * FROM events WHERE created_at LIKE ? ORDER BY created_at DESC LIMIT ?",
    [`${todayPrefix}%`, limit],
  );
}

export async function listUnprocessed(limit = 50): Promise<EventRow[]> {
  return query<EventRow>(
    "SELECT * FROM events WHERE ai_processed = 0 ORDER BY created_at ASC LIMIT ?",
    [limit],
  );
}

export async function markProcessed(
  id: string,
  aiResultId: string,
): Promise<void> {
  await execute(
    "UPDATE events SET ai_processed = 1, ai_result_id = ? WHERE id = ?",
    [aiResultId, id],
  );
}
