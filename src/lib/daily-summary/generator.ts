/**
 * Daily Summary 生成器
 *
 * Phase 7：今日回顾 / 每日总结
 *
 * 流程：
 *   1. loadSummaryInput(date) - 收集当天数据
 *   2. buildPrompt(input) - 构建 LLM prompt
 *   3. fallbackSummary(input) - 本地模板总结
 *   4. generateDailySummary(date):
 *      - 若有 active provider → 调用 LLM
 *      - 失败 / 无 provider → fallback
 *      - 落库到 reviews 表（upsert）
 *
 * 安全：
 * - 不泄露 api_key
 * - 失败时静默降级到模板，App 不崩
 * - 不把完整 LLM 响应写入日志
 *
 * 语气约束（spec §22-23）：
 * - 不鸡汤，要有执行复盘价值
 * - 可包含轻度监督，不人格攻击
 * - 必须包含：今天做成什么 / 今天拖延什么 / 明天最重要一件事 / 一个可执行改进
 */

import type {
  EventRow,
  TaskRow,
  JournalEntryRow,
  IdeaRow,
  ReminderRow,
} from "@/types/db";
import { listByDate } from "@/lib/repositories/journal-repo";
import { query } from "@/lib/repositories/base";
import { todayDate, nowIso } from "@/lib/id";
import { getActive } from "@/lib/repositories/llm-provider-repo";
import { chatCompletion, type ChatMessage } from "@/lib/llm/client";
import {
  upsertDailySummary,
  type DailySummarySections,
} from "@/lib/repositories/review-repo";
import { logInfo, logWarn, logError } from "@/lib/repositories/log-repo";

// ---------------------------------------------------------------------------
// 输入数据
// ---------------------------------------------------------------------------

export interface DailySummaryInput {
  /** YYYY-MM-DD */
  date: string;
  journals: JournalEntryRow[];
  tasksDone: TaskRow[];
  tasksOverdue: TaskRow[];
  tasksDelayed: TaskRow[];
  ideas: IdeaRow[];
  remindersTriggered: ReminderRow[];
  events: EventRow[];
}

/**
 * 加载某天的输入数据
 * - journals: entry_date = date
 * - tasks: due_at 或 completed_at 落在 date 当天
 * - ideas: created_at 落在 date 当天
 * - reminders: status='fired' 且 updated_at 落在 date 当天
 * - events: created_at 落在 date 当天
 */
export async function loadSummaryInput(
  date: string = todayDate(),
): Promise<DailySummaryInput> {
  const dayPrefix = `${date}%`;

  const [
    journals,
    tasksDone,
    tasksOverdue,
    tasksDelayed,
    ideasAll,
    remindersTriggered,
    events,
  ] = await Promise.all([
    listByDate(date),
    // 完成时间在当天
    query<TaskRow>(
      `SELECT * FROM tasks
       WHERE status = 'done' AND completed_at IS NOT NULL
         AND completed_at LIKE ?
       ORDER BY completed_at ASC`,
      [dayPrefix],
    ),
    // 已逾期（due_at < now，未完成未归档）
    query<TaskRow>(
      `SELECT * FROM tasks
       WHERE due_at IS NOT NULL AND due_at < ?
         AND status NOT IN ('done', 'dropped')
       ORDER BY due_at ASC`,
      [nowIso()],
    ),
    // 当天延期的任务
    query<TaskRow>(
      `SELECT * FROM tasks
       WHERE status = 'delayed' OR delay_count > 0
       ORDER BY updated_at DESC LIMIT 20`,
    ),
    // 当天 ideas
    query<IdeaRow>(
      `SELECT * FROM ideas WHERE created_at LIKE ?
       ORDER BY created_at ASC`,
      [dayPrefix],
    ),
    // 当天触发的 reminders（fired/resolved/snoozed/cancelled）
    query<ReminderRow>(
      `SELECT * FROM reminders
       WHERE status IN ('fired', 'resolved', 'snoozed', 'cancelled')
         AND updated_at LIKE ?
       ORDER BY updated_at DESC`,
      [dayPrefix],
    ),
    // 当天 events
    query<EventRow>(
      `SELECT * FROM events WHERE created_at LIKE ?
       ORDER BY created_at ASC`,
      [dayPrefix],
    ),
  ]);

  return {
    date,
    journals,
    tasksDone,
    tasksOverdue,
    tasksDelayed,
    ideas: ideasAll,
    remindersTriggered,
    events,
  };
}

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

export function buildPrompt(input: DailySummaryInput): ChatMessage[] {
  const sections: string[] = [];

  sections.push(`# 今日数据（${input.date}）`);
  sections.push("");

  // 日记
  sections.push(`## 日记（${input.journals.length} 条）`);
  if (input.journals.length === 0) {
    sections.push("- 无日记");
  } else {
    input.journals.forEach((j, i) => {
      const mood = j.mood ?? "unknown";
      const content =
        j.raw_content.length > 200
          ? j.raw_content.slice(0, 200) + "..."
          : j.raw_content;
      sections.push(`${i + 1}. [${mood}] ${content}`);
    });
  }
  sections.push("");

  // 完成的任务
  sections.push(`## 已完成任务（${input.tasksDone.length}）`);
  if (input.tasksDone.length === 0) {
    sections.push("- 无");
  } else {
    input.tasksDone.forEach((t, i) => {
      sections.push(`${i + 1}. ${t.title}`);
    });
  }
  sections.push("");

  // 逾期任务
  sections.push(`## 逾期任务（${input.tasksOverdue.length}）`);
  if (input.tasksOverdue.length === 0) {
    sections.push("- 无");
  } else {
    input.tasksOverdue.forEach((t, i) => {
      sections.push(
        `${i + 1}. ${t.title} (逾期 ${t.delay_count} 次)`,
      );
    });
  }
  sections.push("");

  // 延期任务
  sections.push(`## 延期任务（${input.tasksDelayed.length}）`);
  if (input.tasksDelayed.length === 0) {
    sections.push("- 无");
  } else {
    input.tasksDelayed.slice(0, 10).forEach((t, i) => {
      sections.push(`${i + 1}. ${t.title} (延期 ${t.delay_count} 次)`);
    });
  }
  sections.push("");

  // 灵感
  sections.push(`## 灵感（${input.ideas.length}）`);
  if (input.ideas.length === 0) {
    sections.push("- 无");
  } else {
    input.ideas.forEach((it, i) => {
      sections.push(`${i + 1}. ${it.title}`);
    });
  }
  sections.push("");

  // 触发的提醒
  sections.push(`## 触发的提醒（${input.remindersTriggered.length}）`);
  if (input.remindersTriggered.length === 0) {
    sections.push("- 无");
  } else {
    input.remindersTriggered.slice(0, 5).forEach((r, i) => {
      sections.push(
        `${i + 1}. [${r.status}] ${r.message ?? "(无消息)"}`,
      );
    });
  }
  sections.push("");

  // 重要输入
  sections.push(`## 今日输入（${input.events.length} 条）`);
  if (input.events.length === 0) {
    sections.push("- 无");
  } else {
    input.events.slice(0, 10).forEach((e, i) => {
      const content =
        e.raw_content.length > 100
          ? e.raw_content.slice(0, 100) + "..."
          : e.raw_content;
      sections.push(`${i + 1}. [${e.source}] ${content}`);
    });
  }

  const systemPrompt = `你是「烛照」，一个本地优先的强监督型个人 AI 助手。现在需要为用户生成今日回顾。

要求：
1. 语气不要鸡汤，要有执行复盘价值
2. 可以包含轻度监督，但不能人格攻击
3. 必须包含四个部分：
   - 今天做成了什么（wins）
   - 今天拖延了什么（delays）
   - 明天最重要的一件事（topNext）
   - 一个可执行改进建议（improvement）

输出 JSON：
{
  "wins": ["做成的事 1", ...],
  "delays": ["拖延的事 1", ...],
  "topNext": "明天最重要的一件事",
  "improvement": "一个可执行改进建议",
  "summary": "完整总结文本（200 字内，可以包含轻度监督语气）"
}`;

  const userPrompt = `请基于以下数据生成今日回顾：

${sections.join("\n")}`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}

// ---------------------------------------------------------------------------
// Fallback 模板
// ---------------------------------------------------------------------------

/**
 * 本地模板总结（LLM 不可用时使用）
 */
export function fallbackSummary(
  input: DailySummaryInput,
): { sections: DailySummarySections; rawContent: string } {
  const wins: string[] = input.tasksDone.map((t) => `完成「${t.title}」`);
  if (input.ideas.length > 0) {
    wins.push(`记录了 ${input.ideas.length} 个灵感`);
  }
  if (input.journals.length > 0) {
    wins.push(`写了 ${input.journals.length} 条日记`);
  }

  const delays: string[] = [];
  input.tasksOverdue.slice(0, 5).forEach((t) => {
    delays.push(`「${t.title}」已逾期（延期 ${t.delay_count} 次）`);
  });
  input.tasksDelayed
    .filter((t) => !input.tasksOverdue.includes(t))
    .slice(0, 3)
    .forEach((t) => {
      delays.push(`「${t.title}」延期 ${t.delay_count} 次`);
    });

  // topNext：取第一个逾期任务，或第一个未完成的进行中任务
  const topNext =
    input.tasksOverdue[0]?.title ??
    input.tasksDelayed[0]?.title ??
    (wins.length > 0
      ? "继续保持节奏"
      : "今天没有明确推进，明天选一件具体的事开始");

  // improvement
  let improvement: string;
  if (input.tasksOverdue.length >= 3) {
    improvement = `有 ${input.tasksOverdue.length} 个逾期任务，建议明天先做最旧的一个 5 分钟，启动起来。`;
  } else if (delays.length > 0) {
    improvement = `有 ${delays.length} 项拖延，建议明天把最难的事放在精力最好的时段。`;
  } else if (wins.length === 0) {
    improvement = "今天没有明确产出，明天尝试先做一件 5 分钟的小事启动。";
  } else {
    improvement = "今天有产出，明天保持节奏，把任务前置到上午。";
  }

  // 完整文本
  const lines: string[] = [];
  lines.push(`# 烛照今日回顾（${input.date}）`);
  lines.push("");
  lines.push("## 今天做成了什么");
  if (wins.length === 0) {
    lines.push("- 暂无明确产出");
  } else {
    wins.forEach((w) => lines.push(`- ${w}`));
  }
  lines.push("");
  lines.push("## 今天拖延了什么");
  if (delays.length === 0) {
    lines.push("- 无明显拖延");
  } else {
    delays.forEach((d) => lines.push(`- ${d}`));
  }
  lines.push("");
  lines.push("## 明天最重要的一件事");
  lines.push(topNext);
  lines.push("");
  lines.push("## 一个可执行改进建议");
  lines.push(improvement);

  return {
    sections: {
      wins,
      delays,
      topNext,
      improvement,
    },
    rawContent: lines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// 主入口：生成每日总结
// ---------------------------------------------------------------------------

export type SummarySource = "llm" | "template_fallback";

export interface GenerateSummaryResult {
  ok: boolean;
  reviewId: string | null;
  source: SummarySource;
  /** 完整总结文本 */
  rawContent: string;
  /** 结构化字段 */
  sections: DailySummarySections | null;
  /** 失败时的错误描述（已脱敏） */
  error: string | null;
  /** 警告（非致命） */
  warnings: string[];
}

/**
 * 生成每日总结
 *
 * 策略：
 * 1. 加载当日数据
 * 2. 若有 active provider → 调用 LLM
 * 3. LLM 失败 / 无 provider / 解析失败 → fallback 模板
 * 4. 落库到 reviews 表（upsert by date）
 *
 * 不抛异常，永不使 App 崩溃。
 */
export async function generateDailySummary(
  date: string = todayDate(),
): Promise<GenerateSummaryResult> {
  const warnings: string[] = [];

  // 1. 加载数据
  let input: DailySummaryInput;
  try {
    input = await loadSummaryInput(date);
  } catch (err) {
    // 数据加载失败，使用空输入做 fallback
    const errorMsg = err instanceof Error ? err.message : String(err);
    warnings.push(`数据加载失败：${errorMsg}`);
    void logError("db", `daily summary 数据加载失败：${errorMsg}`, { date });
    input = {
      date,
      journals: [],
      tasksDone: [],
      tasksOverdue: [],
      tasksDelayed: [],
      ideas: [],
      remindersTriggered: [],
      events: [],
    };
  }

  // 2. 尝试 LLM
  let llmResult: { sections: DailySummarySections; rawContent: string } | null = null;
  let llmError: string | null = null;

  try {
    const provider = await getActive();
    if (!provider) {
      warnings.push("未配置 active LLM Provider");
      void logWarn("llm", "未配置 active LLM Provider，使用 fallback");
    } else {
      const messages = buildPrompt(input);
      const result = await chatCompletion(provider, {
        messages,
        temperature: 0.4,
        maxTokens: 1024,
      });

      if (result.ok) {
        // 解析 JSON 响应
        const content = result.data.content;
        const parsed = parseLlmResponse(content);
        if (parsed) {
          llmResult = parsed;
        } else {
          // 解析失败，把原始内容当作文本
          warnings.push("LLM 返回非预期 JSON，使用原始文本");
          void logWarn("llm", "LLM 返回非预期 JSON，使用原始文本");
          llmResult = {
            sections: {
              wins: [],
              delays: [],
              topNext: "",
              improvement: "",
            },
            rawContent: content,
          };
        }
      } else {
        llmError = `${result.error.kind}: ${result.error.message}`;
        warnings.push(`LLM 调用失败：${llmError}`);
        void logWarn("llm", `LLM 调用失败：${llmError}`);
      }
    }
  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err);
    warnings.push(`LLM 异常：${llmError}`);
    void logError("llm", `LLM 异常：${llmError}`);
  }

  // 3. 选择最终结果
  let finalSections: DailySummarySections;
  let finalRawContent: string;
  let source: SummarySource;

  if (llmResult) {
    finalSections = llmResult.sections;
    finalRawContent = llmResult.rawContent;
    source = "llm";
  } else {
    const fallback = fallbackSummary(input);
    finalSections = fallback.sections;
    finalRawContent = fallback.rawContent;
    source = "template_fallback";
  }

  // 4. 落库（upsert）
  let reviewId: string | null = null;
  try {
    const sourceEventIds = input.events.map((e) => e.id);
    const review = await upsertDailySummary({
      date,
      rawContent: finalRawContent,
      sections: finalSections,
      sourceEventIds,
      source,
    });
    reviewId = review.id;
    void logInfo("db", `daily summary 已落库 date=${date} source=${source}`, {
      review_id: review.id,
      source,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    warnings.push(`落库失败：${errorMsg}`);
    void logError("db", `daily summary 落库失败：${errorMsg}`, { date });
  }

  return {
    ok: reviewId !== null,
    reviewId,
    source,
    rawContent: finalRawContent,
    sections: finalSections,
    error: llmError,
    warnings,
  };
}

/**
 * 解析 LLM 返回的 JSON
 * 期望格式：{ wins: [...], delays: [...], topNext: "...", improvement: "...", summary: "..." }
 */
function parseLlmResponse(
  content: string,
): { sections: DailySummarySections; rawContent: string } | null {
  try {
    // 容忍 LLM 包裹 ```json ... ``` 的情况
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr) as {
      wins?: string[];
      delays?: string[];
      topNext?: string;
      improvement?: string;
      summary?: string;
    };

    // 用 summary 作为完整文本，否则用结构化字段拼接
    const rawContent =
      parsed.summary ?? buildRawContentFromSections(parsed);

    return {
      sections: {
        wins: parsed.wins ?? [],
        delays: parsed.delays ?? [],
        topNext: parsed.topNext ?? "",
        improvement: parsed.improvement ?? "",
      },
      rawContent,
    };
  } catch {
    return null;
  }
}

function buildRawContentFromSections(s: {
  wins?: string[];
  delays?: string[];
  topNext?: string;
  improvement?: string;
}): string {
  const lines: string[] = [];
  lines.push("## 今天做成了什么");
  (s.wins ?? []).forEach((w) => lines.push(`- ${w}`));
  lines.push("");
  lines.push("## 今天拖延了什么");
  (s.delays ?? []).forEach((d) => lines.push(`- ${d}`));
  lines.push("");
  lines.push("## 明天最重要的一件事");
  lines.push(s.topNext ?? "");
  lines.push("");
  lines.push("## 一个可执行改进建议");
  lines.push(s.improvement ?? "");
  return lines.join("\n");
}
