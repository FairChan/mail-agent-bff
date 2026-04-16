import { TextEncoder } from "node:util";
import type { FastifyBaseLogger } from "fastify";
import type { MailQuadrant } from "./mail.js";

// ---------------------------------------------------------------------------
// Minimal internal logger
// ---------------------------------------------------------------------------

const _log = {
  _enabled: false,
  info(msg: object, ctx: string) {
    if (this._enabled) console.info("[email-persistence]", ctx, msg);
  },
  warn(msg: object, ctx: string) {
    if (this._enabled) console.warn("[email-persistence]", ctx, msg);
  },
  error(msg: object, ctx: string) {
    if (this._enabled) console.error("[email-persistence]", ctx, msg);
  },
  enable() {
    this._enabled = true;
  },
};

function log() {
  return _log;
}

// ---------------------------------------------------------------------------
// Prisma client types
// ---------------------------------------------------------------------------

type PrismaStoredEmailRecord = {
  id: string;
  sourceId: string;
  userId: string;
  subject: string;
  fromName: string | null;
  fromAddress: string | null;
  bodyPreview: string | null;
  bodyContent: string | null;
  receivedAt: Date;
  importance: string;
  isRead: boolean;
  hasAttachments: boolean;
  webLink: string | null;
  aiSummary: string | null;
  aiSummaryLocale: string | null;
  aiSummaryAt: Date | null;
  quadrant: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaMailSourceRecord = {
  id: string;
  userId: string;
};

type PrismaFullClient = {
  storedEmail: {
    upsert: (args: {
      where: { sourceId_id: { sourceId: string; id: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<PrismaStoredEmailRecord>;
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
      take?: number;
      skip?: number;
      select?: Record<string, unknown>;
    }) => Promise<PrismaStoredEmailRecord[]>;
    findUnique: (args: {
      where: { sourceId_id: { sourceId: string; id: string } };
    }) => Promise<PrismaStoredEmailRecord | null>;
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
  mailSource: {
    findMany: (args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => Promise<PrismaMailSourceRecord[]>;
  };
};

let emailPrismaClient: PrismaFullClient | null = null;
let emailPrismaInitAttempted = false;

/**
 * Initialize the email persistence Prisma client.
 * Call once from server.ts during startup with the Fastify logger.
 */
export async function initEmailPersistence(logger: FastifyBaseLogger): Promise<PrismaFullClient | null> {
  if (emailPrismaInitAttempted) {
    return emailPrismaClient;
  }
  emailPrismaInitAttempted = true;

  const enabled = (process.env.ENABLE_EMAIL_PERSISTENCE ?? "false").trim().toLowerCase();
  const isEnabled = enabled === "1" || enabled === "true" || enabled === "yes";
  if (!isEnabled) {
    logger.info("Email persistence disabled via ENABLE_EMAIL_PERSISTENCE");
    return null;
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim().length === 0) {
    logger.warn("Email persistence enabled but DATABASE_URL is missing — disabling");
    return null;
  }

  try {
    const { PrismaClient } = await import("@prisma/client");
    const client = new PrismaClient({
      log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
    }) as unknown as PrismaFullClient;

    // Fast-fail probe
    await client.mailSource.findMany({ where: {}, select: { id: true, userId: true } });
    emailPrismaClient = client;
    _log.enable();
    logger.info("Email persistence Prisma client initialized");
    return emailPrismaClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ message }, "Email persistence Prisma init failed — disabling");
    return null;
  }
}

/**
 * Returns the initialized Prisma client. Returns null if not initialized or disabled.
 */
export function getEmailPrismaClient(): PrismaFullClient | null {
  return emailPrismaClient;
}

// ---------------------------------------------------------------------------
// Outlook message shape (mirrors mail.ts)
// ---------------------------------------------------------------------------

type OutlookAddress = {
  emailAddress?: {
    address?: string;
    name?: string;
  };
};

export type OutlookMessage = {
  id?: string;
  subject?: string;
  from?: OutlookAddress;
  bodyPreview?: string;
  receivedDateTime?: string;
  importance?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  webLink?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
};

// ---------------------------------------------------------------------------
// Stored email types (returned to callers)
// ---------------------------------------------------------------------------

export type StoredEmailRecord = {
  id: string;
  sourceId: string;
  userId: string;
  subject: string;
  fromName: string | null;
  fromAddress: string | null;
  bodyPreview: string | null;
  bodyContent: string | null;
  receivedAt: string;
  importance: string;
  isRead: boolean;
  hasAttachments: boolean;
  webLink: string | null;
  aiSummary: string | null;
  aiSummaryLocale: string | null;
  aiSummaryAt: string | null;
  quadrant: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredEmailQueryOptions = {
  limit?: number;
  offset?: number;
  quadrant?: MailQuadrant | null;
  aiSummaryLocale?: string | null;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// R-6: 按字节截断而非按字符截断，兼容中文/emoji 等多字节字符
function truncateByBytes(input: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(input).length <= maxBytes) {
    return input;
  }

  let low = 0;
  let high = input.length;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const slice = input.slice(0, mid);
    if (encoder.encode(slice).length <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return input.slice(0, low);
}

const MAX_BODY_CONTENT_BYTES = 10 * 1024;

function messageToUpsertData(
  sourceId: string,
  userId: string,
  message: OutlookMessage,
  quadrant?: MailQuadrant | null
): Record<string, unknown> {
  const fromAddress = message.from?.emailAddress?.address?.trim() || null;
  const fromName = message.from?.emailAddress?.name?.trim() || null;
  const bodyContent =
    message.body?.content ? truncateByBytes(message.body.content, MAX_BODY_CONTENT_BYTES) : null;
  const receivedAt = message.receivedDateTime ? new Date(message.receivedDateTime) : new Date();

  return {
    sourceId,
    userId,
    subject: (message.subject?.trim() || "(No Subject)").slice(0, 500),
    fromName,
    fromAddress: fromAddress ? fromAddress.slice(0, 320) : null,
    bodyPreview: (message.bodyPreview?.trim() || "").slice(0, 500),
    bodyContent,
    receivedAt,
    importance: (message.importance || "normal").slice(0, 20),
    isRead: message.isRead ?? false,
    hasAttachments: message.hasAttachments ?? false,
    webLink: (message.webLink?.trim() || null)?.slice(0, 1000),
    quadrant: quadrant ?? null,
  };
}

function storedEmailToRecord(r: PrismaStoredEmailRecord): StoredEmailRecord {
  return {
    id: r.id,
    sourceId: r.sourceId,
    userId: r.userId,
    subject: r.subject,
    fromName: r.fromName,
    fromAddress: r.fromAddress,
    bodyPreview: r.bodyPreview,
    bodyContent: r.bodyContent,
    receivedAt: r.receivedAt.toISOString(),
    importance: r.importance,
    isRead: r.isRead,
    hasAttachments: r.hasAttachments,
    webLink: r.webLink,
    aiSummary: r.aiSummary,
    aiSummaryLocale: r.aiSummaryLocale,
    aiSummaryAt: r.aiSummaryAt?.toISOString() ?? null,
    quadrant: r.quadrant,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upsert a single email into the database. Returns the stored record.
 */
export async function upsertEmail(
  sourceId: string,
  userId: string,
  message: OutlookMessage,
  quadrant?: MailQuadrant | null
): Promise<StoredEmailRecord | null> {
  const client = getEmailPrismaClient();
  if (!client) return null;

  const id = (message.id?.trim() || "").slice(0, 200);
  if (!id) return null;

  const data = messageToUpsertData(sourceId, userId, message, quadrant);

  try {
    const record = await client.storedEmail.upsert({
      where: { sourceId_id: { sourceId, id } },
      create: { id, ...data },
      update: data,
    });
    return storedEmailToRecord(record);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log().error({ message: msg, sourceId, id }, "upsertEmail failed");
    return null;
  }
}

/**
 * Batch upsert multiple emails. Returns count of upserted records.
 */
export async function upsertEmailBatch(
  sourceId: string,
  userId: string,
  messages: OutlookMessage[],
  quadrantFn?: (msg: OutlookMessage) => MailQuadrant | null
): Promise<number> {
  const client = getEmailPrismaClient();
  if (!client) return 0;

  let count = 0;
  for (const message of messages) {
    const quadrant = quadrantFn ? quadrantFn(message) : undefined;
    const result = await upsertEmail(sourceId, userId, message, quadrant);
    if (result) count++;
  }
  return count;
}

/**
 * Query stored emails with pagination and optional filters.
 */
export async function getStoredEmails(
  sourceId: string,
  userId: string,
  options: StoredEmailQueryOptions = {}
): Promise<{ items: StoredEmailRecord[]; total: number }> {
  const client = getEmailPrismaClient();
  if (!client) return { items: [], total: 0 };

  const { limit = 20, offset = 0, quadrant = null, aiSummaryLocale = null } = options;

  const where: Record<string, unknown> = { sourceId, userId };
  if (quadrant !== null) where.quadrant = quadrant;
  if (aiSummaryLocale !== null) where.aiSummaryLocale = aiSummaryLocale;

  const [items, total] = await Promise.all([
    client.storedEmail.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    client.storedEmail.count({ where }),
  ]);

  return { items: items.map(storedEmailToRecord), total };
}

/**
 * Get a single stored email by its message ID.
 */
export async function getStoredEmailById(
  sourceId: string,
  userId: string,
  messageId: string
): Promise<StoredEmailRecord | null> {
  const client = getEmailPrismaClient();
  if (!client) return null;

  const record = await client.storedEmail.findUnique({
    where: { sourceId_id: { sourceId, id: messageId } },
  });

  if (!record || record.userId !== userId) return null;
  return storedEmailToRecord(record);
}

/**
 * Update the AI summary for a stored email.
 */
export async function updateEmailAiSummary(
  sourceId: string,
  messageId: string,
  summary: string,
  locale: string
): Promise<boolean> {
  const client = getEmailPrismaClient();
  if (!client) return false;

  try {
    const result = await client.storedEmail.updateMany({
      where: { sourceId_id: { sourceId, id: messageId } },
      data: {
        aiSummary: summary.slice(0, 500),
        aiSummaryLocale: locale,
        aiSummaryAt: new Date(),
      },
    });
    return result.count > 0;
  } catch {
    return false;
  }
}

/**
 * Update the quadrant for a stored email.
 */
export async function updateEmailQuadrant(
  sourceId: string,
  messageId: string,
  quadrant: MailQuadrant
): Promise<boolean> {
  const client = getEmailPrismaClient();
  if (!client) return false;

  try {
    const result = await client.storedEmail.updateMany({
      where: { sourceId_id: { sourceId, id: messageId } },
      data: { quadrant },
    });
    return result.count > 0;
  } catch {
    return false;
  }
}

/**
 * Find emails that haven't had an AI summary generated yet (for the given locale).
 */
export async function getEmailsNeedingAiSummary(
  sourceId: string,
  locale: string,
  limit = 16
): Promise<StoredEmailRecord[]> {
  const client = getEmailPrismaClient();
  if (!client) return [];

  const items = await client.storedEmail.findMany({
    where: {
      sourceId,
      OR: [
        { aiSummaryLocale: null },
        { aiSummaryLocale: { not: locale } },
      ],
    },
    orderBy: { receivedAt: "desc" },
    take: Math.min(limit, 100),
  });

  return items.map(storedEmailToRecord);
}

/**
 * Given a list of known message IDs, return the ones not yet stored.
 */
export async function getNewEmailIds(
  sourceId: string,
  knownIds: string[]
): Promise<string[]> {
  const client = getEmailPrismaClient();
  if (!client || knownIds.length === 0) return knownIds;

  const existingIds = new Set<string>();
  const CHUNK = 100;

  for (let i = 0; i < knownIds.length; i += CHUNK) {
    const chunk = knownIds.slice(i, i + CHUNK);
    const records = await client.storedEmail.findMany({
      where: { sourceId, id: { in: chunk } },
      select: { id: true },
    });
    for (const r of records) existingIds.add(r.id);
  }

  return knownIds.filter((id) => !existingIds.has(id));
}

/**
 * Get IDs of all stored emails for a source (up to limit, newest first).
 */
export async function getAllStoredEmailIds(
  sourceId: string,
  limit = 500
): Promise<string[]> {
  const client = getEmailPrismaClient();
  if (!client) return [];

  const records = await client.storedEmail.findMany({
    where: { sourceId },
    select: { id: true },
    orderBy: { receivedAt: "desc" },
    take: Math.min(limit, 1000),
  });

  return records.map((r) => r.id);
}

/**
 * Batch-update AI summaries for multiple emails.
 */
export async function batchUpdateAiSummaries(
  updates: Array<{ messageId: string; sourceId: string; summary: string; locale: string }>
): Promise<number> {
  if (updates.length === 0) return 0;
  let count = 0;
  for (const u of updates) {
    const ok = await updateEmailAiSummary(u.sourceId, u.messageId, u.summary, u.locale);
    if (ok) count++;
  }
  return count;
}

/**
 * Get all active (enabled) mail sources from the DB.
 * Used by the sync worker.
 */
export async function getActiveMailSources(): Promise<Array<{ sourceId: string; userId: string }>> {
  const client = getEmailPrismaClient();
  if (!client) return [];

  const sources = await client.mailSource.findMany({
    where: { enabled: true },
    select: { id: true, userId: true },
  });

  return sources.map((s) => ({ sourceId: s.id, userId: s.userId }));
}
