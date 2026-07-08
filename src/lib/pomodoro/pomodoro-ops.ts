/**
 * Pomodoro Ops - 番茄钟业务操作
 *
 * 规则：
 * 1. startPomodoro 前检查是否已有 running/paused 会话，有则抛错
 * 2. pause 时写 paused_at
 * 3. resume 时累加 paused_seconds += (now - paused_at)
 * 4. complete/abandon/interrupt 时计算 actual_seconds 并写 ended_at
 * 5. 不依赖 setInterval 作为数据真相
 * 6. 不每秒写 DB（UI 用 calculateRemainingSeconds 派生显示）
 *
 * 时间模型：
 * - started_at: 会话开始时间（真相）
 * - paused_seconds: 累计已暂停秒数（已恢复的部分）
 * - paused_at: 最近一次暂停时间（当前若处于 paused 状态）
 * - 计算 elapsed 时：
 *   running: (now - started_at) - paused_seconds
 *   paused:  (paused_at - started_at) - paused_seconds
 *   ended:   actual_seconds（固定）
 */

import type { PomodoroSessionRow } from "@/types/db";
import {
  createPomodoroSession,
  getActivePomodoroSession,
  updatePomodoroSession,
  completePomodoroSession,
  abandonPomodoroSession,
  interruptPomodoroSession,
  getTodayPomodoroStats,
  listTodayPomodoroSessions,
  type PomodoroTodayStats,
} from "@/lib/repositories/pomodoro-repo";
import { nowIso, todayDate } from "@/lib/id";

// ---------------------------------------------------------------------------
// 错误
// ---------------------------------------------------------------------------

export class PomodoroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PomodoroError";
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export interface StartPomodoroInput {
  task_id?: string | null;
  title: string;
  planned_minutes?: number;
  break_minutes?: number | null;
  source_event_id?: string | null;
}

/**
 * 开始一个新番茄钟
 * - 若已有 running/paused 会话，抛 PomodoroError
 * - 默认 planned_minutes = 25
 */
export async function startPomodoro(
  input: StartPomodoroInput,
): Promise<PomodoroSessionRow> {
  const active = await getActivePomodoroSession();
  if (active) {
    throw new PomodoroError(
      `已有番茄钟进行中（${active.title}），请先完成或放弃`,
    );
  }
  const planned = input.planned_minutes ?? 25;
  return createPomodoroSession({
    task_id: input.task_id ?? null,
    title: input.title,
    planned_minutes: planned,
    break_minutes: input.break_minutes ?? null,
    source_event_id: input.source_event_id ?? null,
  });
}

// ---------------------------------------------------------------------------
// Pause / Resume
// ---------------------------------------------------------------------------

/** 暂停当前 running 会话 */
export async function pausePomodoro(
  sessionId: string,
): Promise<PomodoroSessionRow | null> {
  return updatePomodoroSession(sessionId, {
    status: "paused",
    paused_at: nowIso(),
  });
}

/** 恢复当前 paused 会话，累加 paused_seconds */
export async function resumePomodoro(
  sessionId: string,
): Promise<PomodoroSessionRow | null> {
  const session = await getSessionOrThrow(sessionId);
  if (session.status !== "paused") {
    throw new PomodoroError(`当前会话不是暂停状态（${session.status}），无法恢复`);
  }
  const now = nowIso();
  const pauseDelta =
    (new Date(now).getTime() - new Date(session.paused_at ?? now).getTime()) /
    1000;
  const newPausedSeconds = Math.max(
    0,
    Math.round(session.paused_seconds + pauseDelta),
  );
  return updatePomodoroSession(sessionId, {
    status: "running",
    paused_at: null,
    resumed_at: now,
    paused_seconds: newPausedSeconds,
  });
}

// ---------------------------------------------------------------------------
// Complete / Abandon / Interrupt
// ---------------------------------------------------------------------------

/** 完成番茄钟（计算 actual_seconds） */
export async function completePomodoro(
  sessionId: string,
  note?: string,
): Promise<PomodoroSessionRow | null> {
  const session = await getSessionOrThrow(sessionId);
  const actualSeconds = computeActualSecondsOnEnd(session);
  return completePomodoroSession(sessionId, {
    actual_seconds: actualSeconds,
    completion_note: note ?? null,
  });
}

/** 放弃番茄钟（用户主动放弃，不计为中断） */
export async function abandonPomodoro(
  sessionId: string,
  reason?: string,
): Promise<PomodoroSessionRow | null> {
  const session = await getSessionOrThrow(sessionId);
  const actualSeconds = computeActualSecondsOnEnd(session);
  return abandonPomodoroSession(sessionId, {
    actual_seconds: actualSeconds,
    interruption_reason: reason ?? null,
  });
}

/** 中断番茄钟（外部打断） */
export async function interruptPomodoro(
  sessionId: string,
  reason?: string,
): Promise<PomodoroSessionRow | null> {
  const session = await getSessionOrThrow(sessionId);
  const actualSeconds = computeActualSecondsOnEnd(session);
  return interruptPomodoroSession(sessionId, {
    actual_seconds: actualSeconds,
    interruption_reason: reason ?? null,
  });
}

// ---------------------------------------------------------------------------
// 计时派生（不写库）
// ---------------------------------------------------------------------------

/**
 * 计算当前已专注秒数（不写库）
 * - running: (now - started_at) - paused_seconds
 * - paused:  (paused_at - started_at) - paused_seconds
 * - ended:   actual_seconds（固定）
 */
export function calculateElapsedSeconds(
  session: PomodoroSessionRow,
  nowMs: number = Date.now(),
): number {
  if (
    session.status === "completed" ||
    session.status === "abandoned" ||
    session.status === "interrupted"
  ) {
    return session.actual_seconds;
  }
  const startedMs = new Date(session.started_at).getTime();
  const refMs =
    session.status === "paused" && session.paused_at
      ? new Date(session.paused_at).getTime()
      : nowMs;
  const elapsed = (refMs - startedMs) / 1000 - session.paused_seconds;
  return Math.max(0, Math.floor(elapsed));
}

/**
 * 计算剩余秒数（不写库）
 * - running: planned_minutes*60 - elapsed
 * - paused:  planned_minutes*60 - elapsed（按暂停时刻计算）
 * - ended:   0
 */
export function calculateRemainingSeconds(
  session: PomodoroSessionRow,
  nowMs: number = Date.now(),
): number {
  if (
    session.status === "completed" ||
    session.status === "abandoned" ||
    session.status === "interrupted"
  ) {
    return 0;
  }
  const totalSeconds = session.planned_minutes * 60;
  const elapsed = calculateElapsedSeconds(session, nowMs);
  return Math.max(0, totalSeconds - elapsed);
}

// ---------------------------------------------------------------------------
// AI Context
// ---------------------------------------------------------------------------

export interface PomodoroAIContext {
  completed_pomodoros_today: number;
  focus_minutes_today: number;
  interrupted_pomodoros_today: number;
  abandoned_pomodoros_today: number;
  active_pomodoro_session: {
    id: string;
    title: string;
    status: string;
    planned_minutes: number;
    elapsed_seconds: number;
    remaining_seconds: number;
    task_id: string | null;
  } | null;
  recent_pomodoro_sessions: {
    id: string;
    title: string;
    status: string;
    planned_minutes: number;
    actual_seconds: number;
    started_at: string;
    ended_at: string | null;
    task_id: string | null;
  }[];
}

/** 给 AI Context Loader 用的精简摘要（最多 5 条） */
export async function getPomodoroContextForAI(
  date: string = todayDate(),
): Promise<PomodoroAIContext> {
  const stats: PomodoroTodayStats = await getTodayPomodoroStats(date).catch(
    () => ({
      completed_count: 0,
      focus_seconds: 0,
      focus_minutes: 0,
      interrupted_count: 0,
      abandoned_count: 0,
      active_session: null,
      recent_sessions: [],
    }),
  );

  const active = stats.active_session;
  return {
    completed_pomodoros_today: stats.completed_count,
    focus_minutes_today: stats.focus_minutes,
    interrupted_pomodoros_today: stats.interrupted_count,
    abandoned_pomodoros_today: stats.abandoned_count,
    active_pomodoro_session: active
      ? {
          id: active.id,
          title: active.title,
          status: active.status,
          planned_minutes: active.planned_minutes,
          elapsed_seconds: calculateElapsedSeconds(active),
          remaining_seconds: calculateRemainingSeconds(active),
          task_id: active.task_id,
        }
      : null,
    recent_pomodoro_sessions: stats.recent_sessions.slice(0, 5).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      planned_minutes: s.planned_minutes,
      actual_seconds: s.actual_seconds,
      started_at: s.started_at,
      ended_at: s.ended_at,
      task_id: s.task_id,
    })),
  };
}

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

async function getSessionOrThrow(
  id: string,
): Promise<PomodoroSessionRow> {
  const { getPomodoroSessionById } = await import(
    "@/lib/repositories/pomodoro-repo"
  );
  const session = await getPomodoroSessionById(id);
  if (!session) {
    throw new PomodoroError(`番茄会话不存在：${id}`);
  }
  return session;
}

/** 结束时计算 actual_seconds */
function computeActualSecondsOnEnd(session: PomodoroSessionRow): number {
  if (
    session.status === "completed" ||
    session.status === "abandoned" ||
    session.status === "interrupted"
  ) {
    return session.actual_seconds;
  }
  // running 或 paused 状态被结束
  const startedMs = new Date(session.started_at).getTime();
  const endMs =
    session.status === "paused" && session.paused_at
      ? new Date(session.paused_at).getTime()
      : Date.now();
  const elapsed = (endMs - startedMs) / 1000 - session.paused_seconds;
  return Math.max(0, Math.round(elapsed));
}

// 重导出供 UI 使用
export { listTodayPomodoroSessions, getTodayPomodoroStats };
export type { PomodoroTodayStats };
