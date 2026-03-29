/**
 * Configurable LLM client — supports any OpenAI-compatible endpoint
 * (LM Studio, Ollama, OpenAI, OpenRouter, etc.)
 */

export interface LLMConfig {
  endpoint: string;       // e.g. "http://localhost:11434/v1"
  model: string;          // e.g. "qwen/qwen3.5-9b"
  apiKey: string;         // "" for local, "sk-..." for OpenAI
  maxTokens: number;      // max output tokens per response
  contextLength: number;  // total model context window (input + output)
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const CONFIG_KEY = "frontier-ops-llm-config";

// Use the Vite proxy path in dev, but a real endpoint in production.
// Users should configure their endpoint in Mission Control settings.
const DEFAULT_CONFIG: LLMConfig = {
  endpoint: import.meta.env.DEV ? "/llm-proxy/v1" : "http://localhost:11434/v1",
  model: "qwen/qwen3.5-9b",
  apiKey: "",
  maxTokens: 2048,
  contextLength: 8192,
};

export function loadLLMConfig(): LLMConfig {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_CONFIG;
}

export function saveLLMConfig(config: LLMConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export interface LLMStreamCallbacks {
  onToken: (token: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onDone: (fullMessage: ChatMessage) => void;
  onError: (error: string) => void;
}

/**
 * Send a chat completion request.
 * Returns the full response (non-streaming for tool calls, streaming for text).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  callbacks: LLMStreamCallbacks,
  config?: LLMConfig,
): Promise<void> {
  const cfg = config ?? loadLLMConfig();
  const url = `${cfg.endpoint.replace(/\/$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) {
    headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: messages.map(m => {
      const msg: Record<string, unknown> = { role: m.role, content: m.content };
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.name) msg.name = m.name;
      return msg;
    }),
    max_tokens: cfg.maxTokens,
    stream: true,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      callbacks.onError(`LLM API error ${res.status}: ${errText.slice(0, 200)}`);
      return;
    }

    // Handle streaming response
    const reader = res.body?.getReader();
    if (!reader) {
      callbacks.onError("No response body");
      return;
    }

    const decoder = new TextDecoder();
    let fullContent = "";
    const toolCalls: Map<number, ToolCall> = new Map();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          // Text content
          if (delta.content) {
            fullContent += delta.content;
            callbacks.onToken(delta.content);
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls.has(idx)) {
                toolCalls.set(idx, {
                  id: tc.id ?? `call_${idx}`,
                  type: "function",
                  function: { name: "", arguments: "" },
                });
              }
              const existing = toolCalls.get(idx)!;
              if (tc.function?.name) existing.function.name += tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            }
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    // Build final message
    const finalMsg: ChatMessage = {
      role: "assistant",
      content: fullContent,
    };

    if (toolCalls.size > 0) {
      finalMsg.tool_calls = Array.from(toolCalls.values());
      for (const tc of finalMsg.tool_calls) {
        callbacks.onToolCall(tc);
      }
    }

    callbacks.onDone(finalMsg);
  } catch (err) {
    callbacks.onError(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Rough token estimate — good enough for display and trim decisions. */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += (m.content ?? "").length;
    if (m.tool_calls) chars += JSON.stringify(m.tool_calls).length;
  }
  return Math.ceil(chars / 3.5);
}

/**
 * Trim chat history to stay under maxTokens.
 * Always preserves the system prompt (index 0) and the most recent messages.
 * Removes complete exchanges (user → assistant → tool results) from the oldest end.
 */
export function trimHistory(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  if (estimateTokens(messages) <= maxTokens) return messages;

  const system = messages[0]?.role === "system" ? [messages[0]] : [];
  const rest = messages.slice(system.length);

  // Find safe cut points: indices where a new user message starts a fresh exchange
  let trimmed = [...rest];
  while (estimateTokens([...system, ...trimmed]) > maxTokens && trimmed.length > 2) {
    // Find next user message after index 0 to cut from the front
    const nextUser = trimmed.findIndex((m, i) => i > 0 && m.role === "user");
    if (nextUser === -1) break;
    trimmed = trimmed.slice(nextUser);
  }

  return [...system, ...trimmed];
}

export interface ModelInfo {
  id: string;
  displayName?: string;
  params?: string;
  contextLength?: number;
  loadedContextLength?: number;
  loaded: boolean;
  toolUse: boolean;
}

/**
 * Quick test to verify the LLM endpoint is reachable.
 * Tries LM Studio's rich /api/v1/models first, falls back to OpenAI /v1/models.
 */
export async function testConnection(config: LLMConfig): Promise<{
  ok: boolean;
  error?: string;
  models?: string[];
  modelDetails?: ModelInfo[];
}> {
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

    const base = config.endpoint.replace(/\/v1\/?$/, "").replace(/\/$/, "");

    // Try LM Studio rich endpoint first
    try {
      const lmsRes = await fetch(`${base}/api/v1/models`, { headers });
      if (lmsRes.ok) {
        const lmsData = await lmsRes.json();
        const lmsModels = (lmsData.models ?? []) as Array<Record<string, unknown>>;
        const details: ModelInfo[] = lmsModels
          .filter((m) => m.type === "llm")
          .map((m) => {
            const loadedInst = (m.loaded_instances as Array<Record<string, unknown>>) ?? [];
            const loaded = loadedInst.length > 0;
            const loadedCtx = loaded
              ? (loadedInst[0]?.config as Record<string, unknown>)?.context_length as number | undefined
              : undefined;
            return {
              id: m.key as string,
              displayName: m.display_name as string | undefined,
              params: m.params_string as string | undefined,
              contextLength: m.max_context_length as number | undefined,
              loadedContextLength: loadedCtx,
              loaded,
              toolUse: (m.capabilities as Record<string, unknown>)?.trained_for_tool_use === true,
            };
          });

        return {
          ok: true,
          models: details.map((d) => d.id),
          modelDetails: details,
        };
      }
    } catch {
      // LM Studio endpoint not available, fall through
    }

    // Fall back to OpenAI-compatible /v1/models
    const res = await fetch(`${config.endpoint.replace(/\/$/, "")}/models`, { headers });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const data = await res.json();
    const models = (data.data ?? []).map((m: { id: string }) => m.id);
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}
