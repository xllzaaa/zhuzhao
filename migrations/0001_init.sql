-- Migration 0001: 初始化 schema_version 表
-- 用于追踪已执行的 migrations，Phase 2 起添加实际业务表
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES
  (1, 'init', datetime('now'));
