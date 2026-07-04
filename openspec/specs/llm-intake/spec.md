# Spec · llm-intake（LLM Intake 流水线）

> 所有用户输入必须经过 LLM Intake。本 spec 定义 Intake 流水线、JSON Schema、行为规则、reply_mode 语义与边界。

## Purpose

定义烛照系统中所有用户输入如何被 LLM 结构化处理：触发条件、流水线步骤、JSON Schema、Zod 校验、reply_mode 语义、harsh 语气边界与失败 fallback，以保证 AI 自动行为可控、可追溯、不崩溃。

## Requirements

### Requirement: 所有用户输入必须经 LLM Intake 处理

系统 SHALL 在每个 `events.event_type='user_input'` 落库后异步触发 Intake 流水线；SHALL 在 App 启动时扫描 `ai_processed=0` 的事件补偿处理。

#### Scenario: Chat Sidebar 提交输入

- **WHEN** 用户在 Chat Sidebar 提交一条消息
- **THEN** Event 落库后异步触发 LLM Intake，UI 立即返回不阻塞

#### Scenario: App 启动时存在未处理事件

- **WHEN** App 启动扫描到 `events.ai_processed=0` 的事件
- **THEN** 系统按创建时间顺序补处理；同一 Event 不可并发触发

### Requirement: IntakeResult 必须经 Zod 校验

系统 SHALL 使用 `IntakeResultSchema`（见 §4）对 LLM 返回的 JSON 进行 Zod 校验；校验失败时 SHALL 不创建任何子实体。

#### Scenario: LLM 返回合法 JSON

- **WHEN** LLM 返回的 JSON 通过 Zod 校验
- **THEN** 落库 ai_processing_results，根据 actions 创建子实体，根据 should_reply 决定是否生成 assistant 消息

#### Scenario: LLM 返回非法 JSON 或校验失败

- **WHEN** JSON 解析失败或 Zod 校验不通过
- **THEN** 系统不创建任何子实体；raw_response 写入 events.metadata；UI 显示「需人工确认」；App 不崩溃

### Requirement: reply_mode 语义必须严格执行

系统 SHALL 按 [§5.2](#52-replymode-语义) 定义的 silent / ack / suggest / coach / challenge / harsh 六档生成回复；silent 模式 SHALL NOT 生成任何 assistant 消息。

#### Scenario: silent 模式

- **WHEN** LLM 返回 should_reply=false 或 reply_mode='silent'
- **THEN** 系统不创建 assistant conversation_message

#### Scenario: harsh 模式触发

- **WHEN** delay_count >= 2 且 LLM 判定该任务需要严厉监督
- **THEN** reply_mode='harsh'，消息内容批评行为而非人格

### Requirement: harsh 模式语言边界

harsh 回复 MAY 批评用户的拖延、逃避、懒散行为；MUST NOT 攻击人格和长期价值（如「你废了」「你永远做不成事」等）。

#### Scenario: harsh 回复合规

- **WHEN** LLM 生成 harsh 回复
- **THEN** 内容可包含「你这就是在拖」「别再找借口了，先做 10 分钟」；不可包含「你废了」「你没救了」

### Requirement: 失败必须 fallback

系统 SHALL 在 LLM 超时 / 网络错误 / JSON 解析失败 / Zod 校验失败 / risk_level='high' 时进入 fallback 路径（见 §8），SHALL NOT 阻塞用户后续输入。

#### Scenario: LLM 超时

- **WHEN** LLM API 30s 内无响应
- **THEN** Event 标记 `ai_processed=0`，metadata.intake_status='pending_retry'；UI 显示「待处理」

#### Scenario: risk_level='high'

- **WHEN** LLM 返回 risk_level='high'
- **THEN** 即使 actions 触发，系统禁止自动创建子实体，改为生成 assistant 消息提示用户人工确认

---

## 详细设计

## 1. 概述

| 属性 | 值 |
| --- | --- |
| Capability | llm-intake |
| 依赖 | zhuzhao-core / journal-memory / task-supervision |
| Phase | V0 / Phase 5 实现 |
| Status | 设计中（Phase 0） |

## 2. 触发条件

- **触发源**：所有 Event 落库事件，只要 `event_type='user_input'` 且 `ai_processed=0`
- **触发时机**：
  - 同步触发：用户在 Chat Sidebar 或 Dashboard 快速输入提交后立即触发
  - 异步补偿：App 启动时扫描 `ai_processed=0` 的事件并补处理
- **触发约束**：同一 Event 同时只能有一个进行中的 Intake 任务（用 `events.metadata` 标记 `intake_status`）

## 3. 流水线

```
Event 落库
  ↓
[1] 加载 Intake Prompt（prompts/intake.md）
  ↓
[2] 组装 system + user 消息（含上下文：最近 N 条任务 / 当前活跃项目 / 用户画像要点）
  ↓
[3] 调用 OpenAI-compatible chat completion（temperature ≤ 0.3，response_format=json_object）
  ↓
[4] 解析返回 JSON
  ↓
[5] Zod 校验（IntakeResultSchema）
  ↓
[6] 校验失败 → fallback 路径（见 §8）
  ↓
[7] 校验通过 → 落库 ai_processing_results
  ↓
[8] 根据 actions 创建子实体（task / journal / idea / reminder）
  ↓
[9] 根据 should_reply + reply_mode 生成 assistant message（conversation_messages）
  ↓
[10] 标记 events.ai_processed=1, ai_result_id=...
  ↓
[11] 推送 UI 通知（Event 来源面板更新）
```

## 4. IntakeResultSchema（TypeScript / Zod）

```typescript
import { z } from 'zod';

export const IntakeResultSchema = z.object({
  content_type: z.enum([
    'task', 'idea', 'journal', 'chat', 'plan', 'review', 'unknown'
  ]),
  title: z.string().optional(),
  summary: z.string().optional(),
  raw_should_be_saved: z.boolean(),
  tags: z.array(z.string()).default([]),
  topic_candidates: z.array(z.string()).default([]),
  project_candidates: z.array(z.string()).default([]),
  should_reply: z.boolean(),
  reply_mode: z.enum([
    'silent', 'ack', 'suggest', 'coach', 'challenge', 'harsh'
  ]),
  reply_text: z.string().optional(),
  actions: z.object({
    create_task: z.boolean().default(false),
    create_idea: z.boolean().default(false),
    create_journal: z.boolean().default(false),
    create_reminder: z.boolean().default(false),
    update_user_profile: z.boolean().default(false),
    link_to_project: z.boolean().default(false),
    write_markdown: z.boolean().default(false)
  }),
  task: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    due_at: z.string().optional(),         // ISO 8601
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    estimated_minutes: z.number().optional()
  }).optional(),
  reminder: z.object({
    remind_at: z.string().optional(),
    message: z.string().optional(),
    type: z.enum([
      'task_due', 'check_in', 'journal', 'review', 'custom'
    ]).optional()
  }).optional(),
  memory: z.object({
    save_level: z.enum(['none', 'short_term', 'long_term', 'profile']),
    reason: z.string().optional()
  }),
  risk_level: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1)
});

export type IntakeResult = z.infer<typeof IntakeResultSchema>;
```

### 4.1 字段语义

| 字段 | 含义 | 必填 |
| --- | --- | --- |
| content_type | 输入内容类型 | ✅ |
| raw_should_be_saved | 是否保存原文到 journal（true 时再写一条 JournalEntry） | ✅ |
| should_reply | 是否生成 assistant 回复 | ✅ |
| reply_mode | 回复语气 | ✅ |
| actions | 触发的实体创建动作集合 | ✅ |
| memory.save_level | 长期记忆写入级别 | ✅ |
| risk_level | 风险等级（high 时禁止自动执行任何动作，转人工确认） | ✅ |
| confidence | LLM 自评分 [0,1]；< 0.6 时 UI 标记「低置信度，请人工确认」 | ✅ |
| task.* | 当 actions.create_task=true 时必填 | 条件必填 |
| reminder.* | 当 actions.create_reminder=true 时必填 | 条件必填 |

## 5. Intake Prompt 行为规则

### 5.1 角色

你是「烛照」的 Intake Processor。每次用户输入后，你要判断：

1. 内容类型（content_type）
2. 是否保存原文（raw_should_be_saved）
3. 是否创建任务（actions.create_task）
4. 是否创建日记（actions.create_journal）
5. 是否创建灵感（actions.create_idea）
6. 是否创建提醒（actions.create_reminder）
7. 是否回复用户（should_reply）
8. 回复语气（reply_mode）
9. 是否更新用户画像（actions.update_user_profile）
10. 是否进入严厉监督模式（reply_mode='harsh'）

### 5.2 reply_mode 语义

| mode | 行为 | 示例 |
| --- | --- | --- |
| silent | 不回复，只记录 | （无） |
| ack | 简短确认 | 「记下了。」 |
| suggest | 轻量建议 | 「这个明天上午做可能更合适。」 |
| coach | 理性教练式反馈 | 「你之前定的 deadline 是今天，先做 25 分钟看看？」 |
| challenge | 严厉监督，指出问题 | 「这件事已经拖了两次了。是计划问题还是执行问题？」 |
| harsh | 狠话模式，明显批评拖延与懒散 | 「你这就是在拖。别再找借口了，先做 10 分钟。」 |

### 5.3 harsh 模式允许与禁止

**harsh 可以说**：

- 「你这就是在拖。」
- 「别再找借口了，先做 10 分钟。」
- 「你现在就是懒，别继续装作还在规划。」
- 「这件事你已经拖了两次，现在不是计划问题，是执行问题。」

**harsh 不可以说**：

- 「你废了。」
- 「你这个人不行。」
- 「你永远做不成事。」
- 「你没救了。」

**原则**：可以批评行为、拖延、逃避、懒散，**绝不攻击人格和长期价值**。

### 5.4 触发条件示例

| 输入 | content_type | actions | reply_mode |
| --- | --- | --- | --- |
| 「明天晚上前把烛照的开发任务书整理完」 | task | create_task=true, create_reminder=true | ack |
| 「今天有点摆烂，什么都没推进」 | journal | create_journal=true, raw_should_be_saved=true | coach / challenge |
| 「想到一个点，烛照可以以后接飞书机器人」 | idea | create_idea=true | ack |
| 「我最近怎么总是不想干活」 | chat | update_user_profile=true | coach |
| 「我把昨天的事又拖到今天了」 | chat | （不创建实体，仅更新画像与记忆） | harsh（已 ≥ 2 次延期时） |

### 5.5 上下文（注入 Prompt 的变量）

Intake Prompt 必须接收以下上下文：

- `user_input`：当前事件原文
- `recent_tasks`：用户最近 7 天的任务及状态（最多 10 条）
- `active_projects`：当前 active 的 projects（最多 5 条，仅 name + summary）
- `user_profile_brief`：从 user_profiles 表聚合的画像要点（最多 8 条，按 confidence desc）
- `current_time`：当前 ISO 时间
- `active_agent_rules`：enabled=1 的 agent_rules（条件 + tone）

Prompt 模板文件位置：`prompts/intake.md`（Phase 5 实现）。

## 6. 输出处理（actions → 实体创建）

| actions 字段 | 触发动作 | 实体创建字段映射 |
| --- | --- | --- |
| create_task=true | INSERT tasks | title, description, due_at, priority='medium' default, estimated_minutes, source_event_id=event.id, status='inbox' |
| create_journal=true | INSERT journal_entries | entry_date=today, raw_content=event.raw_content, source_event_id=event.id（AI 摘要后续异步更新） |
| create_idea=true | INSERT ideas | title, raw_content=event.raw_content, source_event_id=event.id |
| create_reminder=true | INSERT reminders | remind_at, reminder_type=reminder.type, message, task_id=上一步创建的 task id（如有） |
| update_user_profile=true | UPSERT user_profiles | 按 LLM 输出更新画像（confidence 由 LLM 给出） |
| link_to_project=true | UPDATE 关联实体的 project_id | 按 project_candidates 匹配 / 新建 project |
| write_markdown=true | 调用 markdown-sync 写文件 | 仅当用户在 Settings 启用了 Markdown 同步 |

## 7. should_reply 处理

```
should_reply = true
  → 生成 conversation_message (role='assistant', content=reply_text)
  → 关联到当前 conversation
  → UI Chat Sidebar 实时插入该消息
should_reply = false
  → 不生成 assistant message
  → silent 模式
```

## 8. 失败 Fallback

| 失败类型 | 行为 |
| --- | --- |
| LLM API 超时 / 网络错误 | Event 标记 `ai_processed=0`，metadata.intake_status='pending_retry'，UI 显示「待处理」 |
| LLM 返回非 JSON | 尝试宽容解析（提取 `{...}` 子串）；仍失败 → fallback |
| JSON 解析失败 | 同上 |
| Zod 校验失败 | 落库 raw_response 到 events.metadata，标记 `intake_status='schema_error'`；不创建任何实体；UI 显示「需人工确认」 |
| risk_level='high' | 即使 actions 触发，也禁止自动创建；改为生成 conversation_message 提示用户确认 |

## 9. LLM Provider 配置

V0 必须支持多 Provider，但同一时刻仅一个 `is_active=1`。详见 zhuzhao-core §4.3 的 `llm_providers` 表。

- Provider 类型支持：openai / azure / ollama / custom
- API Key 仅本地存储（不入日志、不上传）
- 支持连接测试（Phase 4）

## 10. 非功能性要求

- Intake 调用异步进行，UI 立即返回（输入框不阻塞）
- 单次 Intake 超时默认 30s，可配置
- 重试策略：指数退避，最多 3 次
- 所有 Intake 结果必须可在 UI 上回溯到源 Event

## 11. 验收（Phase 5）

- [ ] 输入「明天晚上前把烛照的开发任务书整理完」→ 自动生成 task + reminder
- [ ] 输入「今天有点摆烂，什么都没推进」→ 保存为 journal，回复 coach/challenge
- [ ] 输入「想到一个点，烛照可以以后接飞书机器人」→ 保存为 idea
- [ ] LLM 关闭时，输入仍可落 Event，标记 pending
- [ ] JSON 校验失败时不崩溃，UI 显示需人工确认
- [ ] 所有 AI 自动行为在 UI 上可见来源

## 12. 开放问题

| ID | 问题 | 当前处理 |
| --- | --- | --- |
| L1 | 上下文窗口超长时如何裁剪 recent_tasks？ | 按时间 + token 预算裁剪；优先逾期 / 高优先级任务 |
| L2 | 多语言输入？ | V0 默认中文，Prompt 写中文；英文输入不报错即可 |
| L3 | 用户编辑 AI 创建的 task 后是否反馈给 LLM？ | V0 不反馈，仅人工修正 |
