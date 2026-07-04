/**
 * LLM Provider Repository
 * 详见 openspec/specs/zhuzhao-core/spec.md §4.3 llm_providers 表
 *
 * 安全约束：
 * - api_key 仅本地存储，不上传
 * - 查询时返回完整字段（含 api_key），但 UI 层负责脱敏显示
 * - 严禁将 api_key 写入日志
 */

import type { LlmProviderRow } from "@/types/db";
import { query, execute } from "./base";
import { ulid, nowIso } from "@/lib/id";

export interface CreateProviderInput {
  name: string;
  provider_type: string; // 'openai' | 'anthropic' | 'custom' | ...
  base_url: string;
  api_key?: string | null;
  model: string;
  temperature?: number;
  max_tokens?: number;
  is_active?: boolean;
}

export async function createProvider(
  input: CreateProviderInput,
): Promise<LlmProviderRow> {
  const id = ulid();
  const now = nowIso();
  // 若新建时标记为 active，先取消其他 active
  if (input.is_active) {
    await deactivateAll();
  }
  await execute(
    `INSERT INTO llm_providers (
      id, name, provider_type, base_url, api_key, model,
      temperature, max_tokens, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.provider_type,
      input.base_url,
      input.api_key ?? null,
      input.model,
      input.temperature ?? 0.3,
      input.max_tokens ?? 1024,
      input.is_active ? 1 : 0,
      now,
      now,
    ],
  );
  return getById(id) as Promise<LlmProviderRow>;
}

export async function getById(id: string): Promise<LlmProviderRow | null> {
  const rows = await query<LlmProviderRow>(
    "SELECT * FROM llm_providers WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function listAll(): Promise<LlmProviderRow[]> {
  return query<LlmProviderRow>(
    "SELECT * FROM llm_providers ORDER BY created_at ASC",
  );
}

/** 获取当前激活的 provider（is_active=1）。若无则返回 null */
export async function getActive(): Promise<LlmProviderRow | null> {
  const rows = await query<LlmProviderRow>(
    "SELECT * FROM llm_providers WHERE is_active = 1 LIMIT 1",
  );
  return rows[0] ?? null;
}

export interface UpdateProviderInput {
  name?: string;
  provider_type?: string;
  base_url?: string;
  /** 传 undefined 表示不修改；传 null 表示清空 */
  api_key?: string | null;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  is_active?: boolean;
}

export async function updateProvider(
  id: string,
  patch: UpdateProviderInput,
): Promise<LlmProviderRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); params.push(patch.name); }
  if (patch.provider_type !== undefined) { sets.push("provider_type = ?"); params.push(patch.provider_type); }
  if (patch.base_url !== undefined) { sets.push("base_url = ?"); params.push(patch.base_url); }
  if (patch.api_key !== undefined) { sets.push("api_key = ?"); params.push(patch.api_key); }
  if (patch.model !== undefined) { sets.push("model = ?"); params.push(patch.model); }
  if (patch.temperature !== undefined) { sets.push("temperature = ?"); params.push(patch.temperature); }
  if (patch.max_tokens !== undefined) { sets.push("max_tokens = ?"); params.push(patch.max_tokens); }
  if (patch.is_active !== undefined) {
    sets.push("is_active = ?");
    params.push(patch.is_active ? 1 : 0);
    if (patch.is_active) {
      // 设为 active 前先取消其他
      await deactivateAll(id);
    }
  }

  if (sets.length === 0) return getById(id);
  sets.push("updated_at = ?");
  params.push(nowIso());
  params.push(id);

  await execute(`UPDATE llm_providers SET ${sets.join(", ")} WHERE id = ?`, params);
  return getById(id);
}

export async function deleteProvider(id: string): Promise<void> {
  await execute("DELETE FROM llm_providers WHERE id = ?", [id]);
}

/** 将所有 provider 的 is_active 置 0，可选排除某个 id */
async function deactivateAll(exceptId?: string): Promise<void> {
  if (exceptId) {
    await execute(
      "UPDATE llm_providers SET is_active = 0, updated_at = ? WHERE id != ?",
      [nowIso(), exceptId],
    );
  } else {
    await execute("UPDATE llm_providers SET is_active = 0, updated_at = ?", [
      nowIso(),
    ]);
  }
}
