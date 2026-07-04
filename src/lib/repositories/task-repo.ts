/**
 * Task Repository
 * 详见 openspec/specs/zhuzhao-core/spec.md §4.3 tasks 表
 * 详见 openspec/specs/task-supervision/spec.md §2 状态机
 *
 * 不变量 INV-6：delay_count 单调递增，不可重置
 */

import type { TaskRow } from "@/types/db";
import type { TaskStatus, TaskPriority } from "@/types/enums";
import { query, execute } from "./base";
import { ulid, nowIso } from "@/lib/id";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_at?: string | null;
  scheduled_at?: string | null;
  estimated_minutes?: number | null;
  project_id?: string | null;
  topic_id?: string | null;
  source_event_id?: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRow> {
  const id = ulid();
  const now = nowIso();
  await execute(
    `INSERT INTO tasks (
      id, title, description, status, priority,
      due_at, scheduled_at, estimated_minutes, actual_minutes,
      project_id, topic_id, source_event_id, delay_count,
      failure_reason, completion_note, created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, NULL, NULL, ?, ?, NULL)`,
    [
      id,
      input.title,
      input.description ?? null,
      input.status ?? "inbox",
      input.priority ?? "medium",
      input.due_at ?? null,
      input.scheduled_at ?? null,
      input.estimated_minutes ?? null,
      input.project_id ?? null,
      input.topic_id ?? null,
      input.source_event_id ?? null,
      now,
      now,
    ],
  );
  return getById(id) as Promise<TaskRow>;
}

export async function getById(id: string): Promise<TaskRow | null> {
  const rows = await query<TaskRow>("SELECT * FROM tasks WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function listByStatus(status: TaskStatus): Promise<TaskRow[]> {
  return query<TaskRow>(
    "SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC",
    [status],
  );
}

/** 今日到期（due_at 是今天） */
export async function listDueToday(): Promise<TaskRow[]> {
  const todayPrefix = new Date().toISOString().slice(0, 10);
  return query<TaskRow>(
    "SELECT * FROM tasks WHERE due_at LIKE ? AND status NOT IN ('done', 'dropped') ORDER BY due_at ASC",
    [`${todayPrefix}%`],
  );
}

/** 进行中 */
export async function listDoing(): Promise<TaskRow[]> {
  return query<TaskRow>(
    "SELECT * FROM tasks WHERE status = 'doing' ORDER BY updated_at DESC",
  );
}

/** 延期（按 delay_count desc） */
export async function listDelayed(): Promise<TaskRow[]> {
  return query<TaskRow>(
    "SELECT * FROM tasks WHERE status = 'delayed' ORDER BY delay_count DESC, updated_at DESC",
  );
}

/** 逾期重点（delay_count >= 2） */
export async function listHarsh(): Promise<TaskRow[]> {
  return query<TaskRow>(
    "SELECT * FROM tasks WHERE delay_count >= 2 AND status NOT IN ('done', 'dropped') ORDER BY delay_count DESC, updated_at DESC",
  );
}

/** 今日最重要：高优先级 + 今日到期 + 未完成 */
export async function getTopOfToday(): Promise<TaskRow | null> {
  const todayPrefix = new Date().toISOString().slice(0, 10);
  const rows = await query<TaskRow>(
    `SELECT * FROM tasks
     WHERE due_at LIKE ? AND status NOT IN ('done', 'dropped')
       AND priority IN ('high', 'urgent')
     ORDER BY priority DESC, due_at ASC LIMIT 1`,
    [`${todayPrefix}%`],
  );
  return rows[0] ?? null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_at?: string | null;
  scheduled_at?: string | null;
  estimated_minutes?: number | null;
  actual_minutes?: number;
  project_id?: string | null;
  topic_id?: string | null;
  delay_count?: number;
  failure_reason?: string | null;
  completion_note?: string | null;
  completed_at?: string | null;
}

export async function updateTask(
  id: string,
  patch: UpdateTaskInput,
): Promise<TaskRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.title !== undefined) { sets.push("title = ?"); params.push(patch.title); }
  if (patch.description !== undefined) { sets.push("description = ?"); params.push(patch.description); }
  if (patch.status !== undefined) { sets.push("status = ?"); params.push(patch.status); }
  if (patch.priority !== undefined) { sets.push("priority = ?"); params.push(patch.priority); }
  if (patch.due_at !== undefined) { sets.push("due_at = ?"); params.push(patch.due_at); }
  if (patch.scheduled_at !== undefined) { sets.push("scheduled_at = ?"); params.push(patch.scheduled_at); }
  if (patch.estimated_minutes !== undefined) { sets.push("estimated_minutes = ?"); params.push(patch.estimated_minutes); }
  if (patch.actual_minutes !== undefined) { sets.push("actual_minutes = ?"); params.push(patch.actual_minutes); }
  if (patch.project_id !== undefined) { sets.push("project_id = ?"); params.push(patch.project_id); }
  if (patch.topic_id !== undefined) { sets.push("topic_id = ?"); params.push(patch.topic_id); }
  if (patch.delay_count !== undefined) { sets.push("delay_count = ?"); params.push(patch.delay_count); }
  if (patch.failure_reason !== undefined) { sets.push("failure_reason = ?"); params.push(patch.failure_reason); }
  if (patch.completion_note !== undefined) { sets.push("completion_note = ?"); params.push(patch.completion_note); }
  if (patch.completed_at !== undefined) { sets.push("completed_at = ?"); params.push(patch.completed_at); }

  if (sets.length === 0) return getById(id);
  sets.push("updated_at = ?");
  params.push(nowIso());
  params.push(id);

  await execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, params);
  return getById(id);
}

export async function deleteTask(id: string): Promise<void> {
  await execute("DELETE FROM tasks WHERE id = ?", [id]);
}
