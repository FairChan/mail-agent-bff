import { randomBytes } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { getPrismaClient } from "./persistence.js";

export type DbMailSourceConnectionType = "composio" | "microsoft";
export type DbMailSourceProvider = "outlook";

export type DbMailSourceRoutingCheckStatus = "skipped" | "verified" | "failed" | "unverifiable";
export type DbMailSourceRoutingCheckResult = {
  required: boolean;
  status: DbMailSourceRoutingCheckStatus;
  verified: boolean;
  message: string;
};
export type DbMailSourceRoutingStatus = {
  verifiedAt: string;
  routingVerified: boolean;
  failFast: boolean;
  message: string;
  mailbox: DbMailSourceRoutingCheckResult;
  connectedAccount: DbMailSourceRoutingCheckResult;
};
export type DbMailSourceProfile = {
  id: string;
  name: string;
  provider: DbMailSourceProvider;
  connectionType?: DbMailSourceConnectionType;
  microsoftAccountId?: string;
  emailHint: string;
  mailboxUserId?: string;
  connectedAccountId?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
export type DbMailSourceProfileView = DbMailSourceProfile & {
  ready: boolean;
  routingStatus?: DbMailSourceRoutingStatus;
};

export type DbMailSourceSnapshot = {
  sources: DbMailSourceProfileView[];
  activeSourceId: string | null;
};

export type MailSourceCreateInput = {
  label: string;
  provider: DbMailSourceProvider;
  connectionType: DbMailSourceConnectionType;
  emailHint?: string;
  mailboxUserId?: string;
  connectedAccountId?: string;
  microsoftAccountId?: string;
  trustedConnectedAccountId?: boolean;
};

export type MailSourceUpdateInput = {
  id: string;
  name?: string;
  label?: string;
  emailHint?: string;
  mailboxUserId?: string;
  connectedAccountId?: string;
  microsoftAccountId?: string;
  enabled?: boolean;
  trustedConnectedAccountId?: boolean;
};

type PrismaLike = any;

function cleanOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isConnectionType(value: string): value is DbMailSourceConnectionType {
  return value === "composio" || value === "microsoft";
}

function parseRoutingStatus(raw: string | null | undefined): DbMailSourceRoutingStatus | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as DbMailSourceRoutingStatus;
    if (
      typeof parsed?.verifiedAt === "string" &&
      typeof parsed?.routingVerified === "boolean" &&
      typeof parsed?.failFast === "boolean" &&
      parsed.mailbox &&
      parsed.connectedAccount
    ) {
      return parsed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function sourceNeedsConnection(row: any): boolean {
  const connectionType = row.connectionType === "microsoft" ? "microsoft" : "composio";
  if (connectionType === "microsoft") {
    return !cleanOptionalText(row.microsoftAccountId);
  }

  return !cleanOptionalText(row.mailboxUserId) || !cleanOptionalText(row.connectedAccountId);
}

function sourceReady(row: any, status: DbMailSourceRoutingStatus | undefined): boolean {
  if (!row.enabled || sourceNeedsConnection(row)) {
    return false;
  }

  return Boolean(status?.routingVerified && !status.failFast);
}

function profileFromRow(row: any): DbMailSourceProfileView {
  const routingStatus = parseRoutingStatus(row.routingStatusJson);
  const connectionType = isConnectionType(row.connectionType) ? row.connectionType : "composio";
  return {
    id: row.id,
    name: row.label,
    provider: row.provider === "outlook" ? "outlook" : "outlook",
    connectionType,
    ...(cleanOptionalText(row.microsoftAccountId) ? { microsoftAccountId: cleanOptionalText(row.microsoftAccountId) } : {}),
    emailHint: row.emailHint ?? "",
    ...(cleanOptionalText(row.mailboxUserId) ? { mailboxUserId: cleanOptionalText(row.mailboxUserId) } : {}),
    ...(cleanOptionalText(row.connectedAccountId) ? { connectedAccountId: cleanOptionalText(row.connectedAccountId) } : {}),
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    ready: sourceReady(row, routingStatus),
    ...(routingStatus ? { routingStatus } : {}),
  };
}

async function prismaOrThrow(logger: FastifyBaseLogger): Promise<PrismaLike> {
  const prisma = (await getPrismaClient(logger)) as PrismaLike;
  if (!prisma?.mailSource || !prisma?.user) {
    throw new Error("MAIL_SOURCE_STORE_UNAVAILABLE");
  }

  return prisma;
}

function externalIdFromLabel(label: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "source";
  return `${base}_${randomBytes(3).toString("hex")}`;
}

async function uniqueExternalIdForUser(prisma: PrismaLike, userId: string, label: string): Promise<string> {
  let externalId = externalIdFromLabel(label);
  while (await prisma.mailSource.findFirst({ where: { userId, externalId }, select: { id: true } })) {
    externalId = externalIdFromLabel(label);
  }
  return externalId;
}

async function requireOwnedMicrosoftAccount(prisma: PrismaLike, userId: string, accountId: string): Promise<void> {
  const account = await prisma.microsoftAccount.findFirst({
    where: { userId, accountId },
    select: { accountId: true },
  });
  if (!account) {
    throw new Error("MICROSOFT_ACCOUNT_NOT_FOUND");
  }
}

async function selectFallbackActiveSourceId(prisma: PrismaLike, userId: string): Promise<string | null> {
  const fallback = await prisma.mailSource.findFirst({
    where: { userId, enabled: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

async function setActiveSourceId(prisma: PrismaLike, userId: string, sourceId: string | null): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { activeMailSourceId: sourceId },
  });
}

async function resolveActiveSourceId(prisma: PrismaLike, userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeMailSourceId: true },
  });
  const activeSourceId = cleanOptionalText(user?.activeMailSourceId);
  if (activeSourceId) {
    const active = await prisma.mailSource.findFirst({
      where: { id: activeSourceId, userId, enabled: true },
      select: { id: true },
    });
    if (active) {
      return active.id;
    }
  }

  const fallbackId = await selectFallbackActiveSourceId(prisma, userId);
  if (fallbackId !== activeSourceId) {
    await setActiveSourceId(prisma, userId, fallbackId);
  }
  return fallbackId;
}

export class MailSourceService {
  constructor(private readonly logger: FastifyBaseLogger) {}

  async listForUser(userId: string): Promise<DbMailSourceSnapshot> {
    const prisma = await prismaOrThrow(this.logger);
    const [rows, activeSourceId] = await Promise.all([
      prisma.mailSource.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      resolveActiveSourceId(prisma, userId),
    ]);

    return {
      sources: rows.map(profileFromRow),
      activeSourceId,
    };
  }

  async resolveForUser(userId: string, requestedSourceId?: string): Promise<DbMailSourceProfileView | null> {
    const prisma = await prismaOrThrow(this.logger);
    const sourceId = cleanOptionalText(requestedSourceId) ?? (await resolveActiveSourceId(prisma, userId));
    if (!sourceId) {
      return null;
    }

    const row = await prisma.mailSource.findFirst({
      where: { id: sourceId, userId, enabled: true },
    });
    return row ? profileFromRow(row) : null;
  }

  async getOwnedSource(userId: string, sourceId: string): Promise<DbMailSourceProfileView | null> {
    const prisma = await prismaOrThrow(this.logger);
    const row = await prisma.mailSource.findFirst({
      where: { id: sourceId, userId },
    });
    return row ? profileFromRow(row) : null;
  }

  async createForUser(userId: string, input: MailSourceCreateInput): Promise<DbMailSourceSnapshot & { source: DbMailSourceProfileView }> {
    const prisma = await prismaOrThrow(this.logger);
    const label = input.label.trim();
    const connectionType = input.connectionType;
    const mailboxUserId = cleanOptionalText(input.mailboxUserId);
    const connectedAccountId = cleanOptionalText(input.connectedAccountId);
    const microsoftAccountId = cleanOptionalText(input.microsoftAccountId);

    if (connectionType === "composio") {
      if (!mailboxUserId || !connectedAccountId) {
        throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
      }
      if (!input.trustedConnectedAccountId) {
        throw new Error("COMPOSIO_ACCOUNT_OWNERSHIP_REQUIRED");
      }
    }

    if (connectionType === "microsoft") {
      if (!microsoftAccountId) {
        throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
      }
      await requireOwnedMicrosoftAccount(prisma, userId, microsoftAccountId);
    }

    const externalId = await uniqueExternalIdForUser(prisma, userId, label);

    const row = await prisma.mailSource.create({
      data: {
        externalId,
        userId,
        label,
        provider: input.provider,
        connectionType,
        emailHint: cleanOptionalText(input.emailHint) ?? mailboxUserId ?? "",
        mailboxUserId: mailboxUserId ?? null,
        connectedAccountId: connectionType === "composio" ? connectedAccountId ?? null : null,
        microsoftAccountId: connectionType === "microsoft" ? microsoftAccountId ?? null : null,
        enabled: true,
      },
    });

    const currentActive = await resolveActiveSourceId(prisma, userId);
    if (!currentActive) {
      await setActiveSourceId(prisma, userId, row.id);
    }

    const snapshot = await this.listForUser(userId);
    return {
      ...snapshot,
      source: profileFromRow(row),
    };
  }

  async updateForUser(userId: string, input: MailSourceUpdateInput): Promise<DbMailSourceSnapshot & { source: DbMailSourceProfileView }> {
    const prisma = await prismaOrThrow(this.logger);
    const current = await prisma.mailSource.findFirst({
      where: { id: input.id, userId },
    });
    if (!current) {
      throw new Error("MAIL_SOURCE_NOT_FOUND");
    }

    const nextMailboxUserId =
      input.mailboxUserId !== undefined ? cleanOptionalText(input.mailboxUserId) : cleanOptionalText(current.mailboxUserId);
    const nextConnectedAccountId =
      input.connectedAccountId !== undefined
        ? cleanOptionalText(input.connectedAccountId)
        : cleanOptionalText(current.connectedAccountId);
    const nextMicrosoftAccountId =
      input.microsoftAccountId !== undefined
        ? cleanOptionalText(input.microsoftAccountId)
        : cleanOptionalText(current.microsoftAccountId);
    const connectionType = isConnectionType(current.connectionType) ? current.connectionType : "composio";
    const connectedAccountChanged = nextConnectedAccountId !== cleanOptionalText(current.connectedAccountId);

    if (connectionType === "composio") {
      if (!nextMailboxUserId || !nextConnectedAccountId) {
        throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
      }
      if (connectedAccountChanged && !input.trustedConnectedAccountId) {
        throw new Error("COMPOSIO_ACCOUNT_OWNERSHIP_REQUIRED");
      }
    }

    if (connectionType === "microsoft") {
      if (!nextMicrosoftAccountId) {
        throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
      }
      await requireOwnedMicrosoftAccount(prisma, userId, nextMicrosoftAccountId);
    }

    const routingContextChanged =
      nextMailboxUserId !== cleanOptionalText(current.mailboxUserId) ||
      nextConnectedAccountId !== cleanOptionalText(current.connectedAccountId) ||
      nextMicrosoftAccountId !== cleanOptionalText(current.microsoftAccountId);

    const row = await prisma.mailSource.update({
      where: { id: current.id },
      data: {
        label: input.label ?? input.name ?? current.label,
        emailHint: input.emailHint ?? current.emailHint,
        mailboxUserId: nextMailboxUserId ?? null,
        connectedAccountId: connectionType === "composio" ? nextConnectedAccountId ?? null : null,
        microsoftAccountId: connectionType === "microsoft" ? nextMicrosoftAccountId ?? null : null,
        enabled: input.enabled ?? current.enabled,
        ...(routingContextChanged ? { routingVerifiedAt: null, routingStatusJson: null } : {}),
      },
    });

    if (!row.enabled) {
      const activeId = await resolveActiveSourceId(prisma, userId);
      if (activeId === row.id) {
        await setActiveSourceId(prisma, userId, await selectFallbackActiveSourceId(prisma, userId));
      }
    }

    const snapshot = await this.listForUser(userId);
    return {
      ...snapshot,
      source: profileFromRow(row),
    };
  }

  async deleteForUser(userId: string, sourceId: string): Promise<DbMailSourceSnapshot & { deleted: true; id: string }> {
    const prisma = await prismaOrThrow(this.logger);
    const current = await prisma.mailSource.findFirst({
      where: { id: sourceId, userId },
      select: { id: true },
    });
    if (!current) {
      throw new Error("MAIL_SOURCE_NOT_FOUND");
    }

    await prisma.mailSource.delete({ where: { id: current.id } });
    const fallbackId = await selectFallbackActiveSourceId(prisma, userId);
    await setActiveSourceId(prisma, userId, fallbackId);
    return {
      ...(await this.listForUser(userId)),
      id: current.id,
      deleted: true,
    };
  }

  async selectForUser(userId: string, sourceId: string): Promise<DbMailSourceSnapshot> {
    const prisma = await prismaOrThrow(this.logger);
    const current = await prisma.mailSource.findFirst({
      where: { id: sourceId, userId, enabled: true },
      select: { id: true },
    });
    if (!current) {
      throw new Error("MAIL_SOURCE_NOT_FOUND");
    }

    await setActiveSourceId(prisma, userId, current.id);
    return this.listForUser(userId);
  }

  async saveRoutingStatus(userId: string, sourceId: string, routingStatus: DbMailSourceRoutingStatus): Promise<void> {
    const prisma = await prismaOrThrow(this.logger);
    await prisma.mailSource.updateMany({
      where: { id: sourceId, userId },
      data: {
        routingVerifiedAt: new Date(routingStatus.verifiedAt),
        routingStatusJson: JSON.stringify(routingStatus),
      },
    });
  }

  async upsertMicrosoftSourceForUser(input: {
    userId: string;
    accountId: string;
    label?: string;
    email?: string;
    displayName?: string;
    mailboxUserIdHint?: string;
  }): Promise<DbMailSourceSnapshot & { source: DbMailSourceProfileView }> {
    const prisma = await prismaOrThrow(this.logger);
    const account = await prisma.microsoftAccount.findFirst({
      where: { userId: input.userId, accountId: input.accountId },
    });
    if (!account) {
      throw new Error("MICROSOFT_ACCOUNT_NOT_FOUND");
    }

    const mailboxUserId = cleanOptionalText(input.mailboxUserIdHint) ?? cleanOptionalText(account.mailboxUserIdHint) ?? "me";
    const label =
      cleanOptionalText(input.label) ??
      (cleanOptionalText(input.email ?? account.email)
        ? `Outlook ${cleanOptionalText(input.email ?? account.email)}`
        : `Outlook ${cleanOptionalText(input.displayName ?? account.displayName) ?? input.accountId.slice(0, 8)}`);

    const existing = await prisma.mailSource.findFirst({
      where: {
        userId: input.userId,
        provider: "outlook",
        connectionType: "microsoft",
        microsoftAccountId: input.accountId,
      },
    });

    const row = existing
      ? await prisma.mailSource.update({
          where: { id: existing.id },
          data: {
            label,
            emailHint: cleanOptionalText(input.email ?? account.email) ?? mailboxUserId,
            mailboxUserId,
            connectedAccountId: null,
            microsoftAccountId: input.accountId,
            enabled: true,
            routingVerifiedAt: null,
            routingStatusJson: null,
          },
        })
      : await prisma.mailSource.create({
          data: {
            externalId: await uniqueExternalIdForUser(prisma, input.userId, label),
            userId: input.userId,
            label,
            provider: "outlook",
            connectionType: "microsoft",
            emailHint: cleanOptionalText(input.email ?? account.email) ?? mailboxUserId,
            mailboxUserId,
            connectedAccountId: null,
            microsoftAccountId: input.accountId,
            enabled: true,
          },
        });

    await setActiveSourceId(prisma, input.userId, row.id);
    return {
      ...(await this.listForUser(input.userId)),
      source: profileFromRow(row),
    };
  }
}
