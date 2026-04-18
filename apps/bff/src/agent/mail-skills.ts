import { createTool } from "@mastra/core/tools";
import type { ToolsInput } from "@mastra/core/agent";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import {
  type KnowledgeBaseJob,
  getLatestKnowledgeBaseJob,
  triggerMailSummary,
} from "../knowledge-base-service.js";
import { getMailKnowledgeBaseStore } from "../mail-kb-store.js";
import {
  answerMailQuestion,
  buildMailInsights,
  createCalendarEventFromInsight,
  getMailMessageById,
  type MailInsightType,
  type MailPriorityRule,
} from "../mail.js";
import { getPrismaClient } from "../persistence.js";
import type { FileMemoryStore } from "../runtime/memory-store.js";
import { searchKnowledgeBaseMailSummaries } from "../summary.js";
import type { AgentSkillMetadata, TenantContext } from "./types.js";

const insightTypeSchema = z.enum(["ddl", "meeting", "exam", "event"]);
const MAX_DETAIL_BODY_CHARS = 4000;

export const MAIL_ASSISTANT_SKILLS: AgentSkillMetadata[] = [
  {
    id: "searchMail",
    name: "Search mail",
    description: "Search and answer questions from the current user's selected mailbox.",
    enabled: true,
  },
  {
    id: "getMailDetail",
    name: "Get mail detail",
    description: "Read a single message from the current user's selected mailbox.",
    enabled: true,
  },
  {
    id: "summarizeInbox",
    name: "Summarize inbox",
    description: "Summarize recent inbox state, unread count, and upcoming signals.",
    enabled: true,
  },
  {
    id: "extractEvents",
    name: "Extract events",
    description: "Extract DDLs, meetings, exams, and dated events from recent mail.",
    enabled: true,
  },
  {
    id: "syncCalendar",
    name: "Sync calendar",
    description: "Create an Outlook calendar event from a trusted mail insight.",
    enabled: true,
    requiresConnection: true,
  },
  {
    id: "summarizeMailboxHistory",
    name: "Summarize mailbox history",
    description:
      "Build the 30-day historical mail knowledge base with mail IDs, subjects, scores, event clusters, sender profiles, and exported docs.",
    enabled: true,
  },
  {
    id: "knowledgeBaseStatus",
    name: "Knowledge base status",
    description:
      "Check whether the historical mailbox knowledge base is ready and whether a backfill job is still running.",
    enabled: true,
  },
  {
    id: "searchMailKnowledgeBase",
    name: "Search historical summaries",
    description:
      "Search the persisted historical mail knowledge base after the mailbox history backfill has run.",
    enabled: true,
  },
  {
    id: "rememberPreference",
    name: "Remember preference",
    description: "Store a lightweight preference scoped to the current user and mailbox source.",
    enabled: true,
  },
];

export type MailToolOptions = {
  priorityRules?: MailPriorityRule[];
  timeZone?: string;
  logger: FastifyBaseLogger;
  memoryStore?: FileMemoryStore;
};

function defineMailTool(config: any) {
  return createTool(config) as any;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function sanitizePreferenceValue(value: string): string {
  return truncateText(value.trim(), 1200);
}

function serializeKnowledgeBaseJob(job: KnowledgeBaseJob | undefined) {
  if (!job) {
    return null;
  }

  return {
    jobId: job.jobId,
    sourceId: job.sourceId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    progress: job.progress,
  };
}

async function appendPreferenceToFileMemory(
  tenant: TenantContext,
  options: MailToolOptions,
  key: string,
  value: string
): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!options.memoryStore) {
    return { ok: false };
  }

  try {
    const record = await options.memoryStore.append(
      { userId: tenant.userId, sourceId: tenant.sourceId },
      {
        kind: "preference",
        content: `${key}: ${sanitizePreferenceValue(value)}`,
        tags: ["preference", key.slice(0, 40)],
        metadata: { key },
      }
    );
    return { ok: true, id: record.id };
  } catch (error) {
    options.logger.warn(
      {
        userId: tenant.userId,
        sourceId: tenant.sourceId,
        message: error instanceof Error ? error.message : String(error),
      },
      "Failed to persist preference to file memory"
    );
    return { ok: false };
  }
}

async function safeGetAgentPrisma(logger: FastifyBaseLogger): Promise<any | null> {
  try {
    return (await getPrismaClient(logger)) as any;
  } catch (error) {
    logger.warn(
      {
        message: error instanceof Error ? error.message : String(error),
      },
      "Preference persistence falling back to file memory"
    );
    return null;
  }
}

export async function createMailAssistantTools(
  tenant: TenantContext,
  options: MailToolOptions
): Promise<ToolsInput> {
  const priorityRules = options.priorityRules ?? [];
  const tools: ToolsInput = {
    searchMail: defineMailTool({
      id: "searchMail",
      description:
        "Answer questions by searching recent mail in the current user's selected mailbox. Always use this before answering mail-specific questions.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(300),
        limit: z.number().int().min(5).max(100).optional(),
        horizonDays: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ query, limit, horizonDays }: any) =>
        answerMailQuestion({
          question: query,
          limit: limit ?? 40,
          horizonDays: horizonDays ?? 14,
          timeZone: options.timeZone,
          priorityRules,
          sourceContext: tenant,
        }),
    }),
    getMailDetail: defineMailTool({
      id: "getMailDetail",
      description:
        "Fetch one mail message by id from the current user's selected mailbox. The returned body is truncated to reduce private data exposure.",
      inputSchema: z.object({
        messageId: z.string().trim().min(1).max(512),
      }),
      execute: async ({ messageId }: any) => {
        const detail = await getMailMessageById(messageId, tenant);
        return {
          ...detail,
          bodyContent: truncateText(detail.bodyContent, MAX_DETAIL_BODY_CHARS),
        };
      },
    }),
    summarizeInbox: defineMailTool({
      id: "summarizeInbox",
      description: "Build a concise digest of the current user's selected inbox.",
      inputSchema: z.object({
        limit: z.number().int().min(5).max(100).optional(),
        horizonDays: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ limit, horizonDays }: any) => {
        const insights = await buildMailInsights(
          limit ?? 40,
          horizonDays ?? 14,
          options.timeZone,
          priorityRules,
          tenant
        );
        return {
          generatedAt: insights.generatedAt,
          horizonDays: insights.horizonDays,
          timeZone: insights.timeZone,
          digest: insights.digest,
          tomorrowDdl: insights.tomorrowDdl.slice(0, 8),
          upcoming: insights.upcoming.slice(0, 12),
          signalsWithoutDate: insights.signalsWithoutDate.slice(0, 8),
        };
      },
    }),
    extractEvents: defineMailTool({
      id: "extractEvents",
      description: "Extract dated event signals from current user's selected mailbox.",
      inputSchema: z.object({
        limit: z.number().int().min(5).max(100).optional(),
        horizonDays: z.number().int().min(1).max(30).optional(),
        type: insightTypeSchema.optional(),
      }),
      execute: async ({ limit, horizonDays, type }: any) => {
        const insights = await buildMailInsights(
          limit ?? 60,
          horizonDays ?? 21,
          options.timeZone,
          priorityRules,
          tenant
        );
        const filterByType = <T extends { type: MailInsightType }>(items: T[]) =>
          type ? items.filter((item) => item.type === type) : items;

        return {
          generatedAt: insights.generatedAt,
          horizonDays: insights.horizonDays,
          timeZone: insights.timeZone,
          tomorrowDdl: filterByType(insights.tomorrowDdl).slice(0, 10),
          upcoming: filterByType(insights.upcoming).slice(0, 20),
          signalsWithoutDate: filterByType(insights.signalsWithoutDate).slice(0, 12),
        };
      },
    }),
    syncCalendar: defineMailTool({
      id: "syncCalendar",
      description:
        "Create an Outlook calendar event for the current user's selected mailbox. Use only after extracting an event and confirming the message id.",
      inputSchema: z.object({
        messageId: z.string().trim().min(1).max(512),
        subject: z.string().trim().min(1).max(320),
        type: insightTypeSchema,
        dueAt: z.string().trim().min(1).max(80),
        dueDateLabel: z.string().trim().max(120).optional(),
        evidence: z.string().trim().max(500).optional(),
        timeZone: z.string().trim().max(80).optional(),
      }),
      execute: async (input: any) => {
        const hasCalendarConnection =
          tenant.connectionType === "microsoft"
            ? Boolean(tenant.microsoftAccountId)
            : Boolean(tenant.connectedAccountId);
        if (!hasCalendarConnection) {
          return {
            ok: false,
            error: "OUTLOOK_NOT_CONNECTED",
            message: "当前邮箱还没有可用的 Outlook connectedAccountId，请先完成邮箱连接/授权。",
          };
        }

        const result = await createCalendarEventFromInsight(
          {
            ...input,
            timeZone: input.timeZone ?? options.timeZone,
          },
          tenant
        );

        return {
          ok: true,
          result,
        };
      },
    }),
    summarizeMailboxHistory: defineMailTool({
      id: "summarizeMailboxHistory",
      description:
        "Start the 30-day mailbox history backfill job. Use when the user asks to summarize, archive, classify, or fully organize older mail.",
      inputSchema: z.object({
        limit: z.number().int().min(30).max(400).optional(),
        windowDays: z.number().int().min(1).max(90).optional(),
      }),
      execute: async ({ limit, windowDays }: any) => {
        if (tenant.isLegacySession || tenant.userId.startsWith("legacy:")) {
          return {
            ok: false,
            error: "KNOWLEDGE_BASE_UNAVAILABLE_FOR_LEGACY_SESSION",
          };
        }

        const { jobId } = await triggerMailSummary({
          userId: tenant.userId,
          sourceId: tenant.sourceId,
          sourceContext: tenant,
          sessionKey: tenant.sessionToken,
          logger: options.logger,
          limit: limit ?? 250,
          ...(typeof windowDays === "number" ? { windowDays } : {}),
        });
        const latestJob = getLatestKnowledgeBaseJob(tenant.userId, tenant.sourceId);

        return {
          ok: true,
          jobId,
          status: latestJob?.status ?? "pending",
          message:
            "旧邮件归纳任务已经启动。你可以继续提问，我会在知识库完成后直接基于归纳结果回答。",
          latestJob: serializeKnowledgeBaseJob(latestJob),
        };
      },
    }),
    knowledgeBaseArtifacts: defineMailTool({
      id: "knowledgeBaseArtifacts",
      description:
        "Inspect the locally exported mailbox knowledge-base artifacts, including subject index, score index, summary corpus, event clusters, and sender profiles.",
      inputSchema: z.object({}),
      execute: async () => {
        const store = await getMailKnowledgeBaseStore(tenant.userId, tenant.sourceId);
        const paths = store.getPaths();
        return {
          ok: true,
          baselineStatus: store.readBaselineStatus(),
          artifacts: [
            { key: "mailIds", label: "邮件标识码清单", path: paths.mailIdsDocPath },
            { key: "subjects", label: "邮件题目索引", path: paths.mailSubjectDocPath, count: store.getAllSubjectIndexes().length },
            { key: "scores", label: "邮件评分索引", path: paths.mailScoreDocPath, count: store.getAllScoreIndexes().length },
            { key: "summaries", label: "邮件总结正文库", path: paths.mailSummaryDocPath, count: store.getAllMails().length },
            { key: "events", label: "事件聚类索引", path: paths.eventDocPath, count: store.getAllEvents().length },
            { key: "senders", label: "发件人画像索引", path: paths.senderDocPath, count: store.getAllPersons().length },
          ],
        };
      },
    }),
    knowledgeBaseStatus: defineMailTool({
      id: "knowledgeBaseStatus",
      description:
        "Check whether the historical mailbox knowledge base is ready, how many mails/events/persons have been indexed, and whether a job is running.",
      inputSchema: z.object({}),
      execute: async () => {
        const store = await getMailKnowledgeBaseStore(tenant.userId, tenant.sourceId);
        const baselineStatus = store.readBaselineStatus();
        const stats = store.getStats();
        const latestJob = getLatestKnowledgeBaseJob(tenant.userId, tenant.sourceId);
        return {
          ok: true,
          ready: Boolean(baselineStatus?.backfillCompleted),
          stats,
          baselineStatus,
          latestJob: serializeKnowledgeBaseJob(latestJob),
        };
      },
    }),
    searchMailKnowledgeBase: defineMailTool({
      id: "searchMailKnowledgeBase",
      description:
        "Search the historical knowledge base built from the mailbox backfill. Prefer this over live inbox search when the user is asking about older mail history.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(300),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ query, limit }: any) => {
        const store = await getMailKnowledgeBaseStore(tenant.userId, tenant.sourceId);
        const baselineStatus = store.readBaselineStatus();
        const matches = await searchKnowledgeBaseMailSummaries(
          tenant.userId,
          tenant.sourceId,
          query,
          limit ?? 8
        );
        return {
          ok: true,
          ready: Boolean(baselineStatus?.backfillCompleted),
          totalIndexedMails: store.getStats().totalMails,
          matches,
        };
      },
    }),
    rememberPreference: defineMailTool({
      id: "rememberPreference",
      description:
        "Store a lightweight preference scoped to the current user and mailbox source. Never store full mail bodies, provider keys, or tokens.",
      inputSchema: z.object({
        key: z.string().trim().min(1).max(120),
        value: z.string().trim().min(1).max(1200),
      }),
      execute: async ({ key, value }: any) => {
        if (tenant.isLegacySession || tenant.userId.startsWith("legacy:")) {
          return {
            ok: false,
            error: "MEMORY_UNAVAILABLE_FOR_LEGACY_SESSION",
          };
        }

        const fileMemory = await appendPreferenceToFileMemory(tenant, options, key, value);
        if (!fileMemory.ok) {
          return {
            ok: false,
            error: "MEMORY_STORE_UNAVAILABLE",
          };
        }

        const prisma = await safeGetAgentPrisma(options.logger);
        if (!prisma?.agentMemory?.upsert) {
          return {
            ok: true,
            key,
            storage: "file",
            memoryId: fileMemory.id,
          };
        }

        try {
          const now = new Date();
          await prisma.agentMemory.upsert({
            where: {
              userId_sourceId_key: {
                userId: tenant.userId,
                sourceId: tenant.sourceId,
                key,
              },
            },
            create: {
              userId: tenant.userId,
              sourceId: tenant.sourceId,
              key,
              value: sanitizePreferenceValue(value),
              kind: "preference",
              tags: [],
              createdAt: now,
              updatedAt: now,
            },
            update: {
              value: sanitizePreferenceValue(value),
              kind: "preference",
              updatedAt: now,
            },
          });

          return {
            ok: true,
            key,
            storage: "file+database",
            memoryId: fileMemory.id,
          };
        } catch (error) {
          options.logger.warn(
            {
              userId: tenant.userId,
              sourceId: tenant.sourceId,
              message: error instanceof Error ? error.message : String(error),
            },
            "Preference persistence mirrored to file memory but database upsert failed"
          );
          return {
            ok: true,
            key,
            storage: "file",
            memoryId: fileMemory.id,
          };
        }
      },
    }),
  };

  return {
    ...tools,
    ...(await loadComposioMastraTools(tenant, options.logger)),
  };
}

async function loadComposioMastraTools(
  tenant: TenantContext,
  logger: FastifyBaseLogger
): Promise<ToolsInput> {
  if (!env.composioApiKey || !tenant.connectedAccountId) {
    return {};
  }

  try {
    const [{ Composio }, { MastraProvider }] = await Promise.all([
      import("@composio/core"),
      import("@composio/mastra"),
    ]);
    const composio = new Composio({
      apiKey: env.composioApiKey,
      baseURL: env.COMPOSIO_PLATFORM_URL,
      provider: new MastraProvider({ strict: true }),
      allowTracking: false,
    });
    const session = await composio.create(tenant.userId, {
      toolkits: ["outlook"],
      connectedAccounts: {
        outlook: tenant.connectedAccountId,
      },
      manageConnections: false,
      tools: {
        outlook: {
          enable: ["OUTLOOK_GET_MESSAGE", "OUTLOOK_LIST_MESSAGES", "OUTLOOK_CREATE_ME_EVENT"],
        },
      },
    });

    return (await session.tools()) as ToolsInput;
  } catch (error) {
    logger.warn(
      {
        userId: tenant.userId,
        sourceId: tenant.sourceId,
        message: error instanceof Error ? error.message : String(error),
      },
      "Failed to load Composio Mastra tools"
    );
    return {};
  }
}
