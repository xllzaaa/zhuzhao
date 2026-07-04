"""
Phase 6 fix - markDone 后只读查询

验证：
- task.status 是否变为 done
- completed_at 是否有值
- 对应 reminder 是否从 fired 变为 resolved / completed / cancelled
- delay_count 是否没有变化
- 没有重复生成新的追问
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
    except Exception:
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

    # ---------- 1. tasks #phase6fix ----------
    print()
    print("=" * 80)
    print("## 1. tasks #phase6fix")
    print("=" * 80)
    rows = cur.execute(
        "SELECT id, title, status, completed_at, delay_count, updated_at, created_at, "
        "completion_note, failure_reason "
        "FROM tasks WHERE title LIKE '%#phase6fix%' OR title LIKE '%测试烛照监督闭环%' "
        "ORDER BY created_at DESC"
    ).fetchall()
    print(f"找到 {len(rows)} 条")
    for row in rows:
        print(f"  id={row['id']}")
        print(f"  title={row['title']}")
        print(f"  status={row['status']}")
        print(f"  delay_count={row['delay_count']}")
        print(f"  completed_at={row['completed_at']} ({fmt_diff(parse_iso(row['completed_at']))})")
        print(f"  completion_note={row['completion_note']}")
        print(f"  failure_reason={row['failure_reason']}")
        print(f"  created_at={row['created_at']}")
        print(f"  updated_at={row['updated_at']} ({fmt_diff(parse_iso(row['updated_at']))})")
        print()

    # ---------- 2. reminders #phase6fix ----------
    print("=" * 80)
    print("## 2. reminders #phase6fix")
    print("=" * 80)
    rows = cur.execute(
        "SELECT id, task_id, status, remind_at, snooze_count, message, "
        "created_at, updated_at "
        "FROM reminders "
        "WHERE message LIKE '%#phase6fix%' "
        "OR task_id IN (SELECT id FROM tasks WHERE title LIKE '%#phase6fix%' OR title LIKE '%测试烛照监督闭环%') "
        "ORDER BY created_at DESC"
    ).fetchall()
    print(f"找到 {len(rows)} 条")
    for row in rows:
        print(f"  id={row['id']}")
        print(f"  task_id={row['task_id']}")
        print(f"  status={row['status']}")
        print(f"  snooze_count={row['snooze_count']}")
        print(f"  remind_at={row['remind_at']}")
        print(f"  message={row['message']}")
        print(f"  created_at={row['created_at']}")
        print(f"  updated_at={row['updated_at']} ({fmt_diff(parse_iso(row['updated_at']))})")
        print()

    # ---------- 3. conversation_messages ----------
    print("=" * 80)
    print("## 3. conversation_messages（#phase6fix 后的所有消息）")
    print("=" * 80)
    # 找 #phase6fix event 创建时间
    event_created = cur.execute(
        "SELECT created_at FROM events WHERE raw_content LIKE '%#phase6fix%' LIMIT 1"
    ).fetchone()
    if event_created:
        since = event_created['created_at']
        rows = cur.execute(
            "SELECT id, conversation_id, role, content, event_id, created_at "
            "FROM conversation_messages WHERE created_at >= ? "
            "ORDER BY created_at ASC",
            (since,)
        ).fetchall()
        print(f"#phase6fix event 创建于 {since}，之后共 {len(rows)} 条消息")
        for row in rows:
            print(f"  [{row['created_at']}] role={row['role']}")
            print(f"    id={row['id']}")
            print(f"    content={row['content']}")
            print()

    # ---------- 4. 重点判断 ----------
    print("=" * 80)
    print("## 4. 重点判断")
    print("=" * 80)

    # task 状态
    task = cur.execute(
        "SELECT status, completed_at, delay_count, updated_at FROM tasks "
        "WHERE title LIKE '%#phase6fix%' ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    if task:
        print(f"✓ task.status: {task['status']} {'✅ 已完成' if task['status'] == 'done' else '❌ 未完成'}")
        print(f"✓ completed_at: {task['completed_at']} {'✅ 有值' if task['completed_at'] else '❌ 无值'}")
        print(f"✓ delay_count: {task['delay_count']} {'✅ 保持 0 未变化' if task['delay_count'] == 0 else '⚠ 已变化'}")

    # reminder 状态
    print()
    reminders = cur.execute(
        "SELECT id, status, updated_at FROM reminders "
        "WHERE message LIKE '%#phase6fix%' ORDER BY updated_at DESC"
    ).fetchall()
    print(f"✓ reminder 状态变化（#phase6fix）:")
    for r in reminders:
        expected = r['status'] in ['resolved', 'cancelled']
        print(f"  id={r['id']} status={r['status']} updated_at={r['updated_at']} "
              f"{'✅ 已关闭（resolved/cancelled）' if expected else '⚠ 未关闭'}")

    # 重复触发检测
    print()
    dup = cur.execute(
        "SELECT COUNT(*) AS n FROM conversation_messages "
        "WHERE content LIKE '%烛照追问%' AND created_at >= "
        "(SELECT created_at FROM events WHERE raw_content LIKE '%#phase6fix%' LIMIT 1)"
    ).fetchone()["n"]
    print(f"✓ #phase6fix 后的 [烛照追问] 消息数: {dup} {'✅ 无重复' if dup == 1 else '❌ 重复触发'}")

    # completed_at 与 reminder.updated_at 对比
    print()
    if task and task['completed_at'] and reminders:
        t_done = parse_iso(task['completed_at'])
        r_upd = parse_iso(reminders[0]['updated_at'])
        print(f"✓ 时间对照:")
        print(f"  task.completed_at = {task['completed_at']}")
        print(f"  reminder.updated_at = {reminders[0]['updated_at']}")
        if t_done and r_upd:
            diff = (r_upd - t_done).total_seconds()
            print(f"  reminder.updated_at - task.completed_at = {diff:+.1f}s（应接近 0，同步关闭）")

    conn.close()
    print()
    print("[diagnose-markdone] done")


if __name__ == "__main__":
    main()
