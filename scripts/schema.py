import sqlite3
DB = r"file:C:\Users\11012\AppData\Roaming\com.zhuzhao.desktop\zhuzhao.db?mode=ro"
c = sqlite3.connect(DB, uri=True)
cur = c.cursor()
print("=== tables ===")
for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall():
    print(r[0])
for t in ["events", "tasks", "reminders", "conversation_messages"]:
    print(f"--- {t} ---")
    for r in cur.execute(f"PRAGMA table_info({t})").fetchall():
        print(f"  {r[1]} ({r[2]})")
c.close()
