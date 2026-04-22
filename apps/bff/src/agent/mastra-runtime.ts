import { createHash, randomUUID } from "node:crypto";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config.js";
import {
  createPrivacyStreamRestorer,
  type MailPrivacyScope,
} from "../mail-privacy.js";
import { getPrismaClient } from "../persistence.js";
import {
  createDefaultHookEngine,
  type AgentHookEvent,
  type AgentHookPayload,
  type HookEngine,
} from "../runtime/hook-engine.js";
import {
  getDefaultMemoryStore,
  type AgentMemoryRecord,
  type MemoryScope,
} from "../runtime/memory-store.js";
import { createSkillRegistry, type SkillSummary } from "../runtime/skill-registry.js";
import { LlmGatewayService, type PlatformLlmRoute } from "./llm-gateway.js";
import { createMailAssistantTools, MAIL_ASSISTANT_SKILLS } from "./mail-skills.js";
import { loadAgentPrivacyScope, saveAgentPrivacyScope } from "./privacy-state-store.js";
import type {
  AgentChatEvent,
  AgentQueryResult,
  AgentRuntime,
  AgentRuntimeInput,
  AgentSkillMetadata,
  TenantContext,
} from "./types.js";

const MEMORY_TEMPLATE = `# Mail assistant memory
- Communication preferences:
- Mail handling preferences:
- Important senders:
- Calendar preferences:
`;

type RunStatus = "success" | "error" | "aborted" | "timeout";

function scopedResourceId(tenant: TenantContext): string {
  return `mail:${tenant.tenantId}:${tenant.sourceId}`;
}

function memoryScopeFor(tenant: TenantContext): MemoryScope {
  return {
    userId: tenant.userId,
    sourceId: tenant.sourceId,
  };
}

function scopedThreadId(tenant: TenantContext, threadId?: string): string {
  const prefix = `${scopedResourceId(tenant)}:`;
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function sanitizeToolPayload(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= 1200) {
    return value;
  }

  return {
    truncated: true,
    preview: text.slice(0, 1200),
  };
}

async function* readReadableStream<T>(stream: ReadableStream<T>): AsyncGenerator<T> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        return;
      }
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

export class MastraRuntime implements AgentRuntime {
  private readonly llmGateway: LlmGatewayService;
  private readonly skillRegistry = createSkillRegistry();
  private readonly fileMemory = getDefaultMemoryStore();
  private readonly hooks: HookEngine;
  private storagePromise?: Promise<PostgresStore | null>;

  constructor(private readonly logger: FastifyBaseLogger) {
    this.llmGateway = new LlmGatewayService(logger);
    this.hooks = createDefaultHookEngine(this.fileMemory);
  }

  async query(input: AgentRuntimeInput): Promise<AgentQueryResult> {
    let finalResult: AgentQueryResult | undefined;
    let answer = "";

    for await (const event of this.stream(input)) {
      if (event.type === "message_delta") {
        answer += event.delta;
      }
      if (event.type === "final") {
        finalResult = event.result;
      }
      if (event.type === "error") {
        throw new Error(event.error);
      }
    }

    return finalResult ?? { answer, threadId: scopedThreadId(input.tenant, input.threadId) };
  }

  async *stream(input: AgentRuntimeInput): AsyncGenerator<AgentChatEvent> {
    const tenant = input.tenant;
    const route = await this.llmGateway.resolveRoute(tenant);
    const threadId = scopedThreadId(tenant, input.threadId);
    const resourceId = scopedResourceId(tenant);
    const memoryScope = memoryScopeFor(tenant);
    const startedAt = Date.now();
    let status: RunStatus = "success";
    let answer = "";
    let maskedAnswer = "";
    let toolCalls = 0;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let localSkills: SkillSummary[] = [];
    let privacyScope: MailPrivacyScope | null = null;
    let maskedQuestion = input.message;

    try {
      privacyScope = await loadAgentPrivacyScope(this.logger, tenant, threadId);
      maskedQuestion = privacyScope ? privacyScope.pseudonymizeText(input.message) : input.message;

      await this.runHook("before_context_load", {
        scope: memoryScope,
        question: maskedQuestion,
      });
      const recalledMemory = await this.fileMemory.recall(memoryScope, maskedQuestion, 6);
      localSkills = await this.skillRegistry.findRelevant(input.message, 4);
      const memory = await this.createMemory();
      const tools = await createMailAssistantTools(tenant, {
        logger: this.logger,
        timeZone: input.timeZone,
        priorityRules: input.priorityRules,
        memoryStore: this.fileMemory,
        privacyScope,
      });
      await this.runHook("before_model_call", {
        scope: memoryScope,
        question: maskedQuestion,
        usedSkills: localSkills,
      });
      const agent = new Agent({
        id: "mail-assistant",
        name: "Mail Assistant",
        instructions: this.instructionsFor(tenant, localSkills, recalledMemory, privacyScope),
        model: this.llmGateway.toMastraModelConfig(route) as any,
        tools,
        ...(memory ? { memory } : {}),
      });
      const responseRestorer = privacyScope ? createPrivacyStreamRestorer(privacyScope) : null;

      const stream = await agent.stream(maskedQuestion, {
        abortSignal: input.abortSignal,
        maxSteps: env.AGENT_MAX_STEPS,
        memory: memory
          ? {
              thread: threadId,
              resource: resourceId,
              options: {
                lastMessages: 10,
                semanticRecall: false,
                workingMemory: {
                  enabled: true,
                  scope: "resource",
                  template: MEMORY_TEMPLATE,
                },
              },
            }
          : undefined,
        onFinish: (result: any) => {
          inputTokens = result?.usage?.inputTokens ?? result?.usage?.promptTokens ?? inputTokens;
          outputTokens = result?.usage?.outputTokens ?? result?.usage?.completionTokens ?? outputTokens;
        },
      } as any);

      for await (const chunk of readReadableStream(stream.fullStream as ReadableStream<any>)) {
        if (input.abortSignal?.aborted) {
          status = "aborted";
          throw new DOMException("Agent run aborted", "AbortError");
        }

        if (chunk?.type === "text-delta") {
          const delta = String(chunk.payload?.text ?? "");
          if (delta) {
            maskedAnswer += delta;
            const restoredDelta = responseRestorer ? responseRestorer.push(delta) : delta;
            if (restoredDelta) {
              answer += restoredDelta;
              yield { type: "message_delta", delta: restoredDelta };
            }
          }
          continue;
        }

        if (chunk?.type === "tool-call") {
          toolCalls += 1;
          if (toolCalls > env.AGENT_MAX_TOOL_CALLS) {
            status = "error";
            throw new Error(`Agent exceeded max tool calls (${env.AGENT_MAX_TOOL_CALLS})`);
          }

          const toolName = String(chunk.payload?.toolName ?? "unknown");
          const restoredToolArgs = privacyScope
            ? privacyScope.restoreStructuredPayload(chunk.payload?.args, {
                allowUnknownTokens: true,
              })
            : chunk.payload?.args;
          await this.runHook("before_tool_call", {
            scope: memoryScope,
            question: maskedQuestion,
            usedSkills: localSkills,
            toolName,
            toolArgs: chunk.payload?.args,
          });
          yield {
            type: "tool_start",
            tool: toolName,
            input: sanitizeToolPayload(restoredToolArgs),
          };
          continue;
        }

        if (chunk?.type === "tool-result") {
          const toolName = String(chunk.payload?.toolName ?? "unknown");
          const restoredToolResult = privacyScope
            ? privacyScope.restoreStructuredPayload(chunk.payload?.result, {
                allowUnknownTokens: true,
              })
            : chunk.payload?.result;
          await this.runHook("after_tool_call", {
            scope: memoryScope,
            question: maskedQuestion,
            usedSkills: localSkills,
            toolName,
            toolResult: chunk.payload?.result,
          });
          yield {
            type: "tool_result",
            tool: toolName,
            result: sanitizeToolPayload(restoredToolResult),
          };
          continue;
        }

        if (chunk?.type === "finish" || chunk?.type === "step-finish") {
          const usage = chunk.payload?.output?.usage ?? chunk.payload?.stepResult?.usage;
          inputTokens = usage?.inputTokens ?? usage?.promptTokens ?? inputTokens;
          outputTokens = usage?.outputTokens ?? usage?.completionTokens ?? outputTokens;
          continue;
        }

        if (chunk?.type === "error" || chunk?.type === "tool-error") {
          status = "error";
          throw new Error(safeErrorMessage(chunk.payload?.error ?? "Agent stream failed"));
        }
      }

      const flushedDelta = responseRestorer ? responseRestorer.flush() : "";
      if (flushedDelta) {
        answer += flushedDelta;
        yield { type: "message_delta", delta: flushedDelta };
      }

      const result: AgentQueryResult = {
        answer: answer.trim() || "I could not generate a useful answer. Please try again.",
        threadId,
      };
      await this.runHook("after_model_call", {
        scope: memoryScope,
        question: maskedQuestion,
        answer: maskedAnswer.trim() || result.answer,
        usedSkills: localSkills,
      });
      await this.saveAgentTurn(tenant, threadId, input.message, result.answer);
      await saveAgentPrivacyScope(this.logger, privacyScope);
      await this.runHook("after_response", {
        scope: memoryScope,
        question: maskedQuestion,
        answer: maskedAnswer.trim() || result.answer,
        usedSkills: localSkills,
      });
      yield { type: "final", result };
    } catch (error) {
      if (status === "success") {
        status = isAbortError(error) ? "aborted" : "error";
      }
      await this.runHook("on_error", {
        scope: memoryScope,
        question: maskedQuestion,
        usedSkills: localSkills,
        error,
      });
      throw error;
    } finally {
      await this.llmGateway.recordUsage({
        tenant,
        route,
        status,
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
      });
    }
  }

  async listSkills(tenant: TenantContext): Promise<AgentSkillMetadata[]> {
    const hasCalendarConnection =
      tenant.connectionType === "microsoft"
        ? Boolean(tenant.microsoftAccountId)
        : Boolean(tenant.connectedAccountId);
    const platformSkills = MAIL_ASSISTANT_SKILLS.map((skill) => ({
      ...skill,
      enabled: skill.id === "syncCalendar" ? hasCalendarConnection : skill.enabled,
    }));

    const localSkills = await this.skillRegistry.list();
    return [
      ...platformSkills,
      ...localSkills.map((skill) => ({
        id: skill.slug,
        name: skill.name,
        description: skill.description,
        enabled: true,
      })),
    ];
  }

  private async runHook(event: AgentHookEvent, payload: AgentHookPayload): Promise<void> {
    try {
      await this.hooks.run(event, payload);
    } catch (error) {
      this.logger.warn(
        {
          event,
          userId: payload.scope.userId,
          sourceId: payload.scope.sourceId,
          message: safeErrorMessage(error),
        },
        "Agent hook failed"
      );
    }
  }

  private async createMemory(): Promise<Memory | null> {
    const storage = await this.getStorage();
    if (!storage) {
      return null;
    }

    return new Memory({
      storage,
      options: {
        lastMessages: 10,
        semanticRecall: false,
        workingMemory: {
          enabled: true,
          scope: "resource",
          template: MEMORY_TEMPLATE,
        },
      },
    });
  }

  private async getStorage(): Promise<PostgresStore | null> {
    if (!process.env.DATABASE_URL?.trim()) {
      return null;
    }

    this.storagePromise ??= (async () => {
      try {
        const store = new PostgresStore({
          id: "mail-agent-mastra",
          connectionString: process.env.DATABASE_URL,
        });
        await store.init();
        return store;
      } catch (error) {
        this.logger.warn(
          { message: safeErrorMessage(error) },
          "Mastra PostgreSQL memory unavailable; falling back to stateless agent run"
        );
        return null;
      }
    })();

    return this.storagePromise;
  }

  private instructionsFor(
    tenant: TenantContext,
    localSkills: SkillSummary[] = [],
    recalledMemory: AgentMemoryRecord[] = [],
    privacyScope?: MailPrivacyScope | null
  ): string {
    const sections = [
      "You are Mail Assistant embedded in a private mail system.",
      "All tools are already scoped to the current tenant and mailbox source.",
      "Current scope is already tenant-scoped to the active mailbox.",
      "Prefer the platform tools searchMail, summarizeInbox, extractEvents, getMailDetail, syncCalendar, summarizeMailboxHistory, knowledgeBaseStatus, searchMailKnowledgeBase, and rememberPreference.",
      "If a stable opaque pseudonym appears in the prompt, treat it as the real entity identifier and copy it exactly when needed. Do not guess its original value.",
      "Never expose provider keys, tokens, or internal routing details.",
      "Do not output full raw mail bodies unless the user explicitly asks for the original content.",
      "If Outlook authorization or a tool call fails, return a recoverable next step instead of retrying forever.",
      "Answer in the user's language and keep the response concise and actionable.",
    ];

    const skillBlock = this.formatLocalSkillsForPrompt(localSkills);
    if (skillBlock) {
      sections.push(skillBlock);
    }

    const memoryBlock = this.formatMemoryForPrompt(recalledMemory, privacyScope);
    if (memoryBlock) {
      sections.push(memoryBlock);
    }

    return sections.join("\n\n");
  }

  private formatLocalSkillsForPrompt(skills: SkillSummary[]): string | null {
    if (skills.length === 0) {
      return null;
    }

    const rendered = skills
      .map((skill) => {
        const snippet = skill.promptSnippet.replace(/\s+/g, " ").trim().slice(0, 900);
        return `- ${skill.name} (${skill.slug}): ${skill.description}\n  Guidance: ${snippet}`;
      })
      .join("\n");

    return `Relevant local skill guidance:\n${rendered}`;
  }

  private formatMemoryForPrompt(
    records: AgentMemoryRecord[],
    privacyScope?: MailPrivacyScope | null
  ): string | null {
    if (records.length === 0) {
      return null;
    }

    const rendered = records
      .map((record) => {
        const content = record.content.replace(/\s+/g, " ").trim().slice(0, 500);
        const masked = privacyScope ? privacyScope.pseudonymizeText(content) : content;
        return `- [${record.kind}] ${masked}`;
      })
      .join("\n");

    return `Relevant memory hints:\n${rendered}`;
  }

  private async saveAgentTurn(
    tenant: TenantContext,
    threadId: string,
    userMessage: string,
    assistantMessage: string
  ): Promise<void> {
    if (tenant.isLegacySession || tenant.userId.startsWith("legacy:")) {
      return;
    }

    const prisma = (await getPrismaClient(this.logger)) as any;
    if (!prisma?.agentThread?.upsert || !prisma?.agentMessage?.create) {
      return;
    }

    try {
      const now = new Date();
      await prisma.agentThread.upsert({
        where: { id: threadId },
        create: {
          id: threadId,
          userId: tenant.userId,
          sourceId: tenant.sourceId,
          title: userMessage.slice(0, 80),
          createdAt: now,
          updatedAt: now,
        },
        update: {
          updatedAt: now,
        },
      });
      await prisma.agentMessage.create({
        data: {
          threadId,
          userId: tenant.userId,
          sourceId: tenant.sourceId,
          role: "user",
          content: userMessage.slice(0, 8000),
          createdAt: now,
        },
      });
      await prisma.agentMessage.create({
        data: {
          threadId,
          userId: tenant.userId,
          sourceId: tenant.sourceId,
          role: "assistant",
          content: assistantMessage.slice(0, 12000),
          createdAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        {
          userId: tenant.userId,
          sourceId: tenant.sourceId,
          message: safeErrorMessage(error),
        },
        "Failed to persist agent turn"
      );
    }
  }
}
