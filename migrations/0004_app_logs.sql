-- Migration 0004: app_logs 表（Phase 9 日志与诊断）
--
-- 用途：记录关键事件，用于本地诊断，不自动上传。
-- 安全约束：
--   * 不允许写入 api_key / authorization / bearer / token / secret
--   * 应用层负责脱敏后再写库
--   * 不存储完整 LLM 原始响应
CREATE TABLE IF NOT EXISTS app_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  level TEXT NOT NULL,            -- info / warn / error
  scope TEXT NOT NULL,            -- intake / llm / reminder / markdown / settings / db / system
  message TEXT NOT NULL,
  meta_json TEXT                  -- 可选结构化元数据（脱敏后的 JSON 字符串）
);

CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs (level);
CREATE INDEX IF NOT EXISTS idx_app_logs_scope ON app_logs (scope);

INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES
  (4, 'app_logs', datetime('now'));
