import { randomBytes } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { env } from "./config.js";
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
  connectionTrustedAt?: string;
  connectionTrustSource?: string;
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
type MemoryMailSourceRow = {
  id: string;
  externalId: string;
  userId: string;
  label: string;
  provider: DbMailSourceProvider;
  connectionType: DbMailSourceConnectionType;
  emailHint: string;
  mailboxUserId: string | null;
  connectedAccountId: string | null;
  microsoftAccountId: string | null;
  connectionTrustedAt: Date | null;
  connectionTrustSource: string | null;
  connectionTrustDetailsJson: string | null;
  routingVerifiedAt: Date | null;
  routingStatusJson: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const memoryMailSourcesByUser = new Map<string, Map<string, MemoryMailSourceRow>>();
const memoryActiveMailSourceByUser = new Map<string, string>();
const maxMemoryMailSourceUsers = 5000;
const maxMemoryMailSourcesPerUser = 20;

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

function enforceMapLimit<K, V>(map: Map<K, V>, limit: number): void {
  while (map.size > limit) {
    const oldestKey = map.keys().next().value as K | undefined;
    if (oldestKey === undefined) {
      break;
    }
    map.delete(oldestKey);
  }
}

function sourceNeedsConnection(row: any): boolean {
  const connectionType = row.connectionType === "microsoft" ? "microsoft" : "composio";
  if (connectionType === "microsoft") {
    return !cleanOptionalText(row.microsoftAccountId);
  }

  return !cleanOptionalText(row.mailboxUserId) || !cleanOptionalText(row.connectedAccountId);
}

function sourceConnectionTrusted(row: any): boolean {
  return Boolean(row.connectionTrustedAt);
}

function sourceReady(row: any, status: DbMailSourceRoutingStatus | undefined): boolean {
  if (!row.enabled || sourceNeedsConnection(row) || !sourceConnectionTrusted(row)) {
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
    ...(row.connectionTrustedAt instanceof Date ? { connectionTrustedAt: row.connectionTrustedAt.toISOString() } : {}),
    ...(cleanOptionalText(row.connectionTrustSource)
      ? { connectionTrustSource: cleanOptionalText(row.connectionTrustSource) }
      : {}),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    ready: sourceReady(row, routingStatus),
    ...(routingStatus ? { routingStatus } : {}),
  };
}

async function prismaOrNull(logger: FastifyBaseLogger): Promise<PrismaLike | null> {
  const prisma = (await getPrismaClient(logger)) as PrismaLike;
  if (!prisma) {
    if (!env.mailSourceMemoryFallbackEnabled) {
      throw new Error("MAIL_SOURCE_STORE_UNAVAILABLE");
    }
    return null;
  }

  if (!prisma.mailSource || !prisma.user) {
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
  if (!prisma?.microsoftAccount?.findFirst) {
    throw new Error("MICROSOFT_ACCOUNT_STORE_UNAVAILABLE");
  }

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

function getMemorySourceStore(userId: string, createIfMissing: boolean): Map<string, MemoryMailSourceRow> {
  const existing = memoryMailSourcesByUser.get(userId);
  if (existing) {
    return existing;
  }

  if (!createIfMissing) {
    return new Map<string, MemoryMailSourceRow>();
  }

  const created = new Map<string, MemoryMailSourceRow>();
  memoryMailSourcesByUser.set(userId, created);
  enforceMapLimit(memoryMailSourcesByUser, maxMemoryMailSourceUsers);
  return created;
}

function uniqueMemoryExternalIdForUser(userId: string, label: string): string {
  const store = getMemorySourceStore(userId, false);
  let externalId = externalIdFromLabel(label);
  while ([...store.values()].some((row) => row.externalId === externalId)) {
    externalId = externalIdFromLabel(label);
  }
  return externalId;
}

function uniqueMemorySourceId(store: Map<string, MemoryMailSourceRow>, label: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "source";
  let id = `mem_${base}_${randomBytes(3).toString("hex")}`;
  while (store.has(id)) {
    id = `mem_${base}_${randomBytes(3).toString("hex")}`;
  }
  return id;
}

function resolveMemoryActiveSourceId(userId: string): string | null {
  const store = getMemorySourceStore(userId, false);
  const selected = cleanOptionalText(memoryActiveMailSourceByUser.get(userId));
  if (selected && store.get(selected)?.enabled) {
    return selected;
  }

  const fallback =
    [...store.values()]
      .filter((row) => row.enabled)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0]?.id ?? null;
  if (fallback) {
    memoryActiveMailSourceByUser.set(userId, fallback);
  } else {
    memoryActiveMailSourceByUser.delete(userId);
  }
  return fallback;
}

function memorySnapshotForUser(userId: string): DbMailSourceSnapshot {
  const store = getMemorySourceStore(userId, false);
  return {
    sources: [...store.values()]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map(profileFromRow),
    activeSourceId: resolveMemoryActiveSourceId(userId),
  };
}

function pruneEmptyMemorySourceStore(userId: string): void {
  const store = memoryMailSourcesByUser.get(userId);
  if (store && store.size === 0) {
    memoryMailSourcesByUser.delete(userId);
    memoryActiveMailSourceByUser.delete(userId);
  }
}

function validateMemorySourceInput(input: {
  connectionType: DbMailSourceConnectionType;
  mailboxUserId?: string;
  connectedAccountId?: string;
  microsoftAccountId?: string;
  trustedConnectedAccountId?: boolean;
}): {
  mailboxUserId?: string;
  connectedAccountId?: string;
  microsoftAccountId?: string;
} {
  const mailboxUserId = cleanOptionalText(input.mailboxUserId);
  const connectedAccountId = cleanOptionalText(input.connectedAccountId);
  const microsoftAccountId = cleanOptionalText(input.microsoftAccountId);

  if (input.connectionType === "composio") {
    if (!mailboxUserId || !connectedAccountId) {
      throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
    }
    if (!input.trustedConnectedAccountId) {
      throw new Error("COMPOSIO_ACCOUNT_OWNERSHIP_REQUIRED");
    }
  }

  if (input.connectionType === "microsoft" && !microsoftAccountId) {
    throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
  }

  return {
    ...(mailboxUserId ? { mailboxUserId } : {}),
    ...(connectedAccountId ? { connectedAccountId } : {}),
    ...(microsoftAccountId ? { microsoftAccountId } : {}),
  };
}

export class MailSourceService {
  constructor(private readonly logger: FastifyBaseLogger) {}

  async listForUser(userId: string): Promise<DbMailSourceSnapshot> {
    const prisma = await prismaOrNull(this.logger);
    if (!prisma) {
      return memorySnapshotForUser(userId);
    }

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
    const prisma = await prismaOrNull(this.logger);
    if (!prisma) {
      const sourceId = cleanOptionalText(requestedSourceId) ?? resolveMemoryActiveSourceId(userId);
      if (!sourceId) {
        return null;
      }

      const row = getMemorySourceStore(userId, false).get(sourceId);
      return row?.enabled ? profileFromRow(row) : null;
    }

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
    const prisma = await prismaOrNull(this.logger);
    if (!prisma) {
      const row = getMemorySourceStore(userId, false).get(sourceId);
      return row ? profileFromRow(row) : null;
    }

    const row = await prisma.mailSource.findFirst({
      where: { id: sourceId, userId },
    });
    return row ? profileFromRow(row) : null;
  }

  async createForUser(userId: string, input: MailSourceCreateInput): Promise<DbMailSourceSnapshot & { source: DbMailSourceProfileView }> {
    const prisma = await prismaOrNull(this.logger);
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
      if (prisma) {
        await requireOwnedMicrosoftAccount(prisma, userId, microsoftAccountId);
      }
    }

    if (!prisma) {
      const normalized = validateMemorySourceInput({
        connectionType,
        mailboxUserId,
        connectedAccountId,
        microsoftAccountId,
        trustedConnectedAccountId: input.trustedConnectedAccountId,
      });
      const store = getMemorySourceStore(userId, true);
      const now = new Date();
      const row: MemoryMailSourceRow = {
        id: uniqueMemorySourceId(store, label),
        externalId: uniqueMemoryExternalIdForUser(userId, label),
        userId,
        label,
        provider: input.provider,
        connectionType,
        emailHint: cleanOptionalText(input.emailHint) ?? normalized.mailboxUserId ?? normalized.microsoftAccountId ?? "",
        mailboxUserId: normalized.mailboxUserId ?? null,
        connectedAccountId: connectionType === "composio" ? normalized.connectedAccountId ?? null : null,
        microsoftAccountId: connectionType === "microsoft" ? normalized.microsoftAccountId ?? null : null,
        connectionTrustedAt: now,
        connectionTrustSource: connectionType === "microsoft" ? "microsoft_direct_session" : "composio_server_verified",
        connectionTrustDetailsJson: JSON.stringify({
          reason:
            connectionType === "microsoft"
              ? "Owned Microsoft account verified in the current OAuth session"
              : "Composio connected account ownership verified by server flow",
        }),
        routingVerifiedAt: null,
        routingStatusJson: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      store.set(row.id, row);
      enforceMapLimit(store, maxMemoryMailSourcesPerUser);
      if (!resolveMemoryActiveSourceId(userId)) {
        memoryActiveMailSourceByUser.set(userId, row.id);
      }

      return {
        ...memorySnapshotForUser(userId),
        source: profileFromRow(row),
      };
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
        connectionTrustedAt: new Date(),
        connectionTrustSource: connectionType === "microsoft" ? "microsoft_direct" : "composio_server_verified",
        connectionTrustDetailsJson: JSON.stringify({
          reason:
            connectionType === "microsoft"
              ? "Owned Microsoft account verified before source creation"
              : "Composio connected account ownership verified by server flow",
        }),
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
    const prisma = await prismaOrNull(this.logger);
    if (!prisma) {
      const store = getMemorySourceStore(userId, false);
      const current = store.get(input.id);
      if (!current) {
        throw new Error("MAIL_SOURCE_NOT_FOUND");
      }

      const connectionType = isConnectionType(current.connectionType) ? current.connectionType : "composio";
      const nextMailboxUserId =
        input.mailboxUserId !== undefined ? cleanOptionalText(input.mailboxUserId) : cleanOptionalText(current.mailboxUserId ?? undefined);
      const nextConnectedAccountId =
        input.connectedAccountId !== undefined
          ? cleanOptionalText(input.connectedAccountId)
          : cleanOptionalText(current.connectedAccountId ?? undefined);
      const nextMicrosoftAccountId =
        input.microsoftAccountId !== undefined
          ? cleanOptionalText(input.microsoftAccountId)
          : cleanOptionalText(current.microsoftAccountId ?? undefined);
      validateMemorySourceInput({
        connectionType,
        mailboxUserId: nextMailboxUserId,
        connectedAccountId: nextConnectedAccountId,
        microsoftAccountId: nextMicrosoftAccountId,
        trustedConnectedAccountId: input.trustedConnectedAccountId || nextConnectedAccountId === cleanOptionalText(current.connectedAccountId ?? undefined),
      });

      const routingContextChanged =
        nextMailboxUserId !== cleanOptionalText(current.mailboxUserId ?? undefined) ||
        nextConnectedAccountId !== cleanOptionalText(current.connectedAccountId ?? undefined) ||
        nextMicrosoftAccountId !== cleanOptionalText(current.microsoftAccountId ?? undefined);
      const updated: MemoryMailSourceRow = {
        ...current,
        label: input.label ?? input.name ?? current.label,
        emailHint: input.emailHint ?? current.emailHint,
        mailboxUserId: nextMailboxUserId ?? null,
        connectedAccountId: connectionType === "composio" ? nextConnectedAccountId ?? null : null,
        microsoftAccountId: connectionType === "microsoft" ? nextMicrosoftAccountId ?? null : null,
        enabled: input.enabled ?? current.enabled,
        ...(routingContextChanged ? { routingVerifiedAt: null, routingStatusJson: null } : {}),
        updatedAt: new Date(),
      };
      store.set(updated.id, updated);
      if (!updated.enabled && resolveMemoryActiveSourceId(userId) === updated.id) {
        memoryActiveMailSourceByUser.delete(userId);
        resolveMemoryActiveSourceId(userId);
      }

      return {
        ...memorySnapshotForUser(userId),
        source: profileFromRow(updated),
      };
    }

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
    const microsoftAccountChanged = nextMicrosoftAccountId !== cleanOptionalText(current.microsoftAccountId);

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
    const shouldTrustConnection =
      connectionType === "microsoft"
        ? microsoftAccountChanged || !sourceConnectionTrusted(current)
        : Boolean(input.trustedConnectedAccountId && (connectedAccountChanged || !sourceConnectionTrusted(current)));
    const trustPatch =
      shouldTrustConnection
        ? {
            connectionTrustedAt: new Date(),
            connectionTrustSource:
              connectionType === "microsoft" ? "microsoft_direct" : "composio_server_verified",
            connectionTrustDetailsJson: JSON.stringify({
              reason:
                connectionType === "microsoft"
                  ? "Owned Microsoft account verified before source update"
                  : "Composio connected account ownership verified by server flow",
            }),
          }
        : {};

    const row = await prisma.mailSource.update({
      where: { id: current.id },
      data: {
        label: input.label ?? input.name ?? current.label,
        emailHint: input.emailHint ?? current.emailHint,
        mailboxUserId: nextMailboxUserId ?? null,
        connectedAccountId: connectionType === "composio" ? nextConnectedAccountId ?? null : null,
        microsoftAccountId: connectionType === "microsoft" ? nextMicrosoftAccountId ?? null : null,
        enabled: input.enabled ?? current.enabled,
        ...trustPatch,
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
    const prisma = await prismaOrNull(this.logger);
    if (!prisma) {
      const store = getMemorySourceStore(userId, false);
      if (!store.has(sourceId)) {
        throw new Error("MAIL_SOURCE_NOT_FOUND");
      }
      store.delete(sourceId);
      if (memoryActiveMailSourceByUser.get(userId) === sourceId) {
        memoryActiveMailSourceByUser.delete(userId);
        resolveMemoryActiveSourceId(userId);
      }
      pruneEmptyMemorySourceStore(userId);
      return {
        ...memorySnapshotForUser(userId),
        id: sourceId,
        deleted: true,
      };
    }

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
    const prisma = await prismaOrNull(this.logger);
    if (!prisma) {
      const current = getMemorySourceStore(userId, false).get(sourceId);
      if (!current?.enabled) {
        throw new Error("MAIL_SOURCE_NOT_FOUND");
      }
      memoryActiveMailSourceByUser.set(userId, current.id);
      return memorySnapshotForUser(userId);
    }

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
    const prisma = await prismaOrNull(this.logger);
    if (!prisma) {
      const current = getMemorySourceStore(userId, false).get(sourceId);
      if (!current) {
        return;
      }
      current.routingVerifiedAt = new Date(routingStatus.verifiedAt);
      current.routingStatusJson = JSON.stringify(routingStatus);
      current.updatedAt = new Date();
      return;
    }

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
    const prisma = await prismaOrNull(this.logger);
    if (!prisma) {
      const mailboxUserId = cleanOptionalText(input.mailboxUserIdHint) ?? "me";
      const label =
        cleanOptionalText(input.label) ??
        (cleanOptionalText(input.email)
          ? `Outlook ${cleanOptionalText(input.email)}`
          : `Outlook ${cleanOptionalText(input.displayName) ?? input.accountId.slice(0, 8)}`);
      const store = getMemorySourceStore(input.userId, true);
      const existing = [...store.values()].find(
        (row) =>
          row.provider === "outlook" &&
          row.connectionType === "microsoft" &&
          row.microsoftAccountId === input.accountId
      );
      const now = new Date();
      const row: MemoryMailSourceRow = existing
        ? {
            ...existing,
            label,
            emailHint: cleanOptionalText(input.email) ?? mailboxUserId,
            mailboxUserId,
            connectedAccountId: null,
            microsoftAccountId: input.accountId,
            connectionTrustedAt: now,
            connectionTrustSource: "microsoft_direct_session",
            connectionTrustDetailsJson: JSON.stringify({
              reason: "Microsoft direct OAuth account reconnected in the current session",
            }),
            routingVerifiedAt: null,
            routingStatusJson: null,
            enabled: true,
            updatedAt: now,
          }
        : {
            id: uniqueMemorySourceId(store, label),
            externalId: uniqueMemoryExternalIdForUser(input.userId, label),
            userId: input.userId,
            label,
            provider: "outlook",
            connectionType: "microsoft",
            emailHint: cleanOptionalText(input.email) ?? mailboxUserId,
            mailboxUserId,
            connectedAccountId: null,
            microsoftAccountId: input.accountId,
            connectionTrustedAt: now,
            connectionTrustSource: "microsoft_direct_session",
            connectionTrustDetailsJson: JSON.stringify({
              reason: "Microsoft direct OAuth account connected in the current session",
            }),
            routingVerifiedAt: null,
            routingStatusJson: null,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          };
      store.set(row.id, row);
      enforceMapLimit(store, maxMemoryMailSourcesPerUser);
      memoryActiveMailSourceByUser.set(input.userId, row.id);
      return {
        ...memorySnapshotForUser(input.userId),
        source: profileFromRow(row),
      };
    }

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
            connectionTrustedAt: new Date(),
            connectionTrustSource: "microsoft_direct",
            connectionTrustDetailsJson: JSON.stringify({
              reason: "Microsoft direct OAuth account persisted and reconnected",
            }),
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
            connectionTrustedAt: new Date(),
            connectionTrustSource: "microsoft_direct",
            connectionTrustDetailsJson: JSON.stringify({
              reason: "Microsoft direct OAuth account persisted and connected",
            }),
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
