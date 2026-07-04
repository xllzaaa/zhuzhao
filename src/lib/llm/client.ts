/**
 * OpenAI-Compatible Chat Completion Client
 *
 * 设计目标：
 * - 兼容 OpenAI 官方 API 与任意第三方中转 API（DeepSeek / Moonshot / OpenRouter / 自建反代 等）
 * - 通过 tauri-plugin-http 发起请求，走 Rust 端，绕过 webview CORS 限制
 * - 失败时通过 Result 模式返回错误，绝不抛出未捕获异常导致 App 崩溃
 *
 * 安全约束：
 * - api_key 仅在请求头 Authorization 中传递，不写入日志
 * - 错误信息脱敏：禁止回显 api_key、Authorization 头
 * - 不将请求/响应原文写入日志（可能含敏感内容）
 *
 * 为何不用 webview 原生 fetch：
 * - Tauri 2 webview（WebView2/WKWebView/WebKitGTK）仍遵循浏览器同源策略
 * - 带 Authorization 头的跨域请求触发 OPTIONS preflight，第三方中转 API 常不返回 CORS 头
 * - preflight 失败 → fetch 抛 "Failed to fetch"，连实际请求都没发出
 * - tauri-plugin-http 走 Rust 端 reqwest，无 CORS 限制
 */

import { z } from "zod";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { LlmProviderRow } from "@/types/db";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  /** 覆盖 provider 默认温度，不传则使用 provider.temperature */
  temperature?: number;
  /** 覆盖 provider 默认 max_tokens，不传则使用 provider.max_tokens */
  maxTokens?: number;
  /** 覆盖 provider 默认 model，不传则使用 provider.model */
  model?: string;
}

export interface ChatCompletionResponse {
  content: string;
  role: "assistant";
  finishReason: string;
  /** 原始 usage（可能为 undefined，部分中转 API 不返回） */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** 原始响应（调试用，不含敏感信息） */
  raw: unknown;
}

/**
 * Result 模式：成功携带 data，失败携带 error
 * 调用方必须显式处理两种分支，避免遗漏错误。
 */
export type ChatResult =
  | { ok: true; data: ChatCompletionResponse }
  | { ok: false; error: ChatError };

export interface ChatError {
  /** 机器可读的错误类型，用于 UI 分类展示 */
  kind:
    | "no_api_key"
    | "invalid_base_url"
    | "network"
    | "timeout"
    | "http_error"
    | "parse_error"
    | "empty_content"
    | "unknown";
  /** 用户可读的错误信息（已脱敏，不含 api_key） */
  message: string;
  /** HTTP 状态码（仅 http_error 有） */
  status?: number;
  /** API 返回的 error.message（仅 http_error 有，可能含具体提示） */
  apiMessage?: string;
}

// ---------------------------------------------------------------------------
// Zod 校验 schema
// ---------------------------------------------------------------------------

const usageSchema = z
  .object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  })
  .optional();

const choiceSchema = z.object({
  index: z.number(),
  message: z.object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
  }),
  finish_reason: z.string().nullable().optional(),
});

const chatCompletionResponseSchema = z.object({
  id: z.string().optional(),
  object: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(choiceSchema).min(1),
  usage: usageSchema,
});

// ---------------------------------------------------------------------------
// 辅助：URL 规范化
// ---------------------------------------------------------------------------

/**
 * 根据 base_url 拼接 chat completions endpoint。
 * 规则：
 *  - 去除尾部斜杠
 *  - 若已包含 /v1，仅追加 /chat/completions
 *  - 否则追加 /v1/chat/completions
 *  - 兼容用户填写 https://api.openai.com 或 https://api.openai.com/v1 等情况
 */
export function buildChatCompletionsUrl(baseUrl: string): string {
  let url = baseUrl.trim();
  while (url.endsWith("/")) {
    url = url.slice(0, -1);
  }
  if (url.toLowerCase().endsWith("/v1")) {
    return `${url}/chat/completions`;
  }
  return `${url}/v1/chat/completions`;
}

// ---------------------------------------------------------------------------
// 辅助：错误脱敏
// ---------------------------------------------------------------------------

/**
 * 把任意值转为字符串（用于在 catch 中检测关键词，不脱敏）
 */
function safeString(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return "";
  }
}

/**
 * 从未知错误中提取 message，并执行脱敏：
 * - 删除任何形如 sk-xxx 的 token 片段
 * - 删除 Bearer 前缀
 */
function sanitizeMessage(raw: unknown): string {
  let msg: string = safeString(raw);
  // 删除常见的 api_key 痕迹
  msg = msg.replace(/sk-[A-Za-z0-9-_]+/g, "sk-***");
  msg = msg.replace(/[Bb]earer\s+[A-Za-z0-9-_.]+/g, "Bearer ***");
  return msg;
}

// ---------------------------------------------------------------------------
// 主函数：chatCompletion
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 调用 OpenAI-compatible chat completion API。
 *
 * @param provider 来自 llm_providers 表的配置行（含 api_key）
 * @param request  请求参数
 * @returns ChatResult：调用方必须显式处理 ok 与 error
 */
export async function chatCompletion(
  provider: LlmProviderRow,
  request: ChatCompletionRequest,
  options: { timeoutMs?: number } = {},
): Promise<ChatResult> {
  // 1. 参数校验
  if (!provider.api_key) {
    return {
      ok: false,
      error: {
        kind: "no_api_key",
        message: `Provider "${provider.name}" 未配置 api_key，请到 Settings 填写。`,
      },
    };
  }

  let endpoint: string;
  try {
    endpoint = buildChatCompletionsUrl(provider.base_url);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "invalid_base_url",
        message: `base_url 解析失败：${sanitizeMessage(err)}`,
      },
    };
  }

  const model = request.model ?? provider.model;
  const temperature =
    request.temperature ?? provider.temperature ?? 0.3;
  const maxTokens = request.maxTokens ?? provider.max_tokens ?? 1024;

  const body = {
    model,
    messages: request.messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };

  // 2. 发起请求（带超时）
  // 使用 tauri-plugin-http 的 fetch（走 Rust 端 reqwest，绕过 webview CORS）
  // 同时用 AbortController + connectTimeout 双重保险实现超时
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await tauriFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      // plugin-http 特有：连接超时（ms），与 signal 互补
      connectTimeout: timeoutMs,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    // 区分超时 vs 网络错误
    if (
      (err instanceof DOMException && err.name === "AbortError") ||
      /abort/i.test(safeString(err))
    ) {
      return {
        ok: false,
        error: {
          kind: "timeout",
          message: `请求超时（${timeoutMs}ms），请检查网络或 base_url 是否可达。`,
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: "network",
        message: `网络错误：${sanitizeMessage(err)}`,
      },
    };
  }
  clearTimeout(timer);

  // 3. 处理非 2xx 响应
  if (!response.ok) {
    let apiMessage: string | undefined;
    let rawBody: string | undefined;
    try {
      rawBody = await response.text();
      // 尝试解析 OpenAI 标准 error 结构：{ error: { message, type, code } }
      const parsed = JSON.parse(rawBody) as { error?: { message?: string } };
      if (parsed?.error?.message) {
        apiMessage = sanitizeMessage(parsed.error.message);
      } else {
        apiMessage = sanitizeMessage(rawBody.slice(0, 500));
      }
    } catch {
      // JSON 解析失败，使用 statusText
      apiMessage = response.statusText || undefined;
    }
    return {
      ok: false,
      error: {
        kind: "http_error",
        status: response.status,
        message: `HTTP ${response.status} ${response.statusText}`,
        apiMessage,
      },
    };
  }

  // 4. 解析响应 JSON
  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "parse_error",
        message: `响应非 JSON：${sanitizeMessage(err)}`,
      },
    };
  }

  // 5. Zod 校验
  const parsed = chatCompletionResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: "parse_error",
        message: `响应结构不符合 OpenAI 规范：${parsed.error.message.slice(0, 300)}`,
      },
    };
  }

  const choice = parsed.data.choices[0];
  const content = choice.message.content;
  if (content === null || content.length === 0) {
    return {
      ok: false,
      error: {
        kind: "empty_content",
        message: `模型返回空内容（finish_reason=${choice.finish_reason ?? "unknown"}）。`,
      },
    };
  }

  return {
    ok: true,
    data: {
      content,
      role: "assistant",
      finishReason: choice.finish_reason ?? "stop",
      usage: parsed.data.usage
        ? {
            promptTokens: parsed.data.usage.prompt_tokens,
            completionTokens: parsed.data.usage.completion_tokens,
            totalTokens: parsed.data.usage.total_tokens,
          }
        : undefined,
      raw: parsed.data,
    },
  };
}
