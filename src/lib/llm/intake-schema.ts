/**
 * LLM Intake Result Schema
 * 详见 openspec/specs/llm-intake/spec.md §4
 *
 * 设计：
 * - 用 Zod 严格校验 LLM 返回的 JSON
 * - 校验失败时调用方进入 fallback 路径，不创建任何实体
 * - schema 兼容大部分 OpenAI-compatible 模型输出（response_format=json_object）
 *
 * 容错策略：
 * - task / reminder 字段允许 undefined / null / 对象（nullish）
 * - 当 actions.create_task=false 时，task 字段可以是任意值（被忽略）
 * - 当 actions.create_reminder=false 时，reminder 字段可以是任意值（被忽略）
 * - 当 actions.create_task=true 时，task 必须是对象且至少有 title（superRefine）
 * - 当 actions.create_reminder=true 时，reminder 必须是对象且至少有 remind_at 或 message（superRefine）
 * - 核心枚举（content_type / reply_mode / risk_level / save_level）保持严格
 */

import { z } from "zod";

export const contentTypeSchema = z.enum([
  "task",
  "idea",
  "journal",
  "chat",
  "plan",
  "review",
  "unknown",
]);

export const replyModeSchema = z.enum([
  "silent",
  "ack",
  "suggest",
  "coach",
  "challenge",
  "harsh",
]);

export const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const memorySaveLevelSchema = z.enum([
  "none",
  "short_term",
  "long_term",
  "profile",
]);

export const taskPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "urgent",
]);

export const reminderTypeSchema = z.enum([
  "task_due",
  "check_in",
  "journal",
  "review",
  "custom",
]);

/**
 * Task 子对象 schema（所有字段都允许 optional / nullable，避免过度严格）
 */
const taskObjectSchema = z.object({
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(), // ISO 8601
  priority: taskPrioritySchema.nullable().optional(),
  estimated_minutes: z.number().nullable().optional(),
});

/**
 * Reminder 子对象 schema（所有字段都允许 optional / nullable）
 */
const reminderObjectSchema = z.object({
  remind_at: z.string().nullable().optional(), // ISO 8601
  message: z.string().nullable().optional(),
  type: reminderTypeSchema.nullable().optional(),
});

/**
 * IntakeResultSchema - 主 schema
 *
 * task / reminder 用 nullish() 允许 undefined / null / 对象
 * 条件必填规则在 superRefine 中实现
 */
export const IntakeResultSchema = z
  .object({
    content_type: contentTypeSchema,
    title: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    raw_should_be_saved: z.boolean(),
    tags: z.array(z.string()).default([]),
    topic_candidates: z.array(z.string()).default([]),
    project_candidates: z.array(z.string()).default([]),
    should_reply: z.boolean(),
    reply_mode: replyModeSchema,
    reply_text: z.string().nullable().optional(),
    actions: z.object({
      create_task: z.boolean().default(false),
      create_idea: z.boolean().default(false),
      create_journal: z.boolean().default(false),
      create_reminder: z.boolean().default(false),
      update_user_profile: z.boolean().default(false),
      link_to_project: z.boolean().default(false),
      write_markdown: z.boolean().default(false),
    }),
    // nullish() = 接受 undefined / null / 对象
    task: taskObjectSchema.nullish(),
    reminder: reminderObjectSchema.nullish(),
    memory: z.object({
      save_level: memorySaveLevelSchema,
      reason: z.string().nullable().optional(),
    }),
    risk_level: riskLevelSchema,
    confidence: z.number().min(0).max(1),
  })
  .superRefine((data, ctx) => {
    // 条件校验：actions.create_task=true 时，task 必须是对象且至少有 title
    if (data.actions.create_task) {
      if (!data.task || typeof data.task !== "object") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["task"],
          message:
            "actions.create_task=true 时 task 必须是对象且至少包含 title",
        });
      } else if (!data.task.title || typeof data.task.title !== "string" || data.task.title.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["task", "title"],
          message: "actions.create_task=true 时 task.title 必填且不能为空",
        });
      }
    }

    // 条件校验：actions.create_reminder=true 时，reminder 必须是对象且至少有 remind_at 或 message
    if (data.actions.create_reminder) {
      if (!data.reminder || typeof data.reminder !== "object") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reminder"],
          message:
            "actions.create_reminder=true 时 reminder 必须是对象且至少包含 remind_at 或 message",
        });
      } else {
        const hasRemindAt =
          !!data.reminder.remind_at &&
          typeof data.reminder.remind_at === "string" &&
          data.reminder.remind_at.trim().length > 0;
        const hasMessage =
          !!data.reminder.message &&
          typeof data.reminder.message === "string" &&
          data.reminder.message.trim().length > 0;
        if (!hasRemindAt && !hasMessage) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reminder"],
            message:
              "actions.create_reminder=true 时 reminder 必须至少包含 remind_at 或 message",
          });
        }
      }
    }

    // 跨字段一致性：content_type=task 时建议 actions.create_task=true（仅警告，不强制）
    // 不加 issue，避免误判；让 LLM 自己决定

    // should_reply=false 时 reply_mode=silent（建议但不强制）
    // 不加 issue，避免误判
  });

export type IntakeResult = z.infer<typeof IntakeResultSchema>;

/**
 * 宽容解析：LLM 返回可能带 markdown ```json 围栏或前后噪声
 * 1. 先尝试直接 JSON.parse
 * 2. 失败则提取第一个 {...} 子串再 parse
 * 3. 都失败返回 null
 */
export function parseLenientJSON(raw: string): unknown | null {
  // 1. 直接 parse
  try {
    return JSON.parse(raw);
  } catch {
    // 继续
  }

  // 2. 提取 ```json ... ``` 围栏
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // 继续
    }
  }

  // 3. 提取第一个 { 到最后一个 } 的子串
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const substring = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(substring);
    } catch {
      // 继续
    }
  }

  return null;
}

/**
 * 用 Zod 校验已 parse 的对象
 * 返回 success / error（含友好的错误描述）
 */
export function validateIntakeResult(
  parsed: unknown,
): { success: true; data: IntakeResult } | { success: false; error: string } {
  const result = IntakeResultSchema.safeParse(parsed);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // 把 ZodError 转为更友好的字符串
  const issues = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { success: false, error: issues };
}
