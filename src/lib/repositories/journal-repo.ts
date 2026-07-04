/**
 * Journal Repository
 * 详见 openspec/specs/journal-memory/spec.md §2
 *
 * 不变量 INV-2：raw_content 必须全量保存；AI 摘要仅为附加字段
 */

import type { JournalEntryRow } from "@/types/db";
import type { Mood } from "@/types/enums";
import { query, execute } from "./base";
import { ulid, nowIso, todayDate } from "@/lib/id";

export interface CreateJournalInput {
  raw_content: string;
  entry_date?: string;
  mood?: Mood;
  tags?: string[];
  topics?: string[];
  project_ids?: string[];
  source_event_id?: string | null;
}

export async function createJournal(
  input: CreateJournalInput,
): Promise<JournalEntryRow> {
  const id = ulid();
  const created_at = nowIso();
  const entry_date = input.entry_date ?? todayDate();
  const mood = input.mood ?? "unknown";
  const tags = input.tags ? JSON.stringify(input.tags) : null;
  const topics = input.topics ? JSON.stringify(input.topics) : null;
  const project_ids = input.project_ids ? JSON.stringify(input.project_ids) : null;

  await execute(
    `INSERT INTO journal_entries (
      id, created_at, entry_date, raw_content, ai_summary, mood,
      tags, topics, project_ids, should_update_profile, source_event_id
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, ?)`,
    [
      id,
      created_at,
      entry_date,
      input.raw_content,
      mood,
      tags,
      topics,
      project_ids,
      input.source_event_id ?? null,
    ],
  );
  return getById(id) as Promise<JournalEntryRow>;
}

export async function getById(id: string): Promise<JournalEntryRow | null> {
  const rows = await query<JournalEntryRow>(
    "SELECT * FROM journal_entries WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function listRecent(limit = 20): Promise<JournalEntryRow[]> {
  return query<JournalEntryRow>(
    "SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

export async function listByDate(date: string): Promise<JournalEntryRow[]> {
  return query<JournalEntryRow>(
    "SELECT * FROM journal_entries WHERE entry_date = ? ORDER BY created_at ASC",
    [date],
  );
}

export interface UpdateJournalAiFieldsInput {
  ai_summary?: string | null;
  mood?: Mood;
  tags?: string[] | null;
  topics?: string[] | null;
  project_ids?: string[] | null;
  should_update_profile?: number;
}

/**
 * 仅更新 AI 字段，绝不更新 raw_content（INV-2）
 */
export async function updateAiFields(
  id: string,
  patch: UpdateJournalAiFieldsInput,
): Promise<JournalEntryRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.ai_summary !== undefined) { sets.push("ai_summary = ?"); params.push(patch.ai_summary); }
  if (patch.mood !== undefined) { sets.push("mood = ?"); params.push(patch.mood); }
  if (patch.tags !== undefined) { sets.push("tags = ?"); params.push(JSON.stringify(patch.tags)); }
  if (patch.topics !== undefined) { sets.push("topics = ?"); params.push(JSON.stringify(patch.topics)); }
  if (patch.project_ids !== undefined) { sets.push("project_ids = ?"); params.push(JSON.stringify(patch.project_ids)); }
  if (patch.should_update_profile !== undefined) { sets.push("should_update_profile = ?"); params.push(patch.should_update_profile); }

  if (sets.length === 0) return getById(id);
  params.push(id);
  await execute(`UPDATE journal_entries SET ${sets.join(", ")} WHERE id = ?`, params);
  return getById(id);
}
