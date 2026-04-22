import { createHash, randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { queryAgent } from "../gateway.js";
import { MAIL_ASSISTANT_SKILLS } from "./mail-skills.js";
import { loadAgentPrivacyScope, saveAgentPrivacyScope } from "./privacy-state-store.js";
import type {
  AgentChatEvent,
  AgentQueryResult,
  AgentRuntime,
  AgentRuntimeInput,
  AgentSkillMetadata,
  TenantContext,
} from "./types.js";

function extractAnswer(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["answer", "output_text", "text", "content"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  }

  return JSON.stringify(raw);
}

function scopedThreadId(tenant: TenantContext, threadId?: string): string {
  const prefix = `mail:${tenant.tenantId}:${tenant.sourceId}:`;
  const normalized = threadId?.trim();
  if (!normalized) {
    return `${prefix}${randomUUID()}`;
  }
  if (normalized.startsWith(prefix)) {
    return normalized;
  }
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `${prefix}${digest}`;
}

const OPENCLAW_SCOPE_SEPARATOR = "|";

export class OpenClawRuntime implements AgentRuntime {
  constructor(private readonly logger: FastifyBaseLogger) {}

  async query(input: AgentRuntimeInput): Promise<AgentQueryResult> {
    const threadId = scopedThreadId(input.tenant, input.threadId);
    const privacyScope = await loadAgentPrivacyScope(this.logger, input.tenant, threadId);
    const maskedMessage = privacyScope ? privacyScope.pseudonymizeText(input.message) : input.message;

    const raw = await queryAgent({
      message: maskedMessage,
      user: `${input.tenant.tenantId}:${input.tenant.sourceId}`,
      sessionKey: `${input.tenant.sessionToken}${OPENCLAW_SCOPE_SEPARATOR}${input.tenant.sourceId}`,
    });

    const restoredAnswer = privacyScope ? privacyScope.restoreText(extractAnswer(raw)) : extractAnswer(raw);
    await saveAgentPrivacyScope(this.logger, privacyScope);

    return {
      answer: restoredAnswer,
      threadId,
    };
  }

  async *stream(input: AgentRuntimeInput): AsyncGenerator<AgentChatEvent> {
    const result = await this.query(input);
    yield {
      type: "message_delta",
      delta: result.answer,
    };
    yield {
      type: "final",
      result,
    };
  }

  async listSkills(_tenant: TenantContext): Promise<AgentSkillMetadata[]> {
    return MAIL_ASSISTANT_SKILLS.map((skill) => ({
      ...skill,
      enabled: false,
    }));
  }
}
