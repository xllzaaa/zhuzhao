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
