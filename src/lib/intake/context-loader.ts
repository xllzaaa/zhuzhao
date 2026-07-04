/**
 * Intake Context Loader
 *
 * 加载 Intake 所需的上下文（最近任务、活跃 projects、用户画像、agent_rules）
 *
 * Phase 5 范围：
 * - 仅加载 recentTasks（来自 task-repo）
 * - activeProjects / userProfileBrief / activeRules 暂时为空数组
 *   （相关 repo 尚未实现，Phase 后续会补齐）
 * - 即使某些查询失败也返回空数组，不阻塞 Intake
 */

import type { TaskRow, ProjectRow, UserProfileRow, AgentRuleRow } from "@/types/db";
import { query } from "@/lib/repositories/base";

export interface IntakeContextData {
  recentTasks: Pick<TaskRow, "id" | "title" | "status" | "priority" | "due_at" | "delay_count">[];
  activeProjects: Pick<ProjectRow, "id" | "name" | "summary">[];
  userProfileBrief: Pick<UserProfileRow, "profile_key" | "profile_value" | "confidence">[];
  activeRules: Pick<AgentRuleRow, "rule_name" | "condition" | "tone">[];
}

/**
 * 加载 Intake 上下文
 * 任何子查询失败 → 返回空数组，不阻塞 Intake
 */
export async function loadIntakeContext(): Promise<IntakeContextData> {
  const [recentTasks, activeProjects, userProfileBrief, activeRules] =
    await Promise.all([
      loadRecentTasks(),
      loadActiveProjects(),
      loadUserProfileBrief(),
      loadActiveRules(),
    ]);

  return { recentTasks, activeProjects, userProfileBrief, activeRules };
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
