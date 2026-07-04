# 烛照 · 阶段路线图（Roadmap & Phases）

> 严格按 Phase 推进，不跳阶段。每个 Phase 未通过验收前禁止进入下一 Phase。
>
> Phase 0 已完成（仅产出本文档集，不写代码）。Phase 1 启动需用户明确确认。

---

## Phase 0 · 规格与设计（已完成）

### 任务

1. ✅ 识别 OpenSpec 支持（CLI 1.4.1 已安装并 init）
2. ✅ Superpowers 不在当前环境，按 [project.md §9](../openspec/project.md) 约定使用 OpenSpec spec-driven 流程
3. ✅ 创建 `openspec/project.md`
4. ✅ 创建 6 个 capability spec：
   - `openspec/specs/zhuzhao-core/spec.md`（产品定位 + 数据模型 + 14 张表 schema）
   - `openspec/specs/llm-intake/spec.md`（Intake 流水线 + Zod schema + reply_mode 规则）
   - `openspec/specs/task-supervision/spec.md`（任务状态机 + harsh 模式）
   - `openspec/specs/journal-memory/spec.md`（日记全量保存 + 记忆 + 每日总结）
   - `openspec/specs/desktop-ui/spec.md`（信息架构 + 组件清单）
   - `openspec/specs/markdown-sync/spec.md`（Obsidian 同步）
5. ✅ 创建 `docs/UI_UX_SPEC.md`（section 14 强制要求，14 项内容齐全）
6. ✅ 创建 `docs/ROADMAP_PHASES.md`（本文件）

### 验收

- [x] 用户可阅读并确认文档
- [x] **未写任何功能代码**
- [x] **未安装运行时依赖**
- [ ] 等待用户明确说「开始 Phase 1」

### 已识别的 Phase 1 前置阻塞

| 项 | 解决方式 |
| --- | --- |
| Rust / Cargo / rustc 未安装 | 安装 rustup |
| Tauri CLI 未安装 | `npm install -D @tauri-apps/cli` |
| pnpm 未安装（可选） | 用 npm 或安装 pnpm |

---

## Phase 1 · 项目初始化（目标：应用能启动）

### 任务

1. 安装 Rust 工具链（rustup）+ Tauri CLI
2. 初始化 Tauri + React + TypeScript 项目（推荐 `pnpm create tauri-app` 或 `npm create tauri-app@latest`）
3. 配置 Tailwind CSS（深色主题 token 与 [UI_UX_SPEC §8](./UI_UX_SPEC.md#8-颜色系统) 对齐）
4. 配置 shadcn/ui（按 [desktop-ui spec §6](../openspec/specs/desktop-ui/spec.md#6-组件清单) 安装基础组件）
5. 实现主布局：左导航 + 中主区 + 右 Chat Sidebar（折叠态）
6. 创建 7 个占位页：Dashboard / Inbox / Tasks / Journal / Ideas / Reviews / Settings
7. 初始化 SQLite 连接（建议 Rust 端 `rusqlite` + Tauri IPC）
8. 创建 migrations 机制（编号 SQL 文件，启动时自动 apply）
9. 实现 `app/_state` Zustand store（仅 UI 状态）
10. 实现全局快捷键骨架（Cmd/Ctrl+K, Cmd/Ctrl+I, Cmd/Ctrl+B）

### 验收

- [ ] `npm run tauri dev` 能启动桌面窗口
- [ ] 7 个页面可切换
- [ ] Chat Sidebar 可折叠 / 展开
- [ ] SQLite 文件创建在用户数据目录
- [ ] migrations 跑通（哪怕只有 `schema_version` 表）
- [ ] 深色主题完整可用
- [ ] **未实现任何 V0 范围外的功能**

---

## Phase 2 · 数据库与基础 CRUD（目标：核心数据能存取）

### 任务

1. 实现 zhuzhao-core §4.3 全部 14 张表的 migrations
2. 实现 Repository 层（每张表一个 repo，纯函数风格）
3. 实现 Event CRUD（save / list / getById / markProcessed）
4. 实现 Task CRUD
5. 实现 Journal CRUD
6. 实现 Idea CRUD
7. 实现 Reminder CRUD
8. 实现 Conversation / ConversationMessage CRUD
9. 实现 Topic / Project CRUD（最小）
10. 实现 UserProfile / AgentRule CRUD（最小）
11. 实现 Review CRUD
12. 实现 LlmProvider CRUD
13. 实现基础查询：
    - 今日任务 / 延期任务 / 最近日记 / 最近灵感 / 最近输入
14. Dashboard 接入真实数据（替换 Phase 1 占位）

### 验收

- [ ] 可手动新增 Event / Task / Journal / Idea
- [ ] migrations 在干净 DB 上能跑通
- [ ] Dashboard 显示真实数据
- [ ] **未做 LLM 调用**

### 测试

- TDD：每个 repo 写最小测试（创建 → 查询 → 字段正确）
- migrations up / down 测试

---

## Phase 3 · 聊天侧边栏与快速输入（目标：用户能自然输入）

### 任务

1. Chat Sidebar UI：消息流（用户 / assistant / system 三种气泡样式）
2. Chat 输入框 + 提交按钮（⌘+Enter 发送）
3. 提交时：
   - 写入 ConversationMessage (role=user)
   - 同步创建 Conversation（如未指定则新建）
   - 创建 Event (source=chat, raw_content=msg)
4. Dashboard 快速输入框（吸顶）
5. 快速输入提交时创建 Event (source=quick_input)
6. 展示最近对话列表（顶部下拉切换）
7. Chat 消息支持来源回溯（hover 显示 event_id 与时间）

### 验收

- [ ] 输入内容落库
- [ ] Chat 记录能显示
- [ ] Dashboard 「今日输入」显示真实数据
- [ ] **不调用 LLM**（assistant 暂不回复）

---

## Phase 4 · LLM Provider 设置（目标：能调用大模型）

### 任务

1. Settings → LLM Provider 页面
2. CRUD：新增 / 编辑 / 删除 / 设为 active
3. 字段：name / provider_type / base_url / api_key / model / temperature / max_tokens
4. API Key 仅本地保存，UI 用 password input + 「显示 / 隐藏」切换
5. 实现 OpenAI-compatible chat completion client（`src/lib/llm/`）
6. 实现「测试连接」按钮：发送最小 prompt 验证
7. 错误处理：超时 / 401 / 网络断均不崩
8. 加密：API Key 至少 base64 + 用户级 secret（V0 简化，V1 用 OS keychain）

### 验收

- [ ] 可配置 OpenAI / Ollama / 自定义 base_url
- [ ] 「测试连接」返回成功 / 失败 + 错误信息
- [ ] API Key 不出现在日志中
- [ ] 无 active Provider 时 UI 明确提示

---

## Phase 5 · LLM Intake 流水线（目标：输入被结构化处理）

### 任务

1. 实现 `prompts/intake.md`（按 [llm-intake spec §5](../openspec/specs/llm-intake/spec.md#5-intake-prompt-行为规则)）
2. 实现 `IntakeResultSchema`（Zod）
3. 实现 Intake Pipeline（`src/features/intake/`）
4. 调用时机：Event 落库后异步触发（不阻塞 UI）
5. 解析 + Zod 校验
6. 写入 `ai_processing_results`
7. 按 actions 创建子实体（task / journal / idea / reminder）
8. 按 should_reply 写入 assistant ConversationMessage
9. 实现 fallback（[llm-intake spec §8](../openspec/specs/llm-intake/spec.md#8-失败-fallback)）
10. UI：在 Event / Task / Journal / Idea 卡片显示「来源：HH:MM 输入」
11. UI：低 confidence（< 0.6）标记「需人工确认」

### 验收（用户原话示例）

- [ ] 输入「明天晚上前把烛照的开发任务书整理完」→ 自动生成 task + reminder
- [ ] 输入「今天有点摆烂，什么都没推进」→ 保存为 journal，回复 coach/challenge
- [ ] 输入「想到一个点，烛照可以以后接飞书机器人」→ 保存为 idea
- [ ] LLM 关闭时输入仍可落 Event，状态为 pending
- [ ] JSON 解析失败时不崩溃，UI 显示需人工确认

---

## Phase 6 · 任务监督闭环（目标：任务能追问）

### 任务

1. 实现 Reminder scheduler（前端 60s 轮询）
2. 到期 reminder 触发：
   - 在当前对话插入追问消息
   - reminder.status='fired'，task.status='doing'
3. Chat 消息附快捷按钮：完成 / 没完成 / 延期 / 取消 / 拆小
4. 完成路径：更新 task / 关闭 reminder
5. 未完成路径：追问原因 → 写 failure_reason → delay_count+1 → task='delayed' → 新建 reminder
6. delay_count >= 2 时调用 LLM 生成 harsh 回复（独立 prompt `prompts/harsh-supervisor.md`）
7. 次日 App 启动扫描未回复的 fired reminder → 自动标 delayed
8. Dashboard 顶部「烛照监督提醒」区显示逾期重点

### 验收

- [ ] 创建带 due_at 的任务，到期后 Chat 自动追问
- [ ] 点完成 → task='done'
- [ ] 点没完成 + 原因 → task='delayed', delay_count=1
- [ ] 连续 2 次未完成 → 自动 harsh 消息
- [ ] 关闭 App 期间到期，重启后自动标 delayed
- [ ] harsh 消息不出现禁止用语（[llm-intake spec §5.3](../openspec/specs/llm-intake/spec.md#53-harsh-模式允许与禁止)）

---

## Phase 7 · 日记与每日总结（目标：形成复盘能力）

### 任务

1. Journal 页面写日记
2. raw_content 全量保存
3. 调用 LLM（`prompts/journal-summary.md`）生成 summary / tags / mood
4. Reviews 页面：日期选择 + 「生成今日总结」按钮
5. 调用 LLM（`prompts/daily-review.md`）生成 DailyReview
6. 写入 reviews 表（含 sections JSON）
7. Reviews 页面渲染历史总结
8. 每日总结引用当日 task / journal / idea

### 验收

- [ ] Journal raw_content 完整保存
- [ ] AI 摘要生成
- [ ] 每日总结可生成并保存
- [ ] 总结可在 Reviews 页面查看
- [ ] raw_content 不可被覆盖（DB 层校验）

---

## Phase 8 · Markdown / Obsidian 同步（目标：本地文档沉淀）

### 任务

按 [markdown-sync spec](../openspec/specs/markdown-sync/spec.md) 实现：

1. Settings → Markdown / Obsidian 同步开关
2. 目录选择器（系统文件对话框）
3. 自动创建 8 个标准目录
4. 同步写入：
   - 写 journal → `20_Journal/YYYY-MM-DD.md`
   - 生成 review → `60_Reviews/Daily/YYYY-MM-DD.md`
   - 写 idea → `40_Ideas/{slug}.md`
   - 写 project → `50_Projects/{slug}.md`
   - Intake 写 markdown=true → `00_Inbox/{ts}-{slug}.md`
5. 「打开目录」按钮调用系统文件管理器
6. 错误处理：写入失败 Toast，不阻塞 DB
7. 安全：路径校验，禁止路径穿越

### 验收

- [ ] 未配置目录时 App 完整可用
- [ ] 配置目录后能生成所有 Markdown 文件
- [ ] Obsidian 可直接打开并渲染
- [ ] 「打开目录」按钮工作

---

## Phase 9 · 打磨、安全与可用性（目标：可日常试用）

### 任务

1. 全局 loading 状态完善（Skeleton / spinner / 进度条）
2. 全局错误提示完善（Toast 分级 / Critical Dialog）
3. LLM 失败 fallback 完善（重试 / 手动分类 / 忽略）
4. 数据导出：
   - 全量 JSON 导出
   - 单类型导出（journal / task）
5. 监督强度设置（Settings：温和 / 标准 / 严厉）→ 影响 reply_mode 默认值
6. 危险动作拦截：
   - 删除任务二次确认
   - 清空数据二次确认
   - 禁用所有 V0 范围外动作（shell / 删除文件 / 外部消息）
7. 本地日志（`logs/`，按天滚动）
8. README.md（如何启动 / 配置 / 排障）
9. 开发文档（架构 / 调试 / 测试）

### 验收

- [ ] App 不容易崩
- [ ] 用户能理解如何配置（README 清晰）
- [ ] 数据可导出
- [ ] 高风险动作不会自动执行
- [ ] 日志可追溯问题

---

## 跨 Phase 约束

- **每个 Phase 完成后**按 [project.md 引用的汇报格式](../openspec/project.md)（实际在用户输入 §17）汇报：
  1. 当前完成阶段
  2. 改动文件列表
  3. 实现功能
  4. 如何启动
  5. 如何测试
  6. 已知问题
  7. 下一阶段建议
  8. 是否偏离 V0 范围
- **任何需求冲突**先提出问题，不擅自决定
- **任何 Phase 都不允许实现 V0 范围外功能**（[project.md §6.2](../openspec/project.md#62-v0-明确不做可预留接口禁止实现)）
- **YAGNI**：不为假想未来设计

---

## 当前状态

| Phase | 状态 | 备注 |
| --- | --- | --- |
| Phase 0 | ✅ 完成 | 等待用户确认 |
| Phase 1 | ⏸ 待启动 | 需用户明确「开始 Phase 1」；前置需安装 Rust 工具链 |
| Phase 2 | ⏳ 计划 | |
| Phase 3 | ⏳ 计划 | |
| Phase 4 | ⏳ 计划 | |
| Phase 5 | ⏳ 计划 | |
| Phase 6 | ⏳ 计划 | |
| Phase 7 | ⏳ 计划 | |
| Phase 8 | ⏳ 计划 | |
| Phase 9 | ⏳ 计划 | |
