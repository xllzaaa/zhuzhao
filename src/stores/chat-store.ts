/**
 * Chat Store
 * 管理当前会话 + 消息列表 + 发送动作
 *
 * Phase 5：sendMessage 落 Event 后异步触发 LLM Intake
 * - 用户消息立即显示（不阻塞输入）
 * - assistant 回复由 Intake 异步生成，完成后追加到 messages
 */

import { create } from "zustand";
import type { ConversationRow, ConversationMessageRow } from "@/types/db";
import {
  createConversation,
  createMessage,
  listConversations,
  listMessages,
} from "@/lib/repositories/conversation-repo";
import { createEvent } from "@/lib/repositories/event-repo";
import { runIntake } from "@/lib/intake/run-intake";
import { getAssistantMessageById } from "@/lib/intake/executor";

interface ChatState {
  /** 当前会话 */
  currentConversation: ConversationRow | null;
  /** 当前会话消息列表（按时间升序） */
  messages: ConversationMessageRow[];
  /** 最近会话列表 */
  conversations: ConversationRow[];
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** Intake 是否进行中（用于 UI 显示「思考中...」） */
  intakePending: boolean;

  /** 初始化：加载最近会话列表 */
  init: () => Promise<void>;
  /** 切换当前会话 */
  selectConversation: (id: string) => Promise<void>;
  /** 新建会话 */
  newConversation: (title?: string | null) => Promise<void>;
  /**
   * 发送用户消息
   * - 创建 Event(source='chat', raw_content=content)
   * - 创建 ConversationMessage(role='user', event_id=event.id)
   * - 异步触发 LLM Intake
   *   - 成功且 should_reply=true 时：assistant 消息由 Intake 落地，再追加到 messages
   *   - 失败：UI 显示脱敏错误
   */
  sendMessage: (content: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentConversation: null,
  messages: [],
  conversations: [],
  loading: false,
  error: null,
  intakePending: false,

  init: async () => {
    try {
      set({ loading: true, error: null });
      const conversations = await listConversations(20);
      // 若有历史会话，自动选中最近一条
      if (conversations.length > 0) {
        const latest = conversations[0];
        const messages = await listMessages(latest.id, 200);
        set({
          conversations,
          currentConversation: latest,
          messages,
          loading: false,
        });
      } else {
        // 无历史则创建一个默认会话
        const conv = await createConversation(null);
        set({
          conversations: [conv],
          currentConversation: conv,
          messages: [],
          loading: false,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  selectConversation: async (id: string) => {
    try {
      set({ loading: true, error: null });
      const messages = await listMessages(id, 200);
      const conv = get().conversations.find((c) => c.id === id) ?? null;
      set({ currentConversation: conv, messages, loading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  newConversation: async (title: string | null = null) => {
    try {
      set({ loading: true, error: null });
      const conv = await createConversation(title);
      set((state) => ({
        conversations: [conv, ...state.conversations],
        currentConversation: conv,
        messages: [],
        loading: false,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loading: false, error: msg });
    }
  },

  sendMessage: async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const state = get();
    let conv = state.currentConversation;
    if (!conv) {
      // 兜底：若没有当前会话则新建一个
      conv = await createConversation(null);
      set((s) => ({
        conversations: [conv!, ...s.conversations],
        currentConversation: conv,
      }));
    }

    try {
      set({ error: null });
      // 1. 创建 Event（所有输入必须落库为 Event）
      const event = await createEvent({
        source: "chat",
        raw_content: trimmed,
        event_type: "user_input",
      });
      // 2. 创建 ConversationMessage（role='user'，关联 event_id）
      const message = await createMessage({
        conversation_id: conv.id,
        role: "user",
        content: trimmed,
        event_id: event.id,
      });
      // 3. 立即追加到本地状态（用户消息立即可见，不阻塞输入）
      set((s) => ({
        messages: [...s.messages, message],
        intakePending: true,
      }));

      // 4. 异步触发 LLM Intake（不 await，让 UI 立即返回）
      //    注意：runIntake 内部已 try/catch 兜底，永不抛异常
      runIntake(event, conv)
        .then((result) => {
          // 优先用 Intake 成功生成的 assistant 消息
          const successMsgId = result.success
            ? result.execution?.assistantMessageId ?? null
            : null;
          // 失败时用 fallback assistant 消息（「这条已记录，但暂时没有完成 AI 解析。」）
          const fallbackMsgId = !result.success
            ? result.fallbackAssistantMessageId
            : null;
          const targetMsgId = successMsgId ?? fallbackMsgId;

          if (targetMsgId) {
            getAssistantMessageById(targetMsgId)
              .then((msg) => {
                if (msg) {
                  set((s) => ({
                    messages: [...s.messages, msg],
                    intakePending: false,
                  }));
                } else {
                  set({ intakePending: false });
                }
              })
              .catch(() => {
                set({ intakePending: false });
              });
          } else {
            // Intake 未生成回复（silent 或失败且非 Chat 来源），只清 pending 状态
            set({ intakePending: false });
            // 失败时把简短描述写入 error（不阻塞 UI）
            if (!result.success && result.summary) {
              set({ error: result.summary });
            }
          }
        })
        .catch(() => {
          // 兜底：runIntake 内部应永不抛异常
          set({ intakePending: false });
        });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, intakePending: false });
    }
  },
}));
