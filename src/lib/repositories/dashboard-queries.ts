/**
 * Dashboard 聚合查询
 * 详见 openspec/specs/desktop-ui/spec.md §5.1
 *
 * 一次性返回 Dashboard 所需的真实数据，避免多次往返 SQLite。
 */

import type {
  EventRow,
  TaskRow,
  JournalEntryRow,
  IdeaRow,
  ReminderRow,
} from "@/types/db";
import { query } from "./base";
import { nowIso } from "@/lib/id";

export interface DashboardData {
  /** 今日最重要任务 */
  topOfToday: TaskRow | null;
  /** 今日到期 */
  dueToday: TaskRow[];
  /** 进行中 */
  doing: TaskRow[];
  /** 延期任务（按 delay_count desc） */
  delayed: TaskRow[];
  /** 逾期重点（delay_count >= 2） */
  harsh: TaskRow[];
  /** 今日输入 */
  recentEvents: EventRow[];
  /** 最近日记 */
  recentJournals: JournalEntryRow[];
  /** 最近灵感 */
  recentIdeas: IdeaRow[];
  /** 待触发 reminder（即将到期或已到期） */
  pendingReminders: ReminderRow[];
}

/** 加载 Dashboard 全部数据 */
export async function loadDashboardData(limit = 5): Promise<DashboardData> {
  const todayPrefix = nowIso().slice(0, 10);
  const now = nowIso();

  const [
    topOfTodayRows,
    dueToday,
    doing,
    delayed,
    harsh,
    recentEvents,
    recentJournals,
    recentIdeas,
    pendingReminders,
  ] = await Promise.all([
    query<TaskRow>(
      `SELECT * FROM tasks
       WHERE due_at LIKE ? AND status NOT IN ('done', 'dropped')
         AND priority IN ('high', 'urgent')
       ORDER BY priority DESC, due_at ASC LIMIT 1`,
      [`${todayPrefix}%`],
    ),
    query<TaskRow>(
      `SELECT * FROM tasks WHERE due_at LIKE ? AND status NOT IN ('done', 'dropped')
       ORDER BY due_at ASC`,
      [`${todayPrefix}%`],
    ),
    query<TaskRow>(
      "SELECT * FROM tasks WHERE status = 'doing' ORDER BY updated_at DESC",
    ),
    query<TaskRow>(
      "SELECT * FROM tasks WHERE status = 'delayed' ORDER BY delay_count DESC, updated_at DESC",
    ),
    query<TaskRow>(
      "SELECT * FROM tasks WHERE delay_count >= 2 AND status NOT IN ('done', 'dropped') ORDER BY delay_count DESC, updated_at DESC",
    ),
    query<EventRow>(
      "SELECT * FROM events ORDER BY created_at DESC LIMIT ?",
      [limit],
    ),
    query<JournalEntryRow>(
      "SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT ?",
      [limit],
    ),
    query<IdeaRow>(
      "SELECT * FROM ideas ORDER BY created_at DESC LIMIT ?",
      [limit],
    ),
    query<ReminderRow>(
      "SELECT * FROM reminders WHERE status = 'pending' AND remind_at <= ? ORDER BY remind_at ASC",
      [now],
    ),
  ]);

  return {
    topOfToday: topOfTodayRows[0] ?? null,
    dueToday,
    doing,
    delayed,
    harsh,
    recentEvents,
    recentJournals,
    recentIdeas,
    pendingReminders,
  };
}
