/**
 * Composio Service - 封装 Composio MCP 调用，提供 Outlook 邮件和日历功能
 * 
 * 直接连接 Composio MCP Server，不再依赖 OpenClaw Gateway
 */

import { z } from "zod";

// ========== Composio 配置 ==========

interface ComposioConfig {
  apiKey: string;
  mcpUrl: string;
}

let composioConfig: ComposioConfig | null = null;

export function initComposioClient(config: ComposioConfig): void {
  composioConfig = config;
}

function getConfig(): ComposioConfig {
  if (!composioConfig) {
    throw new Error("Composio client not initialized. Call initComposioClient first.");
  }
  return composioConfig;
}

// ========== 类型定义 ==========

export type MailSourceContext = {
  sourceId: string;
  mailboxUserId?: string;
  connectedAccountId?: string;
};

export type MailRoutingProbeResult = {
  ok: boolean;
  error?: string;
};

// ========== Schema 定义 ==========

const rawToolContentItemSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
}).passthrough();

const rawToolInvokeResultSchema = z.object({
  ok: z.boolean().optional(),
  content: z.array(rawToolContentItemSchema).optional(),
  result: z
    .object({
      content: z.array(rawToolContentItemSchema).optional(),
      details: z.unknown().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

const composioToolResultSchema = z.object({
  tool_slug: z.string().optional(),
  error: z.string().nullable().optional(),
  response: z
    .object({
      successful: z.boolean().optional(),
      data: z.unknown().optional(),
      error: z.string().nullable().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

export const composioMultiExecutePayloadSchema = z.object({
  successful: z.boolean().optional(),
  data: z
    .object({
      results: z.array(composioToolResultSchema).optional(),
    })
    .passthrough()
    .optional(),
  error: z.string().nullable().optional(),
}).passthrough();

export type ComposioMultiExecutePayload = z.infer<typeof composioMultiExecutePayloadSchema>;

export type ComposioToolResult = z.infer<typeof composioToolResultSchema>;

// ========== 辅助函数 ==========

export function isComposioPayloadSuccessful(payload: ComposioMultiExecutePayload): boolean {
  if (payload.successful === true) {
    return true;
  }

  if (payload.successful === false) {
    return false;
  }

  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    return false;
  }

  return Boolean(payload.data?.results && payload.data.results.length > 0);
}

export function isComposioResponseSuccessful(response?: { successful?: boolean; error?: string | null }): boolean {
  if (!response) {
    return false;
  }
  if (response.successful === true) {
    return true;
  }
  if (response.successful === false) {
    return false;
  }
  if (typeof response.error === "string" && response.error.trim().length > 0) {
    return false;
  }
  return true;
}

function parseJsonStringCandidate(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }

  if (
    !(trimmed.startsWith("{") && trimmed.endsWith("}")) &&
    !(trimmed.startsWith("[") && trimmed.endsWith("]")) &&
    !(trimmed.startsWith("\"{") && trimmed.endsWith("}\"")) &&
    !(trimmed.startsWith("\"[") && trimmed.endsWith("]\""))
  ) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeJsonLike(value: unknown, maxDepth = 3): unknown {
  let current = value;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parsed = parseJsonStringCandidate(current);
    if (parsed === current) {
      break;
    }
    current = parsed;
  }
  return current;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  const normalized = normalizeJsonLike(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return null;
  }
  return normalized as Record<string, unknown>;
}

export function extractComposioResponseData(result: z.infer<typeof composioToolResultSchema>): unknown {
  const response = asRecord(result.response);
  if (!response) {
    return normalizeJsonLike(result.response);
  }

  if ("data" in response) {
    return normalizeJsonLike(response.data);
  }

  if ("value" in response || "messages" in response || "items" in response) {
    return normalizeJsonLike(response);
  }

  const nestedKeys = ["result", "output", "payload", "body", "response", "result_data"];
  for (const key of nestedKeys) {
    const nested = asRecord(response[key]);
    if (!nested) {
      continue;
    }

    if ("data" in nested) {
      return normalizeJsonLike(nested.data);
    }

    if ("value" in nested || "messages" in nested || "items" in nested) {
      return normalizeJsonLike(nested);
    }
  }

  return normalizeJsonLike(response);
}

function isComposioAuthKeyInvalidText(input: string): boolean {
  const normalized = input.replace(/\s+/g, " ").trim();
  return (
    /invalid (consumer )?api key/i.test(normalized) ||
    /unauthorized[^.]*api key/i.test(normalized) ||
    /missing authentication[^.]*api key/i.test(normalized)
  );
}

export function parseToolTextJson(value: unknown): ComposioMultiExecutePayload {
  let raw: z.infer<typeof rawToolInvokeResultSchema>;

  try {
    raw = rawToolInvokeResultSchema.parse(value);
  } catch {
    throw new Error("Unexpected tool response shape");
  }

  const contentCandidates = [raw.result?.content, raw.content];
  let text: string | undefined;
  for (const content of contentCandidates) {
    const candidateText = content?.find((item) => item.type === "text")?.text;
    if (candidateText) {
      text = candidateText;
      break;
    }
  }

  if (!text) {
    throw new Error("Tool response missing text payload");
  }

  const stripJsonCodeFence = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("```")) {
      return raw;
    }
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  };

  const normalizedText = text.replace(/\s+/g, " ").trim();
  const parseCandidates = [text, stripJsonCodeFence(text)].filter(
    (item, index, array) => array.indexOf(item) === index
  );

  let parsed: unknown;
  for (const candidate of parseCandidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // Continue trying the next candidate.
    }
  }

  if (parsed === undefined) {
    if (isComposioAuthKeyInvalidText(normalizedText)) {
      throw new Error("Composio API key is invalid. Please update your COMPOSIO_API_KEY in .env and retry.");
    }

    if (/^error calling composio_[a-z0-9_]+:/i.test(normalizedText)) {
      throw new Error(normalizedText.slice(0, 320));
    }

    const errorSnippet = normalizedText.slice(0, 500);
    throw new Error(`Composio tool returned non-JSON response: ${errorSnippet}`);
  }

  if (typeof parsed === "string" && isComposioAuthKeyInvalidText(parsed)) {
    throw new Error("Composio API key is invalid. Please update your COMPOSIO_API_KEY in .env and retry.");
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const parsedRecord = parsed as Record<string, unknown>;
    const messageCandidates = [parsedRecord.error, parsedRecord.message, parsedRecord.detail];
    for (const candidate of messageCandidates) {
      if (typeof candidate === "string" && isComposioAuthKeyInvalidText(candidate)) {
        throw new Error("Composio API key is invalid. Please update your COMPOSIO_API_KEY in .env and retry.");
      }
    }
  }

  const validated = composioMultiExecutePayloadSchema.safeParse(parsed);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    const issuePath = issue?.path?.join(".") || "unknown";
    const issueMessage = issue?.message || "unknown mismatch";
    throw new Error(`Parsed tool payload schema mismatch at ${issuePath}: ${issueMessage}`);
  }

  return validated.data;
}

// ========== Source Context 验证函数 ==========

function isValidSourceIdForContext(value: string): boolean {
  return value.length >= 3 && value.length <= 80 && /^[a-z0-9_-]+$/i.test(value);
}

function isValidMailboxUserIdForContext(value: string): boolean {
  if (value === "me") {
    return true;
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return true;
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return true;
  }

  return false;
}

function isValidConnectedAccountIdForContext(value: string): boolean {
  return /^ca_[A-Za-z0-9_-]+$/.test(value);
}

export function normalizeSourceContext(sourceContext?: MailSourceContext): MailSourceContext | null {
  if (!sourceContext) {
    return null;
  }

  const sourceId = sourceContext.sourceId.trim();
  if (!sourceId || !isValidSourceIdForContext(sourceId)) {
    return null;
  }

  const mailboxUserIdRaw = sourceContext.mailboxUserId?.trim();
  const connectedAccountIdRaw = sourceContext.connectedAccountId?.trim();
  const mailboxUserId =
    mailboxUserIdRaw && isValidMailboxUserIdForContext(mailboxUserIdRaw) ? mailboxUserIdRaw : undefined;
  const connectedAccountId =
    connectedAccountIdRaw && isValidConnectedAccountIdForContext(connectedAccountIdRaw)
      ? connectedAccountIdRaw
      : undefined;

  return {
    sourceId,
    ...(mailboxUserId ? { mailboxUserId } : {}),
    ...(connectedAccountId ? { connectedAccountId } : {}),
  };
}

function withSourceAwareToolArguments(
  toolSlug: string,
  args: Record<string, unknown>,
  sourceContext: MailSourceContext | null
): Record<string, unknown> {
  if (!sourceContext?.mailboxUserId) {
    return args;
  }

  const outlookToolSlugs = [
    "OUTLOOK_QUERY_EMAILS",
    "OUTLOOK_GET_MESSAGE",
    "OUTLOOK_CREATE_ME_EVENT",
    "OUTLOOK_GET_EVENT",
    "OUTLOOK_DELETE_EVENT",
    "OUTLOOK_SEND_MESSAGE",
  ];

  if (!outlookToolSlugs.includes(toolSlug)) {
    return args;
  }

  if ("user_id" in args && typeof args.user_id === "string" && args.user_id.trim().length > 0) {
    if (args.user_id.trim() !== "me") {
      return args;
    }
  }

  return {
    ...args,
    user_id: sourceContext.mailboxUserId,
  };
}

export function composioMultiExecuteArgs(
  tools: Array<{
    tool_slug: string;
    arguments: Record<string, unknown>;
  }>,
  sourceContext?: MailSourceContext
): { tools: Array<{ tool_slug: string; arguments: Record<string, unknown> }>; connected_account_id?: string } {
  const normalizedContext = normalizeSourceContext(sourceContext);

  const scopedTools = tools.map((item) => ({
    tool_slug: item.tool_slug,
    arguments: withSourceAwareToolArguments(item.tool_slug, item.arguments, normalizedContext),
  }));

  return {
    tools: scopedTools,
    ...(normalizedContext?.connectedAccountId
      ? { connected_account_id: normalizedContext.connectedAccountId }
      : {}),
  };
}

// ========== Composio API 调用 ==========

export async function callComposioMultiExecutePayload(args: {
  tools: Array<{ tool_slug: string; arguments: Record<string, unknown> }>;
  connected_account_id?: string;
}): Promise<ComposioMultiExecutePayload> {
  const config = getConfig();

  if (!config.apiKey.trim()) {
    throw new Error("COMPOSIO_API_KEY is not configured");
  }

  if (!config.mcpUrl.trim()) {
    throw new Error("COMPOSIO_MCP_URL is not configured");
  }

  const body = {
    jsonrpc: "2.0",
    id: Date.now().toString(),
    method: "tools/call",
    params: {
      name: "multi_execute",
      arguments: {
        tools: args.tools,
        ...(args.connected_account_id ? { connected_account_id: args.connected_account_id } : {}),
      },
    },
  };

  try {
    const response = await fetch(config.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`);
    }

    const text = await response.text();
    const parsed = JSON.parse(text);

    // MCP 响应格式
    if (parsed.result) {
      return parseToolTextJson(parsed.result);
    }

    // 直接返回格式
    return parseToolTextJson(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Composio call failed: ${String(error)}`);
  }
}

export async function callComposioTool(
  tools: Array<{ tool_slug: string; arguments: Record<string, unknown> }>,
  sourceContext?: MailSourceContext
): Promise<ComposioMultiExecutePayload> {
  return callComposioMultiExecutePayload(composioMultiExecuteArgs(tools, sourceContext));
}

// ========== 导出辅助函数 ==========

export function parseRawComposioResponse(value: unknown): ComposioMultiExecutePayload {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if ("successful" in record || "data" in record) {
      const validated = composioMultiExecutePayloadSchema.safeParse(record);
      if (validated.success) {
        return validated.data;
      }
    }
  }

  return parseToolTextJson(value);
}

export async function probeOutlookRouting(
  sourceContext?: Pick<MailSourceContext, "mailboxUserId" | "connectedAccountId">
): Promise<MailRoutingProbeResult> {
  const context: MailSourceContext = {
    sourceId: "source_probe",
    ...(sourceContext?.mailboxUserId ? { mailboxUserId: sourceContext.mailboxUserId } : {}),
    ...(sourceContext?.connectedAccountId ? { connectedAccountId: sourceContext.connectedAccountId } : {}),
  };

  const runProbeTool = async (
    toolSlug: "OUTLOOK_GET_ME" | "OUTLOOK_QUERY_EMAILS",
    toolArgs: Record<string, unknown>
  ) => {
    const result = await callComposioTool(
      [{ tool_slug: toolSlug, arguments: toolArgs }],
      context
    );

    if (!isComposioPayloadSuccessful(result)) {
      throw new Error(result.error ?? `${toolSlug} probe failed`);
    }

    const toolResult = result.data?.results?.[0];
    if (!toolResult) {
      throw new Error(`${toolSlug} probe returned no result item`);
    }

    if (!isComposioResponseSuccessful(toolResult.response)) {
      throw new Error(toolResult.response?.error ?? `${toolSlug} probe failed`);
    }
  };

  const shouldFallbackFromGetMeProbe = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error);
    if (/unauthorized|forbidden|insufficient|invalid (auth|token)|401|403/i.test(message)) {
      return false;
    }
    return /OUTLOOK_GET_ME|tool not available|unexpected tool slug|not implemented|1 out of 1 tools failed/i.test(message);
  };

  try {
    try {
      await runProbeTool("OUTLOOK_GET_ME", {});
    } catch (error) {
      if (!shouldFallbackFromGetMeProbe(error)) {
        throw error;
      }
      await runProbeTool("OUTLOOK_QUERY_EMAILS", {
        folder: "inbox",
        top: 1,
        orderby: "receivedDateTime desc",
        select: ["id"],
      });
    }

    if (context.mailboxUserId) {
      await runProbeTool("OUTLOOK_QUERY_EMAILS", {
        folder: "inbox",
        top: 1,
        orderby: "receivedDateTime desc",
        select: ["id"],
      });
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
