"""Phase 7 验收 - 只读查询当前状态"""
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

# 今天日期
today = datetime.now().strftime("%Y-%m-%d")
print(f"[today] {today}")
print()

# ========== 1. journal_entries 今天 ==========
print("="*80)
print("## 1. journal_entries (今天)")
print("="*80)
rows = cur.execute(
    "SELECT id, entry_date, raw_content, ai_summary, mood, tags, source_event_id, created_at "
    "FROM journal_entries WHERE entry_date = ? ORDER BY created_at ASC",
    (today,)
).fetchall()
print(f"找到 {len(rows)} 条")
for r in rows:
    print(f"  id={r['id']}")
    print(f"  entry_date={r['entry_date']}")
    print(f"  mood={r['mood']}")
    print(f"  source_event_id={r['source_event_id']}")
    print(f"  created_at={r['created_at']}")
    print(f"  tags={r['tags']}")
    raw = r['raw_content']
    print(f"  raw_content (len={len(raw)}): {raw[:300]}{'...' if len(raw) > 300 else ''}")
    ai = r['ai_summary']
    print(f"  ai_summary: {ai if ai else '(NULL)'}")
    print()

# ========== 2. 所有 journal_entries ==========
print("="*80)
print("## 2. journal_entries (全部，按 created_at DESC，前 20)")
print("="*80)
rows = cur.execute(
    "SELECT id, entry_date, raw_content, ai_summary, mood, source_event_id, created_at "
    "FROM journal_entries ORDER BY created_at DESC LIMIT 20"
).fetchall()
for r in rows:
    raw = r['raw_content']
    raw_short = raw[:80] + ('...' if len(raw) > 80 else '')
    print(f"  [{r['entry_date']}] {r['created_at']} | mood={r['mood']} | raw({len(raw)})={raw_short}")
    if r['ai_summary']:
        print(f"    ai_summary: {r['ai_summary'][:100]}")

# ========== 3. reviews 表 ==========
print()
print("="*80)
print("## 3. reviews 表（今日 daily summary）")
print("="*80)
rows = cur.execute(
    "SELECT id, review_date, review_type, raw_content, sections, source_event_ids, created_at "
    "FROM reviews WHERE review_type = 'daily' ORDER BY review_date DESC LIMIT 5"
).fetchall()
print(f"找到 {len(rows)} 条 daily summary")
for r in rows:
    print(f"  id={r['id']}")
    print(f"  review_date={r['review_date']}")
    print(f"  review_type={r['review_type']}")
    print(f"  created_at={r['created_at']}")
    rc = r['raw_content']
    print(f"  raw_content (len={len(rc)}): {rc[:400]}{'...' if len(rc) > 400 else ''}")
    sec = r['sections']
    print(f"  sections: {sec if sec else '(NULL)'}")
    sei = r['source_event_ids']
    print(f"  source_event_ids: {sei if sei else '(NULL)'}")
    print()

# ========== 4. llm_providers ==========
print("="*80)
print("## 4. llm_providers（仅显示非敏感字段，不显示 api_key）")
print("="*80)
rows = cur.execute(
    "SELECT id, name, provider_type, base_url, model, temperature, max_tokens, is_active, created_at "
    "FROM llm_providers ORDER BY created_at ASC"
).fetchall()
for r in rows:
    print(f"  id={r['id']}")
    print(f"  name={r['name']}")
    print(f"  provider_type={r['provider_type']}")
    print(f"  base_url={r['base_url']}")
    print(f"  model={r['model']}")
    print(f"  temperature={r['temperature']} max_tokens={r['max_tokens']}")
    print(f"  is_active={r['is_active']}")
    print()

c.close()
print("[done]")
