/**
 * Reminder Scheduler
 *
 * Phase 6 任务监督闭环核心调度器：
 * - App 运行期间定时扫描 pending reminder
 * - 到点的 reminder 触发后：status='fired' + task='doing' + 生成追问消息
 * - 通过 onTrigger 回调通知 UI（ChatSidebar 追加 assistant 消息）
 *
 * 用户要求：
 * - §3：App 启动后启动一个本地 scheduler，只在 App 运行期间生效
 * - §4：scheduler 定期扫描 status='pending' AND remind_at <= now
 * - §5：不要做系统级后台常驻，不要做 OS 通知。本阶段只做 App 内提醒
 * - §7：Reminder 到点后创建一条 App 内提醒记录或更新 reminder.status；
 *        如果当前有 Chat Sidebar，可以生成一条 assistant message 作为监督提醒
 * - §8：Reminder 不要重复无限触发：每条 reminder 到点后只能触发一次；
 *        触发后 status 从 pending 改成 fired
 *
 * 状态机（task-supervision spec §3.2）：
 * pending → fired → resolved（用户完成）
 *              → snoozed（用户稍后）→ pending（重新算 remind_at）
 *              → cancelled（任务 dropped）
 *
 * 实现策略：
 * - 60s setInterval 轮询
 * - 单次扫描最多触发 10 条（避免雪崩）
 * - 触发后通过回调通知 UI
 * - 不抛异常给调用方
 */

import type {
  ReminderRow,
  TaskRow,
  ConversationRow,
} from "@/types/db";
import { listPendingDue } from "@/lib/repositories/reminder-repo";
import { fireReminder } from "@/lib/supervision/task-ops";
import {
  getTemplateSupervisorReply,
  buildFollowUpMessage,
} from "@/lib/supervision/supervisor";
import { execute } from "@/lib/repositories/base";
import { ulid, nowIso } from "@/lib/id";
import { listConversations } from "@/lib/repositories/conversation-repo";
import { logWarn, logInfo, logError } from "@/lib/repositories/log-repo";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface TriggeredReminderEvent {
  /** 触发的 reminder */
  reminder: ReminderRow;
  /** 关联任务（用于回调中决定 UI 行为） */
  task: TaskRow | null;
  /** 生成的追问消息内容（已格式化） */
  message: string;
  /** 写入 conversation_messages 后的消息 id（若未写入则为 null） */
  assistantMessageId: string | null;
  /** 监督语气（用于 UI 区分样式） */
  replyMode: "ack" | "coach" | "challenge" | "harsh";
}

export interface SchedulerOptions {
  /** 轮询间隔，默认 60_000ms = 60s */
  intervalMs?: number;
  /** 单次扫描最多触发条数（避免雪崩），默认 10 */
  maxBatchSize?: number;
  /** reminder 触发后回调（用于 UI 更新，例如 ChatSidebar 追加消息） */
  onTrigger?: (event: TriggeredReminderEvent) => void;
  /**
   * 获取当前会话（用于写入 assistant message）
   * 如果返回 null，则不写入 conversation_messages（仅更新 reminder/task 状态）
   */
  getActiveConversation?: () => ConversationRow | null;
}

// ---------------------------------------------------------------------------
// Scheduler 类
// ---------------------------------------------------------------------------

export class ReminderScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly options: Required<SchedulerOptions>;
  private running = false;

  constructor(options: SchedulerOptions = {}) {
    this.options = {
      intervalMs: options.intervalMs ?? 60_000,
      maxBatchSize: options.maxBatchSize ?? 10,
      onTrigger: options.onTrigger ?? (() => {}),
      getActiveConversation: options.getActiveConversation ?? (() => null),
    };
  }

  /**
   * 启动 scheduler
   * - 立即执行一次扫描（处理 App 启动期间可能到期的 reminder）
   * - 然后按 intervalMs 定期扫描
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    // 立即扫描一次
    this.scan().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[scheduler] 初始扫描失败：", msg);
      void logWarn("reminder", `scheduler 初始扫描失败：${msg}`);
    });
    // 定期扫描
    this.timer = setInterval(() => {
      this.scan().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[scheduler] 定时扫描失败：", msg);
        void logWarn("reminder", `scheduler 定时扫描失败：${msg}`);
      });
    }, this.options.intervalMs);
  }

  /** 停止 scheduler（App 退出时调用） */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  /** 是否运行中 */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 手动触发一次扫描（测试用，或 UI 强制刷新后调用）
   */
  async scanOnce(): Promise<{ triggered: number; failed: number }> {
    return this.scan();
  }

  // -------------------------------------------------------------------------
  // 内部：单次扫描
  // -------------------------------------------------------------------------

  private async scan(): Promise<{ triggered: number; failed: number }> {
    let triggered = 0;
    let failed = 0;

    let pending: ReminderRow[];
    try {
      pending = await listPendingDue();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[scheduler] listPendingDue 失败：", msg);
      void logError("reminder", `listPendingDue 失败：${msg}`);
      return { triggered: 0, failed: 0 };
    }

    if (pending.length === 0) {
      return { triggered: 0, failed: 0 };
    }

    // 限制单次扫描条数（避免雪崩）
    const batch = pending.slice(0, this.options.maxBatchSize);

    for (const reminder of batch) {
      try {
        const event = await this.triggerReminder(reminder);
        if (event) {
          triggered++;
          this.options.onTrigger(event);
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[scheduler] trigger reminder ${reminder.id} 失败：`, msg);
        void logError("reminder", `trigger reminder 失败：${msg}`, {
          reminder_id: reminder.id,
        });
      }
    }

    if (triggered > 0) {
      console.info(`[scheduler] 触发 ${triggered} 条 reminder`);
      void logInfo("reminder", `scheduler 触发 ${triggered} 条 reminder`);
    }

    return { triggered, failed };
  }

  // -------------------------------------------------------------------------
  // 内部：触发单条 reminder
  // -------------------------------------------------------------------------

  private async triggerReminder(
    reminder: ReminderRow,
  ): Promise<TriggeredReminderEvent | null> {
    // 1. 标记 reminder=fired + task=doing
    const fireResult = await fireReminder(reminder.id);
    if (!fireResult.ok) {
      console.warn(
        `[scheduler] fireReminder 失败：${fireResult.error}`,
      );
      return null;
    }

    const { reminder: firedReminder, task } = fireResult.data;

    // 2. 生成追问文案
    let message: string;
    let replyMode: "ack" | "coach" | "challenge" | "harsh";

    if (task) {
      const reply = getTemplateSupervisorReply(task);
      message = buildFollowUpMessage(task, reply);
      replyMode = reply.reply_mode as "ack" | "coach" | "challenge" | "harsh";
    } else {
      // 无关联 task，使用 reminder.message 或默认文案
      const fallbackText = reminder.message ?? "提醒时间到了。";
      message = `[烛照追问] ${fallbackText}`;
      replyMode = "ack";
    }

    // 3. 写入 conversation_messages
    // Phase 6 验收反馈：必须产生用户可见提醒
    // - 优先用当前会话；若无当前会话，fallback 到最近会话
    // - 确保 reminder 触发后用户在 ChatSidebar 能看到追问消息
    let assistantMessageId: string | null = null;
    let conversation = this.options.getActiveConversation();
    if (!conversation) {
      // fallback：拿最近的会话（用户可能切换到别的页面，但会话仍存在）
      try {
        const recent = await listConversations(1);
        if (recent.length > 0) {
          conversation = recent[0];
        }
      } catch (err) {
        console.warn(
          `[scheduler] listConversations fallback 失败（非致命）：`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    if (conversation) {
      try {
        assistantMessageId = await this.insertAssistantMessage(
          conversation.id,
          message,
        );
      } catch (err) {
        console.warn(
          `[scheduler] insertAssistantMessage 失败（非致命）：`,
          err instanceof Error ? err.message : String(err),
        );
      }
    } else {
      // 即使没有会话，也记录日志（onTrigger 回调可让 UI 通过 toast 通知）
      console.warn(
        `[scheduler] 无可用会话，追问消息未写入 conversation_messages（reminder.id=${firedReminder.id}）`,
      );
    }

    return {
      reminder: firedReminder,
      task,
      message,
      assistantMessageId,
      replyMode,
    };
  }

  // -------------------------------------------------------------------------
  // 内部：写入 assistant message
  // -------------------------------------------------------------------------

  private async insertAssistantMessage(
    conversationId: string,
    content: string,
  ): Promise<string> {
    const msgId = ulid();
    const createdAt = nowIso();
    await execute(
      `INSERT INTO conversation_messages (
        id, conversation_id, role, content, created_at, event_id, save_to_memory, topic_id, project_id
      ) VALUES (?, ?, 'assistant', ?, ?, NULL, 0, NULL, NULL)`,
      [msgId, conversationId, content, createdAt],
    );
    // 更新 conversation.updated_at
    await execute(
      "UPDATE conversations SET updated_at = ? WHERE id = ?",
      [createdAt, conversationId],
    );
    return msgId;
  }
}

// ---------------------------------------------------------------------------
// 单例（App 全局只启动一个 scheduler）
// ---------------------------------------------------------------------------

let schedulerInstance: ReminderScheduler | null = null;

/**
 * 获取/创建全局 scheduler 单例
 *
 * 多次调用会复用同一实例；如果 options 变化，需要先 stop 再重新 create
 */
export function getScheduler(options?: SchedulerOptions): ReminderScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new ReminderScheduler(options);
  }
  return schedulerInstance;
}

/** 停止并销毁全局 scheduler（仅 App 退出时调用） */
export function destroyScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}
