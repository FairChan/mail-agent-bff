import { createTool } from "@mastra/core/tools";
import type { ToolsInput } from "@mastra/core/agent";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import {
  answerMailQuestion,
  buildMailInsights,
  createCalendarEventFromInsight,
  getMailMessageById,
  type MailInsightType,
  type MailPriorityRule,
} from "../mail.js";
import { getPrismaClient } from "../persistence.js";
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
};

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function sanitizePreferenceValue(value: string): string {
  return truncateText(value.trim(), 1200);
}

export async function createMailAssistantTools(
  tenant: TenantContext,
  options: MailToolOptions
): Promise<ToolsInput> {
  const priorityRules = options.priorityRules ?? [];
  const tools: ToolsInput = {
    searchMail: createTool({
      id: "searchMail",
      description:
        "Answer questions by searching recent mail in the current user's selected mailbox. Always use this before answering mail-specific questions.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(300),
        limit: z.number().int().min(5).max(100).optional(),
        horizonDays: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ query, limit, horizonDays }) =>
        answerMailQuestion({
          question: query,
          limit: limit ?? 40,
          horizonDays: horizonDays ?? 14,
          timeZone: options.timeZone,
          priorityRules,
          sourceContext: tenant,
        }),
    }),
    getMailDetail: createTool({
      id: "getMailDetail",
      description:
        "Fetch one mail message by id from the current user's selected mailbox. The returned body is truncated to reduce private data exposure.",
      inputSchema: z.object({
        messageId: z.string().trim().min(1).max(512),
      }),
      execute: async ({ messageId }) => {
        const detail = await getMailMessageById(messageId, tenant);
        return {
          ...detail,
          bodyContent: truncateText(detail.bodyContent, MAX_DETAIL_BODY_CHARS),
        };
      },
    }),
    summarizeInbox: createTool({
      id: "summarizeInbox",
      description: "Build a concise digest of the current user's selected inbox.",
      inputSchema: z.object({
        limit: z.number().int().min(5).max(100).optional(),
        horizonDays: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ limit, horizonDays }) => {
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
    extractEvents: createTool({
      id: "extractEvents",
      description: "Extract dated event signals from current user's selected mailbox.",
      inputSchema: z.object({
        limit: z.number().int().min(5).max(100).optional(),
        horizonDays: z.number().int().min(1).max(30).optional(),
        type: insightTypeSchema.optional(),
      }),
      execute: async ({ limit, horizonDays, type }) => {
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
    syncCalendar: createTool({
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
      execute: async (input) => {
        if (!tenant.connectedAccountId) {
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
    rememberPreference: createTool({
      id: "rememberPreference",
      description:
        "Store a lightweight preference scoped to the current user and mailbox source. Never store full mail bodies, provider keys, or tokens.",
      inputSchema: z.object({
        key: z.string().trim().min(1).max(120),
        value: z.string().trim().min(1).max(1200),
      }),
      execute: async ({ key, value }) => {
        if (tenant.isLegacySession || tenant.userId.startsWith("legacy:")) {
          return {
            ok: false,
            error: "MEMORY_UNAVAILABLE_FOR_LEGACY_SESSION",
          };
        }

        const prisma = (await getPrismaClient(options.logger)) as any;
        if (!prisma?.agentMemory?.upsert) {
          return {
            ok: false,
            error: "MEMORY_STORE_UNAVAILABLE",
          };
        }

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
            createdAt: now,
            updatedAt: now,
          },
          update: {
            value: sanitizePreferenceValue(value),
            updatedAt: now,
          },
        });

        return {
          ok: true,
          key,
        };
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
