"""
Phase 6 验收 bug 诊断 - 只读查询 #phase6test 完整时间线

输出每条记录的 created_at / updated_at / remind_at / due_at，
对照系统当前时间，分析自动延期 bug 的根因。
不修改数据库，不输出 API Key。
"""

import sqlite3
import sys
import os
from datetime import datetime, timezone

DB_PATH = r"C:\Users\11012\AppData\Roaming\com.zhuzhao.desktop\zhuzhao.db"
URI = f"file:{DB_PATH}?mode=ro"


def now_local_and_utc():
    """输出本地时间和 UTC，便于对照数据库里的 ISO 时间"""
    now_local = datetime.now()
    now_utc = datetime.now(timezone.utc)
    print(f"[now] 本地时间: {now_local.strftime('%Y-%m-%d %H:%M:%S')} ({now_local.astimezone().tzinfo})")
    print(f"[now] UTC 时间:  {now_utc.strftime('%Y-%m-%dT%H:%M:%S.%fZ')}")


def parse_iso(s):
    """容错解析 ISO 时间字符串（含 +08:00 / Z / 毫秒）"""
    if not s:
        return None
    try:
        # 替换 Z 为 +00:00
        s2 = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s2)
    except Exception as e:
        print(f"  [warn] parse_iso failed: {s!r} err={e}")
        return None


def fmt_diff(dt):
    """返回距现在的差值字符串"""
    if dt is None:
        return "None"
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    sec = diff.total_seconds()
    if sec >= 0:
        return f"{sec:+.1f}s ago"
    else:
        return f"{-sec:+.1f}s in future"


def main():
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] DB not found: {DB_PATH}")
        sys.exit(1)

    print("=" * 80)
    print("## 当前时间")
    print("=" * 80)
    now_local_and_utc()

    conn = sqlite3.connect(URI, uri=True)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # ---------- 1. event #phase6test ----------
    print()
    print("=" * 80)
    print("## 1. event #phase6test")
    print("=" * 80)
    r = cur.execute(
        "SELECT id, source, raw_content, ai_processed, created_at, event_type, metadata "
        "FROM events WHERE raw_content LIKE '%#phase6test%' "
        "ORDER BY created_at DESC LIMIT 5"
    ).fetchall()
    for row in r:
        print(f"  id={row['id']}")
        print(f"  source={row['source']}")
        print(f"  event_type={row['event_type']}")
        print(f"  raw_content={row['raw_content']}")
        print(f"  ai_processed={row['ai_processed']}")
        print(f"  metadata={row['metadata']}")
        print(f"  created_at={row['created_at']} ({fmt_diff(parse_iso(row['created_at']))})")
        print()

    # ---------- 2. 对应 task ----------
    print("=" * 80)
    print("## 2. tasks #phase6test")
    print("=" * 80)
    rows = cur.execute(
        "SELECT id, title, status, due_at, completed_at, delay_count, "
        "failure_reason, created_at, updated_at, scheduled_at, source_event_id, completion_note "
        "FROM tasks WHERE title LIKE '%#phase6test%' OR title LIKE '%测试烛照监督闭环%' "
        "ORDER BY created_at DESC"
    ).fetchall()
    for row in rows:
        print(f"  id={row['id']}")
        print(f"  title={row['title']}")
        print(f"  status={row['status']}")
        print(f"  delay_count={row['delay_count']}")
        print(f"  due_at={row['due_at']} ({fmt_diff(parse_iso(row['due_at']))})")
        print(f"  completed_at={row['completed_at']}")
        print(f"  failure_reason={row['failure_reason']}")
        print(f"  completion_note={row['completion_note']}")
        print(f"  scheduled_at={row['scheduled_at']}")
        print(f"  source_event_id={row['source_event_id']}")
        print(f"  created_at={row['created_at']} ({fmt_diff(parse_iso(row['created_at']))})")
        print(f"  updated_at={row['updated_at']} ({fmt_diff(parse_iso(row['updated_at']))})")
        print()

    # ---------- 3. 对应 reminder ----------
    print("=" * 80)
    print("## 3. reminders #phase6test")
    print("=" * 80)
    rows = cur.execute(
        "SELECT id, task_id, event_id, remind_at, reminder_type, status, "
        "snooze_count, message, created_at, updated_at "
        "FROM reminders "
        "WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE '%#phase6test%' OR title LIKE '%测试烛照监督闭环%') "
        "OR message LIKE '%#phase6test%' "
        "ORDER BY created_at DESC"
    ).fetchall()
    for row in rows:
        print(f"  id={row['id']}")
        print(f"  task_id={row['task_id']}")
        print(f"  event_id={row['event_id']}")
        print(f"  remind_at={row['remind_at']} ({fmt_diff(parse_iso(row['remind_at']))})")
        print(f"  reminder_type={row['reminder_type']}")
        print(f"  status={row['status']}")
        print(f"  snooze_count={row['snooze_count']}")
        print(f"  message={row['message']}")
        print(f"  created_at={row['created_at']} ({fmt_diff(parse_iso(row['created_at']))})")
        print(f"  updated_at={row['updated_at']} ({fmt_diff(parse_iso(row['updated_at']))})")
        print()

    # ---------- 4. conversation_messages #phase6test ----------
    print("=" * 80)
    print("## 4. conversation_messages #phase6test")
    print("=" * 80)
    rows = cur.execute(
        "SELECT id, conversation_id, role, content, event_id, created_at "
        "FROM conversation_messages "
        "WHERE content LIKE '%#phase6test%' OR content LIKE '%烛照追问%' "
        "ORDER BY created_at DESC"
    ).fetchall()
    for row in rows:
        print(f"  id={row['id']}")
        print(f"  conversation_id={row['conversation_id']}")
        print(f"  role={row['role']}")
        print(f"  event_id={row['event_id']}")
        print(f"  created_at={row['created_at']} ({fmt_diff(parse_iso(row['created_at']))})")
        print(f"  content={row['content']}")
        print()

    # ---------- 5. 所有 conversations ----------
    print("=" * 80)
    print("## 5. conversations (最近 5 个)")
    print("=" * 80)
    rows = cur.execute(
        "SELECT id, title, created_at, updated_at FROM conversations "
        "ORDER BY updated_at DESC LIMIT 5"
    ).fetchall()
    for row in rows:
        print(f"  id={row['id']}")
        print(f"  title={row['title']}")
        print(f"  created_at={row['created_at']}")
        print(f"  updated_at={row['updated_at']} ({fmt_diff(parse_iso(row['updated_at']))})")
        print()

    # ---------- 6. 时间线分析 ----------
    print("=" * 80)
    print("## 6. 时间线分析（按时间顺序）")
    print("=" * 80)
    rows = cur.execute("""
        SELECT 'event' AS kind, created_at, raw_content AS detail
        FROM events WHERE raw_content LIKE '%#phase6test%'
        UNION ALL
        SELECT 'task', created_at, title || ' status=' || status || ' delay=' || delay_count
        FROM tasks WHERE title LIKE '%#phase6test%' OR title LIKE '%测试烛照监督闭环%'
        UNION ALL
        SELECT 'reminder_created', created_at, message || ' status=' || status
        FROM reminders WHERE message LIKE '%#phase6test%'
        UNION ALL
        SELECT 'reminder_updated', updated_at, message || ' status=' || status
        FROM reminders WHERE message LIKE '%#phase6test%'
        UNION ALL
        SELECT 'msg', created_at, role || ': ' || substr(content, 1, 60)
        FROM conversation_messages WHERE content LIKE '%#phase6test%' OR content LIKE '%烛照追问%'
        ORDER BY created_at ASC
    """).fetchall()
    print(f"{'时间':<32} {'kind':<20} {'detail':<80}")
    for row in rows:
        ts = row['created_at']
        print(f"{ts:<32} {row['kind']:<20} {row['detail'][:80]}")
    print()
    print("remind_at 与 reminder 状态变化对照:")
    for r in cur.execute(
        "SELECT remind_at, status, created_at, updated_at FROM reminders WHERE message LIKE '%#phase6test%'"
    ).fetchall():
        r_at = parse_iso(r['remind_at'])
        r_upd = parse_iso(r['updated_at'])
        print(f"  remind_at={r['remind_at']} ({fmt_diff(r_at)})")
        print(f"  created_at={r['created_at']}")
        print(f"  updated_at={r['updated_at']} ({fmt_diff(r_upd)})")
        print(f"  status={r['status']}")
        if r_at and r_upd:
            delay = (r_upd - r_at).total_seconds()
            print(f"  updated_at - remind_at = {delay:+.1f}s（>0 表示触发后多久被改动）")

    conn.close()
    print()
    print("[diagnose] done")


if __name__ == "__main__":
    main()
