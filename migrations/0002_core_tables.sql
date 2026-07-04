-- Migration 0002: V0 核心业务表
-- 详见 openspec/specs/zhuzhao-core/spec.md §4.3
-- 14 张表 + 11 索引；与 schema_version 共存

-- 1. events：用户输入的最原始记录
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ai_processed INTEGER NOT NULL DEFAULT 0,
  ai_result_id TEXT,
  topic_id TEXT,
  project_id TEXT,
  metadata TEXT
);

-- 2. ai_processing_results：LLM Intake 结构化结果
CREATE TABLE IF NOT EXISTS ai_processing_results (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  summary TEXT,
  tags TEXT,
  topics TEXT,
  projects TEXT,
  should_reply INTEGER NOT NULL DEFAULT 0,
  reply_mode TEXT NOT NULL DEFAULT 'silent',
  reply_text TEXT,
  create_task INTEGER NOT NULL DEFAULT 0,
  create_reminder INTEGER NOT NULL DEFAULT 0,
  save_to_memory INTEGER NOT NULL DEFAULT 0,
  update_user_profile INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'low',
  confidence REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events (id)
);

-- 3. tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'inbox',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_at TEXT,
  scheduled_at TEXT,
  estimated_minutes INTEGER,
  actual_minutes INTEGER DEFAULT 0,
  project_id TEXT,
  topic_id TEXT,
  source_event_id TEXT,
  delay_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  completion_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

-- 4. reminders
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  event_id TEXT,
  remind_at TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  snooze_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 5. journal_entries：日记原文必须全量保存
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  ai_summary TEXT,
  mood TEXT DEFAULT 'unknown',
  tags TEXT,
  topics TEXT,
  project_ids TEXT,
  should_update_profile INTEGER NOT NULL DEFAULT 0,
  source_event_id TEXT
);

-- 6. ideas
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'inbox',
  tags TEXT,
  topic_id TEXT,
  project_id TEXT,
  source_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 7. conversations
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 8. conversation_messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  event_id TEXT,
  save_to_memory INTEGER NOT NULL DEFAULT 0,
  topic_id TEXT,
  project_id TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations (id)
);

-- 9. topics
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 10. projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  goals TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 11. user_profiles：由 AI 维护
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  profile_key TEXT NOT NULL,
  profile_value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 12. agent_rules
CREATE TABLE IF NOT EXISTS agent_rules (
  id TEXT PRIMARY KEY,
  rule_name TEXT NOT NULL,
  condition TEXT NOT NULL,
  action TEXT NOT NULL,
  tone TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- 13. reviews（每日总结，V0 必须支持）
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  review_date TEXT NOT NULL,
  review_type TEXT NOT NULL DEFAULT 'daily',
  raw_content TEXT NOT NULL,
  sections TEXT,
  source_event_ids TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (review_date, review_type)
);

-- 14. llm_providers（V0 必须支持配置）
CREATE TABLE IF NOT EXISTS llm_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT,
  model TEXT NOT NULL,
  temperature REAL NOT NULL DEFAULT 0.3,
  max_tokens INTEGER DEFAULT 1024,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_ai_processed ON events (ai_processed);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks (due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_delay_count ON tasks (delay_count);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders (remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders (status);
CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_conv_msg_conv_id ON conversation_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_key ON user_profiles (profile_key);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews (review_date);

INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES
  (2, 'core_tables', datetime('now'));
