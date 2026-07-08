/**
 * Pomodoro Repository
 *
 * 仅负责 SQL 读写，不包含复杂计时逻辑。
 * 计时派生在 pomodoro-ops.ts 中完成。
 *
 * 不变量：
 * - 同时只能存在一个 running/paused 会话（由 ops 层 startPomodoro 保证）
 * - started_at / paused_seconds / planned_minutes 是时间真相
 * - actual_seconds 仅在 complete/abandon/interrupt 时写入
 */

import type { PomodoroSessionRow } from "@/types/db";
import type { PomodoroStatus, PomodoroMode } from "@/types/enums";
import { query, execute } from "./base";
import { ulid, nowIso, todayDate } from "@/lib/id";

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreatePomodoroInput {
  task_id?: string | null;
  title: string;
  planned_minutes: number;
  break_minutes?: number | null;
  mode?: PomodoroMode;
  source_event_id?: string | null;
  /** started_at 默认 nowIso */
  started_at?: string;
}

export async function createPomodoroSession(
  input: CreatePomodoroInput,
): Promise<PomodoroSessionRow> {
  const id = ulid();
  const now = nowIso();
  const startedAt = input.started_at ?? now;
  // 所有 19 个字段都用 ? 占位符，params 一一对应，避免错位
  await execute(
    `INSERT INTO pomodoro_sessions (
      id, task_id, title, status, planned_minutes, break_minutes, mode,
      actual_seconds, paused_seconds, interruption_count, interruption_reason,
      completion_note, started_at, paused_at, resumed_at, ended_at,
      source_event_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.task_id ?? null,
      input.title,
      "running",
      input.planned_minutes,
      input.break_minutes ?? null,
      input.mode ?? "focus",
      0, // actual_seconds
      0, // paused_seconds
      0, // interruption_count
      null, // interruption_reason
      null, // completion_note
      startedAt,
      null, // paused_at
      null, // resumed_at
      null, // ended_at
      input.source_event_id ?? null,
      now, // created_at
      now, // updated_at
    ],
  );
  return getPomodoroSessionById(id) as Promise<PomodoroSessionRow>;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getPomodoroSessionById(
  id: string,
): Promise<PomodoroSessionRow | null> {
  const rows = await query<PomodoroSessionRow>(
    "SELECT * FROM pomodoro_sessions WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

/** 获取当前活跃会话（running 或 paused），同时只能有一个 */
export async function getActivePomodoroSession(): Promise<PomodoroSessionRow | null> {
  const rows = await query<PomodoroSessionRow>(
    `SELECT * FROM pomodoro_sessions
     WHERE status IN ('running', 'paused')
     ORDER BY started_at DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

/** 今日会话（按 started_at 匹配当天日期） */
export async function listTodayPomodoroSessions(
  date: string = todayDate(),
): Promise<PomodoroSessionRow[]> {
  return query<PomodoroSessionRow>(
    `SELECT * FROM pomodoro_sessions
     WHERE started_at LIKE ?
     ORDER BY started_at ASC`,
    [`${date}%`],
  );
}

/** 最近 N 条会话 */
export async function listRecentPomodoroSessions(
  limit = 20,
): Promise<PomodoroSessionRow[]> {
  return query<PomodoroSessionRow>(
    `SELECT * FROM pomodoro_sessions
     ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
}

/** 按任务查询会话 */
export async function listPomodoroSessionsByTaskId(
  taskId: string,
): Promise<PomodoroSessionRow[]> {
  return query<PomodoroSessionRow>(
    `SELECT * FROM pomodoro_sessions
     WHERE task_id = ?
     ORDER BY started_at DESC`,
    [taskId],
  );
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdatePomodoroInput {
  status?: PomodoroStatus;
  paused_seconds?: number;
  paused_at?: string | null;
  resumed_at?: string | null;
  ended_at?: string | null;
  actual_seconds?: number;
  interruption_count?: number;
  interruption_reason?: string | null;
  completion_note?: string | null;
  title?: string;
}

export async function updatePomodoroSession(
  id: string,
  patch: UpdatePomodoroInput,
): Promise<PomodoroSessionRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.status !== undefined) { sets.push("status = ?"); params.push(patch.status); }
  if (patch.paused_seconds !== undefined) { sets.push("paused_seconds = ?"); params.push(patch.paused_seconds); }
  if (patch.paused_at !== undefined) { sets.push("paused_at = ?"); params.push(patch.paused_at); }
  if (patch.resumed_at !== undefined) { sets.push("resumed_at = ?"); params.push(patch.resumed_at); }
  if (patch.ended_at !== undefined) { sets.push("ended_at = ?"); params.push(patch.ended_at); }
  if (patch.actual_seconds !== undefined) { sets.push("actual_seconds = ?"); params.push(patch.actual_seconds); }
  if (patch.interruption_count !== undefined) { sets.push("interruption_count = ?"); params.push(patch.interruption_count); }
  if (patch.interruption_reason !== undefined) { sets.push("interruption_reason = ?"); params.push(patch.interruption_reason); }
  if (patch.completion_note !== undefined) { sets.push("completion_note = ?"); params.push(patch.completion_note); }
  if (patch.title !== undefined) { sets.push("title = ?"); params.push(patch.title); }

  if (sets.length === 0) return getPomodoroSessionById(id);
  sets.push("updated_at = ?");
  params.push(nowIso());
  params.push(id);

  await execute(`UPDATE pomodoro_sessions SET ${sets.join(", ")} WHERE id = ?`, params);
  return getPomodoroSessionById(id);
}

// ---------------------------------------------------------------------------
// 终态操作：complete / abandon / interrupt
// ---------------------------------------------------------------------------

export async function completePomodoroSession(
  id: string,
  patch: { actual_seconds: number; completion_note?: string | null },
): Promise<PomodoroSessionRow | null> {
  return updatePomodoroSession(id, {
    status: "completed",
    ended_at: nowIso(),
    actual_seconds: patch.actual_seconds,
    completion_note: patch.completion_note ?? null,
  });
}

export async function abandonPomodoroSession(
  id: string,
  patch: { actual_seconds: number; interruption_reason?: string | null },
): Promise<PomodoroSessionRow | null> {
  return updatePomodoroSession(id, {
    status: "abandoned",
    ended_at: nowIso(),
    actual_seconds: patch.actual_seconds,
    interruption_reason: patch.interruption_reason ?? null,
  });
}

export async function interruptPomodoroSession(
  id: string,
  patch: { actual_seconds: number; interruption_reason?: string | null },
): Promise<PomodoroSessionRow | null> {
  return updatePomodoroSession(id, {
    status: "interrupted",
    ended_at: nowIso(),
    actual_seconds: patch.actual_seconds,
    interruption_count: 1,
    interruption_reason: patch.interruption_reason ?? null,
  });
}

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------

export interface PomodoroTodayStats {
  completed_count: number;
  focus_seconds: number;
  focus_minutes: number;
  interrupted_count: number;
  abandoned_count: number;
  active_session: PomodoroSessionRow | null;
  recent_sessions: PomodoroSessionRow[];
}

export async function getTodayPomodoroStats(
  date: string = todayDate(),
): Promise<PomodoroTodayStats> {
  const dayPrefix = `${date}%`;
  const [rows, activeRows] = await Promise.all([
    query<PomodoroSessionRow>(
      `SELECT * FROM pomodoro_sessions
       WHERE started_at LIKE ?
       ORDER BY started_at ASC`,
      [dayPrefix],
    ),
    query<PomodoroSessionRow>(
      `SELECT * FROM pomodoro_sessions
       WHERE status IN ('running', 'paused')
       ORDER BY started_at DESC LIMIT 1`,
    ),
  ]);

  let completed_count = 0;
  let focus_seconds = 0;
  let interrupted_count = 0;
  let abandoned_count = 0;
  for (const r of rows) {
    if (r.status === "completed") {
      completed_count++;
      focus_seconds += r.actual_seconds;
    } else if (r.status === "interrupted") {
      interrupted_count++;
      focus_seconds += r.actual_seconds; // 中断也计入专注时间（已专注的部分）
    } else if (r.status === "abandoned") {
      abandoned_count++;
      focus_seconds += r.actual_seconds;
    }
  }

  return {
    completed_count,
    focus_seconds,
    focus_minutes: Math.round(focus_seconds / 60),
    interrupted_count,
    abandoned_count,
    active_session: activeRows[0] ?? null,
    recent_sessions: rows.slice(-10).reverse(),
  };
}
