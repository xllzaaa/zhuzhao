"""Phase 7 验收 - 重复生成测试只读查询"""
import sqlite3, os, json
from datetime import datetime, timezone

DB = r"file:C:\Users\11012\AppData\Roaming\com.zhuzhao.desktop\zhuzhao.db?mode=ro"
if not os.path.exists(DB.split("file:")[1].split("?")[0]):
    print("DB not found"); exit(1)

print(f"[now] 本地: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"[now] UTC:  {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')}")
print()

c = sqlite3.connect(DB, uri=True)
c.row_factory = sqlite3.Row
cur = c.cursor()

# ========== 1. 重复记录检查 ==========
print("="*80)
print("## 1. 重复记录检查（review_date='2026-07-05' AND review_type='daily'）")
print("="*80)
cnt = cur.execute(
    "SELECT COUNT(*) AS n FROM reviews WHERE review_date = '2026-07-05' AND review_type = 'daily'"
).fetchone()["n"]
print(f"记录数量: {cnt}")
if cnt == 1:
    print(f"  ✅ 同一天 daily summary 仍然只有 1 条")
elif cnt == 0:
    print(f"  ❌ 今日无 daily summary")
else:
    print(f"  ⚠ 重复记录: {cnt} 条")

# ========== 2. 记录详情 ==========
print()
print("="*80)
print("## 2. 记录详情")
print("="*80)
r = cur.execute(
    "SELECT id, review_date, review_type, raw_content, sections, source_event_ids, created_at "
    "FROM reviews WHERE review_date = '2026-07-05' AND review_type = 'daily' LIMIT 1"
).fetchone()
if not r:
    print("未找到记录")
else:
    expected_id = "01kwr6e8hm02z77gje4z8g2saj"
    print(f"  id: {r['id']}")
    print(f"    id 是否保持不变: {'✅ 是' if r['id'] == expected_id else '❌ 已变化（原: ' + expected_id + '）'}")
    print(f"  review_date: {r['review_date']}")
    print(f"  review_type: {r['review_type']}")
    print(f"  created_at: {r['created_at']}")
    rc = r['raw_content']
    print(f"  raw_content (len={len(rc)}):")
    print(f"    {rc[:800]}{'...' if len(rc) > 800 else ''}")
    sec = r['sections']
    if sec:
        try:
            sec_obj = json.loads(sec)
            print(f"  sections (parsed):")
            print(f"    wins: {sec_obj.get('wins', [])}")
            print(f"    delays: {sec_obj.get('delays', [])}")
            print(f"    topNext: {sec_obj.get('topNext', '')}")
            print(f"    improvement: {sec_obj.get('improvement', '')}")
            has_all = all(k in sec_obj for k in ['wins','delays','topNext','improvement'])
            print(f"  {'✅' if has_all else '⚠'} sections 字段完整（wins/delays/topNext/improvement）")
        except Exception as e:
            print(f"  ⚠ sections JSON 解析失败: {e}")
            print(f"  sections (raw): {sec[:300]}")
    else:
        print(f"  sections: (NULL)")
    sei = r['source_event_ids']
    if sei:
        try:
            sei_arr = json.loads(sei)
            print(f"  source_event_ids (count={len(sei_arr)}): {sei_arr[:5]}")
            print(f"  ✅ source_event_ids 有关联来源")
        except Exception as e:
            print(f"  ⚠ source_event_ids JSON 解析失败: {e}")
            print(f"  source_event_ids (raw): {sei[:300]}")
    else:
        print(f"  source_event_ids: (NULL)")

# ========== 3. 与上次对比 ==========
print()
print("="*80)
print("## 3. 与上次生成对比（验证 raw_content / sections 已更新）")
print("="*80)
# 上次记录（从对话历史）：
prev_rc = "今天在 Phase 7 测试和总结逻辑上确实有实际产出，技术手感不错。但三个重要任务（周报、任务书、数据库迁移设计）全部搁置，其中数据库迁移已延期 3 次，再拖下去会卡住后续开发。技术推进值得肯定，但维持任务纪律才能让进度真正落地。明天请直接用「先攻克最烂的钉子」策略，别让轻松的技术探索变成逃避积压任务的借口。"
if r:
    curr_rc = r['raw_content']
    if curr_rc == prev_rc:
        print(f"  ⚠ raw_content 与上次完全相同（可能未重新生成）")
    else:
        print(f"  ✅ raw_content 已更新（与上次不同）")
        print(f"    上次前 80 字: {prev_rc[:80]}...")
        print(f"    本次前 80 字: {curr_rc[:80]}...")

# ========== 4. 所有 reviews（看是否有历史版本残留） ==========
print()
print("="*80)
print("## 4. 所有 daily summary（检查是否有历史版本残留）")
print("="*80)
rows = cur.execute(
    "SELECT id, review_date, created_at, length(raw_content) AS rc_len "
    "FROM reviews WHERE review_type = 'daily' ORDER BY review_date DESC, created_at DESC"
).fetchall()
print(f"全部 daily summary 记录数: {len(rows)}")
for r in rows:
    print(f"  [{r['review_date']}] id={r['id']} | created_at={r['created_at']} | raw_content len={r['rc_len']}")

c.close()
print("\n[done]")
