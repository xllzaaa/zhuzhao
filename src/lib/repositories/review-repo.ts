/**
 * Review Repository（每日总结）
 *
 * 复用现有 reviews 表（migration 0002），不新增 migration。
 * 表结构：id / review_date / review_type / raw_content / sections / source_event_ids / created_at
 * 约束：UNIQUE (review_date, review_type)
 *
 * Phase 7 设计：
 * - review_type='daily' 表示每日总结
 * - 同一天重复生成时使用 INSERT OR REPLACE（依赖 UNIQUE 约束自动覆盖）
 * - raw_content 保存完整总结文本
 * - sections 保存结构化字段（JSON：{ wins, delays, topNext, improvement }）
 * - source_event_ids 保存参与总结的 event ids（JSON 数组）
 */

import type { ReviewRow } from "@/types/db";
import { query, execute } from "./base";
import { ulid, nowIso } from "@/lib/id";

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

/**
 * 获取某天的总结
 * @param date YYYY-MM-DD（本地时区）
 * @param reviewType 默认 'daily'
 */
export async function getByDate(
  date: string,
  reviewType = "daily",
): Promise<ReviewRow | null> {
  const rows = await query<ReviewRow>(
    "SELECT * FROM reviews WHERE review_date = ? AND review_type = ? LIMIT 1",
    [date, reviewType],
  );
  return rows[0] ?? null;
}

/**
 * 最近 N 条每日总结（按 review_date DESC）
 */
export async function listRecent(limit = 10): Promise<ReviewRow[]> {
  return query<ReviewRow>(
    "SELECT * FROM reviews WHERE review_type = 'daily' ORDER BY review_date DESC LIMIT ?",
    [limit],
  );
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

export interface UpsertDailySummaryInput {
  date: string; // YYYY-MM-DD
  /** 完整总结文本（用于展示） */
  rawContent: string;
  /** 结构化字段 */
  sections?: DailySummarySections | null;
  /** 参与总结的 event ids */
  sourceEventIds?: string[] | null;
  /** 来源：'llm' | 'template_fallback' */
  source?: string;
}

export interface DailySummarySections {
  /** 今天做成了什么 */
  wins?: string[];
  /** 今天拖延了什么 */
  delays?: string[];
  /** 明天最重要的一件事 */
  topNext?: string;
  /** 一个可执行改进建议 */
  improvement?: string;
}

/**
 * Upsert：同一天已有总结则更新，否则新建
 *
 * 实现策略：
 * 1. 先 SELECT 检查是否存在
 * 2. 存在 → UPDATE（保留原 id 和 created_at）
 * 3. 不存在 → INSERT
 *
 * 不直接用 INSERT OR REPLACE，因为 REPLACE 会先 DELETE 再 INSERT，
 * 导致 id 变化、created_at 重置。这里保留原 id/created_at 更稳定。
 */
export async function upsertDailySummary(
  input: UpsertDailySummaryInput,
): Promise<ReviewRow> {
  const now = nowIso();
  const existing = await getByDate(input.date, "daily");

  if (existing) {
    await execute(
      `UPDATE reviews
       SET raw_content = ?, sections = ?, source_event_ids = ?
       WHERE id = ?`,
      [
        input.rawContent,
        input.sections ? JSON.stringify(input.sections) : null,
        input.sourceEventIds ? JSON.stringify(input.sourceEventIds) : null,
        existing.id,
      ],
    );
    const updated = await getByDate(input.date, "daily");
    return updated ?? existing;
  }

  // 新建
  const id = ulid();
  await execute(
    `INSERT INTO reviews (
      id, review_date, review_type, raw_content, sections, source_event_ids, created_at
    ) VALUES (?, ?, 'daily', ?, ?, ?, ?)`,
    [
      id,
      input.date,
      input.rawContent,
      input.sections ? JSON.stringify(input.sections) : null,
      input.sourceEventIds ? JSON.stringify(input.sourceEventIds) : null,
      now,
    ],
  );
  const created = await getByDate(input.date, "daily");
  return created!;
}

// ---------------------------------------------------------------------------
// 辅助：解析 sections JSON
// ---------------------------------------------------------------------------

/**
 * 把 reviews.sections（JSON 字符串）解析为对象
 * 失败时返回 null
 */
export function parseSections(raw: string | null): DailySummarySections | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DailySummarySections;
  } catch {
    return null;
  }
}

/**
 * 把 reviews.source_event_ids（JSON 字符串）解析为字符串数组
 * 失败时返回空数组
 */
export function parseSourceEventIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
