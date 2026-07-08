-- Migration 0006: pomodoro_sessions 单 active session 保护（Pomodoro V1 Safety Patch）
--
-- 目标：保证 pomodoro_sessions 中同时最多只能有一个 status IN ('running', 'paused') 的 active session
--
-- 实现方式：partial unique index + 常量表达式
--   所有 active session 在常量 1 上冲突，partial unique index 强制全局唯一
--   即：任何时刻最多存在一行满足 status IN ('running','paused')
--
-- 兼容性说明：
--   * SQLite >= 3.9.0 (2015-10-14) 起支持表达式索引
--   * Tauri 2.x 内置 SQLite 版本 >= 3.30，完全支持
--   * 常量表达式 1 不引用任何列，符合 SQLite 表达式索引规范
--
-- 不修改 0005 的表结构和字段；不改 Rust 业务逻辑；不影响已有数据
-- 如已有 0005 已执行，本 migration 仅追加一个 index
CREATE UNIQUE INDEX IF NOT EXISTS idx_pomodoro_sessions_single_active
ON pomodoro_sessions (1)
WHERE status IN ('running', 'paused');

INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES
  (6, 'pomodoro_single_active_index', datetime('now'));
