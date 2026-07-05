"""Phase 6 post-commit 回归验收 - 只读查询当前状态"""
import sqlite3, os
from datetime import datetime, timezone

DB = r"file:C:\Users\11012\AppData\Roaming\com.zhuzhao.desktop\zhuzhao.db?mode=ro"
if not os.path.exists(DB.split("file:")[1].split("?")[0]):
    print("DB not found"); exit(1)

print(f"[now] 本地: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"[now] UTC:  {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')}")

c = sqlite3.connect(DB, uri=True)
c.row_factory = sqlite3.Row
cur = c.cursor()

print("\n" + "="*80)
print("## 1. 所有 tasks（按 created_at DESC）")
print("="*80)
rows = cur.execute(
    "SELECT id, title, status, delay_count, due_at, completed_at, "
    "failure_reason, created_at, updated_at "
    "FROM tasks ORDER BY created_at DESC"
).fetchall()
for r in rows:
    print(f"  id={r['id']}")
    print(f"  title={r['title']}")
    print(f"    status={r['status']} delay_count={r['delay_count']}")
    print(f"    due_at={r['due_at']}")
    print(f"    completed_at={r['completed_at']}")
    print(f"    failure_reason={r['failure_reason']}")
    print(f"    created_at={r['created_at']}")
    print(f"    updated_at={r['updated_at']}")
    print()

print("="*80)
print("## 2. 所有 reminders（按 created_at DESC）")
print("="*80)
rows = cur.execute(
    "SELECT id, task_id, status, remind_at, snooze_count, message, "
    "created_at, updated_at "
    "FROM reminders ORDER BY created_at DESC"
).fetchall()
for r in rows:
    print(f"  id={r['id']}")
    print(f"    task_id={r['task_id']}")
    print(f"    status={r['status']} snooze_count={r['snooze_count']}")
    print(f"    remind_at={r['remind_at']}")
    print(f"    message={r['message']}")
    print(f"    created_at={r['created_at']}")
    print(f"    updated_at={r['updated_at']}")
    print()

print("="*80)
print("## 3. #phase6fix 任务当前状态")
print("="*80)
r = cur.execute(
    "SELECT id, title, status, completed_at, delay_count, updated_at "
    "FROM tasks WHERE title LIKE '%#phase6fix%' ORDER BY created_at DESC LIMIT 1"
).fetchone()
if r:
    print(f"  id={r['id']}")
    print(f"  title={r['title']}")
    print(f"  status={r['status']}")
    print(f"  completed_at={r['completed_at']}")
    print(f"  delay_count={r['delay_count']}")
    print(f"  updated_at={r['updated_at']}")
else:
    print("  未找到")

c.close()
print("\n[done]")
