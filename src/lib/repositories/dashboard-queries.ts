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
  ReviewRow,
} from "@/types/db";
import { query } from "./base";
import { nowIso, todayDate } from "@/lib/id";
import {
  getTodayPomodoroStats,
  type PomodoroTodayStats,
} from "./pomodoro-repo";

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
  /**
   * 已逾期任务（due_at < now，未完成未归档）
   * Phase 6 新增：用于 Dashboard 监督区域
   */
  overdue: TaskRow[];
  /**
   * 高 delay_count 任务（delay_count >= 1，未完成未归档）
   * Phase 6 新增：用于 Dashboard 监督区域
   */
  highDelay: TaskRow[];
  /** 今日输入 */
  recentEvents: EventRow[];
  /** 最近日记 */
  recentJournals: JournalEntryRow[];
  /** 最近灵感 */
  recentIdeas: IdeaRow[];
  /** 待触发 reminder（即将到期或已到期） */
  pendingReminders: ReminderRow[];
  /**
   * 最近触发/已处理的 reminder（已 fired/resolved/snoozed/cancelled）
   * Phase 6 新增：用于 Dashboard 展示
   */
  recentlyTriggeredReminders: ReminderRow[];
  /**
   * 今日总结（reviews 表 review_type='daily'）
   * Phase 7 新增：null 表示今日尚未生成
   */
  todaySummary: ReviewRow | null;
  /** Pomodoro V1：今日番茄统计（含活跃会话） */
  pomodoroStats: PomodoroTodayStats;
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
    overdue,
    highDelay,
    recentEvents,
    recentJournals,
    recentIdeas,
    pendingReminders,
    recentlyTriggeredReminders,
    todaySummaryRows,
    pomodoroStats,
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
    // Phase 6: 已逾期（due_at < now，未完成未归档）
    query<TaskRow>(
      `SELECT * FROM tasks
       WHERE due_at IS NOT NULL AND due_at < ?
         AND status NOT IN ('done', 'dropped')
       ORDER BY due_at ASC`,
      [now],
    ),
    // Phase 6: 高 delay_count（>=1）
    query<TaskRow>(
      `SELECT * FROM tasks
       WHERE delay_count >= 1 AND status NOT IN ('done', 'dropped')
       ORDER BY delay_count DESC, updated_at DESC LIMIT 10`,
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
    // Phase 6: 最近触发的 reminder（已 fired/resolved/snoozed/cancelled）
    query<ReminderRow>(
      `SELECT * FROM reminders
       WHERE status IN ('fired', 'resolved', 'snoozed', 'cancelled')
       ORDER BY updated_at DESC LIMIT ?`,
      [limit],
    ),
    // Phase 7: 今日每日总结
    query<ReviewRow>(
      "SELECT * FROM reviews WHERE review_type = 'daily' AND review_date = ? LIMIT 1",
      [todayDate()],
    ),
    // Pomodoro V1：今日番茄统计（失败时返回空统计，不阻塞 Dashboard）
    getTodayPomodoroStats().catch(() => ({
      completed_count: 0,
      focus_seconds: 0,
      focus_minutes: 0,
      interrupted_count: 0,
      abandoned_count: 0,
      active_session: null,
      recent_sessions: [],
    })),
  ]);

  return {
    topOfToday: topOfTodayRows[0] ?? null,
    dueToday,
    doing,
    delayed,
    harsh,
    overdue,
    highDelay,
    recentEvents,
    recentJournals,
    recentIdeas,
    pendingReminders,
    recentlyTriggeredReminders,
    todaySummary: todaySummaryRows[0] ?? null,
    pomodoroStats,
  };
}
