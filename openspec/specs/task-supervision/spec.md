# Spec · task-supervision（任务监督闭环）

> 任务到期 → 追问 → 完成 / 未完成 → 延期累计 → harsh 监督模式。本 spec 定义任务状态机、Reminder 调度、追问交互与延期累计规则。

## Purpose

定义烛照系统中任务的状态机、Reminder 调度、Chat Sidebar 追问交互、延期累计与严厉监督（harsh）触发规则，确保任务不会被「写下来就忘」。

## Requirements

### Requirement: 任务状态机必须严格遵守

系统 SHALL 仅允许 [§2.2](#22-状态转移规则) 列出的状态转移；任何非法转移 SHALL 被拒绝并报错。

#### Scenario: 合法转移 inbox → planned → scheduled

- **WHEN** 用户为 inbox 任务填好 due_at 并保存
- **THEN** task.status='planned'；当 reminder remind_at 到达前到 scheduled_at 时进入 'scheduled'

#### Scenario: 非法转移 done → doing

- **WHEN** 系统尝试将 status='done' 的任务改回 'doing'
- **THEN** 操作被拒绝，抛出状态机错误

### Requirement: Reminder 到期必须触发追问

系统 SHALL 在 reminder.remind_at 到达时（前端 60s 轮询）将 reminder.status='fired'，task.status='doing'，并在 Chat Sidebar 插入追问 assistant 消息。

#### Scenario: 任务到期且 App 在前台

- **WHEN** reminder.remind_at <= now() 且 App 在前台
- **THEN** Chat Sidebar 出现追问消息；提供「完成 / 没完成 / 延期 / 取消 / 拆小」5 个快捷按钮

#### Scenario: App 未运行期间到期

- **WHEN** App 启动时扫描到 fired/pending 状态遗留且 remind_at < today
- **THEN** 自动标记 task.status='delayed'，delay_count+1，failure_reason='用户未回复'

### Requirement: 用户未完成时必须延期累计

系统 SHALL 在用户回复未完成时执行：写 failure_reason、task.delay_count+1、task.status='delayed'、reminder.status='resolved'、创建下一次 reminder。

#### Scenario: 第一次延期

- **WHEN** 用户点「没完成」并输入原因，且当前 delay_count=0
- **THEN** task.delay_count=1, task.status='delayed', 新 reminder remind_at=now+1d（默认）

#### Scenario: 第二次延期触发 harsh

- **WHEN** 用户再次点「没完成」使 delay_count 达到 2
- **THEN** 系统调用 LLM 生成 reply_mode='harsh' 消息，并插入对话；Dashboard 顶部置顶该任务为逾期重点

### Requirement: delay_count 单调递增不可重置

系统 SHALL 保证 delay_count 单调递增；SHALL NOT 因任何状态转移（除新建任务）重置为 0。

#### Scenario: 任务重新排期不重置 delay_count

- **WHEN** delayed 任务被用户重新设置 due_at 进入 scheduled
- **THEN** delay_count 保持不变，仅 reminder 重新创建

### Requirement: 用户不回复的处理

V0 简化：当 reminder 触发后用户当日未操作，次日 App 启动 SHALL 自动标记 task.status='delayed'，delay_count+1，failure_reason='用户未回复'。

#### Scenario: 连续 2 日未回复进入 harsh

- **WHEN** 某 reminder 触发后连续 2 日用户未回复
- **THEN** 系统在 Dashboard 顶部「烛照监督提醒」区显示该任务；下一次 LLM 回复使用 harsh 语气

---

## 详细设计

## 1. 概述

| 属性 | 值 |
| --- | --- |
| Capability | task-supervision |
| 依赖 | zhuzhao-core / llm-intake |
| Phase | V0 / Phase 6 实现 |
| Status | 设计中（Phase 0） |

## 2. 任务状态机

### 2.1 状态枚举

```
inbox              # 刚创建，未规划
planned            # 已分析，未排期
scheduled          # 已排期，未到期
doing              # 进行中
blocked            # 阻塞
delayed            # 延期（已触发过 reminder 且未完成）
done               # 完成
dropped            # 主动放弃
review_needed      # 需人工确认（LLM 不确定 / risk=high）
```

### 2.2 状态转移图

```
                       ┌──────────────┐
                       │   inbox      │ ← Intake 默认
                       └──────┬───────┘
                              │ 用户规划
                              ▼
                       ┌──────────────┐
                       │   planned    │
                       └──────┬───────┘
                              │ 用户排期
                              ▼
                       ┌──────────────┐
        ┌─────────────▶│  scheduled   │
        │              └──────┬───────┘
        │                     │ 到期 reminder 触发
        │                     ▼
        │              ┌──────────────┐
        │              │    doing     │
        │              └──────┬───────┘
        │                     │
        │       ┌─────────────┼─────────────┐
        │       │ 完成        │ 未完成       │ 阻塞
        │       ▼             ▼              ▼
        │  ┌─────────┐  ┌──────────┐  ┌──────────┐
        │  │  done   │  │ delayed  │  │ blocked  │
        │  └─────────┘  └────┬─────┘  └────┬─────┘
        │                    │              │
        │                    │ 重新排期      │ 解除阻塞
        │                    └──────┬───────┘
        │                           │
        └───────────────────────────┘
                                    │ 用户主动放弃
                                    ▼
                              ┌──────────────┐
                              │   dropped    │
                              └──────────────┘

        review_needed: 由 LLM risk=high 或 Zod 校验失败进入，等待人工确认
```

### 2.3 状态转移规则

| 当前 | 目标 | 触发 | 副作用 |
| --- | --- | --- | --- |
| inbox | planned | 用户编辑任务（填好 due_at） | 无 |
| planned | scheduled | reminder 到期前到达 scheduled_at | 无 |
| scheduled | doing | reminder.status='fired' | 触发 Chat Sidebar 追问 |
| doing | done | 用户回复完成 | 写 completion_note, completed_at=now, reminder.status='resolved' |
| doing | delayed | 用户回复未完成 | delay_count+1, 写 failure_reason, 创建下一次 reminder |
| doing | blocked | 用户回复阻塞 | 写 failure_reason（描述阻塞原因） |
| delayed | scheduled | 用户重新排期 | 创建新 reminder |
| * | dropped | 用户主动放弃 | reminder.status='cancelled' |
| * | review_needed | LLM risk=high / 校验失败 | 等待人工确认 |

## 3. Reminder 调度

### 3.1 Reminder 类型

| type | 含义 | 触发条件 |
| --- | --- | --- |
| task_due | 任务到期 | remind_at = task.due_at（或提前 N 分钟） |
| check_in | 任务进行中检查 | remind_at = scheduled_at + estimated_minutes |
| journal | 日记提醒 | remind_at = 配置的每日写日记时间 |
| review | 每日总结提醒 | remind_at = 配置的每日总结时间 |
| custom | 自定义 | 由 Intake 创建 |

### 3.2 Reminder 状态

```
pending → fired → resolved（用户完成）
              → snoozed（用户要求稍后）→ pending（重新算 remind_at）
              → cancelled（任务 dropped）
```

### 3.3 Scheduler 行为

V0 实现：

- App 启动时扫描 `reminders WHERE status='pending' AND remind_at <= now()`
- 触发：在 Chat Sidebar 插入一条 assistant message（追问「完成了吗？」），并附任务上下文
- 同时 reminder.status='fired'，task.status='doing'
- 后台轮询：每 60s 扫描一次 pending reminder

V0 不实现：系统级通知 / 后台守护 / 跨日触发器。App 必须在前台运行才会触发 reminder。

## 4. 追问交互（Chat Sidebar）

### 4.1 触发追问的消息格式

当 reminder 触发时，assistant 消息：

```
[烛照追问] 任务「{task.title}」到期。
状态：{task.status}
原 deadline：{task.due_at}
已延期次数：{task.delay_count}

完成了吗？请回复：
  - 完成
  - 没完成（附原因）
  - 延期
  - 取消
  - 拆小
```

UI 提供 5 个快捷按钮（不只是自然语言识别，V0 双轨）：

| 按钮 | 动作 |
| --- | --- |
| 完成 | task.status='done', reminder.status='resolved' |
| 没完成 | 进入「追问原因」子流程 |
| 延期 | 创建新 reminder（默认 +1d，可调） |
| 取消 | task.status='dropped', reminder.status='cancelled' |
| 拆小 | 进入拆任务子流程（V0 简化：弹窗输入子任务标题，每条新建 task） |

### 4.2 没完成的子流程

```
[烛照] 这次为什么没完成？
[user 输入原因]
  → 写 task.failure_reason
  → task.delay_count += 1
  → task.status = 'delayed'
  → reminder.status = 'resolved'
  → 创建下一次 reminder（默认 remind_at = now + 1d，可由用户改）
  → 若 delay_count >= 2：
      → reply_mode = 'harsh'
      → 在同一对话插入一条 harsh 语气消息（见 llm-intake spec §5.3）
```

## 5. 延期累计与 harsh 触发

| delay_count | 默认 reply_mode | 行为 |
| --- | --- | --- |
| 0 | ack / coach | 正常追问 |
| 1 | coach / challenge | 追问 + 指出已延期一次 |
| ≥ 2 | **harsh** | 进入严厉监督模式，按 llm-intake §5.3 规则生成消息 |

harsh 模式额外动作：

- 在 Dashboard 顶部固定显示该任务为「逾期重点」
- 每日总结的「拖延 / 逃避点」section 必须列出
- 用户画像写入「该用户在 X 任务上累计延期 N 次」（confidence 由 LLM 给）

## 6. 用户不回复的处理

V0 简化策略：

| 场景 | 处理 |
| --- | --- |
| Reminder 触发后用户未回复，当日未再操作 | reminder.status 保持 'fired'；task.status 保持 'doing' |
| 次日 App 启动 | 扫描昨日未回复的 fired reminder → 自动标记 task.status='delayed'，delay_count+1，写 failure_reason='用户未回复' |
| 连续 2 日未回复 | reply_mode=harsh；Dashboard 顶部「昨日未回应任务」区显示 |

## 7. 数据写入清单

完成事件触发的写入：

```sql
-- 完成
UPDATE tasks SET status='done', completion_note=?, completed_at=?, updated_at=? WHERE id=?;
UPDATE reminders SET status='resolved', updated_at=? WHERE id=?;

-- 未完成
UPDATE tasks SET status='delayed', delay_count=delay_count+1, failure_reason=?, updated_at=? WHERE id=?;
UPDATE reminders SET status='resolved', updated_at=? WHERE id=?;
INSERT INTO reminders (id, task_id, remind_at, reminder_type, status, ...) VALUES (...);

-- harsh（delay_count >= 2 后由 LLM Intake 生成）
INSERT INTO conversation_messages (id, conversation_id, role='assistant', content=?, created_at=?, event_id=?);
INSERT INTO events (id, source='system', raw_content=?, event_type='reminder_fired');
```

## 8. Dashboard 集成

Dashboard 必须展示（详见 desktop-ui spec）：

- 今日到期任务（status='scheduled' AND due_at=today）
- 进行中任务（status='doing'，含未回复追问的）
- 延期任务（status='delayed'，按 delay_count desc 排序）
- 逾期重点（delay_count >= 2 的任务，红色卡片，置顶）

## 9. 验收（Phase 6）

- [ ] 创建一条带 due_at 的 task，到期后 Chat Sidebar 自动出现追问
- [ ] 点「完成」→ task.status='done'
- [ ] 点「没完成」+ 输入原因 → task.status='delayed', delay_count=1
- [ ] 连续 2 次没完成 → 自动出现 harsh 语气消息
- [ ] Dashboard 顶部出现逾期重点卡片
- [ ] 关闭 App 期间到期，重启 App 后扫描并标记 delayed

## 10. 开放问题

| ID | 问题 | 当前处理 |
| --- | --- | --- |
| T1 | 用户用自然语言说「我做完了」是否能识别？ | V0 双轨：按钮 + LLM 识别。识别失败兜底按钮 |
| T2 | 拆小任务的子任务是否继承原 delay_count？ | V0 不继承，子任务 delay_count=0 |
| T3 | 用户回复「延期 3 天」是否能解析时长？ | V0 默认 +1d，可由用户改 remind_at |
| T4 | Reminder scheduler 是否需要 Rust 后台进程？ | V0 前端 60s 轮询；后台守护留 V1 |
