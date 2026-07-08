-- Migration 0005: pomodoro_sessions 表（Pomodoro V1）
-- 用于持久化番茄钟会话，作为烛照的执行力数据源
--
-- 设计原则：
--   * 不每秒写数据库；started_at / paused_seconds / planned_minutes 是时间真相
--   * UI 倒计时用 Date.now() 派生
--   * 仅在 start / pause / resume / complete / abandon / interrupt 时写库
--   * app 重启后通过 getActivePomodoroSession() 恢复 running/paused 会话
--   * 同时只能存在一个 running 或 paused session（由 ops 层保证）
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT,                       -- 可选：关联任务
  title TEXT NOT NULL,                -- 番茄标题（可不同于 task.title）
  status TEXT NOT NULL,               -- running / paused / completed / abandoned / interrupted
  planned_minutes INTEGER NOT NULL,   -- 计划专注分钟数（通常 25）
  break_minutes INTEGER,              -- 预留休息分钟数（V1 不强制使用）
  mode TEXT NOT NULL DEFAULT 'focus', -- focus / break（V1 仅 focus）
  actual_seconds INTEGER NOT NULL DEFAULT 0,    -- 最终专注秒数（complete/abandon/interrupt 时写入）
  paused_seconds INTEGER NOT NULL DEFAULT 0,    -- 累计已暂停秒数（每次 resume 时累加）
  interruption_count INTEGER NOT NULL DEFAULT 0, -- 中断次数
  interruption_reason TEXT,
  completion_note TEXT,
  started_at TEXT NOT NULL,           -- 会话开始时间
  paused_at TEXT,                     -- 最近一次暂停时间
  resumed_at TEXT,                    -- 最近一次恢复时间
  ended_at TEXT,                      -- 结束时间（complete/abandon/interrupt）
  source_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_started_at ON pomodoro_sessions (started_at);
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_task_id ON pomodoro_sessions (task_id);
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_status ON pomodoro_sessions (status);

INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES
  (5, 'pomodoro_sessions', datetime('now'));
