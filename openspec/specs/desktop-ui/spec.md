# Spec · desktop-ui（桌面端 UI 信息架构与组件）

> 详细视觉与交互规范见 [docs/UI_UX_SPEC.md](../../../docs/UI_UX_SPEC.md)。本 spec 定义结构层：信息架构、页面清单、布局、组件需求与状态约定。

## Purpose

定义烛照桌面端 UI 的信息架构、主布局、页面清单、组件选型、状态色系统与交互原则，确保桌面生产力工具气质（冷静、克制、有压迫感）并满足「烛照」监督主题。

## Requirements

### Requirement: 三栏主布局

系统 SHALL 提供左导航（64/200px 折叠态）+ 中主内容区（flex-1）+ 右 Chat Sidebar（320px 可折叠）的三栏布局。

#### Scenario: Chat Sidebar 折叠

- **WHEN** 用户点击折叠按钮或按 Cmd/Ctrl+B
- **THEN** Chat Sidebar 收起为 0 宽，顶部留烛形按钮可重新展开

### Requirement: 7 个核心页面

系统 SHALL 提供 Dashboard / Inbox / Tasks / Journal / Ideas / Reviews / Settings 共 7 个页面，可通过左导航切换。

#### Scenario: 切换页面

- **WHEN** 用户点击左导航某项或按 Cmd/Ctrl+1..7
- **THEN** 主内容区切换至对应页面，URL / state 同步

### Requirement: 深色主题为默认

系统 SHALL 默认使用深色主题；SHALL 支持浅色主题切换；状态色 SHALL 按 [§7](#7-状态色系统) 定义。

#### Scenario: 延期任务视觉压力

- **WHEN** task.delay_count >= 2
- **THEN** 任务卡片左侧色条为 rose-600 红色，置顶显示；Dashboard 顶部出现红色「烛照监督提醒」区

### Requirement: 快速输入始终可用

系统 SHALL 在 Dashboard 顶部提供吸顶快速输入框；SHALL 支持全局快捷键 Cmd/Ctrl+I 唤起。

#### Scenario: 全局唤起快速输入

- **WHEN** 用户在任意页面按 Cmd/Ctrl+I
- **THEN** 弹出快速输入对话框，提交后创建 Event(source='quick_input')

### Requirement: AI 自动行为必须可见来源

系统 SHALL 在每个 AI 创建的实体（task / journal / idea / reminder）卡片上显示来源信息（HH:MM + 原始输入摘要 + event_id）。

#### Scenario: 任务卡片显示来源

- **WHEN** 用户查看由 Intake 自动创建的 task
- **THEN** 卡片显示「来源：09:12 输入」标签，hover 显示 event_id

### Requirement: 高风险动作必须确认

系统 SHALL 对删除任务、取消任务、清空数据等危险操作使用 Dialog 二次确认；SHALL 禁用所有 V0 范围外动作。

#### Scenario: 删除任务前确认

- **WHEN** 用户点击「删除任务」
- **THEN** 弹出 Dialog 显示「此操作不可撤销，确认删除？」+ [取消] [删除] 按钮

### Requirement: 日记原文在 UI 上永远可见

Journal 页面 SHALL 将 raw_content 显示在最显眼位置；ai_summary / tags / mood SHALL 默认折叠。

#### Scenario: 查看日记

- **WHEN** 用户打开某条日记
- **THEN** 原文以大字体置顶；AI 摘要、标签、情绪默认折叠，需点击展开

---

## 详细设计

## 1. 概述

| 属性 | 值 |
| --- | --- |
| Capability | desktop-ui |
| 依赖 | zhuzhao-core / llm-intake / task-supervision / journal-memory |
| Phase | V0 / Phase 1 起骨架 |
| Status | 设计中（Phase 0） |

## 2. 设计基调

- 桌面生产力工具，**冷静、克制、有压迫感**
- 像个人指挥中心 / 每日作战室
- 「烛照」意象：照见真实状态、拖延、借口和行动
- **不是**花哨 AI 聊天玩具；**不是**企业后台；**不是**传统 Todo 列表
- 深色优先，支持浅色切换
- 主色：暖色 / 烛光色 / 琥珀色作为强调
- 背景：深灰、墨色、低对比卡片
- 卡片式信息架构
- 任务状态要清晰；延期 / 阻塞 / 到期任务要有明显视觉压力
- 聊天侧边栏不要喧宾夺主
- 快速输入要非常显眼

## 3. 信息架构

```
烛照
├── Dashboard           # 每日作战室
├── Inbox               # 待处理 / 待规划的事件与任务
├── Tasks               # 全部任务（按状态 / 项目 / 主题筛选）
├── Journal             # 日记（全量保存，原文可见）
├── Ideas               # 灵感
├── Reviews             # 每日总结 / 复盘
└── Settings
    ├── LLM Provider
    ├── 监督强度
    ├── Markdown / Obsidian 同步
    ├── 数据导出
    └── 关于
```

## 4. 主布局

```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌────────┐  ┌────────────────────────────────────┐  ┌──────────────┐  │
│ │        │  │                                    │  │              │  │
│ │  Left  │  │         Main Content               │  │ Chat Sidebar │  │
│ │  Nav   │  │                                    │  │              │  │
│ │        │  │   (Dashboard / Tasks / Journal /    │  │  - 历史对话  │  │
│ │  64px  │  │    Ideas / Reviews / Settings)      │  │  - 用户输入  │  │
│ │        │  │                                    │  │  - AI 回复   │  │
│ │        │  │                                    │  │  - 任务追问  │  │
│ │        │  │                                    │  │              │  │
│ └────────┘  └────────────────────────────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
   64px              flex-1                              320px（可折叠）
```

- 左导航：图标 + label，宽 64px（折叠）或 200px（展开），可记忆状态
- 中间主区：自适应宽度
- 右侧 Chat Sidebar：320px 宽，可折叠；折叠后顶部留一个圆形「烛」图标按钮唤起

## 5. 页面清单与职责

### 5.1 Dashboard（首屏 / 作战室）

必须展示：

1. 今日最重要任务（Top 1，醒目大卡）
2. 今日到期任务列表
3. 延期任务列表（按 delay_count desc，delay_count>=2 红色高亮）
4. 今日输入（最近 events，最多 5 条）
5. 最近日记（最近 1-3 条 entry_date）
6. 最近灵感（最近 1-3 条）
7. 烛照监督提醒（harsh 任务 / 未回应追问）
8. 快速输入框（顶部，吸顶）
9. 每日总结入口（右上角按钮）

### 5.2 Inbox

- 显示 `status='inbox'` 的 tasks 与未 refined 的 ideas
- 支持拖拽到 Tasks / Projects（V1）
- V0：列表 + 「转为 Task」「转为 Idea」按钮

### 5.3 Tasks

- Tabs：今日 / 进行中 / 延期 / 已完成 / 全部
- 列表视图：卡片，左侧状态色条，标题 + due_at + delay_count
- 任务详情：Sheet 抽屉，展示 description / failure_reason / completion_note / source event
- 顶部：筛选（项目 / 主题 / 优先级 / 状态）
- 新建：右上角按钮，弹窗仅必填字段

### 5.4 Journal

- 左侧日期列表（最近 30 天有日记的日期）
- 右侧：原文（大字体）+ AI 摘要（折叠）+ tags + mood
- 新建：右上角按钮，进入编辑模式
- 顶部：搜索（V0 仅按 tags / 关键词 LIKE）
- **原文永远在最显眼位置**，AI 摘要折叠

### 5.5 Ideas

- 卡片网格（每张卡片：title / summary / tags / status badge）
- 点击卡片展开详情
- 新建按钮

### 5.6 Reviews

- 顶部：日期选择 + 「生成今日总结」按钮
- 主体：渲染 DailyReview 内容（completed / delayed / new / journals / ideas / procrastination / tomorrow / 烛照建议）
- 历史总结列表（左侧）

### 5.7 Settings

- LLM Provider 配置（多 Provider，含连接测试按钮）
- 监督强度（slider：温和 / 标准 / 严厉）
- Markdown / Obsidian 同步（启用开关 + 目录选择 + 「打开目录」按钮）
- 数据导出（全量 / 单类型）
- 关于（版本号、本地数据库路径、日志路径）

## 6. 组件清单

基于 shadcn/ui：

| 组件 | 用途 |
| --- | --- |
| Button | 主操作 |
| Card | 信息块容器 |
| Dialog | 新建 / 确认 |
| Sheet | 任务详情抽屉 |
| Tabs | Tasks / Reviews 页面切换 |
| Badge | 状态、优先级、reply_mode 标签 |
| Command | 全局快速命令面板（Cmd/Ctrl+K） |
| ScrollArea | 列表区域 |
| Input / Textarea | 表单 |
| DropdownMenu | 上下文菜单 |
| Sonner (Toast) | 通知反馈 |
| Tooltip | 图标说明 |

辅助：

- Lucide Icons：导航、状态、动作图标
- 自定义 `CandleIcon`：烛照品牌图标（可作为 App 图标与导航顶部 logo）

V0 不使用：React Flow（任务关系图，留 V1）

## 7. 状态色系统

| 状态 | 颜色（深色主题） | 含义 |
| --- | --- | --- |
| inbox | 灰（zinc-400） | 待处理 |
| planned / scheduled | 蓝（sky-400） | 已规划 |
| doing | 琥珀（amber-400） | 进行中 |
| done | 绿（emerald-400） | 完成 |
| delayed（1 次） | 橙（orange-500） | 延期 |
| delayed（≥2 次） | 红（rose-600） | 严重延期，置顶 |
| blocked | 紫（violet-500） | 阻塞 |
| dropped | 灰（zinc-600） | 已放弃 |
| review_needed | 黄（yellow-400） | 待人工确认 |
| harsh 通知 | 红（rose-700，闪烁边框） | 严厉监督提醒 |

## 8. 交互原则

- 用户输入要快（Quick Input 全局快捷键 Cmd/Ctrl+I）
- 用户不要被复杂表单阻塞（最少必填字段）
- AI 自动判断结构
- 必要时再追问
- 所有 AI 自动行为都要能在 UI 上看到来源（事件 ID / 创建原因）
- 高风险动作必须禁止或确认（Dialog 二次确认）
- 日记原文永远可见
- AI 摘要不能替代原文

## 9. 全局快捷键（V0）

| 快捷键 | 动作 |
| --- | --- |
| Cmd/Ctrl+K | 全局命令面板（Command） |
| Cmd/Ctrl+I | 快速输入（任意位置唤起） |
| Cmd/Ctrl+B | 折叠 / 展开 Chat Sidebar |
| Cmd/Ctrl+1..7 | 切换导航页面 |
| Cmd/Ctrl+N | 在当前页面新建 |

## 10. 空状态 / 加载 / 错误状态

详见 [docs/UI_UX_SPEC.md §13-§15](../../../docs/UI_UX_SPEC.md)。

## 11. 验收（Phase 1+）

- [ ] App 启动后默认进入 Dashboard
- [ ] 左导航可切换 7 个页面
- [ ] Chat Sidebar 可折叠 / 展开
- [ ] 快速输入框在 Dashboard 顶部，可输入并提交
- [ ] 提交后 Event 落库（Phase 3 起）
- [ ] 深色主题完整可用，浅色可切换

## 12. 开放问题

| ID | 问题 | 当前处理 |
| --- | --- | --- |
| U1 | 是否需要全局快捷键唤起 App 窗口？ | V0 不做系统级快捷键，仅 App 内快捷键 |
| U2 | 是否支持多窗口（如单独日记窗口）？ | V0 单窗口 |
| U3 | 字体选择？ | 建议中文用「霞鹜文楷」或思源黑体；英文用 Inter；最终在 UI_UX_SPEC 决定 |
