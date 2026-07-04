/**
 * Phase 2 验证用种子数据
 *
 * 用途：在空数据库插入示例数据，便于验证 Dashboard 真实数据流。
 * 仅 dev 模式调用，生产环境不入此路径。
 *
 * Phase 9 会移除该脚本，改为「设置 → 开发工具 → 插入示例数据」。
 */

import { createEvent } from "@/lib/repositories/event-repo";
import { createTask, updateTask } from "@/lib/repositories/task-repo";
import { createJournal } from "@/lib/repositories/journal-repo";
import { createIdea } from "@/lib/repositories/idea-repo";
import { createReminder } from "@/lib/repositories/reminder-repo";
import { nowIso } from "@/lib/id";

/**
 * 检查是否已有示例数据，若无则插入。
 * 返回 true 表示已插入新种子。
 */
export async function ensureSeedData(): Promise<boolean> {
  // 简单检查：events 表是否为空
  const { query } = await import("@/lib/repositories/base");
  const existing = await query<{ c: number }>(
    "SELECT COUNT(*) as c FROM events",
  );
  if (existing[0]?.c > 0) return false;

  const today = new Date();
  const todayIsoPrefix = nowIso().slice(0, 10);
  const today18 = `${todayIsoPrefix}T18:00:00.000Z`;
  const today14 = `${todayIsoPrefix}T14:00:00.000Z`;
  const tomorrow = new Date(today.getTime() + 86400_000).toISOString();

  // 1. Event + Task（最重要任务，今日到期）
  const event1 = await createEvent({
    source: "quick_input",
    raw_content: "明天晚上前把烛照的开发任务书整理完",
  });
  await createTask({
    title: "整理烛照开发任务书",
    description: "完成 V0 任务书撰写并提交",
    status: "scheduled",
    priority: "high",
    due_at: today18,
    estimated_minutes: 120,
    source_event_id: event1.id,
  });

  // 2. Event + Task（写周报）
  const event2 = await createEvent({
    source: "chat",
    raw_content: "今天 14:00 写周报",
  });
  await createTask({
    title: "写周报",
    status: "doing",
    priority: "medium",
    due_at: today14,
    source_event_id: event2.id,
  });

  // 3. Event + Journal（摆烂日记）
  const event3 = await createEvent({
    source: "quick_input",
    raw_content: "今天有点摆烂，什么都没推进",
  });
  await createJournal({
    raw_content: "今天有点摆烂，什么都没推进。早上看了 1 小时手机，下午又被会议打断。",
    mood: "frustrated",
    tags: ["拖延", "会议", "手机"],
    source_event_id: event3.id,
  });

  // 4. Event + Idea（飞书机器人）
  const event4 = await createEvent({
    source: "chat",
    raw_content: "想到一个点，烛照可以以后接飞书机器人",
  });
  await createIdea({
    title: "接飞书机器人",
    raw_content: "烛照可以以后接飞书机器人，把任务追问通过飞书推送。",
    status: "inbox",
    tags: ["飞书", "集成"],
    source_event_id: event4.id,
  });

  // 5. 延期任务（delay_count = 2，触发 harsh）
  // 注意：INV-6 不变量 — delay_count 不可通过 createTask 直接设置
  // 这里用 createTask 创建后 updateTask 模拟「已经延期 2 次」
  const event5 = await createEvent({
    source: "quick_input",
    raw_content: "数据库迁移上次又拖了，已经第 2 次了",
  });
  const seedTask = await createTask({
    title: "数据库迁移设计",
    status: "delayed",
    priority: "urgent",
    due_at: today18,
    source_event_id: event5.id,
  });
  await updateTask(seedTask.id, {
    delay_count: 2,
    failure_reason: "用户未回复",
  });

  // 6. 一个待触发 reminder
  await createReminder({
    remind_at: tomorrow,
    reminder_type: "task_due",
    message: "数据库迁移设计到期检查",
  });

  return true;
}
