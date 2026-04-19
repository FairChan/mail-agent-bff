import { queryAgent } from "../gateway.js";
import { MAIL_ASSISTANT_SKILLS } from "./mail-skills.js";
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

const OPENCLAW_SCOPE_SEPARATOR = "|";

export class OpenClawRuntime implements AgentRuntime {
  async query(input: AgentRuntimeInput): Promise<AgentQueryResult> {
    const raw = await queryAgent({
      message: input.message,
      user: `${input.tenant.tenantId}:${input.tenant.sourceId}`,
      sessionKey: `${input.tenant.sessionToken}${OPENCLAW_SCOPE_SEPARATOR}${input.tenant.sourceId}`,
    });

    return {
      answer: extractAnswer(raw),
      threadId: input.threadId,
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
