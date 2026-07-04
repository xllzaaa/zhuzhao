/**
 * Idea Repository
 * 详见 openspec/specs/journal-memory/spec.md §3
 */

import type { IdeaRow } from "@/types/db";
import type { IdeaStatus } from "@/types/enums";
import { query, execute } from "./base";
import { ulid, nowIso } from "@/lib/id";

export interface CreateIdeaInput {
  title: string;
  raw_content: string;
  summary?: string | null;
  status?: IdeaStatus;
  tags?: string[];
  topic_id?: string | null;
  project_id?: string | null;
  source_event_id?: string | null;
}

export async function createIdea(input: CreateIdeaInput): Promise<IdeaRow> {
  const id = ulid();
  const now = nowIso();
  const tags = input.tags ? JSON.stringify(input.tags) : null;
  await execute(
    `INSERT INTO ideas (
      id, title, raw_content, summary, status, tags,
      topic_id, project_id, source_event_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.title,
      input.raw_content,
      input.summary ?? null,
      input.status ?? "inbox",
      tags,
      input.topic_id ?? null,
      input.project_id ?? null,
      input.source_event_id ?? null,
      now,
      now,
    ],
  );
  return getById(id) as Promise<IdeaRow>;
}

export async function getById(id: string): Promise<IdeaRow | null> {
  const rows = await query<IdeaRow>("SELECT * FROM ideas WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function listRecent(limit = 20): Promise<IdeaRow[]> {
  return query<IdeaRow>(
    "SELECT * FROM ideas ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

export async function listByStatus(status: IdeaStatus): Promise<IdeaRow[]> {
  return query<IdeaRow>(
    "SELECT * FROM ideas WHERE status = ? ORDER BY created_at DESC",
    [status],
  );
}

export async function deleteIdea(id: string): Promise<void> {
  await execute("DELETE FROM ideas WHERE id = ?", [id]);
}
