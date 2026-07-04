/**
 * 监督文案生成器（Supervisor）
 *
 * 规则（task-supervision spec §5）：
 * - delay_count = 0：ack（正常提醒）
 * - delay_count = 1：coach
 * - delay_count = 2：challenge
 * - delay_count >= 3：harsh（严厉监督模式）
 *
 * harsh 边界（task-supervision spec §5.3 + llm-intake spec §5.3）：
 * - 允许：批评拖延 / 逃避 / 懒散 / 找借口
 * - 禁止：人格攻击 / 长期价值否定 / 绝对化否定
 *   - 例如：「你废了」「你永远不行」「你就是没救」均禁止
 *
 * 本阶段优先使用模板（V0 稳定性优先，不强依赖 LLM）：
 * - 用户要求 §15：本阶段可以使用模板生成监督文案，优先保证稳定性；不要强依赖 LLM
 * - 用户要求 §16：如果使用 LLM 生成监督文案，必须使用 Phase 4 active provider；
 *   失败时 fallback 到本地模板；不泄露 API Key；不把完整敏感日志写入 console
 *
 * 本文件只做纯函数模板生成。LLM 调用入口在 harsh-llm.ts（可选，未启用）。
 */

import type { TaskRow } from "@/types/db";
import type { ReplyMode } from "@/types/enums";

// ---------------------------------------------------------------------------
// 公共类型
// ---------------------------------------------------------------------------

export interface SupervisorReply {
  /** 监督语气（用于 conversation_messages.reply_mode 字段映射） */
  reply_mode: ReplyMode;
  /** 文案内容（已格式化，可直接展示给用户） */
  text: string;
  /** 来源：模板 / LLM（V0 默认模板） */
  source: "template" | "llm";
}

// ---------------------------------------------------------------------------
// delay_count → reply_mode 映射
// ---------------------------------------------------------------------------

/**
 * 根据 delay_count 决定 reply_mode
 * 详见 task-supervision spec §5 表
 *
 * 用户要求 §12：
 * - delay_count = 0：正常提醒（ack / coach）
 * - delay_count = 1：coach
 * - delay_count = 2：challenge
 * - delay_count >= 3：harsh
 */
export function mapDelayToReplyMode(delayCount: number): ReplyMode {
  if (delayCount <= 0) return "ack";
  if (delayCount === 1) return "coach";
  if (delayCount === 2) return "challenge";
  return "harsh"; // >= 3
}

// ---------------------------------------------------------------------------
// 模板文案
// ---------------------------------------------------------------------------

/** delay_count = 0：正常提醒模板 */
const ACK_TEMPLATES = [
  '任务「{title}」到期了。完成了吗？',
  '到点了：任务「{title}」。准备好开始了吗？',
];

/** delay_count = 1：coach 模板 */
const COACH_TEMPLATES = [
  '任务「{title}」已经延期 1 次了。先做 5 分钟试试，启动一下。',
  '上次没推进「{title}」。这次先选一个最小动作开始。',
];

/** delay_count = 2：challenge 模板 */
const CHALLENGE_TEMPLATES = [
  '任务「{title}」已经延期 2 次了。再不动就要进入严厉模式。现在选一个最小动作开始。',
  '这已经是「{title}」的第二次延期。计划没用，开始做才有用。',
];

/**
 * harsh 模板（delay_count >= 3）
 *
 * 用户要求 §13 允许类似：
 * - 你又把这件事往后推了。别再用『之后再说』糊弄自己，先做 5 分钟。
 * - 这已经不是计划问题，是执行问题。现在选一个最小动作开始。
 *
 * 用户要求 §14 禁止：
 * - 你废了 / 你永远不行 / 你就是没救 / 任何人格羞辱或绝对化否定
 */
const HARSH_TEMPLATES = [
  '你又把「{title}」往后推了。别再用『之后再说』糊弄自己，先做 5 分钟。',
  '这已经不是计划问题，是执行问题。任务「{title}」已经在拖延队列里 {delay} 次。现在选一个最小动作开始。',
  '「{title}」已经延期 {delay} 次了。别再写新计划，先把这件事做 5 分钟。',
  '「{title}」拖到第 {delay} 次了。这次写不出新借口了，先做最小动作。',
  '不要再规划怎么完成「{title}」了。已经第 {delay} 次延期，规划没用，开始做才有用。',
];

// ---------------------------------------------------------------------------
// 模板格式化
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T {
  // 简单随机：crypto 可用时用，否则用 Math.random（仅用于文案选择，非安全场景）
  let idx: number;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    idx = buf[0] % arr.length;
  } else {
    idx = Math.floor(Math.random() * arr.length);
  }
  return arr[idx];
}

function formatTemplate(
  template: string,
  task: TaskRow,
): string {
  return template
    .replaceAll("{title}", task.title)
    .replaceAll("{delay}", String(task.delay_count));
}

// ---------------------------------------------------------------------------
// 主函数：模板生成监督文案
// ---------------------------------------------------------------------------

/**
 * 生成监督回复（模板版，V0 默认）
 *
 * @param task 关联任务
 * @returns SupervisorReply（含 reply_mode 与文案）
 */
export function getTemplateSupervisorReply(
  task: TaskRow,
): SupervisorReply {
  const replyMode = mapDelayToReplyMode(task.delay_count);
  let templates: string[];

  switch (replyMode) {
    case "ack":
      templates = ACK_TEMPLATES;
      break;
    case "coach":
      templates = COACH_TEMPLATES;
      break;
    case "challenge":
      templates = CHALLENGE_TEMPLATES;
      break;
    case "harsh":
      templates = HARSH_TEMPLATES;
      break;
    default:
      // silent / suggest：默认 ack 文案
      templates = ACK_TEMPLATES;
  }

  const text = formatTemplate(pickRandom(templates), task);
  return {
    reply_mode: replyMode,
    text,
    source: "template",
  };
}

// ---------------------------------------------------------------------------
// 追问消息格式化（用于 scheduler 生成 Chat Sidebar 追问内容）
// ---------------------------------------------------------------------------

/**
 * 生成完整追问消息（含任务上下文）
 *
 * 格式参考 task-supervision spec §4.1：
 * ```
 * [烛照追问] 任务「{title}」到期。
 * 状态：{status}
 * 原 deadline：{due_at}
 * 已延期次数：{delay_count}
 *
 * {supervisor_text}
 *
 * 你可以：
 *   - 完成
 *   - 延期
 *   - 稍后提醒
 *   - 拆小
 * ```
 */
export function buildFollowUpMessage(
  task: TaskRow,
  reply: SupervisorReply,
): string {
  const lines: string[] = [];
  lines.push(`[烛照追问] 任务「${task.title}」到期。`);
  lines.push(`状态：${task.status}`);
  if (task.due_at) {
    lines.push(`原 deadline：${task.due_at}`);
  }
  lines.push(`已延期次数：${task.delay_count}`);
  lines.push("");
  lines.push(reply.text);
  lines.push("");
  lines.push("你可以：");
  lines.push("  - 完成");
  lines.push("  - 延期");
  lines.push("  - 稍后提醒");
  lines.push("  - 拆小");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// harsh 文案边界检测（防御性，避免 LLM 误用）
// ---------------------------------------------------------------------------

/**
 * 禁止词列表（用户要求 §14）
 * 用于校验 LLM 返回的 harsh 文案是否越界
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /你废了/,
  /你永远不行/,
  /你就是没救/,
  /你这个人.{0,10}废/,
  /你永远做不成/,
  /你注定/,
  /你就是.{0,5}废/,
  /没救了/,
];

/**
 * 检测文案是否含禁止用语
 *
 * 用于 LLM harsh 文案 fallback 后兜底校验。
 * 命中禁止词时回退到本地模板。
 *
 * @returns true 表示文案越界，应回退模板
 */
export function isHarshTextForbidden(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}
