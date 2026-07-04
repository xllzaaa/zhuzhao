/**
 * Intake Executor
 *
 * 把 Zod 校验通过的 IntakeResult 落地为 DB 实体：
 *   1. ai_processing_results（先建，拿 id）
 *   2. task / journal / idea / reminder（依据 actions）
 *   3. events.ai_processed=1, ai_result_id=ai_processing_result.id
 *   4.（可选）conversation_messages(role='assistant')，依据 should_reply + reply_mode
 *
 * 安全：
 * - 整个流程是 best-effort：单条 INSERT 失败不影响其他动作
 * - 每个子实体失败被记录但不抛异常
 * - raw_response 写入 ai_processing_results.summary 时会被截断（避免过长 + 防止日志暴露）
 *
 * 不变量：
 * - INV-2: journal_entries.raw_content 必须全量保存（用 event.raw_content，绝不用 AI summary）
 * - INV-6: tasks.delay_count 创建时为 0（task-repo 已保证）
 *
 * Phase 5 范围：
 * - 不真正写 Markdown（write_markdown=true 也仅记 1，Phase 8 实现）
 * - 不真正调度 Reminder（仅 INSERT 行，status='pending'，Phase 6 实现）
 * - 不真正 update_user_profile（仅记 ai_processing_results.update_user_profile=1，未来 Phase）
 * - 不真正 link_to_project（仅记 project_candidates 到 ai_processing_results.projects，未来 Phase）
 */

import type {
  EventRow,
  ConversationRow,
  ConversationMessageRow,
} from "@/types/db";
import type { IntakeResult } from "@/lib/llm/intake-schema";
import { execute, query } from "@/lib/repositories/base";
import { ulid, nowIso, todayDate } from "@/lib/id";
import { createTask } from "@/lib/repositories/task-repo";
import { createJournal } from "@/lib/repositories/journal-repo";
import { createIdea } from "@/lib/repositories/idea-repo";
import { createReminder } from "@/lib/repositories/reminder-repo";

// ---------------------------------------------------------------------------
// 执行结果
// ---------------------------------------------------------------------------

export interface IntakeExecutionResult {
  /** ai_processing_results 行 id（永远会创建） */
  aiResultId: string;
  /** 创建的 task（若有） */
  taskId: string | null;
  /** 创建的 journal（若有） */
  journalId: string | null;
  /** 创建的 idea（若有） */
  ideaId: string | null;
  /** 创建的 reminder（若有） */
  reminderId: string | null;
  /** 创建的 assistant message（若有，仅 should_reply=true 且 reply_mode≠silent） */
  assistantMessageId: string | null;
  /** 执行过程中的警告（非致命错误） */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 执行 IntakeResult（落地为 DB 实体）
 *
 * @param event 关联的 Event
 * @param result Zod 校验通过的 IntakeResult
 * @param rawResponse LLM 原始返回（用于 ai_processing_results 落库）
 * @param conversation 可选：关联会话（若需要 assistant 回复）
 * @returns IntakeExecutionResult，永远不抛异常
 */
export async function executeIntakeResult(
  event: EventRow,
  result: IntakeResult,
  rawResponse: string,
  conversation: ConversationRow | null,
): Promise<IntakeExecutionResult> {
  const warnings: string[] = [];
  const aiResultId = ulid();

  // 1. 先建 ai_processing_results（无论后续动作成功失败，这一行必须存在）
  await insertAiProcessingResult({
    id: aiResultId,
    eventId: event.id,
    result,
    rawResponse,
  }).catch((err) => {
    // 致命：连 ai_processing_results 都建不了
    throw new Error(
      `insertAiProcessingResult failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  // 2. 根据 actions 创建子实体
  let taskId: string | null = null;
  let journalId: string | null = null;
  let ideaId: string | null = null;
  let reminderId: string | null = null;

  // 2.1 create_task
  if (result.actions.create_task) {
    try {
      const taskTitle = result.task?.title ?? result.title ?? event.raw_content.slice(0, 50);
      const task = await createTask({
        title: taskTitle,
        description: result.task?.description ?? event.raw_content,
        status: "inbox",
        priority: result.task?.priority ?? "medium",
        due_at: result.task?.due_at ?? null,
        estimated_minutes: result.task?.estimated_minutes ?? null,
        source_event_id: event.id,
      });
      taskId = task.id;
    } catch (err) {
      warnings.push(
        `create_task 失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2.2 create_journal
  // 仅当 content_type='journal' 或 actions.create_journal=true 时创建
  // raw_should_be_saved 不等于日记（task/idea/chat 即使 raw_should_be_saved=true
  // 也不应自动创建 JournalEntry，原始输入已保存在 events.raw_content 中）
  if (result.content_type === "journal" || result.actions.create_journal) {
    try {
      // INV-2: raw_content 必须用 event.raw_content（原文），AI summary 后续异步更新
      const journal = await createJournal({
        raw_content: event.raw_content,
        entry_date: todayDate(),
        tags: result.tags,
        topics: result.topic_candidates,
        project_ids: result.project_candidates,
        source_event_id: event.id,
      });
      journalId = journal.id;

      // 若 LLM 返回了 summary，异步更新 ai_summary
      if (result.summary) {
        try {
          await execute(
            "UPDATE journal_entries SET ai_summary = ? WHERE id = ?",
            [result.summary, journalId],
          );
        } catch (err) {
          warnings.push(
            `update journal ai_summary 失败：${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      warnings.push(
        `create_journal 失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2.3 create_idea
  if (result.actions.create_idea) {
    try {
      const idea = await createIdea({
        title: result.title ?? event.raw_content.slice(0, 50),
        raw_content: event.raw_content,
        summary: result.summary ?? null,
        status: "inbox",
        tags: result.tags,
        source_event_id: event.id,
      });
      ideaId = idea.id;
    } catch (err) {
      warnings.push(
        `create_idea 失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2.4 create_reminder
  if (result.actions.create_reminder) {
    try {
      const remindAt = result.reminder?.remind_at;
      if (!remindAt) {
        warnings.push("create_reminder=true 但 reminder.remind_at 缺失，跳过");
      } else {
        const reminder = await createReminder({
          remind_at: remindAt,
          reminder_type: result.reminder?.type ?? "custom",
          message: result.reminder?.message ?? null,
          task_id: taskId, // 关联上一步创建的 task
          event_id: event.id,
        });
        reminderId = reminder.id;
      }
    } catch (err) {
      warnings.push(
        `create_reminder 失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2.5 assistant reply（should_reply=true 且 reply_mode≠silent）
  let assistantMessageId: string | null = null;
  const shouldGenerateReply =
    result.should_reply &&
    result.reply_mode !== "silent" &&
    Boolean(result.reply_text) &&
    conversation !== null;

  if (shouldGenerateReply && conversation) {
    try {
      const msgId = ulid();
      const createdAt = nowIso();
      await execute(
        `INSERT INTO conversation_messages (
          id, conversation_id, role, content, created_at, event_id, save_to_memory, topic_id, project_id
        ) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`,
        [
          msgId,
          conversation.id,
          result.reply_text,
          createdAt,
          event.id,
          result.memory.save_level === "long_term" ? 1 : 0,
          null,
          null,
        ],
      );
      // 同时更新 conversation.updated_at
      await execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        [createdAt, conversation.id],
      );
      assistantMessageId = msgId;
    } catch (err) {
      warnings.push(
        `create assistant message 失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3. 标记 events.ai_processed=1, ai_result_id
  try {
    await execute(
      "UPDATE events SET ai_processed = 1, ai_result_id = ? WHERE id = ?",
      [aiResultId, event.id],
    );
  } catch (err) {
    warnings.push(
      `mark event processed 失败：${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    aiResultId,
    taskId,
    journalId,
    ideaId,
    reminderId,
    assistantMessageId,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Fallback 执行（Intake 失败时）
// ---------------------------------------------------------------------------

/**
 * Fallback：Intake 调用失败或校验失败时调用
 *
 * 行为：
 * - 不创建任何 task/journal/idea/reminder
 * - 不创建 ai_processing_results
 * - 仅把错误状态写入 events.metadata.intake_status
 * - events.ai_processed 保持 0（允许后续重试）
 * - 若来源是 Chat（event.source='chat' 且 conversation 非 null）：
 *   生成 assistant 消息「这条已记录，但暂时没有完成 AI 解析。」
 *
 * @param event 关联 Event
 * @param status pending_retry | schema_error | network_error | timeout | no_provider | parse_error | http_error | risk_high | unknown_error
 * @param errorMessage 已脱敏的错误描述
 * @param rawResponse 可选，LLM 原始返回（用于后续人工排查）
 * @param conversation 可选：关联会话（若需生成 assistant fallback 消息）
 * @returns assistantMessageId 若生成了 fallback 消息则返回 id，否则 null
 */
export async function executeIntakeFallback(
  event: EventRow,
  status: FallbackStatus,
  errorMessage: string,
  rawResponse?: string,
  conversation: ConversationRow | null = null,
): Promise<string | null> {
  // 读取现有 metadata（避免覆盖其他字段）
  let existingMetadata: Record<string, unknown> = {};
  try {
    if (event.metadata) {
      existingMetadata = JSON.parse(event.metadata) as Record<string, unknown>;
    }
  } catch {
    // 旧 metadata 不是合法 JSON，重置
    existingMetadata = {};
  }

  // 写入 intake 状态
  const newMetadata: Record<string, unknown> = {
    ...existingMetadata,
    intake_status: status,
    intake_error: errorMessage,
    intake_at: nowIso(),
  };

  // rawResponse 截断后写入（仅 schema_error / parse_error 时有用，便于人工排查）
  // 截断到 2000 字符避免 metadata 膨胀；不入日志
  if (rawResponse) {
    newMetadata.llm_raw_response_preview =
      rawResponse.length > 2000 ? rawResponse.slice(0, 2000) + "...(truncated)" : rawResponse;
  }

  try {
    await execute(
      "UPDATE events SET metadata = ? WHERE id = ?",
      [JSON.stringify(newMetadata), event.id],
    );
  } catch {
    // 连 metadata 都写不进去，没办法了
    // 不抛异常，避免 App 崩溃
  }

  // 若来源是 Chat 且有会话上下文，生成 fallback assistant 消息
  // 让用户在 Chat Sidebar 看到明确反馈（而不是无声失败）
  if (event.source === "chat" && conversation) {
    try {
      const msgId = ulid();
      const createdAt = nowIso();
      const fallbackText = "这条已记录，但暂时没有完成 AI 解析。";
      await execute(
        `INSERT INTO conversation_messages (
          id, conversation_id, role, content, created_at, event_id, save_to_memory, topic_id, project_id
        ) VALUES (?, ?, 'assistant', ?, ?, ?, 0, ?, ?)`,
        [
          msgId,
          conversation.id,
          fallbackText,
          createdAt,
          event.id,
          null,
          null,
        ],
      );
      // 同时更新 conversation.updated_at
      await execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        [createdAt, conversation.id],
      );
      return msgId;
    } catch {
      // 写消息失败也不抛异常
      return null;
    }
  }

  return null;
}

export type FallbackStatus =
  | "pending_retry"
  | "schema_error"
  | "network_error"
  | "timeout"
  | "no_provider"
  | "parse_error"
  | "http_error"
  | "risk_high"
  | "unknown_error";

// ---------------------------------------------------------------------------
// ai_processing_results 落库
// ---------------------------------------------------------------------------

async function insertAiProcessingResult(
  args: {
    id: string;
    eventId: string;
    result: IntakeResult;
    rawResponse: string;
  },
): Promise<void> {
  const { id, eventId, result, rawResponse } = args;
  const now = nowIso();

  // summary 字段策略：
  // - 优先用 LLM 给的 summary
  // - 否则用 rawResponse 前 200 字符（截断）
  // - 不直接写完整 rawResponse（避免过长 + 防止日志暴露）
  const summary = result.summary
    ?? (rawResponse.length > 200 ? rawResponse.slice(0, 200) + "...(truncated)" : rawResponse);

  await execute(
    `INSERT INTO ai_processing_results (
      id, event_id, content_type, summary, tags, topics, projects,
      should_reply, reply_mode, reply_text,
      create_task, create_reminder, save_to_memory, update_user_profile,
      risk_level, confidence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      eventId,
      result.content_type,
      summary,
      JSON.stringify(result.tags),
      JSON.stringify(result.topic_candidates),
      JSON.stringify(result.project_candidates),
      result.should_reply ? 1 : 0,
      result.reply_mode,
      result.reply_text ?? null,
      result.actions.create_task ? 1 : 0,
      result.actions.create_reminder ? 1 : 0,
      result.memory.save_level === "long_term" || result.memory.save_level === "profile" ? 1 : 0,
      result.actions.update_user_profile ? 1 : 0,
      result.risk_level,
      result.confidence,
      now,
    ],
  );
}

// ---------------------------------------------------------------------------
// 辅助查询：Intake 完成后 ChatSidebar 需要拉取新 assistant 消息
// ---------------------------------------------------------------------------

export async function getAssistantMessageById(
  id: string,
): Promise<ConversationMessageRow | null> {
  const rows = await query<ConversationMessageRow>(
    "SELECT * FROM conversation_messages WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}
