import type { FastifyBaseLogger } from "fastify";
import { env } from "../config.js";
import { getPrismaClient } from "../persistence.js";
import { decryptSecret } from "../secret-box.js";
import type { TenantContext } from "./types.js";

export type PlatformLlmRoute = {
  routeId: string;
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type LlmUsageInput = {
  tenant: TenantContext;
  route: PlatformLlmRoute;
  status: "success" | "error" | "aborted" | "timeout";
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type LlmGatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmGatewayGenerateInput = {
  tenant: TenantContext;
  messages: LlmGatewayMessage[];
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" | "text" };
};

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function extractChatCompletionText(body: any): string {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return "";
}

export class LlmGatewayService {
  constructor(private readonly logger: FastifyBaseLogger) {}

  async resolveRoute(tenant: TenantContext): Promise<PlatformLlmRoute> {
    const dbRoute = await this.resolveDbRoute(tenant);
    if (dbRoute) {
      return dbRoute;
    }

    return {
      routeId: "platform-default",
      provider: "openai-compatible",
      baseUrl: env.llmProviderBaseUrl,
      model: env.llmProviderModel,
      apiKey: env.llmProviderApiKey,
    };
  }

  toMastraModelConfig(route: PlatformLlmRoute) {
    return {
      providerId: "platform",
      modelId: route.model,
      url: route.baseUrl,
      apiKey: route.apiKey,
    } as const;
  }

  async generateText(input: LlmGatewayGenerateInput): Promise<string> {
    const route = await this.resolveRoute(input.tenant);
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    let status: LlmUsageInput["status"] = "success";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      status = "timeout";
      controller.abort();
    }, input.timeoutMs);

    try {
      const response = await fetch(chatCompletionsUrl(route.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${route.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: route.model,
          messages: input.messages,
          temperature: input.temperature ?? 0.2,
          max_tokens: input.maxTokens ?? 800,
          ...(input.responseFormat && input.responseFormat.type !== "text"
            ? { response_format: input.responseFormat }
            : {}),
        }),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let body: any = null;
      try {
        body = responseText ? JSON.parse(responseText) : null;
      } catch {
        body = null;
      }

      if (!response.ok) {
        status = timedOut ? "timeout" : "error";
        const providerMessage =
          typeof body?.error?.message === "string" ? body.error.message : responseText.slice(0, 500);
        throw new Error(`LLM provider request failed (${response.status}): ${providerMessage}`);
      }

      inputTokens = body?.usage?.prompt_tokens ?? body?.usage?.input_tokens;
      outputTokens = body?.usage?.completion_tokens ?? body?.usage?.output_tokens;
      return extractChatCompletionText(body);
    } catch (error) {
      if (status === "success") {
        status = timedOut ? "timeout" : error instanceof Error && error.name === "AbortError" ? "aborted" : "error";
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      await this.recordUsage({
        tenant: input.tenant,
        route,
        status,
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
      });
    }
  }

  private async resolveDbRoute(tenant: TenantContext): Promise<PlatformLlmRoute | null> {
    if (tenant.isLegacySession || tenant.userId.startsWith("legacy:")) {
      return null;
    }

    const prisma = (await getPrismaClient(this.logger)) as any;
    if (!prisma?.llmRoute?.findFirst) {
      return null;
    }

    const candidates = [
      { userId: tenant.userId, sourceId: tenant.sourceId },
      { userId: tenant.userId, sourceId: null },
      { userId: null, sourceId: null },
    ];

    for (const where of candidates) {
      const row = await prisma.llmRoute.findFirst({
        where: {
          ...where,
          enabled: true,
          provider: "openai-compatible",
        },
        orderBy: { updatedAt: "desc" },
      });
      if (!row) {
        continue;
      }

      const apiKey = row.apiKeyCiphertext ? decryptSecret(row.apiKeyCiphertext) : env.llmProviderApiKey;
      if (!apiKey) {
        this.logger.warn(
          { routeId: row.id, userId: tenant.userId, sourceId: tenant.sourceId },
          "Skipping LLM route without usable API key"
        );
        continue;
      }

      return {
        routeId: row.id,
        provider: "openai-compatible",
        baseUrl: row.baseUrl,
        model: row.model,
        apiKey,
      };
    }

    return null;
  }

  async recordUsage(input: LlmUsageInput): Promise<void> {
    if (input.tenant.isLegacySession || input.tenant.userId.startsWith("legacy:")) {
      return;
    }

    const prisma = (await getPrismaClient(this.logger)) as any;
    if (!prisma?.llmUsage?.create) {
      return;
    }

    try {
      await prisma.llmUsage.create({
        data: {
          userId: input.tenant.userId,
          sourceId: input.tenant.sourceId,
          routeId: input.route.routeId,
          model: input.route.model,
          inputTokens: input.inputTokens ?? null,
          outputTokens: input.outputTokens ?? null,
          status: input.status,
          durationMs: input.durationMs,
        },
      });
    } catch (error) {
      this.logger.warn(
        { message: error instanceof Error ? error.message : String(error) },
        "Failed to record LLM usage"
      );
    }
  }
}
