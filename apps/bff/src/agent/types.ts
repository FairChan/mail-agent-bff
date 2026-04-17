import type { MailPriorityRule, MailSourceContext } from "../mail.js";

export type AgentRuntimeName = "mastra" | "openclaw";

export type TenantContext = MailSourceContext & {
  userId: string;
  sessionToken: string;
  sourceId: string;
  isLegacySession?: boolean;
};

export type AgentChatRequest = {
  message: string;
  threadId?: string;
  sourceId?: string;
};

export type AgentQueryResult = {
  answer: string;
  threadId?: string;
  references?: unknown[];
};

export type AgentSkillMetadata = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  requiresConnection?: boolean;
};

export type AgentChatEvent =
  | { type: "message_delta"; delta: string }
  | { type: "tool_start"; tool: string; input?: unknown }
  | { type: "tool_result"; tool: string; result?: unknown }
  | { type: "final"; result: AgentQueryResult }
  | { type: "error"; error: string; code?: string };

export type AgentRuntimeInput = {
  tenant: TenantContext;
  message: string;
  threadId?: string;
  timeZone?: string;
  limit?: number;
  horizonDays?: number;
  priorityRules?: MailPriorityRule[];
  abortSignal?: AbortSignal;
};

export interface AgentRuntime {
  query(input: AgentRuntimeInput): Promise<AgentQueryResult>;
  stream(input: AgentRuntimeInput): AsyncGenerator<AgentChatEvent>;
  listSkills(tenant: TenantContext): Promise<AgentSkillMetadata[]>;
}
