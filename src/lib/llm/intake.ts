/**
 * LLM Intake 调用入口
 *
 * 流程：
 *   1. 加载 active LLM Provider
 *   2. 组装 system prompt + user message（含上下文）
 *   3. 调用 chatCompletion（temperature 低，json_object 模式）
 *   4. 解析返回（宽容 JSON 解析）
 *   5. Zod 校验
 *   6. 失败时进入 fallback 路径（不抛异常，返回 Result 模式）
 *
 * 安全：
 * - 全程不打印 api_key / Authorization
 * - 失败信息脱敏后才返回
 * - 不把完整 LLM 响应写入日志（可能含敏感信息）
 */

import type { EventRow, LlmProviderRow, TaskRow, ProjectRow, UserProfileRow, AgentRuleRow } from "@/types/db";
import { getActive } from "@/lib/repositories/llm-provider-repo";
import { chatCompletion, type ChatResult } from "@/lib/llm/client";
import {
  parseLenientJSON,
  validateIntakeResult,
  type IntakeResult,
} from "@/lib/llm/intake-schema";

// ---------------------------------------------------------------------------
// 上下文类型（注入 prompt 的变量）
// ---------------------------------------------------------------------------

export interface IntakeContext {
  /** 当前事件 */
  event: EventRow;
  /** 最近任务（最多 10 条，已序列化为简短字段） */
  recentTasks: Pick<TaskRow, "id" | "title" | "status" | "priority" | "due_at" | "delay_count">[];
  /** 当前活跃 projects（最多 5 条） */
  activeProjects: Pick<ProjectRow, "id" | "name" | "summary">[];
  /** 用户画像要点（最多 8 条，按 confidence desc） */
  userProfileBrief: Pick<UserProfileRow, "profile_key" | "profile_value" | "confidence">[];
  /** 启用中的 agent_rules */
  activeRules: Pick<AgentRuleRow, "rule_name" | "condition" | "tone">[];
}

// ---------------------------------------------------------------------------
// Intake 返回 Result
// ---------------------------------------------------------------------------

export type IntakeOutcome =
  | {
      ok: true;
      provider: { id: string; name: string; model: string };
      /** Zod 校验后的结构化结果 */
      result: IntakeResult;
      /** LLM 原始返回（用于 ai_processing_results 落库；调用方负责脱敏） */
      rawResponse: string;
    }
  | {
      ok: false;
      /** 错误分类 */
      errorKind:
        | "no_active_provider"
        | "no_api_key"
        | "network"
        | "timeout"
        | "http_error"
        | "parse_error"
        | "schema_error"
        | "empty_content"
        | "unknown";
      /** 已脱敏的友好错误描述 */
      message: string;
      /** LLM 原始返回（如能取到，用于 events.metadata 落库，便于后续人工排查） */
      rawResponse?: string;
      /** HTTP 状态码（仅 http_error） */
      status?: number;
    };

// ---------------------------------------------------------------------------
// Prompt 组装
// ---------------------------------------------------------------------------

/**
 * 组装 system prompt
 * 详见 openspec/specs/llm-intake/spec.md §5
 *
 * 注意：prompt 写中文，要求模型输出严格 JSON
 */
function buildSystemPrompt(ctx: IntakeContext): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("你是「烛照」的 Intake Processor。每次用户输入后，你需要判断内容的类型、应该触发哪些动作、是否回复用户以及用什么语气回复。");

  lines.push("");
  lines.push("## 当前时间");
  lines.push(now);

  lines.push("");
  lines.push("## 判断维度");
  lines.push("1. content_type: task（任务）/ idea（灵感）/ journal（日记/反思）/ chat（聊天）/ plan（计划）/ review（回顾）/ unknown（不确定）");
  lines.push("2. raw_should_be_saved: 是否保存原文到 journal_entries（日记或反思类必须为 true）");
  lines.push("3. actions.create_task: 输入含明确执行项 + 时间或优先级时为 true");
  lines.push("4. actions.create_journal: 输入是反思、心情、状态记录时为 true");
  lines.push("5. actions.create_idea: 输入是新点子、灵感、未来可能性时为 true");
  lines.push("6. actions.create_reminder: 输入含明确时间触发点时为 true");
  lines.push("7. should_reply: 是否生成 assistant 回复");
  lines.push("8. reply_mode: silent / ack / suggest / coach / challenge / harsh");
  lines.push("9. risk_level: low / medium / high（high 时禁止自动执行任何动作）");

  lines.push("");
  lines.push("## reply_mode 语义");
  lines.push("- silent: 不回复，仅记录");
  lines.push("- ack: 简短确认（如「记下了」）");
  lines.push("- suggest: 轻量建议");
  lines.push("- coach: 理性教练式反馈");
  lines.push("- challenge: 严厉监督，指出问题");
  lines.push("- harsh: 狠话模式，明显批评拖延与懒散，但绝不攻击人格");

  lines.push("");
  lines.push("## harsh 模式边界");
  lines.push("可以批评：拖延、逃避、懒散、找借口");
  lines.push("禁止攻击：人格、长期价值（如「你废了」「你永远做不成事」「你没救了」）");

  lines.push("");
  lines.push("## 触发示例");
  lines.push('输入「明天晚上前把烛照的开发任务书整理完」→ content_type=task, actions.create_task=true, actions.create_reminder=true, reply_mode=ack');
  lines.push('输入「今天有点摆烂，什么都没推进」→ content_type=journal, actions.create_journal=true, raw_should_be_saved=true, reply_mode=coach 或 challenge');
  lines.push('输入「想到一个点，烛照可以接飞书机器人」→ content_type=idea, actions.create_idea=true, 不创建 task');
  lines.push('输入「谢谢你」→ content_type=chat, 不创建任何实体, should_reply=true, reply_mode=ack');
  lines.push('输入「随便记一下，今天中午吃了面」→ content_type=journal 或 chat, reply_mode=silent 或 ack');

  // 上下文：最近任务
  if (ctx.recentTasks.length > 0) {
    lines.push("");
    lines.push("## 用户最近任务（最多 10 条）");
    for (const t of ctx.recentTasks) {
      const parts = [`- [${t.status}] ${t.title}`];
      if (t.priority) parts.push(`priority=${t.priority}`);
      if (t.due_at) parts.push(`due=${t.due_at}`);
      if (t.delay_count > 0) parts.push(`delay=${t.delay_count}`);
      lines.push(parts.join(" · "));
    }
  }

  // 上下文：活跃 projects
  if (ctx.activeProjects.length > 0) {
    lines.push("");
    lines.push("## 当前活跃 projects（最多 5 条）");
    for (const p of ctx.activeProjects) {
      lines.push(`- ${p.name}${p.summary ? `：${p.summary}` : ""}`);
    }
  }

  // 上下文：用户画像
  if (ctx.userProfileBrief.length > 0) {
    lines.push("");
    lines.push("## 用户画像要点（最多 8 条）");
    for (const u of ctx.userProfileBrief) {
      lines.push(`- ${u.profile_key}: ${u.profile_value} (confidence=${u.confidence})`);
    }
  }

  // 上下文：agent_rules
  if (ctx.activeRules.length > 0) {
    lines.push("");
    lines.push("## 启用中的监督规则");
    for (const r of ctx.activeRules) {
      lines.push(`- ${r.rule_name}: 条件=${r.condition} · 语气=${r.tone}`);
    }
  }

  lines.push("");
  lines.push("## 输出格式（必须严格遵守）");
  lines.push("1. 永远只输出一个 JSON 对象，不要任何 markdown code fence（```），不要任何前后缀文本");
  lines.push("2. 顶层字段必须完整，缺一不可（content_type / raw_should_be_saved / should_reply / reply_mode / actions / memory / risk_level / confidence 必填）");
  lines.push("3. task 字段：");
  lines.push("   - 当 actions.create_task=true 时，task 必须是对象且至少包含 title");
  lines.push("   - 当 actions.create_task=false 时，task 必须输出 null（不要编造任务）");
  lines.push("4. reminder 字段：");
  lines.push("   - 当 actions.create_reminder=true 时，reminder 必须是对象且至少包含 remind_at 或 message");
  lines.push("   - 当 actions.create_reminder=false 时，reminder 必须输出 null（不要编造提醒）");
  lines.push("5. 不要在 actions 中编造不存在的动作：create_task=false 时不要返回 task 对象");
  lines.push("");
  lines.push("示例 1（普通聊天，不创建任何实体）：");
  lines.push(`{
  "content_type": "chat",
  "title": "感谢",
  "summary": "用户表达感谢。",
  "raw_should_be_saved": false,
  "tags": [],
  "topic_candidates": [],
  "project_candidates": [],
  "should_reply": true,
  "reply_mode": "ack",
  "reply_text": "不客气。",
  "actions": {
    "create_task": false,
    "create_idea": false,
    "create_journal": false,
    "create_reminder": false,
    "update_user_profile": false,
    "link_to_project": false,
    "write_markdown": false
  },
  "task": null,
  "reminder": null,
  "memory": {
    "save_level": "none",
    "reason": "普通感谢，不需要长期记忆。"
  },
  "risk_level": "low",
  "confidence": 0.9
}`);
  lines.push("");
  lines.push("示例 2（任务输入，创建 task + reminder）：");
  lines.push(`{
  "content_type": "task",
  "title": "整理烛照开发任务书",
  "summary": "用户要求在明天晚上前完成烛照开发任务书整理。",
  "raw_should_be_saved": false,
  "tags": ["烛照", "开发"],
  "topic_candidates": ["烛照"],
  "project_candidates": ["烛照"],
  "should_reply": true,
  "reply_mode": "ack",
  "reply_text": "已记下，明天晚上前整理烛照开发任务书。",
  "actions": {
    "create_task": true,
    "create_idea": false,
    "create_journal": false,
    "create_reminder": true,
    "update_user_profile": false,
    "link_to_project": false,
    "write_markdown": false
  },
  "task": {
    "title": "整理烛照开发任务书",
    "description": "明天晚上前把烛照的开发任务书整理完",
    "due_at": "2026-07-05T22:00:00+08:00",
    "priority": "high",
    "estimated_minutes": 120
  },
  "reminder": {
    "remind_at": "2026-07-05T20:00:00+08:00",
    "message": "烛照开发任务书还有 2 小时到期",
    "type": "task_due"
  },
  "memory": {
    "save_level": "short_term",
    "reason": "短期任务跟踪"
  },
  "risk_level": "low",
  "confidence": 0.9
}`);
  lines.push("");
  lines.push("示例 3（日记，全量保存原文）：");
  lines.push(`{
  "content_type": "journal",
  "title": "今日反思",
  "summary": "用户感到今天摆烂，没有推进事情。",
  "raw_should_be_saved": true,
  "tags": ["反思", "情绪"],
  "topic_candidates": [],
  "project_candidates": [],
  "should_reply": true,
  "reply_mode": "coach",
  "reply_text": "今天没推进，明天可以先做 10 分钟启动一下。",
  "actions": {
    "create_task": false,
    "create_idea": false,
    "create_journal": true,
    "create_reminder": false,
    "update_user_profile": false,
    "link_to_project": false,
    "write_markdown": false
  },
  "task": null,
  "reminder": null,
  "memory": {
    "save_level": "long_term",
    "reason": "情绪模式记录"
  },
  "risk_level": "low",
  "confidence": 0.85
}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 调用 LLM Intake
 *
 * @param ctx IntakeContext，包含 event 与上下文
 * @returns IntakeOutcome（绝不抛异常）
 */
export async function callIntake(
  ctx: IntakeContext,
): Promise<IntakeOutcome> {
  // 1. 加载 active provider
  let provider: LlmProviderRow | null;
  try {
    provider = await getActive();
  } catch (err) {
    return outcomeError(
      "unknown",
      `读取 active provider 失败：${safeMsg(err)}`,
    );
  }

  if (!provider) {
    return outcomeError(
      "no_active_provider",
      "未配置 active LLM Provider，请到 Settings 配置并设为 active。",
    );
  }

  // 2. 调用 chatCompletion
  let chatResult: ChatResult;
  try {
    chatResult = await chatCompletion(
      provider,
      {
        messages: [
          { role: "system", content: buildSystemPrompt(ctx) },
          { role: "user", content: ctx.event.raw_content },
        ],
        // Intake 用低 temperature 保证输出稳定
        temperature: 0.2,
        // Intake 结果可能较长，给足空间
        maxTokens: 1500,
      },
      { timeoutMs: 30_000 },
    );
  } catch (err) {
    // chatCompletion 内部应已 try/catch，但再加一层兜底
    return outcomeError(
      "unknown",
      `调用 LLM 时发生未预期错误：${safeMsg(err)}`,
    );
  }

  if (!chatResult.ok) {
    // 直接转发错误
    // 注意：ChatError.kind 可能含 'invalid_base_url'，但 IntakeOutcome 不含
    // → 把 invalid_base_url 归类为 'network'，避免 union 不匹配
    const mappedKind = chatResult.error.kind === "invalid_base_url"
      ? ("network" as const)
      : chatResult.error.kind;
    return {
      ok: false,
      errorKind: mappedKind,
      message: chatResult.error.message,
      status: chatResult.error.status,
    };
  }

  const rawResponse = chatResult.data.content;

  // 3. 宽容 JSON 解析
  const parsed = parseLenientJSON(rawResponse);
  if (parsed === null) {
    return {
      ok: false,
      errorKind: "parse_error",
      message: "LLM 返回内容不是有效 JSON。",
      rawResponse,
    };
  }

  // 4. Zod 校验
  const validation = validateIntakeResult(parsed);
  if (!validation.success) {
    return {
      ok: false,
      errorKind: "schema_error",
      message: `JSON 结构不符合 IntakeResultSchema：${validation.error}`,
      rawResponse,
    };
  }

  // 5. 成功
  return {
    ok: true,
    provider: { id: provider.id, name: provider.name, model: provider.model },
    result: validation.data,
    rawResponse,
  };
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

type IntakeErrorKind =
  | "no_active_provider"
  | "no_api_key"
  | "network"
  | "timeout"
  | "http_error"
  | "parse_error"
  | "schema_error"
  | "empty_content"
  | "unknown";

function outcomeError(
  errorKind: IntakeErrorKind,
  message: string,
): IntakeOutcome {
  return { ok: false, errorKind, message };
}

function safeMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
