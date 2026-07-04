# Spec · journal-memory（日记、灵感、对话、记忆与用户画像）

> 日记全量保存原文；AI 仅附加摘要 / 标签 / 情绪。对话与灵感由 AI 判断是否进入长期记忆。本 spec 定义相关实体的写入、读取、记忆升级与画像维护规则。

## Purpose

定义烛照系统中日记、灵感、对话、长期记忆与用户画像的写入、读取、记忆升级与画像维护规则，确保原文不丢、AI 字段为附加、敏感内容不进入长期画像。

## Requirements

### Requirement: 日记原文必须永久保存

系统 SHALL 永久保存 journal_entries.raw_content；ai_summary / tags / mood / topics / project_ids SHALL 仅为附加字段；任何写入路径 SHALL NOT 覆盖 raw_content（用户主动编辑除外）。

#### Scenario: Intake 创建日记

- **WHEN** LLM Intake 判定 content_type='journal' 且 raw_should_be_saved=true
- **THEN** 系统插入 journal_entries(raw_content=event.raw_content)；ai_summary 字段异步后续生成

#### Scenario: AI 重新生成摘要

- **WHEN** 用户点「重新生成 AI 摘要」
- **THEN** 系统仅更新 ai_summary / tags / mood；raw_content 不变

### Requirement: 灵感可独立创建或由 Intake 创建

系统 SHALL 支持用户在 Ideas 页面手动添加灵感；SHALL 在 Intake 判定 content_type='idea' 时自动创建。

#### Scenario: Intake 自动创建灵感

- **WHEN** 用户输入「想到一个点，烛照可以以后接飞书机器人」
- **THEN** 系统创建 idea，title/raw_content 来自输入，source_event_id 关联 Event

### Requirement: 对话长期记忆由 LLM 判定

系统 SHALL 默认 conversation_messages.save_to_memory=0；SHALL 仅在 LLM 判定对话含长期价值时设为 1；SHALL 在 risk_level='high' 时强制设为 0。

#### Scenario: LLM 判定需长期记忆

- **WHEN** LLM 返回 memory.save_level='long_term' 或 'profile'
- **THEN** conversation_messages.save_to_memory=1；可能写入 topics 或 user_profiles

### Requirement: 用户画像由 AI 维护且 UPSERT

系统 SHALL 通过 UPSERT (profile_key) 维护 user_profiles；SHALL 按 confidence 取 max 或加权更新；SHALL NOT 自动删除画像条目。

#### Scenario: 画像更新

- **WHEN** LLM 输出 update_user_profile=true 且给定 profile_updates
- **THEN** 系统对每个 profile_key 执行 UPSERT；confidence 取 max(原值, 新值)

#### Scenario: 敏感内容不入画像

- **WHEN** LLM 返回 risk_level='high'
- **THEN** 系统跳过 user_profiles 写入

### Requirement: 每日总结 V0 手动触发

系统 SHALL 在 Reviews 页面提供「生成今日总结」按钮；V0 SHALL NOT 实现自动定时；总结 SHALL 引用当日 task / journal / idea。

#### Scenario: 用户手动生成总结

- **WHEN** 用户在 Reviews 页面选择日期并点击「生成今日总结」
- **THEN** 系统调用 LLM（prompts/daily-review.md），输出 DailyReviewSchema，写入 reviews 表（含 sections JSON）

### Requirement: 数据导出支持 JSON

系统 SHALL 支持全量 JSON 导出与单类型导出（journal / task）；SHALL NOT 上传至任何远端服务。

#### Scenario: 全量导出

- **WHEN** 用户在 Settings 点击「导出全量数据」
- **THEN** 系统生成单个 JSON 文件包含所有表数据，保存到用户选择路径

---

## 详细设计

## 1. 概述

| 属性 | 值 |
| --- | --- |
| Capability | journal-memory |
| 依赖 | zhuzhao-core / llm-intake |
| Phase | V0 / Phase 7 实现 |
| Status | 设计中（Phase 0） |

## 2. 日记（JournalEntry）

### 2.1 核心不变量

> **JournalEntry.raw_content 必须完整保存用户原文；AI 摘要、标签、情绪只是附加字段。**
>
> - 不能只存摘要
> - 不能丢原文
> - 任何写操作不可覆盖 raw_content

### 2.2 写入路径

| 触发源 | 行为 |
| --- | --- |
| 用户在 Journal 页面直接写日记 | INSERT journal_entries(raw_content=原文, ai_summary=null)；异步触发 LLM 生成 ai_summary / tags / mood |
| 用户在 Chat / Quick Input 输入被 Intake 判为 `content_type='journal'` | INSERT events + INSERT journal_entries(raw_content=event.raw_content)；同步触发 LLM 生成 summary |
| 用户编辑日记 | **只允许更新 raw_content**（用户主动改），AI 字段再次异步重生成；保留版本可放 V1，V0 仅更新当前 |

### 2.3 LLM 处理（日记专属 prompt）

`prompts/journal-summary.md` 输入：

- `raw_content`：日记原文
- `recent_topics`：最近 topics（最多 5 条）
- `user_profile_brief`：画像要点

输出（Zod schema 见 §6）：

- `ai_summary`：1-3 句客观摘要（不替代原文）
- `mood`：unknown / positive / neutral / negative / frustrated / motivated
- `tags`：标签数组
- `should_update_profile`：是否建议更新画像

### 2.4 读取查询

| 查询 | 用途 |
| --- | --- |
| `SELECT * FROM journal_entries WHERE entry_date=?` | 单日日记 |
| `SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT 20` | 最近日记 |
| `SELECT * FROM journal_entries WHERE tags LIKE ?` | 按标签筛选（V0 简化 LIKE，V1 全文索引） |

## 3. 灵感（Idea）

### 3.1 写入路径

| 触发源 | 行为 |
| --- | --- |
| 用户在 Ideas 页面直接添加 | INSERT ideas(title, raw_content, status='inbox') |
| Intake 判为 `content_type='idea'` | INSERT ideas(title, raw_content, source_event_id, status='inbox') |

### 3.2 灵感状态

```
inbox        # 刚记录
refined      # 已被 AI 补充 summary / tags
linked       # 已关联到 topic / project
archived     # 已归档
```

### 3.3 读取查询

- 最近灵感：`ORDER BY created_at DESC LIMIT 20`
- 按 status 筛选

## 4. 对话（Conversation / ConversationMessage）

### 4.1 写入路径

| 角色 | 写入 |
| --- | --- |
| 用户在 Chat Sidebar 发消息 | INSERT conversation_messages(role='user', content, event_id=新建 event.id, save_to_memory=0) |
| Intake 生成 assistant 回复 | INSERT conversation_messages(role='assistant', content, event_id=关联的 system event id, save_to_memory=由 LLM 决定) |
| Reminder 触发的追问 | INSERT conversation_messages(role='assistant', content=追问模板, event_id=null) |

### 4.2 长期记忆判定

`conversation_messages.save_to_memory` 由 Intake 决定：

- 默认 0
- LLM 判定对话包含长期价值（决策 / 反思 / 自我认知）→ 1
- 敏感内容（用户原话提及不想被记忆的内容）→ 强制 0

### 4.3 读取查询

- 单对话完整消息：`WHERE conversation_id=? ORDER BY created_at`
- 最近对话列表：`SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 20`

## 5. 长期记忆与用户画像

### 5.1 记忆分级（来自 Intake 的 memory.save_level）

| level | 含义 | 落地 |
| --- | --- | --- |
| none | 不记忆 | 仅存 Event 与 ConversationMessage |
| short_term | 短期上下文 | 写入 events.metadata，未来 7 天的 Intake 注入 |
| long_term | 长期记忆 | 写入 topics（如果识别为新主题）或追加到现有 topic.summary |
| profile | 升级到画像 | 写入 user_profiles |

### 5.2 user_profiles 维护规则

- 写入：UPSERT by (profile_key)
  - 已存在 → 更新 profile_value 与 confidence（取 max 或加权）
  - 不存在 → INSERT
- 删除：仅人工，V0 不自动删画像
- 敏感内容不自动入画像（V0 简化：由 LLM 在 Intake 时判断，risk_level=high 时跳过画像更新）

### 5.3 画像注入 Intake

按 confidence desc 取前 8 条，作为 `user_profile_brief` 注入 Intake Prompt。

## 6. JournalSummarySchema

```typescript
import { z } from 'zod';

export const JournalSummarySchema = z.object({
  ai_summary: z.string().min(1).max(500),
  mood: z.enum([
    'unknown', 'positive', 'neutral', 'negative',
    'frustrated', 'motivated'
  ]),
  tags: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  should_update_profile: z.boolean().default(false),
  profile_updates: z.array(z.object({
    profile_key: z.string(),
    profile_value: z.string(),
    confidence: z.number().min(0).max(1)
  })).default([])
});

export type JournalSummary = z.infer<typeof JournalSummarySchema>;
```

## 7. DailyReviewSchema（每日总结）

每日总结由 Reviews 页面手动触发，调用 `prompts/daily-review.md`，输出写入 `reviews` 表。

```typescript
import { z } from 'zod';

export const DailyReviewSchema = z.object({
  date: z.string(),                         // YYYY-MM-DD
  completed: z.array(z.object({
    task_id: z.string(),
    title: z.string(),
    completion_note: z.string().optional()
  })),
  delayed: z.array(z.object({
    task_id: z.string(),
    title: z.string(),
    delay_count: z.number(),
    failure_reason: z.string().optional()
  })),
  new_tasks: z.array(z.object({
    task_id: z.string(),
    title: z.string()
  })),
  journals: z.array(z.object({
    journal_id: z.string(),
    entry_date: z.string(),
    ai_summary: z.string()
  })),
  ideas: z.array(z.object({
    idea_id: z.string(),
    title: z.string()
  })),
  procrastination_patterns: z.array(z.string()),
  tomorrow_priorities: z.array(z.object({
    title: z.string(),
    reason: z.string()
  })).max(3),
  supervisor_advice: z.string()            // 烛照的监督建议
});

export type DailyReview = z.infer<typeof DailyReviewSchema>;
```

## 8. 每日总结规则

输入 LLM 的上下文：

- `target_date`：目标日期
- `tasks_today`：当日新增 / 完成 / 延期 / 进行中任务
- `journals_today`：当日日记原文 + AI 摘要
- `ideas_today`：当日灵感
- `recent_user_profile`：画像

输出（DailyReviewSchema）写入 `reviews` 表：

```sql
INSERT INTO reviews (
  id, review_date, review_type='daily',
  raw_content=AI 生成的完整 Markdown 文本,
  sections=JSON(DailyReview),
  source_event_ids=JSON(相关 event id),
  created_at=now
) ON CONFLICT (review_date, review_type) DO UPDATE SET ...;
```

## 9. 数据导出

V0 至少支持 JSON 导出（Phase 9）：

- 全量导出：所有表 dump 为单个 JSON
- 单类型导出：仅 journal / 仅 task

## 10. 验收（Phase 7）

- [ ] Journal 页面可写日记
- [ ] 日记 raw_content 完整保存，DB 层禁止 UPDATE 覆盖
- [ ] LLM 自动生成 ai_summary / tags / mood
- [ ] Reviews 页面可手动生成每日总结
- [ ] 总结引用当日 task / journal / idea
- [ ] 总结保存到 reviews 表
- [ ] 总结可在 Reviews 页面查看
- [ ] Markdown 同步（如启用）按 markdown-sync spec 写文件

## 11. 开放问题

| ID | 问题 | 当前处理 |
| --- | --- | --- |
| J1 | 用户编辑 raw_content 后是否重新生成 AI 字段？ | V0 重新生成（异步），不保留旧版本 |
| J2 | 日记是否支持附件（图片）？ | V0 不支持，仅文本 |
| J3 | 画像如何防止 LLM 写入互相矛盾的内容？ | V0 由 LLM confidence 取 max；冲突检测留 V1 |
| J4 | 敏感内容如何判定？ | V0 由 LLM risk_level='high' 触发跳过画像更新 |
