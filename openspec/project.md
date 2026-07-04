# Zhuzhao · 烛照

> 本文件是 OpenSpec 工作流的项目级上下文。所有 capability spec（`openspec/specs/*/spec.md`）和未来 change proposal 都必须遵守这里的约束。

## 1. 项目定位

**烛照**是一个本地优先的强监督型个人 AI 助手。

一句话定位：

> 烛照是一个会记录、会整理、会追问、会复盘，必要时骂醒你的本地 AI 个人助手。

它不是普通 Todo App，也不是普通聊天机器人，而是一个**个人监督系统**。用户可以输入 Todo、灵感、日记、想法、问题。系统用大模型理解输入内容，自动判断是否创建任务、提醒、日记、灵感、长期记忆，是否回复用户，以及用什么语气回复。任务到期后，系统要主动追问完成情况；如果用户拖延、延期或逃避，系统可以进入严厉监督模式。

## 2. 项目元信息

| 字段 | 值 |
| --- | --- |
| 项目名（中文） | 烛照 |
| 英文代号 | Zhuzhao |
| 仓库名 | zhuzhao-desktop |
| 当前阶段 | Phase 0：规格与设计 |
| 当前 OpenSpec 版本 | 1.4.1 |
| 平台 | 桌面端（Windows 优先，跨平台目标） |
| 部署形态 | 本地优先，无云服务 |

## 3. 技术栈

| 类别 | 选型 | 说明 |
| --- | --- | --- |
| 桌面框架 | **Tauri** | 必选。当前开发机未安装 Rust/Cargo，Phase 1 前必须安装 rustup + Tauri CLI |
| 前端框架 | **React 18 + TypeScript** | 严格 TS，禁用 `any`（除 LLM 兜底） |
| 构建工具 | Vite | Tauri 推荐 |
| 样式 | **Tailwind CSS** | 深色优先 |
| 组件库 | **shadcn/ui** | 基于 Radix UI + Tailwind |
| 状态管理 | **Zustand**（首选） / Jotai（备选） | 选 Zustand，API 更线性 |
| 表单/校验 | **Zod** | LLM Intake JSON 必须用 Zod 校验 |
| 日期 | **date-fns** | 不可用 moment |
| LLM 客户端 | OpenAI-compatible client | 不绑定具体厂商 |
| 图标 | **Lucide Icons** | |
| 本地数据库 | **SQLite** | 通过 Tauri 插件或 better-sqlite3 |
| 包管理 | npm（pnpm 未安装，可在 Phase 1 切换） | |
| Node 版本 | v24.12.0（已安装） | |

> Phase 0 不写代码。所有技术栈依赖安装留到 Phase 1。

## 4. 推荐项目结构

```
zhuzhao-desktop/
├── src/                     # 前端源码
│   ├── app/                 # App 入口、路由、Provider
│   ├── components/          # 通用组件（shadcn/ui + 自定义）
│   ├── features/            # 按功能域组织（tasks / journal / ideas / chat / intake / reviews / settings）
│   ├── lib/                 # 工具库（db / llm / markdown / date / id）
│   ├── stores/              # Zustand stores
│   ├── types/               # 共享类型与 Zod schema
│   └── ...
├── src-tauri/               # Tauri Rust 后端
│   └── ...
├── docs/                    # 人类可读设计文档
│   ├── UI_UX_SPEC.md
│   └── ROADMAP_PHASES.md
├── openspec/                # OpenSpec 规格（本目录）
│   ├── project.md
│   └── specs/
├── prompts/                 # LLM Prompt 模板（intake / journal-summary / daily-review / harsh-supervisor）
├── migrations/              # SQLite 迁移脚本（编号 + .sql）
└── README.md
```

## 5. 核心产品闭环

所有功能必须围绕以下闭环开发，不允许先做边缘功能：

```
用户输入内容
  → 保存为 Event
  → 调用 LLM Intake
  → 返回结构化 JSON（Zod 校验）
  → 根据 JSON 创建 task / journal / idea / reminder
  → 根据 should_reply 决定是否回复
  → 到期 reminder 触发
  → 用户反馈完成 / 未完成
  → 记录完成质量或失败原因
  → 多次延期进入严厉监督
  → 每日总结
  → 可选 Markdown / Obsidian 同步
```

## 6. V0 范围

### 6.1 V0 必须实现

1. 桌面端应用（Tauri）
2. Dashboard 首页
3. 聊天侧边栏
4. 快速输入
5. 本地 SQLite 数据库
6. Event 原始事件记录
7. Todo 任务管理
8. Journal 日记管理（**全量保存原文**）
9. Idea 灵感管理
10. Reminder 本地提醒
11. Conversation 对话记录
12. LLM Provider 配置
13. LLM Intake 处理流水线
14. AI 判断是否回复
15. AI 自动创建本地任务、提醒、日记、灵感
16. 任务到期追问
17. 完成 / 未完成反馈
18. 多次延期后的严厉监督模式
19. 每日总结
20. Markdown / Obsidian 可选同步

### 6.2 V0 明确不做（可预留接口，禁止实现）

1. 手机端
2. 多端同步
3. 摄像头 / 麦克风 / 屏幕读取
4. 自动发邮件 / 外部消息
5. 自动执行 shell
6. 自动删除文件
7. 自动修改外部日历
8. 自动访问浏览器内容
9. 插件市场
10. 完整多 Agent 平台
11. 复杂工作流编排器
12. 云端账号系统
13. 云同步
14. 团队协作

## 7. 安全约束（硬性）

所有 Phase、所有 spec、所有 change proposal 必须遵守：

1. 不上传用户数据
2. API Key 必须本地保存
3. 不自动执行 shell
4. 不自动删除文件
5. 不自动发邮件或外部消息
6. 不访问未授权目录
7. 不实现摄像头 / 麦克风 / 屏幕读取
8. **LLM 输出必须用 Zod 校验**
9. JSON 解析失败必须 fallback（不能崩溃）
10. **日记原文不能丢**（raw_content 永久保存）
11. 所有危险动作必须禁止或人工确认

## 8. 设计与编码约定

- **语言**：所有 spec / docs / 代码注释使用中文（技术术语保留英文）
- **命名**：数据库表与字段使用 snake_case；TS 类型使用 PascalCase；变量使用 camelCase；常量使用 UPPER_SNAKE_CASE
- **YAGNI**：不实现 V0 范围外的功能
- **TDD**：新功能优先 TDD（user profile 已强制要求）
- **不要过度抽象**：一次性逻辑不抽 helper
- **不要添加多余错误处理**：仅在系统边界（用户输入、LLM API、文件 IO）校验
- **不要做向后兼容 shim**：直接删除/重命名，V0 不需要兼容
- **每个 commit 必须可独立测试**

## 9. OpenSpec 工作流约定

- **变更入口**：所有功能变更必须通过 `openspec change` 创建 change proposal，禁止直接修改 spec 之外的代码
- **流程**：proposal → specs → design → tasks → apply
- **不跳阶段**：Phase N 未验收前禁止进入 Phase N+1
- **Phase 0 边界**：仅产出规格与设计文档，不写任何功能代码、不安装运行时依赖
- **校验**：`openspec validate --specs` 必须通过

## 10. 词汇表

| 中文 | 英文 / 代号 | 含义 |
| --- | --- | --- |
| 烛照 | Zhuzhao | 系统本身。取「烛照」之意：照见真实状态、拖延、借口与行动 |
| 事件 | Event | 用户输入的最原始记录，所有处理的入口 |
| 任务 | Task | 有 deadline / 状态机的可执行项 |
| 日记 | JournalEntry | 全量保存原文，AI 仅附加摘要 / 标签 / 情绪 |
| 灵感 | Idea | 不一定可执行的想法 |
| 提醒 | Reminder | 触发追问 / 复盘 / 检查的机制 |
| 对话 | Conversation / Message | 与 AI 的对话历史 |
| 主题 | Topic | 跨实体的语义聚类 |
| 项目 | Project | 一组任务 / 日记 / 灵感的容器 |
| 用户画像 | User Profile | 由 AI 维护的对用户的认知 |
| 代理规则 | Agent Rule | 控制语气 / 触发条件的规则 |
| 严厉监督 | harsh mode | delay_count >= 2 时启用的强力问责模式 |
| Intake | LLM Intake | 用户输入经 LLM 结构化的处理流水线 |

## 11. 当前已知环境阻塞项（Phase 1 前必须解决）

| 阻塞项 | 影响 | 解决方式 |
| --- | --- | --- |
| Rust / Cargo / rustc 未安装 | 无法构建 Tauri | 安装 rustup（`https://rustup.rs`） |
| pnpm 未安装 | 包管理可选 | 可继续用 npm；如要统一，安装 pnpm |
| Tauri CLI 未安装 | 无法 `tauri dev` | `npm install -D @tauri-apps/cli` 或 `cargo install tauri-cli` |
| Windows WebView2 | Tauri 运行时依赖 | 一般 Win11 已自带，Phase 1 验证 |

这些是 Phase 1 启动前的工作，**Phase 0 不需要解决**。

## 12. 相关文档

- 产品与数据总览：`openspec/specs/zhuzhao-core/spec.md`
- LLM Intake：`openspec/specs/llm-intake/spec.md`
- 任务监督：`openspec/specs/task-supervision/spec.md`
- 日记与记忆：`openspec/specs/journal-memory/spec.md`
- 桌面 UI：`openspec/specs/desktop-ui/spec.md`
- Markdown 同步：`openspec/specs/markdown-sync/spec.md`
- 详细 UI/UX 设计：`docs/UI_UX_SPEC.md`
- 阶段路线图：`docs/ROADMAP_PHASES.md`
