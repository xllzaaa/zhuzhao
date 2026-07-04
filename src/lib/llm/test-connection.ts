/**
 * 测试 LLM Provider 连接
 *
 * 设计目标：
 * - 使用当前 active provider 发送一个最小测试请求
 * - 返回成功/失败状态（Result 模式）
 * - 失败时给出清晰、脱敏的错误信息
 * - 不依赖 LLM Intake，不处理用户输入内容
 * - 调用方 App 绝不因测试失败而崩溃
 */

import type { LlmProviderRow } from "@/types/db";
import { getActive } from "@/lib/repositories/llm-provider-repo";
import { chatCompletion, type ChatResult } from "./client";

export interface TestConnectionSuccess {
  ok: true;
  provider: { id: string; name: string; model: string };
  reply: string;
  finishReason: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface TestConnectionFailure {
  ok: false;
  /** 当前用于测试的 provider（用于 UI 提示），可能为 null（未配置 active） */
  provider: { id: string; name: string; model: string } | null;
  error:
    | { kind: "no_active_provider"; message: string }
    | { kind: "no_api_key"; message: string }
    | { kind: "invalid_base_url"; message: string }
    | { kind: "network"; message: string }
    | { kind: "timeout"; message: string }
    | { kind: "http_error"; message: string; status?: number; apiMessage?: string }
    | { kind: "parse_error"; message: string }
    | { kind: "empty_content"; message: string }
    | { kind: "unknown"; message: string };
}

export type TestConnectionResult = TestConnectionSuccess | TestConnectionFailure;

/**
 * 测试当前 active provider 是否可用。
 *
 * 发送最小请求：
 *   system: "You are a connection test assistant. Reply with exactly: pong"
 *   user: "ping"
 *
 * max_tokens 限制为 16，避免浪费配额。
 */
export async function testActiveProviderConnection(): Promise<TestConnectionResult> {
  // 1. 取 active provider
  let provider: LlmProviderRow | null;
  try {
    provider = await getActive();
  } catch (err) {
    return {
      ok: false,
      provider: null,
      error: {
        kind: "unknown",
        message: `读取 active provider 失败：${safeMsg(err)}`,
      },
    };
  }

  if (!provider) {
    return {
      ok: false,
      provider: null,
      error: {
        kind: "no_active_provider",
        message: "未配置任何 active provider，请先到 Settings 勾选一个为 active。",
      },
    };
  }

  // 2. 调用 chatCompletion
  let result: ChatResult;
  try {
    result = await chatCompletion(
      provider,
      {
        messages: [
          {
            role: "system",
            content:
              "You are a connection test assistant. Reply with exactly the word: pong",
          },
          { role: "user", content: "ping" },
        ],
        maxTokens: 16,
      },
      { timeoutMs: 20_000 },
    );
  } catch (err) {
    // 兜底：chatCompletion 内部已 try/catch，但再加一层保险，绝不抛
    return {
      ok: false,
      provider: toProviderMeta(provider),
      error: {
        kind: "unknown",
        message: `调用过程发生未预期错误：${safeMsg(err)}`,
      },
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      provider: toProviderMeta(provider),
      error: result.error,
    };
  }

  return {
    ok: true,
    provider: toProviderMeta(provider),
    reply: result.data.content,
    finishReason: result.data.finishReason,
    usage: result.data.usage,
  };
}

/**
 * 测试指定 provider（不依赖 active 状态）。
 * 用于 Settings 页「测试连接」按钮，允许在保存前/未激活的 provider 上测试。
 */
export async function testProviderConnection(
  provider: LlmProviderRow,
): Promise<TestConnectionResult> {
  let result: ChatResult;
  try {
    result = await chatCompletion(
      provider,
      {
        messages: [
          {
            role: "system",
            content:
              "You are a connection test assistant. Reply with exactly the word: pong",
          },
          { role: "user", content: "ping" },
        ],
        maxTokens: 16,
      },
      { timeoutMs: 20_000 },
    );
  } catch (err) {
    return {
      ok: false,
      provider: toProviderMeta(provider),
      error: {
        kind: "unknown",
        message: `调用过程发生未预期错误：${safeMsg(err)}`,
      },
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      provider: toProviderMeta(provider),
      error: result.error,
    };
  }

  return {
    ok: true,
    provider: toProviderMeta(provider),
    reply: result.data.content,
    finishReason: result.data.finishReason,
    usage: result.data.usage,
  };
}

function toProviderMeta(p: LlmProviderRow): {
  id: string;
  name: string;
  model: string;
} {
  return { id: p.id, name: p.name, model: p.model };
}

function safeMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 将 TestConnectionResult 转为 UI 友好的提示文本。
 * 用于 toast / banner 展示。
 */
export function formatTestConnectionResult(
  result: TestConnectionResult,
): { title: string; description: string; variant: "success" | "error" } {
  if (result.ok) {
    const providerName = result.provider.name;
    const usage = result.usage;
    const usageText = usage?.totalTokens
      ? ` · tokens=${usage.totalTokens}`
      : "";
    return {
      title: `连接成功 · ${providerName}`,
      description: `模型 ${result.provider.model} 回复："${result.reply.slice(0, 80)}"${usageText}`,
      variant: "success",
    };
  }

  const err = result.error;
  const providerLabel = result.provider
    ? result.provider.name
    : "（无 active provider）";
  return {
    title: `连接失败 · ${providerLabel}`,
    description: err.message,
    variant: "error",
  };
}
