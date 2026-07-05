"""Phase 9 只读数据库诊断脚本

用途：检查 app_settings / schema_version / events / reviews / app_logs 当前状态
不修改任何数据。
"""
import sqlite3
import sys
from pathlib import Path

DB = Path(r"C:\Users\11012\AppData\Roaming\com.zhuzhao.desktop\zhuzhao.db")

if not DB.exists():
    print(f"[ERROR] DB not found: {DB}")
    sys.exit(1)

# 只读连接
conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
cur = conn.cursor()


def dump(title, sql, *args):
    print(f"\n=== {title} ===")
    try:
        rows = cur.execute(sql, args).fetchall()
    except Exception as e:
        print(f"[ERROR] {e}")
        return
    if not rows:
        print("(empty)")
        return
    cols = rows[0].keys()
    print(" | ".join(cols))
    for r in rows:
        print(" | ".join(str(r[c]) for c in cols))


# 1. schema_version
dump("schema_version", "SELECT version, name, applied_at FROM schema_version ORDER BY version")

# 2. app_settings
dump("app_settings", "SELECT key, value, updated_at FROM app_settings ORDER BY key")

# 3. events today
dump("events today", "SELECT id, event_type, substr(raw_content,1,80) AS raw_preview, ai_processed, created_at FROM events WHERE date(created_at)=date('now') ORDER BY created_at DESC")

# 4. journal_entries today
dump("journal_entries today", "SELECT id, substr(raw_content,1,80) AS raw_preview, mood, tags, source_event_id, created_at FROM journal_entries WHERE date(created_at)=date('now') ORDER BY created_at DESC")

# 5. reviews today
dump("reviews today", "SELECT id, review_date, review_type, substr(raw_content,1,80) AS raw_preview, created_at FROM reviews WHERE review_date=date('now')")

# 6. reminders pending
dump("reminders pending", "SELECT id, remind_at, status, task_id FROM reminders WHERE status='pending' ORDER BY remind_at")

# 7. app_logs summary
dump("app_logs summary", "SELECT level, scope, COUNT(*) AS cnt FROM app_logs GROUP BY level, scope ORDER BY level, scope")

# 8. app_logs recent 20
dump("app_logs recent 20", "SELECT created_at, level, scope, substr(message,1,100) AS msg FROM app_logs ORDER BY created_at DESC LIMIT 20")

# 9. llm_providers（不输出 api_key）
dump("llm_providers (no api_key)", "SELECT id, name, provider_type, base_url, model, is_active, created_at FROM llm_providers ORDER BY created_at")

conn.close()
print("\n[OK] read-only diagnosis complete")
