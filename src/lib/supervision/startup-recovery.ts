/**
 * Startup Recovery
 *
 * App 启动时扫描遗留的 fired reminder，标记任务为「需要复核」。
 *
 * 用户要求（Phase 6 验收反馈修订）：
 * - App 启动时如果发现 missed/fired reminder，不要直接 delay_count+1
 * - 先标记为 needs_review，等待用户确认
 * - task.status='review_needed'，reminder.status 保持 'fired'
 * - delay_count 不变
 * - 不创建新 reminder
 *
 * 触发条件：
 * - reminder.status='fired' AND remind_at < today_start（00:00 本地）
 * - 即：到点已触发但用户从未回复（已经过了一个自然日）
 *
 * 不变量：
 * - INV-6: delay_count 单调递增（本函数不再触碰 delay_count）
 * - 不删除任何数据（仅状态更新）
 * - 不创建新 reminder（用户重新激活任务时才创建，由 task-ops.activateTask 处理）
 *
 * 安全：
 * - 失败不阻塞 App 启动
 * - 单条失败不影响其他 reminder
 */

import type { ReminderRow, TaskRow } from "@/types/db";
import { listFiredBefore } from "@/lib/repositories/reminder-repo";
import { markTaskNeedsReview } from "@/lib/supervision/task-ops";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface StartupRecoveryResult {
  /** 扫描到的遗留 fired reminder 数量 */
  scanned: number;
  /** 标记为 review_needed 成功的数量 */
  marked: number;
  /** 标记失败的数量 */
  failed: number;
  /** 已处理 reminder 列表（用于 UI 通知） */
  processed: Array<{
    reminder: ReminderRow;
    task: TaskRow | null;
    success: boolean;
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 执行启动恢复
 *
 * 流程：
 *   1. 计算今日 00:00（本地时区）的 ISO 字符串
 *   2. 查询 reminders WHERE status='fired' AND remind_at < today_start
 *   3. 对每条调用 markTaskNeedsReview：
 *      - task.status='review_needed'（保留 delay_count 不变）
 *      - reminder.status 保持 'fired'（让用户在 UI 看到已触发但未处理）
 *
 * @param beforeIso 可选：自定义截止时间，默认为今日 00:00 本地时间
 */
export async function runStartupRecovery(
  beforeIso?: string,
): Promise<StartupRecoveryResult> {
  const cutoff = beforeIso ?? todayStartIso();
  const processed: StartupRecoveryResult["processed"] = [];

  let reminders: ReminderRow[];
  try {
    reminders = await listFiredBefore(cutoff);
  } catch (err) {
    console.warn(
      "[startup-recovery] listFiredBefore 失败：",
      err instanceof Error ? err.message : String(err),
    );
    return {
      scanned: 0,
      marked: 0,
      failed: 0,
      processed: [],
    };
  }

  let marked = 0;
  let failed = 0;

  for (const reminder of reminders) {
    const result = await markTaskNeedsReview(reminder.id);
    if (result.ok) {
      marked++;
      processed.push({
        reminder,
        task: result.data,
        success: true,
      });
    } else {
      failed++;
      processed.push({
        reminder,
        task: null,
        success: false,
        error: result.error,
      });
      console.warn(
        `[startup-recovery] reminder ${reminder.id} 标记 review_needed 失败：${result.error}`,
      );
    }
  }

  if (marked > 0) {
    console.info(
      `[startup-recovery] 标记 ${marked} 条任务为 review_needed（用户未回复 reminder）`,
    );
  }

  return {
    scanned: reminders.length,
    marked,
    failed,
    processed,
  };
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/**
 * 今日 00:00（本地时区）的 ISO 字符串
 *
 * 用于"次日 App 启动"判断：
 * - remind_at < 今日 00:00 → 已经过了一整天
 * - remind_at >= 今日 00:00 → 今日触发，等待用户回复
 */
function todayStartIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  // 本地 00:00 转为 ISO（UTC）
  const localMidnight = new Date(`${y}-${m}-${day}T00:00:00`);
  return localMidnight.toISOString();
}
