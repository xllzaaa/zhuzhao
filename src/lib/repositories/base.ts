/**
 * Repository 基类：提供通用的 SELECT / INSERT / UPDATE 辅助
 * 依赖 @tauri-apps/plugin-sql
 */

import type Database from "@tauri-apps/plugin-sql";
import { getDb } from "@/lib/db";

/**
 * 通用查询
 * @param sql SQL 语句（占位符 ?）
 * @param params 绑定参数
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db: Database = getDb();
  return db.select(sql, params);
}

/**
 * 通用执行（INSERT/UPDATE/DELETE）
 * @returns 影响行数
 */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const db: Database = getDb();
  const result = await db.execute(sql, params);
  return result.rowsAffected;
}
