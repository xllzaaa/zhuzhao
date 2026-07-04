/**
 * Reminder Repository
 * 详见 openspec/specs/task-supervision/spec.md §3
 */

import type { ReminderRow } from "@/types/db";
import type { ReminderType, ReminderStatus } from "@/types/enums";
import { query, execute } from "./base";
import { ulid, nowIso } from "@/lib/id";

export interface CreateReminderInput {
  task_id?: string | null;
  event_id?: string | null;
  remind_at: string;
  reminder_type: ReminderType;
  status?: ReminderStatus;
  message?: string | null;
}

export async function createReminder(
  input: CreateReminderInput,
): Promise<ReminderRow> {
  const id = ulid();
  const now = nowIso();
  await execute(
    `INSERT INTO reminders (
      id, task_id, event_id, remind_at, reminder_type,
      status, snooze_count, message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      id,
      input.task_id ?? null,
      input.event_id ?? null,
      input.remind_at,
      input.reminder_type,
      input.status ?? "pending",
      input.message ?? null,
      now,
      now,
    ],
  );
  return getById(id) as Promise<ReminderRow>;
}

export async function getById(id: string): Promise<ReminderRow | null> {
  const rows = await query<ReminderRow>(
    "SELECT * FROM reminders WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

/** 待触发（remind_at <= now） */
export async function listPendingDue(): Promise<ReminderRow[]> {
  const now = nowIso();
  return query<ReminderRow>(
    "SELECT * FROM reminders WHERE status = 'pending' AND remind_at <= ? ORDER BY remind_at ASC",
    [now],
  );
}

/** 按 task_id 查询 */
export async function listByTaskId(taskId: string): Promise<ReminderRow[]> {
  return query<ReminderRow>(
    "SELECT * FROM reminders WHERE task_id = ? ORDER BY remind_at DESC",
    [taskId],
  );
}

export async function updateStatus(
  id: string,
  status: ReminderStatus,
): Promise<ReminderRow | null> {
  await execute(
    "UPDATE reminders SET status = ?, updated_at = ? WHERE id = ?",
    [status, nowIso(), id],
  );
  return getById(id);
}

export async function snooze(id: string, newRemindAt: string): Promise<void> {
  await execute(
    "UPDATE reminders SET status = 'snoozed', snooze_count = snooze_count + 1, remind_at = ?, updated_at = ? WHERE id = ?",
    [newRemindAt, nowIso(), id],
  );
}

// ---------------------------------------------------------------------------
// Phase 6: 任务监督闭环相关查询
// ---------------------------------------------------------------------------

/**
 * 查询某时刻之前已 fired 但未回复的 reminder
 * 用于启动恢复：扫描遗留未回复 reminder
 */
export async function listFiredBefore(
  beforeIso: string,
): Promise<ReminderRow[]> {
  return query<ReminderRow>(
    `SELECT * FROM reminders
     WHERE status = 'fired' AND remind_at < ?
     ORDER BY remind_at ASC`,
    [beforeIso],
  );
}

/** 查询某 task 仍处于 pending / fired 状态的 reminder（用于 markDone 时批量关闭） */
export async function listActiveByTaskId(
  taskId: string,
): Promise<ReminderRow[]> {
  return query<ReminderRow>(
    `SELECT * FROM reminders
     WHERE task_id = ? AND status IN ('pending', 'fired')
     ORDER BY remind_at ASC`,
    [taskId],
  );
}

/** 最近触发的 reminder（用于 Dashboard 展示） */
export async function listRecentlyTriggered(
  limit = 5,
): Promise<ReminderRow[]> {
  return query<ReminderRow>(
    `SELECT * FROM reminders
     WHERE status IN ('fired', 'resolved', 'snoozed', 'cancelled')
     ORDER BY updated_at DESC LIMIT ?`,
    [limit],
  );
}

/**
 * 批量关闭 task 的所有 active reminder
 * - markDone 时：标记为 resolved
 * - delayTask 时：标记为 cancelled（由新 reminder 接替）
 */
export async function resolveByTask(
  taskId: string,
  status: "resolved" | "cancelled",
): Promise<number> {
  const result = await execute(
    `UPDATE reminders
     SET status = ?, updated_at = ?
     WHERE task_id = ? AND status IN ('pending', 'fired')`,
    [status, nowIso(), taskId],
  );
  return result;
}

/** 列出指定时刻之后的所有 pending reminder（用于 Dashboard 即将到期展示） */
export async function listPendingAfter(
  afterIso: string,
  limit = 10,
): Promise<ReminderRow[]> {
  return query<ReminderRow>(
    `SELECT * FROM reminders
     WHERE status = 'pending' AND remind_at > ?
     ORDER BY remind_at ASC LIMIT ?`,
    [afterIso, limit],
  );
}
