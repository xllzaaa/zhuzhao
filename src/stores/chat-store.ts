/**
 * Chat Store
 * 管理当前会话 + 消息列表 + 发送动作
 *
 * Phase 3：仅本地存储，不调用 LLM
 * - sendMessage 同时创建 Event + ConversationMessage
 * - assistant 暂不自动回复
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
   * Phase 5 起：触发 LLM Intake
   */
  sendMessage: (content: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentConversation: null,
  messages: [],
  conversations: [],
  loading: false,
  error: null,

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
      // 2. 创建 ConversationMessage（关联 event_id）
      const message = await createMessage({
        conversation_id: conv.id,
        role: "user",
        content: trimmed,
        event_id: event.id,
      });
      // 3. 更新本地状态
      set((s) => ({ messages: [...s.messages, message] }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
    }
  },
}));
