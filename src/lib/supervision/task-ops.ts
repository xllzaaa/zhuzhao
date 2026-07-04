/**
 * 任务操作（Task Operations）
 *
 * Phase 6 4 个核心操作的实现（用户要求 §10）：
 *   1. markDone(taskId, completionNote?)      - 完成任务
 *   2. delayTask(taskId, newDueAt, reason?)   - 延期任务（INV-6: delay_count+1）
 *   3. snoozeReminder(reminderId, newRemindAt) - 稍后提醒
 *   4. activateTask(taskId, dueAt, scheduledAt?) - 激活任务（inbox → scheduled）
 *
 * 不变量：
 * - INV-6: delay_count 单调递增，不可重置（task-repo.applyDelay 用 SQL 表达式 delay_count+1）
 * - markDone 不删除 task，只更新 status='done' 和 completed_at（用户要求 §21）
 * - snoozeReminder 不删除 reminder，只更新 status（用户要求 §22）
 *
 * 设计：
 * - 每个 op 返回 Result 模式：{ ok, ... } | { ok: false, error }
 * - 操作失败时不破坏现有数据
 * - 不抛异常给调用方
 */

import type { TaskRow, ReminderRow } from "@/types/db";
import type { TaskStatus } from "@/types/enums";
import {
  markDone as repoMarkDone,
  applyDelay,
  activateTask as repoActivateTask,
  getById as getTaskById,
} from "@/lib/repositories/task-repo";
import {
  resolveByTask,
  createReminder,
  snooze as repoSnooze,
  getById as getReminderById,
  listActiveByTaskId,
} from "@/lib/repositories/reminder-repo";
import { nowIso } from "@/lib/id";

// ---------------------------------------------------------------------------
// 通用 Result 类型
// ---------------------------------------------------------------------------

export type TaskOpResult<T = TaskRow> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// 1. markDone：完成任务
// ---------------------------------------------------------------------------

export interface MarkDoneInput {
  /** 完成备注（可选） */
  completionNote?: string | null;
}

/**
 * 标记任务完成
 *
 * 副作用：
 * - task.status='done', task.completion_note=?, task.completed_at=now
 * - 该任务所有 pending/fired reminder → status='resolved'
 *
 * 不变量：
 * - 不删除 task（用户要求 §21）
 * - 不删除 reminder（用户要求 §22）
 * - 不重置 delay_count（INV-6，保留历史延期记录）
 *
 * @param taskId 任务 id
 * @param input 可选参数
 */
export async function markDone(
  taskId: string,
  input: MarkDoneInput = {},
): Promise<TaskOpResult<TaskRow>> {
  try {
    const task = await getTaskById(taskId);
    if (!task) {
      return { ok: false, error: `任务不存在：${taskId}` };
    }
    if (task.status === "done") {
      return { ok: false, error: `任务已完成，不能重复标记完成。` };
    }
    if (task.status === "dropped") {
      return { ok: false, error: `任务已归档（dropped），不能标记完成。` };
    }

    const updated = await repoMarkDone(taskId, input.completionNote ?? null);
    if (!updated) {
      return { ok: false, error: `更新任务状态失败` };
    }

    // 关闭所有 active reminder（pending / fired → resolved）
    try {
      await resolveByTask(taskId, "resolved");
    } catch (err) {
      // 非致命：task 已标记完成，reminder 关闭失败不阻塞
      // 但需要返回警告让 UI 提示
      console.warn(
        `[task-ops] markDone: resolveByTask 失败（非致命）:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    return { ok: true, data: updated };
  } catch (err) {
    return {
      ok: false,
      error: `markDone 异常：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. delayTask：延期任务
// ---------------------------------------------------------------------------

export interface DelayTaskInput {
  /** 新的 due_at（必填，本地时间 ISO 字符串） */
  newDueAt: string;
  /** 延期原因（可选，UI 暂未输入时可为空） */
  reason?: string | null;
  /**
   * 新状态（用户要求 §11：可以变为 delayed 或 active）
   * - 默认 'delayed'：保持延期状态
   * - 'scheduled'：让任务立即重新激活（task-supervision spec 用 scheduled 表示"已激活"）
   *
   * 注意：task-supervision spec §2.1 的 TaskStatus 枚举没有 "active"，
   * "active" 是 UI 层的状态分组（详见 task-repo.ts statusToGroup）。
   * 这里只接受 delayed / scheduled。
   */
  newStatus?: TaskStatus;
  /**
   * 新 reminder 的 remind_at
   * - 默认等于 newDueAt
   * - 调用方可传更早时间（如 due_at 前 1 小时）
   */
  newReminderAt?: string;
}

/**
 * 延期任务
 *
 * 副作用：
 * - task.due_at=newDueAt, task.delay_count+1, task.failure_reason=reason, task.status=newStatus
 * - 该任务所有 pending/fired reminder → status='cancelled'
 * - 创建新 reminder：remind_at=newReminderAt ?? newDueAt, status='pending', task_id=taskId
 *
 * 不变量：
 * - INV-6: delay_count 单调递增（SQL 表达式 delay_count+1，绝不重置）
 *
 * @param taskId 任务 id
 * @param input 延期参数
 */
export async function delayTask(
  taskId: string,
  input: DelayTaskInput,
): Promise<TaskOpResult<{ task: TaskRow; reminder: ReminderRow | null }>> {
  try {
    const task = await getTaskById(taskId);
    if (!task) {
      return { ok: false, error: `任务不存在：${taskId}` };
    }
    if (task.status === "done") {
      return { ok: false, error: `任务已完成，不能延期。` };
    }
    if (task.status === "dropped") {
      return { ok: false, error: `任务已归档（dropped），不能延期。` };
    }

    const newStatus: TaskStatus = input.newStatus ?? "delayed";
    if (newStatus !== "delayed" && newStatus !== "scheduled") {
      return {
        ok: false,
        error: `delayTask 不支持的新状态：${newStatus}（仅允许 delayed / scheduled）`,
      };
    }

    // 1. 更新 task（delay_count+1）
    const updated = await applyDelay(
      taskId,
      input.newDueAt,
      input.reason ?? null,
      newStatus,
    );
    if (!updated) {
      return { ok: false, error: `更新任务状态失败` };
    }

    // 2. 取消旧 reminder（pending / fired → cancelled）
    try {
      await resolveByTask(taskId, "cancelled");
    } catch (err) {
      console.warn(
        `[task-ops] delayTask: resolveByTask(cancelled) 失败（非致命）:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    // 3. 创建新 reminder
    const remindAt = input.newReminderAt ?? input.newDueAt;
    let newReminder: ReminderRow | null = null;
    try {
      newReminder = await createReminder({
        task_id: taskId,
        event_id: null,
        remind_at: remindAt,
        reminder_type: "task_due",
        status: "pending",
        message: task.title,
      });
    } catch (err) {
      // 非致命：task 已延期，reminder 没创建不影响核心状态
      console.warn(
        `[task-ops] delayTask: createReminder 失败（非致命）:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    return { ok: true, data: { task: updated, reminder: newReminder } };
  } catch (err) {
    return {
      ok: false,
      error: `delayTask 异常：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 3. snoozeReminder：稍后提醒
// ---------------------------------------------------------------------------

/**
 * 稍后提醒
 *
 * 副作用：
 * - 旧 reminder.status='snoozed', snooze_count+1, remind_at=newRemindAt（保留原行）
 * - 不创建新 reminder（用户要求 §8：稍后提醒时创建新的 reminder 或更新 remind_at，但必须有明确记录）
 *
 * 选择"更新 remind_at"而非"创建新 reminder + 老 reminder snoozed"：
 * - 单条 reminder 维护更简单，避免堆积
 * - snooze_count 单调递增，记录用户稍后次数
 * - 若用户要求"必须创建新 reminder"，可改用 createReminder
 *
 * @param reminderId reminder id
 * @param newRemindAt 新的 remind_at（ISO 字符串）
 */
export async function snoozeReminder(
  reminderId: string,
  newRemindAt: string,
): Promise<TaskOpResult<ReminderRow>> {
  try {
    const reminder = await getReminderById(reminderId);
    if (!reminder) {
      return { ok: false, error: `reminder 不存在：${reminderId}` };
    }
    if (reminder.status === "resolved" || reminder.status === "cancelled") {
      return {
        ok: false,
        error: `reminder 已 ${reminder.status}，不能再稍后。`,
      };
    }

    await repoSnooze(reminderId, newRemindAt);
    const updated = await getReminderById(reminderId);
    if (!updated) {
      return { ok: false, error: `snooze 后查询 reminder 失败` };
    }

    return { ok: true, data: updated };
  } catch (err) {
    return {
      ok: false,
      error: `snoozeReminder 异常：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 4. activateTask：激活任务
// ---------------------------------------------------------------------------

export interface ActivateTaskInput {
  /** due_at（必填，激活后任务才有 reminder） */
  dueAt: string;
  /** scheduled_at（可选，默认等于 due_at） */
  scheduledAt?: string | null;
}

/**
 * 激活任务（inbox → scheduled）
 *
 * 副作用：
 * - task.status='scheduled', task.due_at=dueAt, task.scheduledAt=scheduledAt ?? dueAt
 * - 如果该任务没有 pending reminder，自动创建一条（remind_at=dueAt）
 *
 * 不变量：
 * - 不重置 delay_count（INV-6，重新排期时 delay_count 保持不变，task-supervision spec §2.3）
 *
 * @param taskId 任务 id
 * @param input 激活参数
 */
export async function activateTask(
  taskId: string,
  input: ActivateTaskInput,
): Promise<TaskOpResult<TaskRow>> {
  try {
    const task = await getTaskById(taskId);
    if (!task) {
      return { ok: false, error: `任务不存在：${taskId}` };
    }
    if (task.status === "done") {
      return { ok: false, error: `任务已完成，不能激活。` };
    }
    if (task.status === "dropped") {
      return { ok: false, error: `任务已归档（dropped），不能激活。` };
    }

    const updated = await repoActivateTask(
      taskId,
      input.dueAt,
      input.scheduledAt ?? input.dueAt,
    );
    if (!updated) {
      return { ok: false, error: `更新任务状态失败` };
    }

    // 检查是否需要创建 reminder
    const activeReminders = await listActiveByTaskId(taskId);
    if (activeReminders.length === 0) {
      try {
        await createReminder({
          task_id: taskId,
          event_id: null,
          remind_at: input.dueAt,
          reminder_type: "task_due",
          status: "pending",
          message: task.title,
        });
      } catch (err) {
        // 非致命：task 已激活，reminder 创建失败不影响核心状态
        console.warn(
          `[task-ops] activateTask: createReminder 失败（非致命）:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    return { ok: true, data: updated };
  } catch (err) {
    return {
      ok: false,
      error: `activateTask 异常：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 辅助：批量扫描时使用
// ---------------------------------------------------------------------------

/**
 * 触发 reminder：scheduler 用，把 reminder.status 从 pending 改为 fired
 * 同时把关联 task.status 改为 doing
 *
 * 注意：此函数不创建 Chat Sidebar 消息（由 scheduler 主流程负责）
 *
 * @returns 关联的 task（用于 scheduler 生成追问文案）
 */
export async function fireReminder(
  reminderId: string,
): Promise<TaskOpResult<{ reminder: ReminderRow; task: TaskRow | null }>> {
  try {
    const reminder = await getReminderById(reminderId);
    if (!reminder) {
      return { ok: false, error: `reminder 不存在：${reminderId}` };
    }
    if (reminder.status !== "pending") {
      // 防御：避免重复触发
      return {
        ok: false,
        error: `reminder 状态为 ${reminder.status}，不能触发（仅 pending 可触发）`,
      };
    }

    // 1. reminder → fired
    const { updateStatus } = await import("@/lib/repositories/reminder-repo");
    const updated = await updateStatus(reminderId, "fired");
    if (!updated) {
      return { ok: false, error: `更新 reminder.status 失败` };
    }

    // 2. task → doing（如果有关联 task 且非 done/dropped）
    let task: TaskRow | null = null;
    if (reminder.task_id) {
      task = await getTaskById(reminder.task_id);
      if (task && task.status !== "done" && task.status !== "dropped") {
        try {
          const { updateTask } = await import("@/lib/repositories/task-repo");
          task = await updateTask(task.id, { status: "doing" });
        } catch (err) {
          // 非致命：reminder 已触发，task 状态没改不影响提醒
          console.warn(
            `[task-ops] fireReminder: 更新 task.status 失败（非致命）:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }

    return { ok: true, data: { reminder: updated, task } };
  } catch (err) {
    return {
      ok: false,
      error: `fireReminder 异常：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 辅助：startup recovery 用
// ---------------------------------------------------------------------------

/**
 * 标记任务为「需要复核」（startup-recovery 用）
 *
 * Phase 6 验收反馈修订：
 * - 不再自动 delay_count+1（INV-6 由 delayTask 显式触发）
 * - 不再自动改 task.status='delayed'
 * - 改为：task.status='review_needed'，reminder 保持 'fired'
 *
 * 副作用：
 * - task.status='review_needed'（保留 delay_count 不变）
 * - reminder.status 保持 'fired'（让用户在 UI 看到已触发但未处理）
 *
 * 用户在 Tasks 页看到 review_needed 任务后，可以：
 * - markDone（完成任务）
 * - delayTask（这才 delay_count+1）
 * - snoozeReminder（稍后提醒）
 * - activateTask（重新激活）
 *
 * @returns Result（包含更新后的 task 或错误信息）
 */
export async function markTaskNeedsReview(
  reminderId: string,
): Promise<TaskOpResult<TaskRow | null>> {
  try {
    const reminder = await getReminderById(reminderId);
    if (!reminder) {
      return { ok: false, error: `reminder 不存在：${reminderId}` };
    }
    if (reminder.status !== "fired") {
      return {
        ok: false,
        error: `reminder 状态为 ${reminder.status}，仅 fired 状态可标记 review_needed`,
      };
    }

    // reminder 保持 'fired'（不动），让用户在 UI 看到已触发但未处理
    // 只更新 task.status='review_needed'（如有关联 task）
    if (!reminder.task_id) {
      return { ok: true, data: null };
    }

    const task = await getTaskById(reminder.task_id);
    if (!task) {
      return { ok: true, data: null };
    }
    if (task.status === "done" || task.status === "dropped") {
      // 任务已完成/归档，跳过标记
      return { ok: true, data: task };
    }

    // 标记为 review_needed（不动 delay_count，不动 failure_reason）
    const { updateTask } = await import("@/lib/repositories/task-repo");
    const updatedTask = await updateTask(task.id, { status: "review_needed" });

    return { ok: true, data: updatedTask };
  } catch (err) {
    return {
      ok: false,
      error: `markTaskNeedsReview 异常：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * @deprecated 保留兼容：startup-recovery 不再调用此函数
 * 旧版自动延期逻辑（已被 markTaskNeedsReview 替代）
 *
 * 保留此函数仅为兼容性，不再被任何地方调用
 */
export async function autoDelayForUnrepliedReminder(
  reminderId: string,
): Promise<TaskOpResult<TaskRow | null>> {
  try {
    const reminder = await getReminderById(reminderId);
    if (!reminder) {
      return { ok: false, error: `reminder 不存在：${reminderId}` };
    }
    if (reminder.status !== "fired") {
      return {
        ok: false,
        error: `reminder 状态为 ${reminder.status}，仅 fired 状态可自动延期`,
      };
    }

    // 1. reminder → resolved
    const { updateStatus } = await import("@/lib/repositories/reminder-repo");
    await updateStatus(reminderId, "resolved");

    // 2. task 自动延期（如有关联）
    if (!reminder.task_id) {
      return { ok: true, data: null };
    }

    const task = await getTaskById(reminder.task_id);
    if (!task) {
      return { ok: true, data: null };
    }
    if (task.status === "done" || task.status === "dropped") {
      return { ok: true, data: task };
    }

    const now = nowIso();
    const updatedTask = await applyDelay(
      task.id,
      task.due_at ?? now,
      "用户未回复",
      "delayed",
    );

    return { ok: true, data: updatedTask };
  } catch (err) {
    return {
      ok: false,
      error: `autoDelayForUnrepliedReminder 异常：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
