import type { FastifyBaseLogger } from "fastify";
import { env } from "../config.js";
import { getPrismaClient } from "../persistence.js";
import type { TenantContext } from "./types.js";

export type PlatformLlmRoute = {
  routeId: string;
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
};

export type LlmUsageInput = {
  tenant: TenantContext;
  route: PlatformLlmRoute;
  status: "success" | "error" | "aborted" | "timeout";
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

export class LlmGatewayService {
  constructor(private readonly logger: FastifyBaseLogger) {}

  resolveRoute(_tenant: TenantContext): PlatformLlmRoute {
    return {
      routeId: "platform-default",
      provider: "openai-compatible",
      baseUrl: env.llmProviderBaseUrl,
      model: env.llmProviderModel,
    };
  }

  toMastraModelConfig(route: PlatformLlmRoute) {
    return {
      providerId: "platform",
      modelId: route.model,
      url: route.baseUrl,
      apiKey: env.llmProviderApiKey,
    } as const;
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
