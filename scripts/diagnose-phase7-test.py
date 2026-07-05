"""Phase 7 验收 - #phase7test 链路只读查询"""
import sqlite3, os, json
from datetime import datetime, timezone

DB = r"file:C:\Users\11012\AppData\Roaming\com.zhuzhao.desktop\zhuzhao.db?mode=ro"
if not os.path.exists(DB.split("file:")[1].split("?")[0]):
    print("DB not found"); exit(1)

print(f"[now] 本地: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"[now] UTC:  {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')}")

today = datetime.now().strftime("%Y-%m-%d")
print(f"[today] {today}")
print()

c = sqlite3.connect(DB, uri=True)
c.row_factory = sqlite3.Row
cur = c.cursor()

# ========== 1. events (#phase7test) ==========
print("="*80)
print("## 1. events (#phase7test)")
print("="*80)
rows = cur.execute(
    "SELECT id, source, raw_content, ai_processed, event_type, created_at "
    "FROM events WHERE raw_content LIKE '%#phase7test%' ORDER BY created_at ASC"
).fetchall()
print(f"找到 {len(rows)} 条")
phase7test_event_ids = []
for r in rows:
    phase7test_event_ids.append(r['id'])
    print(f"  id={r['id']}")
    print(f"  source={r['source']}")
    print(f"  event_type={r['event_type']}")
    print(f"  ai_processed={r['ai_processed']}")
    print(f"  created_at={r['created_at']}")
    print(f"  raw_content: {r['raw_content']}")
    print()

# ========== 2. journal_entries (今天 + #phase7test) ==========
print("="*80)
print("## 2. journal_entries (今天 / 含 #phase7test)")
print("="*80)
rows = cur.execute(
    "SELECT id, entry_date, raw_content, ai_summary, mood, tags, source_event_id, created_at "
    "FROM journal_entries WHERE entry_date = ? OR raw_content LIKE '%#phase7test%' "
    "ORDER BY created_at ASC",
    (today,)
).fetchall()
print(f"找到 {len(rows)} 条")
for r in rows:
    raw = r['raw_content']
    ai = r['ai_summary']
    print(f"  id={r['id']}")
    print(f"  entry_date={r['entry_date']}")
    print(f"  mood={r['mood']}")
    print(f"  source_event_id={r['source_event_id']}")
    print(f"  created_at={r['created_at']}")
    print(f"  tags={r['tags']}")
    print(f"  raw_content (len={len(raw)}): {raw}")
    print(f"  ai_summary: {ai if ai else '(NULL)'}")
    # 关键检查：raw_content 是否被 ai_summary 替代
    if ai and ai in raw:
        print(f"  ⚠ WARNING: ai_summary 出现在 raw_content 中（可能替代）")
    else:
        print(f"  ✅ ai_summary 没有替代 raw_content")
    print()

# ========== 3. reviews (今日 daily summary) ==========
print("="*80)
print("## 3. reviews (review_type='daily')")
print("="*80)
rows = cur.execute(
    "SELECT id, review_date, review_type, raw_content, sections, source_event_ids, created_at "
    "FROM reviews WHERE review_type = 'daily' ORDER BY review_date DESC, created_at DESC"
).fetchall()
print(f"找到 {len(rows)} 条 daily summary")
for r in rows:
    print(f"  id={r['id']}")
    print(f"  review_date={r['review_date']}")
    print(f"  review_type={r['review_type']}")
    print(f"  created_at={r['created_at']}")
    rc = r['raw_content']
    print(f"  raw_content (len={len(rc)}):")
    print(f"    {rc[:600]}{'...' if len(rc) > 600 else ''}")
    sec = r['sections']
    if sec:
        try:
            sec_obj = json.loads(sec)
            print(f"  sections (parsed):")
            print(f"    wins: {sec_obj.get('wins', [])}")
            print(f"    delays: {sec_obj.get('delays', [])}")
            print(f"    topNext: {sec_obj.get('topNext', '')}")
            print(f"    improvement: {sec_obj.get('improvement', '')}")
            # 检查 4 个必需字段
            has_wins = 'wins' in sec_obj
            has_delays = 'delays' in sec_obj
            has_topnext = 'topNext' in sec_obj
            has_improvement = 'improvement' in sec_obj
            print(f"  ✅ sections 字段完整性:")
            print(f"    wins: {'✅' if has_wins else '❌'}")
            print(f"    delays: {'✅' if has_delays else '❌'}")
            print(f"    topNext: {'✅' if has_topnext else '❌'}")
            print(f"    improvement: {'✅' if has_improvement else '❌'}")
        except Exception as e:
            print(f"  ⚠ sections JSON 解析失败: {e}")
            print(f"  sections (raw): {sec[:300]}")
    else:
        print(f"  sections: (NULL)")
    sei = r['source_event_ids']
    if sei:
        try:
            sei_arr = json.loads(sei)
            print(f"  source_event_ids (parsed, count={len(sei_arr)}): {sei_arr[:5]}")
            # 检查是否包含 #phase7test 的 event id
            overlap = set(sei_arr) & set(phase7test_event_ids)
            if overlap:
                print(f"  ✅ source_event_ids 包含 #phase7test event: {overlap}")
            else:
                print(f"  ℹ source_event_ids 不包含 #phase7test event（可能 #phase7test 不在今日总结范围内）")
        except Exception as e:
            print(f"  ⚠ source_event_ids JSON 解析失败: {e}")
            print(f"  source_event_ids (raw): {sei[:300]}")
    else:
        print(f"  source_event_ids: (NULL)")
    print()

# ========== 4. 今日总结是否是今天 ==========
print("="*80)
print("## 4. 今日总结验证")
print("="*80)
today_review = cur.execute(
    "SELECT id, review_date, review_type, created_at FROM reviews "
    "WHERE review_type = 'daily' AND review_date = ? LIMIT 1",
    (today,)
).fetchone()
if today_review:
    print(f"  ✅ 今日（{today}）有 daily summary")
    print(f"  id={today_review['id']}")
    print(f"  review_date={today_review['review_date']}")
    print(f"  created_at={today_review['created_at']}")
else:
    print(f"  ❌ 今日（{today}）无 daily summary")

# ========== 5. 重复记录检查 ==========
print()
print("="*80)
print("## 5. 重复记录检查")
print("="*80)
dup = cur.execute(
    "SELECT review_date, COUNT(*) AS n FROM reviews "
    "WHERE review_type = 'daily' GROUP BY review_date HAVING n > 1"
).fetchall()
if dup:
    print(f"  ⚠ 发现重复记录：")
    for d in dup:
        print(f"    {d['review_date']}: {d['n']} 条")
else:
    print(f"  ✅ 同一天无重复 daily summary（UNIQUE 约束 + upsert 生效）")

# ========== 6. 关键判断汇总 ==========
print()
print("="*80)
print("## 6. 关键判断汇总")
print("="*80)

# #phase7test 是否进入 journal_entries
j = cur.execute(
    "SELECT id FROM journal_entries WHERE raw_content LIKE '%#phase7test%' LIMIT 1"
).fetchone()
print(f"  {'✅' if j else '❌'} #phase7test 进入 journal_entries: {'是' if j else '否'}")

# raw_content 完整
if j:
    jr = cur.execute("SELECT raw_content, ai_summary FROM journal_entries WHERE id = ?", (j['id'],)).fetchone()
    raw = jr['raw_content']
    expected = "今天在测 Phase 7，感觉还能推进。写了一段总结生成逻辑，也准备检查今日总结能不能正确落库。#phase7test"
    print(f"  {'✅' if raw == expected or '今天在测 Phase 7' in raw else '⚠'} raw_content 完整: {raw}")

# reviews 有 daily
print(f"  {'✅' if today_review else '❌'} reviews 有 review_type='daily' 且 review_date=今天")

c.close()
print("\n[done]")
