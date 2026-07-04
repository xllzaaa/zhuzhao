/**
 * 烛照数据库实体类型
 * 对应 migrations/0002_core_tables.sql 的 14 张表
 * 详见 openspec/specs/zhuzhao-core/spec.md §4
 *
 * 字段命名规则：
 * - DB 列：snake_case（如 raw_content）
 * - TS 类型：保持 snake_case 以便与 DB 行直接映射
 *   枚举字段使用 union string literal
 * - 时间字段：ISO 8601 字符串
 * - JSON 数组字段：TEXT 存 JSON 字符串，TS 端按需 parse
 */

import type {
  TaskStatus,
  TaskPriority,
  ReminderType,
  ReminderStatus,
  Mood,
  IdeaStatus,
  MessageRole,
} from "./enums";

/** 通用：DB 行的元数据字段 */
export interface BaseEntity {
  id: string;
  created_at: string;
}

/** 1. events：用户输入的最原始记录 */
export interface EventRow {
  id: string;
  created_at: string;
  /** 来源：'chat' | 'quick_input' | 'journal' | 'reminder' | 'system' */
  source: string;
  /** 原文，永不修改 */
  raw_content: string;
  /** 'user_input' | 'system' | 'reminder_fired' */
  event_type: string;
  ai_processed: number; // 0 | 1
  ai_result_id: string | null;
  topic_id: string | null;
  project_id: string | null;
  /** JSON 字符串 */
  metadata: string | null;
}

/** 2. ai_processing_results */
export interface AiProcessingResultRow {
  id: string;
  event_id: string;
  content_type: string;
  summary: string | null;
  tags: string | null; // JSON array string
  topics: string | null;
  projects: string | null;
  should_reply: number; // 0 | 1
  reply_mode: string;
  reply_text: string | null;
  create_task: number;
  create_reminder: number;
  save_to_memory: number;
  update_user_profile: number;
  risk_level: string;
  confidence: number;
  created_at: string;
}

/** 3. tasks */
export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  scheduled_at: string | null;
  estimated_minutes: number | null;
  actual_minutes: number;
  project_id: string | null;
  topic_id: string | null;
  source_event_id: string | null;
  delay_count: number;
  failure_reason: string | null;
  completion_note: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** 4. reminders */
export interface ReminderRow {
  id: string;
  task_id: string | null;
  event_id: string | null;
  remind_at: string;
  reminder_type: ReminderType;
  status: ReminderStatus;
  snooze_count: number;
  message: string | null;
  created_at: string;
  updated_at: string;
}

/** 5. journal_entries：日记原文必须全量保存 */
export interface JournalEntryRow {
  id: string;
  created_at: string;
  entry_date: string; // YYYY-MM-DD
  raw_content: string;
  ai_summary: string | null;
  mood: Mood;
  tags: string | null;
  topics: string | null;
  project_ids: string | null;
  should_update_profile: number;
  source_event_id: string | null;
}

/** 6. ideas */
export interface IdeaRow {
  id: string;
  title: string;
  raw_content: string;
  summary: string | null;
  status: IdeaStatus;
  tags: string | null;
  topic_id: string | null;
  project_id: string | null;
  source_event_id: string | null;
  created_at: string;
  updated_at: string;
}

/** 7. conversations */
export interface ConversationRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

/** 8. conversation_messages */
export interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  event_id: string | null;
  save_to_memory: number;
  topic_id: string | null;
  project_id: string | null;
}

/** 9. topics */
export interface TopicRow {
  id: string;
  name: string;
  summary: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

/** 10. projects */
export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  summary: string | null;
  goals: string | null;
  created_at: string;
  updated_at: string;
}

/** 11. user_profiles */
export interface UserProfileRow {
  id: string;
  profile_key: string;
  profile_value: string;
  confidence: number;
  source: string;
  updated_at: string;
}

/** 12. agent_rules */
export interface AgentRuleRow {
  id: string;
  rule_name: string;
  condition: string;
  action: string;
  tone: string;
  enabled: number;
  created_at: string;
}

/** 13. reviews */
export interface ReviewRow {
  id: string;
  review_date: string;
  review_type: string;
  raw_content: string;
  sections: string | null;
  source_event_ids: string | null;
  created_at: string;
}

/** 14. llm_providers */
export interface LlmProviderRow {
  id: string;
  name: string;
  provider_type: string;
  base_url: string;
  api_key: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

/** schema_version（migration 0001 创建） */
export interface SchemaVersionRow {
  version: number;
  name: string;
  applied_at: string;
}
