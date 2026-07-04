"""
Phase 6 验收 - 只读查询脚本

使用 SQLite URI 只读模式打开 App 的数据库，避免干扰 App 运行时的写入。
不修改任何数据，不输出敏感信息（API Key 等）。

用法:
    python scripts/readonly-query.py [tag]

tag 可选，用于标识本次查询对应的测试步骤（如 "before", "after-1min", "after-markdone"）。
"""

import sqlite3
import sys
import os
from pathlib import Path

DB_PATH = r"C:\Users\11012\AppData\Roaming\com.zhuzhao.desktop\zhuzhao.db"
URI = f"file:{DB_PATH}?mode=ro"


def fmt(s, max_len=60):
    if s is None:
        return ""
    s = str(s)
    if len(s) > max_len:
        return s[: max_len - 3] + "..."
    return s


def print_section(title):
    print()
    print("=" * 80)
    print(f"## {title}")
    print("=" * 80)


def query_db():
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] DB not found: {DB_PATH}")
        sys.exit(1)

    # 只读模式打开
    conn = sqlite3.connect(URI, uri=True)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    tag = sys.argv[1] if len(sys.argv) > 1 else "query"
    print(f"[readonly-query] tag={tag} db={DB_PATH}")
    print(f"[readonly-query] db size={os.path.getsize(DB_PATH)} bytes")

    # ---------- 1. events ----------
    print_section("1. events (最近 10 条，按 created_at DESC)")
    rows = cur.execute(
        "SELECT id, source, substr(raw_content,1,80) AS raw_preview, "
        "ai_processed, created_at FROM events ORDER BY created_at DESC LIMIT 10"
    ).fetchall()
    print(f"{'id':<26} {'source':<10} {'ai':<3} {'created_at':<26} raw_preview")
    for r in rows:
        print(f"{r['id']:<26} {r['source']:<10} {str(r['ai_processed']):<3} "
              f"{r['created_at']:<26} {fmt(r['raw_preview'], 80)}")

    # 找到包含 #phase6test 的 event
    print_section("1b. events 含 #phase6test 标记")
    rows = cur.execute(
        "SELECT id, source, raw_content, ai_processed, created_at "
        "FROM events WHERE raw_content LIKE '%#phase6test%' "
        "ORDER BY created_at DESC"
    ).fetchall()
    print(f"找到 {len(rows)} 条")
    for r in rows:
        print(f"  id={r['id']}")
        print(f"  source={r['source']}")
        print(f"  raw_content={r['raw_content']}")
        print(f"  ai_processed={r['ai_processed']}")
        print(f"  created_at={r['created_at']}")
        print()

    # ---------- 2. tasks ----------
    print_section("2. tasks (全部，按 updated_at DESC)")
    rows = cur.execute(
        "SELECT id, title, status, due_at, completed_at, delay_count, "
        "failure_reason, updated_at, created_at "
        "FROM tasks ORDER BY updated_at DESC"
    ).fetchall()
    print(f"{'id':<26} {'title':<30} {'status':<14} {'delay':<5} {'due_at':<26} {'completed_at':<26} failure_reason")
    for r in rows:
        print(f"{r['id']:<26} {fmt(r['title'],30):<30} {r['status']:<14} "
              f"{r['delay_count']:<5} {str(r['due_at']):<26} {str(r['completed_at']):<26} {fmt(r['failure_reason'], 40)}")
    print()
    print("详细信息:")
    for r in rows:
        print(f"  id={r['id']}")
        print(f"    title={r['title']}")
        print(f"    status={r['status']}")
        print(f"    delay_count={r['delay_count']}")
        print(f"    due_at={r['due_at']}")
        print(f"    completed_at={r['completed_at']}")
        print(f"    failure_reason={r['failure_reason']}")
        print(f"    created_at={r['created_at']}")
        print(f"    updated_at={r['updated_at']}")
        print()

    # ---------- 3. reminders ----------
    print_section("3. reminders (全部，按 updated_at DESC)")
    rows = cur.execute(
        "SELECT id, task_id, event_id, remind_at, reminder_type, status, "
        "snooze_count, substr(message,1,80) AS msg_preview, updated_at "
        "FROM reminders ORDER BY updated_at DESC"
    ).fetchall()
    print(f"{'id':<26} {'task_id':<26} {'status':<10} {'type':<10} {'snooz':<5} {'remind_at':<26} msg")
    for r in rows:
        print(f"{r['id']:<26} {str(r['task_id']):<26} {r['status']:<10} "
              f"{str(r['reminder_type']):<10} {r['snooze_count']:<5} {str(r['remind_at']):<26} {fmt(r['msg_preview'], 60)}")
    print()
    print("详细信息:")
    for r in rows:
        print(f"  id={r['id']}")
        print(f"    task_id={r['task_id']}")
        print(f"    event_id={r['event_id']}")
        print(f"    remind_at={r['remind_at']}")
        print(f"    reminder_type={r['reminder_type']}")
        print(f"    status={r['status']}")
        print(f"    snooze_count={r['snooze_count']}")
        print(f"    message={r['msg_preview']}")
        print(f"    updated_at={r['updated_at']}")
        print()

    # ---------- 4. conversation_messages ----------
    print_section("4. conversation_messages (最近 15 条，按 created_at DESC)")
    rows = cur.execute(
        "SELECT role, substr(content,1,100) AS content_preview, event_id, created_at "
        "FROM conversation_messages ORDER BY created_at DESC LIMIT 15"
    ).fetchall()
    print(f"{'role':<12} {'event_id':<26} {'created_at':<26} content")
    for r in rows:
        print(f"{r['role']:<12} {str(r['event_id']):<26} {r['created_at']:<26} {fmt(r['content_preview'], 100)}")
    print()

    print_section("4b. conversation_messages 含 [烛照追问] 标记")
    rows = cur.execute(
        "SELECT role, content, event_id, created_at "
        "FROM conversation_messages WHERE content LIKE '%烛照追问%' "
        "ORDER BY created_at DESC"
    ).fetchall()
    print(f"找到 {len(rows)} 条 监督追问消息")
    for r in rows:
        print(f"  role={r['role']}")
        print(f"  event_id={r['event_id']}")
        print(f"  created_at={r['created_at']}")
        print(f"  content=\n{r['content']}")
        print()

    # ---------- 5. 重点判断 ----------
    print_section("5. 重点判断")

    # 检查 pending reminder 到点是否触发
    pending_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='pending'"
    ).fetchone()["n"]
    fired_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='fired'"
    ).fetchone()["n"]
    snoozed_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='snoozed'"
    ).fetchone()["n"]
    resolved_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='resolved'"
    ).fetchone()["n"]
    cancelled_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='cancelled'"
    ).fetchone()["n"]
    print(f"reminder 状态分布: pending={pending_count} fired={fired_count} "
          f"snoozed={snoozed_count} resolved={resolved_count} cancelled={cancelled_count}")

    # 检查是否存在同一 task_id 下多个 pending/fired reminder（重复触发检测）
    dup = cur.execute(
        "SELECT task_id, COUNT(*) AS n FROM reminders "
        "WHERE status IN ('fired') GROUP BY task_id HAVING n > 1"
    ).fetchall()
    print(f"同一 task 的 fired reminder 重复数（>1 表示可能重复触发）: {len(dup)}")
    for r in dup:
        print(f"  task_id={r['task_id']} fired_count={r['n']}")

    # 检查 #phase6test 任务对应的 reminder
    print()
    print("#phase6test 任务链路:")
    rows = cur.execute(
        "SELECT t.id AS task_id, t.title, t.status AS task_status, "
        "t.delay_count, t.due_at, t.completed_at, "
        "r.id AS reminder_id, r.status AS reminder_status, r.remind_at, r.snooze_count "
        "FROM tasks t LEFT JOIN reminders r ON r.task_id = t.id "
        "WHERE t.title LIKE '%#phase6test%' OR t.title LIKE '%phase6test%' "
        "ORDER BY t.created_at DESC, r.remind_at DESC"
    ).fetchall()
    for r in rows:
        print(f"  task={r['task_id']} status={r['task_status']} delay={r['delay_count']}")
        print(f"    due_at={r['due_at']} completed_at={r['completed_at']}")
        print(f"    reminder={r['reminder_id']} status={r['reminder_status']}")
        print(f"    remind_at={r['remind_at']} snooze={r['snooze_count']}")
        print()

    conn.close()
    print("[readonly-query] done")


if __name__ == "__main__":
    query_db()
