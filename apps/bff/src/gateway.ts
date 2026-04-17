import { env } from "./config.js";
import { callComposioMultiExecutePayload } from "./composio-service.js";
import { createSiliconFlowClient } from "./providers/siliconflow-client.js";

export class GatewayHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function buildUrl(path: string): string {
  const base = env.OPENCLAW_GATEWAY_BASE_URL.endsWith("/")
    ? env.OPENCLAW_GATEWAY_BASE_URL.slice(0, -1)
    : env.OPENCLAW_GATEWAY_BASE_URL;
  return `${base}${path}`;
}

function gatewayConfigured(): boolean {
  return env.openClawGatewayBearer.length > 0;
}

function wrapDirectToolPayload(payload: unknown): unknown {
  return {
    ok: true,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload),
        },
      ],
    },
  };
}

let siliconFlowClient: ReturnType<typeof createSiliconFlowClient> | null = null;

function getSiliconFlowClient() {
  if (!siliconFlowClient) {
    siliconFlowClient = createSiliconFlowClient();
  }
  return siliconFlowClient;
}

async function requestGateway<T>(
  path: string,
  payload: unknown,
  extraHeaders?: Record<string, string>,
  timeoutMs = env.GATEWAY_TIMEOUT_MS
): Promise<T> {
  const bearer = env.OPENCLAW_GATEWAY_BEARER?.trim();
  if (!bearer) {
    throw new GatewayHttpError(503, "OPENCLAW_GATEWAY_BEARER is required when AGENT_RUNTIME=openclaw", null);
  }

  const controller = new AbortController();
  const effectiveTimeoutMs = Math.max(1, timeoutMs);
  const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  try {
    const response = await fetch(buildUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    const body = text.length > 0 ? safeJsonParse(text) : null;

    if (!response.ok) {
      const message =
        typeof body === "object" && body && "message" in body
          ? String((body as { message: unknown }).message)
          : `Gateway request failed with status ${response.status}`;
      throw new GatewayHttpError(response.status, message, body ?? { message: text });
    }

    return (body as T) ?? ({} as T);
  } catch (error) {
    if (error instanceof GatewayHttpError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new GatewayHttpError(504, `Gateway request timed out after ${effectiveTimeoutMs}ms`, null);
    }

    throw new GatewayHttpError(
      502,
      error instanceof Error ? error.message : "Gateway request failed",
      null
    );
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export type InvokeToolInput = {
  tool: string;
  args?: Record<string, unknown>;
  action?: string;
  sessionKey?: string;
};

export async function invokeTool(input: InvokeToolInput): Promise<unknown> {
  if (!gatewayConfigured()) {
    const normalizedTool = input.tool.trim().toUpperCase();
    if (normalizedTool === "COMPOSIO_MULTI_EXECUTE_TOOL") {
      const rawArgs = input.args ?? {};
      const tools = Array.isArray(rawArgs.tools)
        ? rawArgs.tools.filter((item): item is { tool_slug: string; arguments: Record<string, unknown> } => {
            if (!item || typeof item !== "object") {
              return false;
            }
            const record = item as Record<string, unknown>;
            return (
              typeof record.tool_slug === "string" &&
              !!record.arguments &&
              typeof record.arguments === "object" &&
              !Array.isArray(record.arguments)
            );
          })
        : [];
      const connectedAccountId =
        typeof rawArgs.connected_account_id === "string" && rawArgs.connected_account_id.trim().length > 0
          ? rawArgs.connected_account_id
          : undefined;

      if (tools.length === 0) {
        throw new GatewayHttpError(400, "COMPOSIO_MULTI_EXECUTE_TOOL requires a non-empty tools array", null);
      }

      const payload = await callComposioMultiExecutePayload({
        tools,
        ...(connectedAccountId ? { connected_account_id: connectedAccountId } : {}),
      });
      return wrapDirectToolPayload(payload);
    }

    throw new GatewayHttpError(
      503,
      `Tool '${input.tool}' requires the legacy OpenClaw gateway, which is not configured`,
      null
    );
  }

  return requestGateway<unknown>("/tools/invoke", {
    tool: input.tool,
    args: input.args ?? {},
    action: input.action,
    sessionKey: input.sessionKey,
  });
}

export type QueryAgentInput = {
  message: string;
  user?: string;
  sessionKey?: string;
  timeoutMs?: number;
};

export async function queryAgent(input: QueryAgentInput): Promise<unknown> {
  if (!gatewayConfigured()) {
    const completion = await getSiliconFlowClient().createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Ground your answer in the user prompt only, keep it concise, and prefer Chinese when the user speaks Chinese.",
        },
        {
          role: "user",
          content: input.message,
        },
      ],
      temperature: 0.2,
      maxTokens: 1800,
    });

    return {
      id: completion.id ?? `sf_${Date.now()}`,
      object: "response",
      model: completion.model,
      output_text: completion.text,
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: completion.text,
            },
          ],
        },
      ],
      usage: completion.usage ?? null,
    };
  }

  return requestGateway<unknown>(
    "/v1/responses",
    {
      model: `openclaw:${env.OPENCLAW_AGENT_ID}`,
      input: input.message,
      user: input.user,
      stream: false,
    },
    input.sessionKey
      ? {
          "x-openclaw-session-key": input.sessionKey,
        }
      : undefined,
    input.timeoutMs
  );
}
