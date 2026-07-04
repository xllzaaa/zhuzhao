# Spec · zhuzhao-core（烛照核心）

> 本 spec 描述烛照桌面端 V0 的产品定位、核心闭环、系统架构与数据模型总览。其他子 spec（llm-intake / task-supervision / journal-memory / desktop-ui / markdown-sync）在本文件基础上展开。

## Purpose

定义烛照桌面端 V0 的核心产品定位、范围边界、系统架构与数据模型总览，作为所有子 capability spec 的统一基础与不变量来源。

## Requirements

### Requirement: V0 核心闭环必须端到端跑通

烛照系统 SHALL 实现从用户输入 → Event 落库 → LLM Intake → Zod 校验 → 创建子实体 → should_reply 判定 → Reminder 追问 → 用户反馈 → 延期累计 → 每日总结 → 可选 Markdown 同步的完整闭环，缺一不可。

#### Scenario: 用户输入任务型内容并最终完成

- **WHEN** 用户在 Chat Sidebar 输入「明天晚上前把烛照的开发任务书整理完」
- **THEN** 系统创建 Event，调用 LLM Intake，根据返回的 actions.create_task=true 创建 task，根据 actions.create_reminder=true 创建 reminder；到期后追问；用户回复「完成」时 task.status='done' 并写入 completion_note

#### Scenario: 用户多次延期触发严厉监督

- **WHEN** 同一 task 连续两次被标记为未完成（delay_count >= 2）
- **THEN** 系统在对话中插入 reply_mode='harsh' 的 assistant 消息，且不攻击用户人格

### Requirement: V0 范围严格收窄

系统 SHALL 仅实现 [project.md §6.1](../../project.md#61-v0-必须实现) 列出的 20 项功能；SHALL NOT 实现 [project.md §6.2](../../project.md#62-v0-明确不做可预留接口禁止实现) 列出的 14 项功能（可预留接口但禁止实现）。

#### Scenario: 检测到 V0 范围外动作

- **WHEN** 系统尝试自动执行 shell / 删除文件 / 发送外部消息 / 访问摄像头
- **THEN** 动作被动作网关拦截，抛出错误且不执行

### Requirement: 数据模型必须覆盖 14 张表

系统 SHALL 通过 SQLite migrations 创建以下 14 张表：events / ai_processing_results / tasks / reminders / journal_entries / ideas / conversations / conversation_messages / topics / projects / user_profiles / agent_rules / reviews / llm_providers。

#### Scenario: 干净数据库首次启动

- **WHEN** App 首次启动且 SQLite 文件不存在
- **THEN** migrations 自动执行并创建全部 14 张表 + 索引；events.ai_processed 默认 0

### Requirement: 关键不变量（INV-1 ~ INV-7）

系统 SHALL 在所有写入路径上保证 [§2.3](#23-关键不变量hard-invariants) 列出的 7 条不变量。

#### Scenario: 日记原文不可被 AI 覆盖

- **WHEN** LLM 为某条日记生成新的 ai_summary / tags / mood
- **THEN** journal_entries.raw_content 字段保持不变

#### Scenario: LLM 输出必须经 Zod 校验

- **WHEN** LLM 返回的 Intake JSON 解析失败或 Zod 校验失败
- **THEN** 系统不创建任何子实体，标记 events.metadata.intake_status='schema_error'，UI 显示需人工确认

#### Scenario: API Key 不出本地

- **WHEN** 系统调用 LLM Provider
- **THEN** API Key 仅从本地存储读取，不出现在日志、网络请求 URL 或 UI 普通字段中

---

## 详细设计

## 1. 概述

烛照是本地优先的强监督型个人 AI 助手。它的核心是**事件驱动的输入处理流水线 + 任务监督闭环**。

| 属性 | 值 |
| --- | --- |
| Capability | zhuzhao-core |
| Owner | 烛照桌面端 |
| Phase | V0 / Phase 1+ 实现 |
| Status | 设计中（Phase 0） |

## 2. 功能性需求

### 2.1 必须实现（V0）

详见 [project.md §6.1](../project.md#61-v0-必须实现)。核心闭环：

```
用户输入
  → Event 落库（原文不可丢）
  → LLM Intake（结构化 JSON）
  → Zod 校验
  → 根据 actions 创建 task / journal / idea / reminder
  → 根据 should_reply + reply_mode 生成 assistant 消息
  → Reminder 到期 → Chat Sidebar 追问
  → 用户反馈完成 / 未完成
  → 更新 task.status / delay_count / failure_reason / completion_note
  → 多次延期 → harsh 监督模式
  → 每日总结
  → 可选 Markdown 同步
```

### 2.2 不允许在 V0 实现

详见 [project.md §6.2](../project.md#62-v0-明确不做可预留接口禁止实现)。

### 2.3 关键不变量（Hard Invariants）

| ID | 不变量 | 校验位置 |
| --- | --- | --- |
| INV-1 | Event.raw_content 必须永久保存，AI 不可修改 | DB schema + 写入路径 |
| INV-2 | JournalEntry.raw_content 必须全量保存，AI 摘要仅为附加字段 | DB schema + Intake 写入 |
| INV-3 | LLM Intake JSON 必须经 Zod 校验；解析失败必须 fallback | Intake pipeline |
| INV-4 | API Key 仅本地保存，不上传 | Settings + 网络层 |
| INV-5 | 危险动作（shell / 删除文件 / 外部消息）必须禁止或人工确认 | 全局动作网关 |
| INV-6 | 任务 delay_count 单调递增，不可重置（除非新建任务） | task 状态机 |
| INV-7 | harsh 语气仅可批评行为，不可攻击人格 | LLM Prompt + 输出审查 |

## 3. 系统架构

### 3.1 分层

```
┌──────────────────────────────────────────────────────────┐
│                    UI Layer (React)                      │
│  Dashboard │ Inbox │ Tasks │ Journal │ Ideas │ Reviews   │
│  Settings │ Chat Sidebar │ Quick Input                   │
└───────────────────────┬──────────────────────────────────┘
                        │ Zustand store + IPC
┌───────────────────────┴──────────────────────────────────┐
│                  Application Layer                       │
│  Intake Pipeline │ Reminder Scheduler │ Daily Review    │
│  Supervision Engine │ Markdown Syncer                   │
└───────────────────────┬──────────────────────────────────┘
                        │
┌───────────────────────┴──────────────────────────────────┐
│              Domain / Persistence Layer                 │
│   SQLite (migrations) │ Repositories (CRUD)              │
│   LLM Client (OpenAI-compatible) │ File IO              │
└──────────────────────────────────────────────────────────┘
```

### 3.2 进程与边界

- **主进程**：Tauri Rust 主进程承载 SQLite（推荐用 `tauri-plugin-sql` 或 Rust 端 `rusqlite`，前端通过 IPC 调用）
- **WebView 进程**：React UI，通过 Tauri `invoke` 调用 Rust 命令
- **网络出口**：仅 LLM API（用户配置的 BaseURL）。其他网络请求默认禁止

### 3.3 LLM 调用边界

- 唯一出口：用户在 Settings 配置的 OpenAI-compatible endpoint
- 必须支持 timeout / retry / fallback
- LLM 失败 → Event 标记 `ai_processed=0`，不阻塞用户输入

## 4. 数据模型总览

### 4.1 ER 概览

```
Event ──┬──> AIProcessingResult
        ├──> Task ──> Reminder
        ├──> JournalEntry
        ├──> Idea
        └──> ConversationMessage ──> Conversation

Topic / Project ──┐
                  ├──> Task / Journal / Idea / ConversationMessage
UserProfile ──────┘
AgentRule ────────> 控制 reply_mode 与触发条件
```

### 4.2 表清单

| 表 | 主键 | 用途 | V0 是否实现 |
| --- | --- | --- | --- |
| events | id | 用户输入的原始事件 | ✅ |
| ai_processing_results | id | LLM Intake 结果 | ✅ |
| tasks | id | 任务 | ✅ |
| reminders | id | 提醒 | ✅ |
| journal_entries | id | 日记（原文必存） | ✅ |
| ideas | id | 灵感 | ✅ |
| conversations | id | 对话 | ✅ |
| conversation_messages | id | 对话消息 | ✅ |
| topics | id | 主题 | ✅ |
| projects | id | 项目 | ✅ |
| user_profiles | id | 用户画像 | ✅ |
| agent_rules | id | Agent 规则 | ✅ |
| reviews（每日总结） | id | V0 必须支持每日总结 | ✅（新增） |
| llm_providers（LLM 配置） | id | V0 必须支持配置 | ✅（新增，本地存储） |

> 表 13、14 在用户提供的原始 schema 中未列出，但 V0 范围明确要求每日总结与 LLM Provider 配置，因此本 spec 显式声明为新增表。详细 schema 见 §5。

### 4.3 完整建表 SQL

以下为 Phase 2 实现时的迁移目标 schema。Phase 0 仅文档化，不执行。

```sql
-- 1. events：用户输入的最原始记录
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,            -- 'chat' | 'quick_input' | 'journal' | 'reminder' | 'system'
  raw_content TEXT NOT NULL,       -- 原文，永不修改
  event_type TEXT NOT NULL,        -- 'user_input' | 'system' | 'reminder_fired'
  ai_processed INTEGER NOT NULL DEFAULT 0,
  ai_result_id TEXT,
  topic_id TEXT,
  project_id TEXT,
  metadata TEXT                    -- JSON
);

-- 2. ai_processing_results：LLM Intake 结构化结果
CREATE TABLE IF NOT EXISTS ai_processing_results (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  content_type TEXT NOT NULL,      -- 'task' | 'idea' | 'journal' | 'chat' | 'plan' | 'review' | 'unknown'
  summary TEXT,
  tags TEXT,                       -- JSON array
  topics TEXT,                    -- JSON array
  projects TEXT,                  -- JSON array
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
  status TEXT NOT NULL DEFAULT 'inbox',  -- 见 task-supervision spec
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
  reminder_type TEXT NOT NULL,    -- 'task_due' | 'check_in' | 'journal' | 'review' | 'custom'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'fired' | 'snoozed' | 'resolved' | 'cancelled'
  snooze_count INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 5. journal_entries：日记原文必须全量保存
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  entry_date TEXT NOT NULL,        -- YYYY-MM-DD
  raw_content TEXT NOT NULL,       -- 原文，永不丢
  ai_summary TEXT,                 -- 仅附加
  mood TEXT DEFAULT 'unknown',
  tags TEXT,                       -- JSON array
  topics TEXT,                     -- JSON array
  project_ids TEXT,                -- JSON array
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
  role TEXT NOT NULL,              -- 'user' | 'assistant' | 'system'
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
  condition TEXT NOT NULL,        -- 自然语言或 JSON 描述
  action TEXT NOT NULL,
  tone TEXT NOT NULL,             -- 'silent' | 'ack' | 'suggest' | 'coach' | 'challenge' | 'harsh'
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- 13. reviews（每日总结，V0 必须支持，原 schema 未列）
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  review_date TEXT NOT NULL,       -- YYYY-MM-DD
  review_type TEXT NOT NULL DEFAULT 'daily',  -- V0 仅 'daily'
  raw_content TEXT NOT NULL,       -- AI 生成的总结全文
  sections TEXT,                   -- JSON：{ completed: [], delayed: [], journals: [], ideas: [], procrastination: [], tomorrow_priorities: [], supervisor_advice: [] }
  source_event_ids TEXT,           -- JSON array
  created_at TEXT NOT NULL,
  UNIQUE (review_date, review_type)
);

-- 14. llm_providers（V0 必须支持配置，原 schema 未列）
CREATE TABLE IF NOT EXISTS llm_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,              -- 用户自定义名
  provider_type TEXT NOT NULL,     -- 'openai' | 'azure' | 'ollama' | 'custom'
  base_url TEXT NOT NULL,
  api_key TEXT,                    -- 仅本地保存，不上传
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
```

### 4.4 字段约定

- 所有 `id` 使用 ULID（按时间排序友好），TEXT 存储
- 所有时间字段使用 ISO 8601 UTC 字符串
- JSON 数组字段（tags / topics / projects / sections）以 TEXT 存 JSON 字符串
- 布尔字段以 INTEGER（0/1）存

## 5. 非功能性需求

| 类别 | 要求 |
| --- | --- |
| 性能 | App 冷启动 ≤ 2s；SQLite 单查询 ≤ 100ms（10w 行内）；LLM 调用不阻塞 UI |
| 离线 | 未配置 LLM 时 App 仍可记录 Event / 手动建任务 / 写日记；Intake 标记 pending |
| 数据安全 | API Key 仅本地；日记原文不可丢；导出支持 JSON |
| 可用性 | LLM 失败 / 网络断 / JSON 解析失败均不崩溃 |
| 可观测 | 本地日志（Phase 9）；所有 AI 自动行为在 UI 上可见来源 |
| 可维护 | TDD；每个 Phase 可独立验收 |

## 6. 风险与开放问题

| ID | 风险 / 问题 | 当前处理 |
| --- | --- | --- |
| Q1 | Tauri SQLite 通过 Rust 还是 JS（better-sqlite3）？ | Phase 1 spike：优先 Rust 端 `rusqlite` + IPC，避免 WebView 重型依赖 |
| Q2 | 用户不回复 reminder 时如何处理？ | V0 简化：下次启动 / 次日 Dashboard 显示「昨日未回应任务」并自动标记 delayed |
| Q3 | 每日总结自动定时还是手动？ | V0 手动触发（用户原话）；自动定时留 V1 |
| Q4 | harsh 语气审查机制？ | Prompt 内嵌禁止条款 + 输出关键词扫描兜底（Phase 9 完善） |
| Q5 | Markdown 双向同步？ | V0 单向（DB → Markdown）。Obsidian 修改不回写 DB |

## 7. 验收（Phase 0）

本 spec 验收：

- [x] V0 范围明确
- [x] 不变量明确
- [x] 数据模型完整（14 张表，含新增 reviews / llm_providers）
- [x] 闭环清晰
- [x] 风险与开放问题列出

Phase 0 不写代码，不接受任何 PR 包含功能实现。
