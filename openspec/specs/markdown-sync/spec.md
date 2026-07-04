# Spec · markdown-sync（Markdown / Obsidian 同步）

> Markdown 同步是可选增强。未配置目录时 App 必须完整可用。本 spec 定义目录结构、文件路径、文件格式与触发时机。

## Purpose

定义烛照系统与本地 Markdown / Obsidian 仓库的可选同步规则：启用方式、目录结构、文件路径、文件格式、触发时机与安全约束，确保未配置目录时 App 完整可用。

## Requirements

### Requirement: 默认关闭，未配置时 App 完整可用

系统 SHALL 默认禁用 Markdown 同步；SHALL 在未配置目录时保证 Dashboard / Chat / Intake / 每日总结等所有功能正常工作。

#### Scenario: 未启用同步时写日记

- **WHEN** 用户写日记且 Markdown 同步未启用
- **THEN** 仅写入 journal_entries 表，不创建任何 .md 文件，App 不报错

### Requirement: 启用时自动创建标准目录结构

系统 SHALL 在用户首次配置目录后自动创建 [§3](#3-目录结构) 列出的 8 个标准子目录（00_Inbox ~ 70_AgentMemory）。

#### Scenario: 首次启用同步

- **WHEN** 用户在 Settings 选择目录并打开同步开关
- **THEN** 系统在 <root>/Zhuzhao/ 下创建全部 8 个子目录；如已存在则保留

### Requirement: V0 仅单向同步 DB → Markdown

系统 SHALL 仅将 SQLite 数据写入 Markdown 文件；SHALL NOT 解析 Obsidian 中用户对 Markdown 的修改并回写 DB。

#### Scenario: 用户在 Obsidian 编辑 .md 文件

- **WHEN** 用户在 Obsidian 中修改了烛照生成的 20_Journal/2026-07-04.md
- **THEN** 系统不读取该修改；下次烛照写入该日记时覆盖用户修改（V0 行为）

### Requirement: 触发时机

系统 SHALL 在以下事件触发同步写入：journal 写入 / 更新 → 20_Journal/YYYY-MM-DD.md；DailyReview 生成 → 60_Reviews/Daily/YYYY-MM-DD.md；idea 写入 → 40_Ideas/{slug}.md；project 写入 → 50_Projects/{slug}.md；Intake actions.write_markdown=true → 00_Inbox/{ts}-{slug}.md。

#### Scenario: 写日记触发同步

- **WHEN** 用户写一条新日记并启用同步
- **THEN** 系统写入 journal_entries 后立即写入对应 .md 文件，格式见 [§4.1](#41-日记)

### Requirement: 安全约束

系统 SHALL 仅写入 <root>/Zhuzhao/ 之下；SHALL 校验路径不穿越；SHALL NOT 删除任何已存在文件；SHALL NOT 修改 Obsidian 配置。

#### Scenario: 路径穿越拦截

- **WHEN** 某次同步计算出的目标路径不在 <root>/Zhuzhao/ 之下
- **THEN** 系统拒绝写入并记录日志

#### Scenario: 写入失败不阻塞 DB

- **WHEN** Markdown 写入失败（权限 / 磁盘满 / 文件占用）
- **THEN** DB 操作不回滚；系统 Toast 提示并记录日志

### Requirement: 「打开目录」按钮

系统 SHALL 在 Settings 同步配置区提供「打开目录」按钮，调用系统文件管理器打开 <root>/Zhuzhao/。

#### Scenario: 点击打开目录

- **WHEN** 用户点击「打开目录」按钮
- **THEN** 系统文件管理器打开 Zhuzhao 目录（Windows 资源管理器 / macOS Finder / Linux xdg-open）

---

## 详细设计

## 1. 概述

| 属性 | 值 |
| --- | --- |
| Capability | markdown-sync |
| 依赖 | journal-memory / task-supervision |
| Phase | V0 / Phase 8 实现 |
| Status | 设计中（Phase 0） |
| 默认状态 | 关闭（未配置目录时 App 完整可用） |

## 2. 启用方式

- Settings → Markdown / Obsidian 同步 → 启用开关
- 选择目录（系统文件选择器）
- 自动创建烛照标准目录结构（§3）
- 「打开目录」按钮：用系统默认文件管理器打开

## 3. 目录结构

用户配置根目录 `<root>` 后，自动创建：

```
<root>/
└── Zhuzhao/
    ├── 00_Inbox/
    ├── 10_Daily/
    ├── 20_Journal/
    ├── 30_Tasks/
    ├── 40_Ideas/
    ├── 50_Projects/
    ├── 60_Reviews/
    │   └── Daily/
    └── 70_AgentMemory/
```

| 目录 | 用途 |
| --- | --- |
| 00_Inbox | 未分类的事件原文 |
| 10_Daily | 每日快速笔记（V0 可空） |
| 20_Journal | 日记 |
| 30_Tasks | 任务（按 project 子目录，V1） |
| 40_Ideas | 灵感 |
| 50_Projects | 项目说明 |
| 60_Reviews/Daily | 每日总结 |
| 70_AgentMemory | 由 AI 写入的长期记忆 / 画像快照 |

## 4. 文件路径与命名

### 4.1 日记

路径：`<root>/Zhuzhao/20_Journal/YYYY-MM-DD.md`

格式：

```markdown
# YYYY-MM-DD 日记

## 原文

{raw_content}

## AI 摘要

{ai_summary}

## 标签

{#tag1 #tag2}

## 关联项目

- [[50_Projects/项目名|项目名]]
```

### 4.2 每日总结

路径：`<root>/Zhuzhao/60_Reviews/Daily/YYYY-MM-DD.md`

格式：

```markdown
# YYYY-MM-DD 每日总结

## 今日完成

- [x] 任务 A（completion_note）

## 今日延期

- 任务 B（已延期 N 次：failure_reason）

## 今日记录

- 日记摘要...

## 今日灵感

- 灵感 A

## 拖延 / 逃避点

- 描述...

## 明日重点

1. 任务 X（reason）
2. ...

## 烛照建议

{supervisor_advice}
```

### 4.3 灵感

路径：`<root>/Zhuzhao/40_Ideas/{slugified-title}.md`

格式：

```markdown
# {title}

## 原文

{raw_content}

## 摘要

{summary}

## 标签

{#tags}

## 状态

{status}
```

### 4.4 项目

路径：`<root>/Zhuzhao/50_Projects/{slugified-name}.md`

格式：

```markdown
# {name}

## 描述

{description}

## 目标

{goals}

## 关联任务

- [[30_Tasks/任务标题]]
```

## 5. 同步方向与触发

| 触发 | 动作 |
| --- | --- |
| 写入 / 更新 journal_entries | 同步写入 `20_Journal/YYYY-MM-DD.md`（覆盖文件） |
| 生成 DailyReview | 同步写入 `60_Reviews/Daily/YYYY-MM-DD.md` |
| 创建 / 更新 ideas | 同步写入 `40_Ideas/{slug}.md` |
| 创建 / 更新 projects | 同步写入 `50_Projects/{slug}.md` |
| Intake 输出 `actions.write_markdown=true` 且 raw_should_be_saved=true | 写入 `00_Inbox/{timestamp}-{slug}.md` |

**V0 仅单向**：DB → Markdown。Obsidian 中编辑 Markdown 不回写 DB。

## 6. 错误处理

| 场景 | 行为 |
| --- | --- |
| 目录不存在 | 自动创建（mkdir -p） |
| 文件被占用 / 无写权限 | Toast 错误，不阻塞 DB 操作；记录本地日志 |
| 同步失败 | 重试 1 次；仍失败标记 `sync_status='failed'`（V1 加表） |
| 用户删除目录 | App 不崩；下次写入失败 Toast 提示重新配置 |

## 7. 安全

- 仅写入用户配置的 `<root>/Zhuzhao/` 目录
- 不允许路径穿越（写入前校验路径在 `<root>/Zhuzhao/` 之下）
- 不删除任何已存在文件（V0 仅覆盖烛照自己生成的文件）
- 不修改 Obsidian 配置

## 8. 验收（Phase 8）

- [ ] 未配置目录时 App 完整可用（Dashboard / Chat / Intake / 每日总结均正常）
- [ ] 配置目录后自动创建目录结构
- [ ] 写日记 → 同步生成 `20_Journal/YYYY-MM-DD.md`
- [ ] 生成每日总结 → 同步生成 `60_Reviews/Daily/YYYY-MM-DD.md`
- [ ] 创建灵感 → 同步生成 `40_Ideas/{slug}.md`
- [ ] 「打开目录」按钮可调用系统文件管理器
- [ ] Obsidian 可直接打开并渲染生成内容

## 9. 开放问题

| ID | 问题 | 当前处理 |
| --- | --- | --- |
| M1 | 用户在 Obsidian 编辑后是否回写 DB？ | V0 不回写，仅单向同步 |
| M2 | 双链 [[...]] 是否解析为 topic / project？ | V0 仅生成，不解析 |
| M3 | 大文件 / 性能？ | 单文件 < 100KB，无性能问题 |
| M4 | slug 命名冲突？ | V0 重名时附加 `-2`、`-3` 后缀 |
