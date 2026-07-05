-- Migration 0003: app_settings 表（Phase 8 Markdown 导出配置）
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES
  (3, 'app_settings', datetime('now'));
