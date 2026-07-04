/**
 * SQLite 数据库初始化与连接
 *
 * 使用 @tauri-apps/plugin-sql（基于 tauri-plugin-sql Rust 插件）
 * migrations 在 Rust 端 lib.rs 中通过 add_migrations 注册
 * 这里仅负责加载连接并验证 schema_version
 */

import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

/**
 * 初始化数据库连接
 * - 加载 SQLite 连接（plugin-sql 会自动执行 migrations）
 * - 验证 schema_version 表存在
 */
export async function initDatabase(): Promise<void> {
  if (db) return;

  try {
    db = await Database.load("sqlite:zhuzhao.db");

    // 验证 migrations 已执行：查询 schema_version
    const rows = await db.select<{ version: number; name: string; applied_at: string }[]>(
      "SELECT version, name, applied_at FROM schema_version ORDER BY version",
    );

    if (rows.length === 0) {
      throw new Error("schema_version 表为空，migrations 可能未执行");
    }

    console.info(
      `[DB] 初始化成功，已执行 ${rows.length} 条 migration:`,
      rows.map((r) => `v${r.version}(${r.name})`).join(", "),
    );
  } catch (err) {
    db = null;
    throw err;
  }
}

/** 获取数据库连接（需先 initDatabase） */
export function getDb(): Database {
  if (!db) {
    throw new Error("数据库未初始化，请先调用 initDatabase()");
  }
  return db;
}

/** 关闭数据库连接 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
