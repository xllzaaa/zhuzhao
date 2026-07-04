/**
 * 烛照共享枚举类型
 * 详见 openspec/specs/task-supervision/spec.md §2.1（任务状态机）
 * 详见 openspec/specs/llm-intake/spec.md §4（IntakeResultSchema）
 */

/** 任务状态 - task-supervision spec §2.1 */
export type TaskStatus =
  | "inbox"
  | "planned"
  | "scheduled"
  | "doing"
  | "blocked"
  | "delayed"
  | "done"
  | "dropped"
  | "review_needed";

/** 任务优先级 - llm-intake spec §4 */
export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** 提醒类型 */
export type ReminderType =
  | "task_due"
  | "check_in"
  | "journal"
  | "review"
  | "custom";

/** 提醒状态 */
export type ReminderStatus =
  | "pending"
  | "fired"
  | "snoozed"
  | "resolved"
  | "cancelled";

/** 日记情绪 - journal-memory spec §6 */
export type Mood =
  | "unknown"
  | "positive"
  | "neutral"
  | "negative"
  | "frustrated"
  | "motivated";

/** 灵感状态 */
export type IdeaStatus =
  | "inbox"
  | "refined"
  | "linked"
  | "archived";

/** 对话消息角色 */
export type MessageRole = "user" | "assistant" | "system";

/** 内容类型 - llm-intake spec §4 */
export type ContentType =
  | "task"
  | "idea"
  | "journal"
  | "chat"
  | "plan"
  | "review"
  | "unknown";

/** 回复语气 - llm-intake spec §5.2 */
export type ReplyMode =
  | "silent"
  | "ack"
  | "suggest"
  | "coach"
  | "challenge"
  | "harsh";

/** 风险等级 */
export type RiskLevel = "low" | "medium" | "high";

/** 记忆保存级别 - journal-memory spec §5.1 */
export type MemorySaveLevel = "none" | "short_term" | "long_term" | "profile";

/** Event 来源 */
export type EventSource = "chat" | "quick_input" | "journal" | "reminder" | "system";

/** Event 类型 */
export type EventType = "user_input" | "system" | "reminder_fired";
