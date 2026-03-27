import { env } from "./config.js";

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

async function requestGateway<T>(
  path: string,
  payload: unknown,
  extraHeaders?: Record<string, string>,
  timeoutMs = env.GATEWAY_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const effectiveTimeoutMs = Math.max(1, timeoutMs);
  const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  try {
    const response = await fetch(buildUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENCLAW_GATEWAY_BEARER}`,
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
