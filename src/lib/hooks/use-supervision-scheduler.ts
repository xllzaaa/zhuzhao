/**
 * useSupervisionScheduler
 *
 * React hook：App 启动时启动监督 scheduler
 *
 * 流程：
 *   1. dbReady 后等待初始化完成
 *   2. 调用 runStartupRecovery：扫描遗留 fired reminder → 自动延期
 *   3. 启动 ReminderScheduler 单例（60s 轮询）
 *   4. scheduler 触发 reminder 时通过 onTrigger 回调通知 ChatStore
 *
 * 用户要求：
 * - §3：App 启动后启动一个本地 scheduler，只在 App 运行期间生效
 * - §7：如果当前有 Chat Sidebar，可以生成一条 assistant message 作为监督提醒
 *
 * 注意：
 * - scheduler 单例：多次调用本 hook 不会创建多个 scheduler
 * - 组件卸载时停止 scheduler（仅 App 顶层调用一次，永远不卸载）
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getScheduler,
  destroyScheduler,
  type TriggeredReminderEvent,
} from "@/lib/supervision/scheduler";
import { runStartupRecovery } from "@/lib/supervision/startup-recovery";
import { useChatStore } from "@/stores/chat-store";
import { getAssistantMessageById } from "@/lib/intake/executor";

interface UseSupervisionSchedulerOptions {
  /** 是否就绪（DB 已加载） */
  ready: boolean;
}

/**
 * 启动 supervision scheduler
 *
 * 在 App.tsx 顶层调用一次：
 * ```tsx
 * useSupervisionScheduler({ ready: dbReady });
 * ```
 */
export function useSupervisionScheduler(
  options: UseSupervisionSchedulerOptions,
): void {
  const { ready } = options;

  // 用 ref 持有最新的 chat-store 实例（避免 scheduler 闭包过期）
  // scheduler 是单例，其 onTrigger 回调在第一次创建时绑定
  // 如果 chat-store 状态变化，回调仍能读取最新值（zustand 的 get() 永远读最新）
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ready || startedRef.current) return;
    startedRef.current = true;

    let schedulerStarted = false;

    const start = async () => {
      // 1. 启动恢复：扫描遗留 fired reminder（标记为 review_needed，不再自动延期）
    try {
      const result = await runStartupRecovery();
      if (result.marked > 0) {
        console.info(
          `[supervision] startup recovery: 标记 ${result.marked} 条任务为 review_needed`,
        );
      }
    } catch (err) {
      console.warn(
        "[supervision] runStartupRecovery 失败：",
        err instanceof Error ? err.message : String(err),
      );
    }

      // 2. 启动 scheduler
      try {
        const scheduler = getScheduler({
          intervalMs: 60_000,
          maxBatchSize: 10,
          onTrigger: (event: TriggeredReminderEvent) => {
            handleReminderTriggered(event);
          },
          getActiveConversation: () => {
            // 通过 zustand 的 getState() 读取最新状态（不订阅，避免 re-render）
            return useChatStore.getState().currentConversation;
          },
        });
        scheduler.start();
        schedulerStarted = true;
      } catch (err) {
        console.warn(
          "[supervision] scheduler 启动失败：",
          err instanceof Error ? err.message : String(err),
        );
      }
    };

    void start();

    // 清理：App 卸载时停止 scheduler
    return () => {
      if (schedulerStarted) {
        destroyScheduler();
      }
      startedRef.current = false;
    };
  }, [ready]);
}

// ---------------------------------------------------------------------------
// reminder 触发后：把生成的追问消息追加到 chat-store
// ---------------------------------------------------------------------------

async function handleReminderTriggered(
  event: TriggeredReminderEvent,
): Promise<void> {
  // Phase 6 验收反馈：即使会话不匹配也要让用户感知到提醒
  if (!event.assistantMessageId) {
    // scheduler 未写入 conversation_messages（无任何会话可用）
    // 通过 toast 通知用户
    toast.info("烛照监督提醒", {
      description: event.task
        ? `任务「${event.task.title}」到期了，请到 Tasks 页处理`
        : "有提醒到期，请到 Tasks 页处理",
    });
    return;
  }

  try {
    const msg = await getAssistantMessageById(event.assistantMessageId);
    if (!msg) return;

    // 通过 zustand 的 getState() + setState 直接更新（不订阅，避免循环依赖）
    const state = useChatStore.getState();
    if (
      state.currentConversation &&
      msg.conversation_id === state.currentConversation.id
    ) {
      // 当前会话匹配：追加到 chat-store，ChatSidebar 会立即显示
      useChatStore.setState((s) => ({
        messages: [...s.messages, msg],
      }));
    } else {
      // 会话不匹配：scheduler 把消息写入了别的会话
      // 通过 toast 通知用户切换会话查看
      toast.info("烛照监督提醒", {
        description: event.task
          ? `任务「${event.task.title}」到期了，追问消息已写入会话，请切换会话查看`
          : "有提醒到期，追问消息已写入会话，请切换会话查看",
      });
    }
  } catch (err) {
    console.warn(
      "[supervision] handleReminderTriggered 失败：",
      err instanceof Error ? err.message : String(err),
    );
  }
}
