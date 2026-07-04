/**
 * Intake 主流程：Event 落库后调用 LLM Intake 并落地结果
 *
 * 流程：
 *   1. 加载 Intake 上下文（最近任务 / projects / user profile / agent_rules）
 *   2. 调用 LLM Intake（callIntake）
 *   3. 成功 → executeIntakeResult
 *      失败 → executeIntakeFallback（写 events.metadata.intake_status）
 *   4. 返回 IntakeRunResult（用于 UI 通知）
 *
 * 不变量：
 * - 永不抛异常（任何错误都包装为 IntakeRunResult.error）
 * - App 永不崩溃
 * - 即使 LLM 不可用，Event 也已经落库（用户输入不会丢）
 *
 * Phase 5：
 * - 不真正调度 reminder（仅 INSERT 行）
 * - 不真正写 markdown（仅记意图）
 * - 不真正更新 user_profile（仅记意图）
 */

import type {
  EventRow,
  ConversationRow,
} from "@/types/db";
import { callIntake, type IntakeOutcome } from "@/lib/llm/intake";
import {
  executeIntakeResult,
  executeIntakeFallback,
  type IntakeExecutionResult,
  type FallbackStatus,
} from "@/lib/intake/executor";
import { loadIntakeContext } from "@/lib/intake/context-loader";

// ---------------------------------------------------------------------------
// Run Result
// ---------------------------------------------------------------------------

export interface IntakeRunResult {
  /** 是否成功完成 Intake 并落地 */
  success: boolean;
  /** 关联的 Event id */
  eventId: string;
  /** 成功时的执行结果 */
  execution: IntakeExecutionResult | null;
  /** 失败时的 Intake outcome（含 errorKind / message） */
  outcome: IntakeOutcome | null;
  /** 脱敏的简短描述（用于 UI toast） */
  summary: string;
  /** Fallback 时生成的 assistant 消息 id（仅 Chat 来源 + Intake 失败时有值） */
  fallbackAssistantMessageId: string | null;
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 运行 Intake
 *
 * @param event 已落库的 Event
 * @param conversation 可选：关联会话（用于 assistant 回复）
 * @returns IntakeRunResult，永不抛异常
 */
export async function runIntake(
  event: EventRow,
  conversation: ConversationRow | null = null,
): Promise<IntakeRunResult> {
  try {
    // 1. 加载上下文（任何子查询失败都不阻塞）
    const ctxData = await loadIntakeContext();

    // 2. 调用 LLM Intake
    const outcome = await callIntake({
      event,
      recentTasks: ctxData.recentTasks,
      activeProjects: ctxData.activeProjects,
      userProfileBrief: ctxData.userProfileBrief,
      activeRules: ctxData.activeRules,
    });

    // 3. 分支处理
    if (!outcome.ok) {
      // 失败 → fallback
      const fallbackStatus = mapErrorKindToStatus(
        outcome.errorKind,
        outcome.message,
      );
      const fallbackMsgId = await executeIntakeFallback(
        event,
        fallbackStatus,
        outcome.message,
        outcome.rawResponse,
        conversation,
      );

      return {
        success: false,
        eventId: event.id,
        execution: null,
        outcome,
        summary: describeFailure(outcome),
        fallbackAssistantMessageId: fallbackMsgId,
      };
    }

    // 成功 → 落地
    // risk_level='high' 时禁止自动执行（spec §8）
    // 使用独立的 'risk_high' 状态，不复用 schema_error
    if (outcome.result.risk_level === "high") {
      const message =
        "LLM 判定 risk_level=high，已转人工确认。请在 Inbox 中查看。";
      const fallbackMsgId = await executeIntakeFallback(
        event,
        "risk_high",
        message,
        outcome.rawResponse,
        conversation,
      );
      return {
        success: false,
        eventId: event.id,
        execution: null,
        outcome: {
          ok: false,
          errorKind: "unknown",
          message,
        },
        summary: message,
        fallbackAssistantMessageId: fallbackMsgId,
      };
    }

    // 正常落地
    const execution = await executeIntakeResult(
      event,
      outcome.result,
      outcome.rawResponse,
      conversation,
    );

    return {
      success: true,
      eventId: event.id,
      execution,
      outcome: null,
      summary: describeSuccess(outcome, execution),
      fallbackAssistantMessageId: null,
    };
  } catch (err) {
    // 兜底：任何未捕获异常都转为 fallback
    const msg = err instanceof Error ? err.message : String(err);
    let fallbackMsgId: string | null = null;
    try {
      fallbackMsgId = await executeIntakeFallback(
        event,
        "unknown_error",
        msg,
        undefined,
        conversation,
      );
    } catch {
      // 连 fallback 都失败了，没办法
    }
    return {
      success: false,
      eventId: event.id,
      execution: null,
      outcome: {
        ok: false,
        errorKind: "unknown",
        message: msg,
      },
      summary: `Intake 异常：${msg}`,
      fallbackAssistantMessageId: fallbackMsgId,
    };
  }
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

type IntakeErrorKindForStatus =
  | "no_active_provider"
  | "no_api_key"
  | "network"
  | "timeout"
  | "http_error"
  | "parse_error"
  | "schema_error"
  | "empty_content"
  | "unknown";

function mapErrorKindToStatus(
  errorKind: IntakeErrorKindForStatus,
  _message: string,
): FallbackStatus {
  switch (errorKind) {
    case "no_active_provider":
      return "no_provider";
    case "no_api_key":
      return "no_provider";
    case "network":
      return "network_error";
    case "timeout":
      return "timeout";
    case "http_error":
      return "http_error";
    case "parse_error":
      return "parse_error";
    case "schema_error":
      return "schema_error";
    case "empty_content":
      return "parse_error";
    case "unknown":
    default:
      return "unknown_error";
  }
}

function describeFailure(outcome: IntakeOutcome & { ok: false }): string {
  switch (outcome.errorKind) {
    case "no_active_provider":
      return "未配置 LLM Provider，已保存输入，请到 Settings 配置。";
    case "no_api_key":
      return "Provider 未配置 api_key，已保存输入。";
    case "network":
      return `网络错误：${outcome.message}`;
    case "timeout":
      return "LLM 请求超时，已保存输入，可稍后重试。";
    case "http_error":
      return `LLM 返回错误：${outcome.message}`;
    case "parse_error":
      return "LLM 返回内容不是有效 JSON，已保存输入，需人工确认。";
    case "schema_error":
      return "LLM 返回结构不符合 schema，已保存输入，需人工确认。";
    case "empty_content":
      return "LLM 返回空内容。";
    case "unknown":
    default:
      return `Intake 失败：${outcome.message}`;
  }
}

function describeSuccess(
  outcome: IntakeOutcome & { ok: true },
  execution: IntakeExecutionResult,
): string {
  const parts: string[] = [];
  parts.push(outcome.result.content_type);
  if (execution.taskId) parts.push("task");
  if (execution.journalId) parts.push("journal");
  if (execution.ideaId) parts.push("idea");
  if (execution.reminderId) parts.push("reminder");
  if (execution.assistantMessageId) parts.push("replied");
  return `Intake 完成：${parts.join(" · ")}`;
}
