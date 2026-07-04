"""
Phase 6 fix 验收 - 只读查询 #phase6fix 完整链路

不修改数据库，不输出 API Key。
"""

import sqlite3
import sys
import os
from datetime import datetime, timezone

DB_PATH = r"C:\Users\11012\AppData\Roaming\com.zhuzhao.desktop\zhuzhao.db"
URI = f"file:{DB_PATH}?mode=ro"


def now_str():
    now_local = datetime.now()
    now_utc = datetime.now(timezone.utc)
    print(f"[now] 本地时间: {now_local.strftime('%Y-%m-%d %H:%M:%S')} ({now_local.astimezone().tzinfo})")
    print(f"[now] UTC 时间:  {now_utc.strftime('%Y-%m-%dT%H:%M:%S.%fZ')}")


def parse_iso(s):
    if not s:
        return None
    try:
        s2 = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s2)
    except Exception as e:
        print(f"  [warn] parse_iso failed: {s!r} err={e}")
        return None


def fmt_diff(dt):
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
    now_str()

    conn = sqlite3.connect(URI, uri=True)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # ---------- 1. events #phase6fix ----------
    print()
    print("=" * 80)
    print("## 1. events #phase6fix")
    print("=" * 80)
    r = cur.execute(
        "SELECT id, source, raw_content, ai_processed, created_at, event_type, metadata "
        "FROM events WHERE raw_content LIKE '%#phase6fix%' "
        "ORDER BY created_at DESC LIMIT 5"
    ).fetchall()
    print(f"找到 {len(r)} 条")
    for row in r:
        print(f"  id={row['id']}")
        print(f"  source={row['source']}")
        print(f"  event_type={row['event_type']}")
        print(f"  raw_content={row['raw_content']}")
        print(f"  ai_processed={row['ai_processed']}")
        print(f"  metadata={row['metadata']}")
        print(f"  created_at={row['created_at']} ({fmt_diff(parse_iso(row['created_at']))})")
        print()

    # ---------- 2. tasks #phase6fix ----------
    print("=" * 80)
    print("## 2. tasks #phase6fix")
    print("=" * 80)
    rows = cur.execute(
        "SELECT id, title, status, due_at, completed_at, delay_count, "
        "failure_reason, created_at, updated_at, scheduled_at, source_event_id, completion_note "
        "FROM tasks WHERE title LIKE '%#phase6fix%' OR title LIKE '%测试烛照监督闭环%' "
        "ORDER BY created_at DESC"
    ).fetchall()
    print(f"找到 {len(rows)} 条")
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

    # ---------- 3. reminders #phase6fix ----------
    print("=" * 80)
    print("## 3. reminders #phase6fix")
    print("=" * 80)
    rows = cur.execute(
        "SELECT id, task_id, event_id, remind_at, reminder_type, status, "
        "snooze_count, message, created_at, updated_at "
        "FROM reminders "
        "WHERE message LIKE '%#phase6fix%' "
        "OR task_id IN (SELECT id FROM tasks WHERE title LIKE '%#phase6fix%' OR title LIKE '%测试烛照监督闭环%') "
        "ORDER BY created_at DESC"
    ).fetchall()
    print(f"找到 {len(rows)} 条")
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

    # ---------- 4. conversation_messages #phase6fix ----------
    print("=" * 80)
    print("## 4. conversation_messages #phase6fix")
    print("=" * 80)
    rows = cur.execute(
        "SELECT id, conversation_id, role, content, event_id, created_at "
        "FROM conversation_messages "
        "WHERE content LIKE '%#phase6fix%' OR content LIKE '%烛照追问%' "
        "ORDER BY created_at DESC"
    ).fetchall()
    print(f"找到 {len(rows)} 条")
    for row in rows:
        print(f"  id={row['id']}")
        print(f"  conversation_id={row['conversation_id']}")
        print(f"  role={row['role']}")
        print(f"  event_id={row['event_id']}")
        print(f"  created_at={row['created_at']} ({fmt_diff(parse_iso(row['created_at']))})")
        print(f"  content={row['content']}")
        print()

    # ---------- 5. 时间线 ----------
    print("=" * 80)
    print("## 5. 时间线（按时间顺序）")
    print("=" * 80)
    rows = cur.execute("""
        SELECT 'event' AS kind, created_at, raw_content AS detail
        FROM events WHERE raw_content LIKE '%#phase6fix%'
        UNION ALL
        SELECT 'task', created_at, title || ' status=' || status || ' delay=' || delay_count
        FROM tasks WHERE title LIKE '%#phase6fix%' OR title LIKE '%测试烛照监督闭环%'
        UNION ALL
        SELECT 'reminder_created', created_at, message || ' status=' || status
        FROM reminders WHERE message LIKE '%#phase6fix%'
        UNION ALL
        SELECT 'reminder_updated', updated_at, message || ' status=' || status
        FROM reminders WHERE message LIKE '%#phase6fix%'
        UNION ALL
        SELECT 'msg', created_at, role || ': ' || substr(content, 1, 60)
        FROM conversation_messages WHERE content LIKE '%#phase6fix%' OR content LIKE '%烛照追问%'
        ORDER BY created_at ASC
    """).fetchall()
    print(f"{'时间':<32} {'kind':<20} {'detail':<80}")
    for row in rows:
        ts = row['created_at']
        print(f"{ts:<32} {row['kind']:<20} {row['detail'][:80]}")

    # ---------- 6. 重点判断 ----------
    print()
    print("=" * 80)
    print("## 6. 重点判断")
    print("=" * 80)

    # 6.1 reminder 状态分布
    pending_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='pending' AND message LIKE '%#phase6fix%'"
    ).fetchone()["n"]
    fired_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='fired' AND message LIKE '%#phase6fix%'"
    ).fetchone()["n"]
    snoozed_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='snoozed' AND message LIKE '%#phase6fix%'"
    ).fetchone()["n"]
    resolved_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='resolved' AND message LIKE '%#phase6fix%'"
    ).fetchone()["n"]
    cancelled_count = cur.execute(
        "SELECT COUNT(*) AS n FROM reminders WHERE status='cancelled' AND message LIKE '%#phase6fix%'"
    ).fetchone()["n"]
    print(f"reminder 状态分布 (#phase6fix): pending={pending_count} fired={fired_count} "
          f"snoozed={snoozed_count} resolved={resolved_count} cancelled={cancelled_count}")

    # 6.2 task 状态
    tasks_status = cur.execute(
        "SELECT status, delay_count, id, title FROM tasks "
        "WHERE title LIKE '%#phase6fix%' OR title LIKE '%测试烛照监督闭环%' "
        "ORDER BY created_at DESC"
    ).fetchall()
    print(f"\ntask 状态 (#phase6fix):")
    for t in tasks_status:
        print(f"  id={t['id']} title={t['title']} status={t['status']} delay_count={t['delay_count']}")

    # 6.3 [烛照追问] 消息数
    followup_count = cur.execute(
        "SELECT COUNT(*) AS n FROM conversation_messages WHERE content LIKE '%烛照追问%' "
        "AND created_at >= (SELECT created_at FROM events WHERE raw_content LIKE '%#phase6fix%' LIMIT 1)"
    ).fetchone()["n"]
    print(f"\n[烛照追问] 消息数（#phase6fix 之后）: {followup_count}")

    # 6.4 重复触发检测
    dup = cur.execute(
        "SELECT task_id, COUNT(*) AS n FROM reminders "
        "WHERE status IN ('fired') AND message LIKE '%#phase6fix%' "
        "GROUP BY task_id HAVING n > 1"
    ).fetchall()
    print(f"同一 task 的 fired reminder 重复数（>1 表示可能重复触发）: {len(dup)}")

    # 6.5 remind_at vs 触发时间
    print(f"\nremind_at 与 [烛照追问] 消息时间对照:")
    reminder = cur.execute(
        "SELECT id, remind_at, status FROM reminders WHERE message LIKE '%#phase6fix%' LIMIT 1"
    ).fetchone()
    if reminder:
        r_at = parse_iso(reminder['remind_at'])
        print(f"  remind_at={reminder['remind_at']} ({fmt_diff(r_at)})")
        print(f"  reminder.status={reminder['status']}")
        msg = cur.execute(
            "SELECT created_at FROM conversation_messages WHERE content LIKE '%烛照追问%' "
            "AND created_at >= ? ORDER BY created_at ASC LIMIT 1",
            (reminder['remind_at'],)
        ).fetchone()
        if msg:
            m_at = parse_iso(msg['created_at'])
            print(f"  [烛照追问]消息时间={msg['created_at']} ({fmt_diff(m_at)})")
            if r_at and m_at:
                delay = (m_at - r_at).total_seconds()
                print(f"  触发延迟 = {delay:+.1f}s（理想 ≈ 0~60s，因 scheduler 60s 轮询）")

    # ---------- 7. 总结 ----------
    print()
    print("=" * 80)
    print("## 7. 验收要点总结")
    print("=" * 80)
    print(f"✓ reminder 是否 pending → fired：{'是' if fired_count > 0 else '否（仍为 pending 或其他状态）'}")
    task_status_str = tasks_status[0]['status'] if tasks_status else 'None'
    task_delay = tasks_status[0]['delay_count'] if tasks_status else 0
    print(f"✓ task 状态：{task_status_str}（应为 doing / scheduled / review_needed，不应是 delayed）")
    print(f"✓ delay_count：{task_delay}（应保持 0，除非用户手动延期）")
    print(f"✓ 是否生成 [烛照追问] 消息：{'是' if followup_count > 0 else '否'}")
    print(f"✓ 是否只有一条追问（无重复触发）：{'是' if followup_count == 1 else f'否（{followup_count} 条）'}")
    print(f"✓ ChatSidebar 是否自动滚到底部：UI 行为，数据库无法验证（需用户主观确认）")

    conn.close()
    print()
    print("[diagnose-phase6fix] done")


if __name__ == "__main__":
    main()
