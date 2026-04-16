import { env } from "../config.js";

export type SiliconFlowToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type SiliconFlowToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type SiliconFlowChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: SiliconFlowToolCall[];
};

export type SiliconFlowChatCompletionInput = {
  messages: SiliconFlowChatMessage[];
  tools?: SiliconFlowToolDefinition[];
  temperature?: number;
  maxTokens?: number;
};

export type SiliconFlowChatCompletionResult = {
  id: string | null;
  model: string;
  text: string;
  message: SiliconFlowChatMessage;
  toolCalls: SiliconFlowToolCall[];
  finishReason: string | null;
  usage?: Record<string, unknown>;
  raw: unknown;
};

export type SiliconFlowClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
};

function normalizeContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    if (typeof record.text === "string" && record.text.trim().length > 0) {
      parts.push(record.text.trim());
      continue;
    }

    if (typeof record.content === "string" && record.content.trim().length > 0) {
      parts.push(record.content.trim());
    }
  }

  return parts.join("\n").trim();
}

function normalizeToolCalls(raw: unknown): SiliconFlowToolCall[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const calls: SiliconFlowToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const fn = record.function;
    if (!fn || typeof fn !== "object") {
      continue;
    }

    const fnRecord = fn as Record<string, unknown>;
    if (typeof fnRecord.name !== "string" || typeof fnRecord.arguments !== "string") {
      continue;
    }

    calls.push({
      id: typeof record.id === "string" ? record.id : `tool_${calls.length + 1}`,
      type: "function",
      function: {
        name: fnRecord.name,
        arguments: fnRecord.arguments,
      },
    });
  }

  return calls;
}

export class SiliconFlowClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: SiliconFlowClientConfig = {}) {
    this.apiKey = config.apiKey ?? env.siliconFlowApiKey;
    this.baseUrl = (config.baseUrl ?? env.siliconFlowBaseUrl).replace(/\/+$/, "");
    this.model = config.model ?? env.siliconFlowModel;
    this.timeoutMs = config.timeoutMs ?? env.GATEWAY_TIMEOUT_MS;
  }

  async createChatCompletion(
    input: SiliconFlowChatCompletionInput
  ): Promise<SiliconFlowChatCompletionResult> {
    if (!this.apiKey) {
      throw new Error("SILICONFLOW_API_KEY is not configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, this.timeoutMs));

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: input.messages,
          tools: input.tools,
          tool_choice: input.tools?.length ? "auto" : undefined,
          temperature: input.temperature ?? 0.2,
          max_tokens: input.maxTokens ?? 2048,
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let parsed: Record<string, unknown> = {};
      if (rawText.length > 0) {
        try {
          parsed = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          const snippet = rawText.slice(0, 400);
          throw new Error(
            `SiliconFlow returned a non-JSON response (status=${response.status}, model=${this.model}): ${snippet}`
          );
        }
      }

      if (!response.ok) {
        const message =
          typeof parsed.message === "string"
            ? parsed.message
            : rawText.slice(0, 400) || `SiliconFlow request failed with ${response.status}`;
        throw new Error(message);
      }

      const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
      const firstChoice = choices[0];
      if (!firstChoice || typeof firstChoice !== "object") {
        throw new Error("SiliconFlow response missing choices[0]");
      }

      const choiceRecord = firstChoice as Record<string, unknown>;
      const rawMessage = choiceRecord.message;
      if (!rawMessage || typeof rawMessage !== "object") {
        throw new Error("SiliconFlow response missing message");
      }

      const messageRecord = rawMessage as Record<string, unknown>;
      const toolCalls = normalizeToolCalls(messageRecord.tool_calls);
      const text = normalizeContent(messageRecord.content);

      const message: SiliconFlowChatMessage = {
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      };

      return {
        id: typeof parsed.id === "string" ? parsed.id : null,
        model: typeof parsed.model === "string" ? parsed.model : this.model,
        text,
        message,
        toolCalls,
        finishReason: typeof choiceRecord.finish_reason === "string" ? choiceRecord.finish_reason : null,
        usage:
          parsed.usage && typeof parsed.usage === "object"
            ? parsed.usage as Record<string, unknown>
            : undefined,
        raw: parsed,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`SiliconFlow request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createSiliconFlowClient(config: SiliconFlowClientConfig = {}): SiliconFlowClient {
  return new SiliconFlowClient(config);
}
