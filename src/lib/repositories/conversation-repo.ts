/**
 * Conversation Repository
 * 详见 openspec/specs/journal-memory/spec.md §4
 */

import type { ConversationRow, ConversationMessageRow } from "@/types/db";
import type { MessageRole } from "@/types/enums";
import { query, execute } from "./base";
import { ulid, nowIso } from "@/lib/id";

export async function createConversation(
  title: string | null = null,
): Promise<ConversationRow> {
  const id = ulid();
  const now = nowIso();
  await execute(
    "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, title, now, now],
  );
  return getConversationById(id) as Promise<ConversationRow>;
}

export async function getConversationById(
  id: string,
): Promise<ConversationRow | null> {
  const rows = await query<ConversationRow>(
    "SELECT * FROM conversations WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function listConversations(
  limit = 20,
): Promise<ConversationRow[]> {
  return query<ConversationRow>(
    "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?",
    [limit],
  );
}

export interface CreateMessageInput {
  conversation_id: string;
  role: MessageRole;
  content: string;
  event_id?: string | null;
  save_to_memory?: boolean;
  topic_id?: string | null;
  project_id?: string | null;
}

export async function createMessage(
  input: CreateMessageInput,
): Promise<ConversationMessageRow> {
  const id = ulid();
  const created_at = nowIso();
  await execute(
    `INSERT INTO conversation_messages (
      id, conversation_id, role, content, created_at, event_id, save_to_memory, topic_id, project_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.conversation_id,
      input.role,
      input.content,
      created_at,
      input.event_id ?? null,
      input.save_to_memory ? 1 : 0,
      input.topic_id ?? null,
      input.project_id ?? null,
    ],
  );
  // 同时更新 conversation.updated_at
  await execute(
    "UPDATE conversations SET updated_at = ? WHERE id = ?",
    [created_at, input.conversation_id],
  );
  return getMessageById(id) as Promise<ConversationMessageRow>;
}

export async function getMessageById(
  id: string,
): Promise<ConversationMessageRow | null> {
  const rows = await query<ConversationMessageRow>(
    "SELECT * FROM conversation_messages WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function listMessages(
  conversationId: string,
  limit = 100,
): Promise<ConversationMessageRow[]> {
  return query<ConversationMessageRow>(
    "SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?",
    [conversationId, limit],
  );
}
