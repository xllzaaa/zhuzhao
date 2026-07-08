/**
 * Intake Context Loader
 *
 * 加载 Intake 所需的上下文（最近任务、活跃 projects、用户画像、agent_rules、今日番茄摘要）
 *
 * Phase 5 范围：
 * - 仅加载 recentTasks（来自 task-repo）
 * - activeProjects / userProfileBrief / activeRules 暂时为空数组
 *   （相关 repo 尚未实现，Phase 后续会补齐）
 * - 即使某些查询失败也返回空数组，不阻塞 Intake
 *
 * Pomodoro V1 扩展：
 * - 新增 pomodoroBrief（今日番茄摘要 + 活跃会话 + 最近会话）
 * - 任何查询失败都返回空摘要，不阻塞 Intake
 */

import type { TaskRow, ProjectRow, UserProfileRow, AgentRuleRow } from "@/types/db";
import { query } from "@/lib/repositories/base";
import { getPomodoroContextForAI, type PomodoroAIContext } from "@/lib/pomodoro/pomodoro-ops";

export interface IntakeContextData {
  recentTasks: Pick<TaskRow, "id" | "title" | "status" | "priority" | "due_at" | "delay_count">[];
  activeProjects: Pick<ProjectRow, "id" | "name" | "summary">[];
  userProfileBrief: Pick<UserProfileRow, "profile_key" | "profile_value" | "confidence">[];
  activeRules: Pick<AgentRuleRow, "rule_name" | "condition" | "tone">[];
  /** Pomodoro V1：今日番茄摘要（失败时为空摘要） */
  pomodoroBrief: PomodoroAIContext | null;
}

const EMPTY_POMODORO_CONTEXT: PomodoroAIContext = {
  completed_pomodoros_today: 0,
  focus_minutes_today: 0,
  interrupted_pomodoros_today: 0,
  abandoned_pomodoros_today: 0,
  active_pomodoro_session: null,
  recent_pomodoro_sessions: [],
};

/**
 * 加载 Intake 上下文
 * 任何子查询失败 → 返回空数组 / 空摘要，不阻塞 Intake
 */
export async function loadIntakeContext(): Promise<IntakeContextData> {
  const [recentTasks, activeProjects, userProfileBrief, activeRules, pomodoroBrief] =
    await Promise.all([
      loadRecentTasks(),
      loadActiveProjects(),
      loadUserProfileBrief(),
      loadActiveRules(),
      loadPomodoroBrief(),
    ]);

  return { recentTasks, activeProjects, userProfileBrief, activeRules, pomodoroBrief };
}

async function loadRecentTasks(): Promise<IntakeContextData["recentTasks"]> {
  try {
    return await query<TaskRow>(
      `SELECT id, title, status, priority, due_at, delay_count
       FROM tasks
       ORDER BY created_at DESC
       LIMIT 10`,
    );
  } catch {
    return [];
  }
}

async function loadActiveProjects(): Promise<IntakeContextData["activeProjects"]> {
  try {
    return await query<ProjectRow>(
      `SELECT id, name, summary
       FROM projects
       WHERE status = 'active'
       ORDER BY updated_at DESC
       LIMIT 5`,
    );
  } catch {
    return [];
  }
}

async function loadUserProfileBrief(): Promise<IntakeContextData["userProfileBrief"]> {
  try {
    return await query<UserProfileRow>(
      `SELECT profile_key, profile_value, confidence
       FROM user_profiles
       ORDER BY confidence DESC
       LIMIT 8`,
    );
  } catch {
    return [];
  }
}

async function loadActiveRules(): Promise<IntakeContextData["activeRules"]> {
  try {
    return await query<AgentRuleRow>(
      `SELECT rule_name, condition, tone
       FROM agent_rules
       WHERE enabled = 1
       ORDER BY created_at ASC`,
    );
  } catch {
    return [];
  }
}

async function loadPomodoroBrief(): Promise<PomodoroAIContext | null> {
  try {
    return await getPomodoroContextForAI();
  } catch {
    return EMPTY_POMODORO_CONTEXT;
  }
}
