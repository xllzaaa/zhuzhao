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

/** 按 source_event_id 查询单个任务（LIMIT 1） */
export async function getTaskBySourceEventId(
  sourceEventId: string,
): Promise<TaskRow | null> {
  const rows = await query<TaskRow>(
    "SELECT * FROM tasks WHERE source_event_id = ? ORDER BY created_at ASC LIMIT 1",
    [sourceEventId],
  );
  return rows[0] ?? null;
}

/** 按 source_event_id 批量查询任务（用于 Inbox 加载时建立 event.id -> TaskRow 映射） */
export async function listBySourceEventIds(
  sourceEventIds: string[],
): Promise<TaskRow[]> {
  if (sourceEventIds.length === 0) return [];
  const placeholders = sourceEventIds.map(() => "?").join(",");
  return query<TaskRow>(
    `SELECT * FROM tasks WHERE source_event_id IN (${placeholders}) ORDER BY created_at ASC`,
    sourceEventIds,
  );
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

// ---------------------------------------------------------------------------
// Phase 6: 任务监督闭环相关查询与操作
// ---------------------------------------------------------------------------

/**
 * 任务状态分组（按 UI 5 分类对齐用户要求 §9）
 * - inbox: 待规划
 * - active: 进行中（planned + scheduled + doing + blocked）
 * - delayed: 延期
 * - done: 已完成
 * - archived: 已归档（dropped）
 *
 * 详见 task-supervision spec §2.1
 */
export type TaskStatusGroup = "inbox" | "active" | "delayed" | "done" | "archived";

export function statusToGroup(status: TaskStatus): TaskStatusGroup {
  switch (status) {
    case "inbox":
      return "inbox";
    case "planned":
    case "scheduled":
    case "doing":
    case "blocked":
      return "active";
    case "delayed":
      return "delayed";
    case "done":
      return "done";
    case "dropped":
      return "archived";
    case "review_needed":
      return "inbox"; // 需人工确认暂归 inbox
    default:
      return "inbox";
  }
}

/** 已逾期（due_at < now，且未完成未归档） */
export async function listOverdue(): Promise<TaskRow[]> {
  const now = nowIso();
  return query<TaskRow>(
    `SELECT * FROM tasks
     WHERE due_at IS NOT NULL AND due_at < ?
       AND status NOT IN ('done', 'dropped')
     ORDER BY due_at ASC`,
    [now],
  );
}

/** 已完成 */
export async function listDone(limit = 50): Promise<TaskRow[]> {
  return query<TaskRow>(
    `SELECT * FROM tasks WHERE status = 'done' ORDER BY completed_at DESC, updated_at DESC LIMIT ?`,
    [limit],
  );
}

/** 已归档（dropped） */
export async function listArchived(limit = 50): Promise<TaskRow[]> {
  return query<TaskRow>(
    `SELECT * FROM tasks WHERE status = 'dropped' ORDER BY updated_at DESC LIMIT ?`,
    [limit],
  );
}

/** inbox 状态 */
export async function listInbox(limit = 50): Promise<TaskRow[]> {
  return query<TaskRow>(
    `SELECT * FROM tasks WHERE status IN ('inbox', 'review_needed') ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

/** active 状态（planned + scheduled + doing + blocked） */
export async function listActive(limit = 50): Promise<TaskRow[]> {
  return query<TaskRow>(
    `SELECT * FROM tasks WHERE status IN ('planned', 'scheduled', 'doing', 'blocked') ORDER BY updated_at DESC LIMIT ?`,
    [limit],
  );
}

/** 全部未完成（用于今日视图过滤等） */
export async function listAllNotDone(limit = 100): Promise<TaskRow[]> {
  return query<TaskRow>(
    `SELECT * FROM tasks WHERE status NOT IN ('done', 'dropped') ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

/** 高 delay_count 任务（用于 Dashboard 监督提醒） */
export async function listHighDelay(limit = 10): Promise<TaskRow[]> {
  return query<TaskRow>(
    `SELECT * FROM tasks WHERE delay_count >= 1 AND status NOT IN ('done', 'dropped')
     ORDER BY delay_count DESC, updated_at DESC LIMIT ?`,
    [limit],
  );
}

/**
 * 标记任务完成（INV-6: delay_count 不重置，保持单调递增历史）
 *
 * @param id 任务 id
 * @param completionNote 完成备注（可选）
 */
export async function markDone(
  id: string,
  completionNote: string | null = null,
): Promise<TaskRow | null> {
  const now = nowIso();
  await execute(
    `UPDATE tasks
     SET status = 'done', completion_note = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
    [completionNote, now, now, id],
  );
  return getById(id);
}

/**
 * 延期任务（只更新 task 字段，不创建新 reminder；reminder 由 task-ops.delayTask 处理）
 *
 * INV-6: delay_count 单调递增
 *
 * @param id 任务 id
 * @param newDueAt 新的 due_at
 * @param failureReason 延期原因（可选，UI 暂未输入时可为空）
 * @param newStatus 新状态，默认 delayed；可传 scheduled 让任务立即重新激活
 */
export async function applyDelay(
  id: string,
  newDueAt: string,
  failureReason: string | null = null,
  newStatus: TaskStatus = "delayed",
): Promise<TaskRow | null> {
  const now = nowIso();
  await execute(
    `UPDATE tasks
     SET due_at = ?, status = ?, delay_count = delay_count + 1,
         failure_reason = ?, updated_at = ?
     WHERE id = ?`,
    [newDueAt, newStatus, failureReason, now, id],
  );
  return getById(id);
}

/**
 * 激活任务（inbox → scheduled；填好 due_at/scheduled_at 后激活）
 */
export async function activateTask(
  id: string,
  dueAt: string | null,
  scheduledAt: string | null = null,
): Promise<TaskRow | null> {
  const now = nowIso();
  await execute(
    `UPDATE tasks
     SET status = 'scheduled', due_at = ?, scheduled_at = ?, updated_at = ?
     WHERE id = ?`,
    [dueAt, scheduledAt, now, id],
  );
  return getById(id);
}
