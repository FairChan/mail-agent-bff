import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type { MailSourceConnectionType, MailSourceProvider } from "@mail-agent/shared-types";
import { env } from "./config.js";
import {
  isMailSourceConnectionType,
  isMailSourceProvider,
  providerSupportsConnectionType,
} from "./mail-provider-registry.js";
import { deleteImapCredentialForSource } from "./imap-credential-store.js";
import { getPrismaClient } from "./persistence.js";
import { runtimePaths } from "./runtime/paths.js";
import { listJsonFiles, readJsonFile, writeJsonFile } from "./runtime/json-file-store.js";

export type DbMailSourceConnectionType = MailSourceConnectionType;
export type DbMailSourceProvider = MailSourceProvider;

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
  trustedImapConnection?: boolean;
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

type MemoryMailSourceRowSnapshot = {
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
  connectionTrustedAt: string | null;
  connectionTrustSource: string | null;
  connectionTrustDetailsJson: string | null;
  routingVerifiedAt: string | null;
  routingStatusJson: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type FileMailSourceSnapshot = {
  version: 1;
  userId: string;
  activeSourceId: string | null;
  sources: MemoryMailSourceRowSnapshot[];
};

const memoryMailSourcesByUser = new Map<string, Map<string, MemoryMailSourceRow>>();
const memoryActiveMailSourceByUser = new Map<string, string>();
const maxMemoryMailSourceUsers = 5000;
const maxMemoryMailSourcesPerUser = 20;
const mailSourceFileStoreDir = join(runtimePaths.dataDir, "mail-sources");

function fileScopeKey(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

function fileStorePathForUser(userId: string): string {
  return join(mailSourceFileStoreDir, `${fileScopeKey(userId)}.json`);
}

function serializeMemoryRow(row: MemoryMailSourceRow): MemoryMailSourceRowSnapshot {
  return {
    id: row.id,
    externalId: row.externalId,
    userId: row.userId,
    label: row.label,
    provider: row.provider,
    connectionType: row.connectionType,
    emailHint: row.emailHint,
    mailboxUserId: row.mailboxUserId,
    connectedAccountId: row.connectedAccountId,
    microsoftAccountId: row.microsoftAccountId,
    connectionTrustedAt: row.connectionTrustedAt ? row.connectionTrustedAt.toISOString() : null,
    connectionTrustSource: row.connectionTrustSource,
    connectionTrustDetailsJson: row.connectionTrustDetailsJson,
    routingVerifiedAt: row.routingVerifiedAt ? row.routingVerifiedAt.toISOString() : null,
    routingStatusJson: row.routingStatusJson,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function deserializeMemoryRow(row: MemoryMailSourceRowSnapshot): MemoryMailSourceRow | null {
  if (!row?.id || !row.userId || !row.label) {
    return null;
  }

  return {
    id: row.id,
    externalId: row.externalId,
    userId: row.userId,
    label: row.label,
    provider: isProvider(row.provider) ? row.provider : "outlook",
    connectionType: isConnectionType(row.connectionType) ? row.connectionType : "composio",
    emailHint: row.emailHint ?? "",
    mailboxUserId: row.mailboxUserId ?? null,
    connectedAccountId: row.connectedAccountId ?? null,
    microsoftAccountId: row.microsoftAccountId ?? null,
    connectionTrustedAt: row.connectionTrustedAt ? new Date(row.connectionTrustedAt) : null,
    connectionTrustSource: row.connectionTrustSource ?? null,
    connectionTrustDetailsJson: row.connectionTrustDetailsJson ?? null,
    routingVerifiedAt: row.routingVerifiedAt ? new Date(row.routingVerifiedAt) : null,
    routingStatusJson: row.routingStatusJson ?? null,
    enabled: Boolean(row.enabled),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

async function hydrateMemorySourceStoreForUser(userId: string): Promise<void> {
  if (memoryMailSourcesByUser.has(userId)) {
    return;
  }

  const snapshot = await readJsonFile<FileMailSourceSnapshot | null>(
    fileStorePathForUser(userId),
    null
  );
  if (!snapshot || snapshot.userId !== userId || !Array.isArray(snapshot.sources)) {
    return;
  }

  const store = new Map<string, MemoryMailSourceRow>();
  for (const row of snapshot.sources) {
    const parsed = deserializeMemoryRow(row);
    if (parsed) {
      store.set(parsed.id, parsed);
    }
  }

  if (store.size > 0) {
    memoryMailSourcesByUser.set(userId, store);
    enforceMapLimit(memoryMailSourcesByUser, maxMemoryMailSourceUsers);
  }

  const activeSourceId = cleanOptionalText(snapshot.activeSourceId ?? undefined);
  if (activeSourceId) {
    memoryActiveMailSourceByUser.set(userId, activeSourceId);
  }
}

async function persistMemorySourceStoreForUser(userId: string): Promise<void> {
  const store = getMemorySourceStore(userId, false);
  const snapshot: FileMailSourceSnapshot = {
    version: 1,
    userId,
    activeSourceId: cleanOptionalText(memoryActiveMailSourceByUser.get(userId) ?? undefined) ?? null,
    sources: [...store.values()]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map(serializeMemoryRow),
  };

  await writeJsonFile(fileStorePathForUser(userId), snapshot);
}

function cleanOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isConnectionType(value: string): value is DbMailSourceConnectionType {
  return isMailSourceConnectionType(value);
}

function isProvider(value: string): value is DbMailSourceProvider {
  return isMailSourceProvider(value);
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
  const connectionType = isConnectionType(row.connectionType) ? row.connectionType : "composio";
  if (connectionType === "microsoft") {
    return !cleanOptionalText(row.microsoftAccountId);
  }

  if (connectionType === "gmail_oauth") {
    return !cleanOptionalText(row.mailboxUserId);
  }

  if (connectionType === "imap_password") {
    return !cleanOptionalText(row.mailboxUserId);
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
  const provider = isProvider(row.provider) ? row.provider : "outlook";
  return {
    id: row.id,
    name: row.label,
    provider,
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
  trustedImapConnection?: boolean;
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

  if (input.connectionType === "gmail_oauth" && !mailboxUserId) {
    throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
  }

  if (input.connectionType === "imap_password") {
    if (!mailboxUserId) {
      throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
    }
    if (!input.trustedImapConnection) {
      throw new Error("IMAP_CONNECTION_VERIFICATION_REQUIRED");
    }
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
      await hydrateMemorySourceStoreForUser(userId);
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
      await hydrateMemorySourceStoreForUser(userId);
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
      await hydrateMemorySourceStoreForUser(userId);
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

    if (!providerSupportsConnectionType(input.provider, connectionType)) {
      throw new Error("MAIL_SOURCE_PROVIDER_CONNECTION_UNSUPPORTED");
    }

    if (
      connectionType !== "composio" &&
      connectionType !== "microsoft" &&
      connectionType !== "gmail_oauth" &&
      connectionType !== "imap_password"
    ) {
      throw new Error("MAIL_SOURCE_CONNECTION_TYPE_NOT_IMPLEMENTED");
    }

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

    if (connectionType === "gmail_oauth" && !mailboxUserId) {
      throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
    }

    if (connectionType === "imap_password") {
      if (!mailboxUserId) {
        throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
      }
      if (!input.trustedImapConnection) {
        throw new Error("IMAP_CONNECTION_VERIFICATION_REQUIRED");
      }
    }

    if (!prisma) {
      await hydrateMemorySourceStoreForUser(userId);
      const normalized = validateMemorySourceInput({
        connectionType,
        mailboxUserId,
        connectedAccountId,
        microsoftAccountId,
        trustedConnectedAccountId: input.trustedConnectedAccountId,
        trustedImapConnection: input.trustedImapConnection,
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
        connectionTrustSource:
          connectionType === "microsoft"
            ? "microsoft_direct_session"
            : connectionType === "imap_password"
              ? "imap_password_verified"
              : "composio_server_verified",
        connectionTrustDetailsJson: JSON.stringify({
          reason:
            connectionType === "microsoft"
              ? "Owned Microsoft account verified in the current OAuth session"
              : connectionType === "imap_password"
                ? "IMAP mailbox login verified before source creation"
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
      await persistMemorySourceStoreForUser(userId);

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
        connectionTrustSource:
          connectionType === "microsoft"
            ? "microsoft_direct"
            : connectionType === "imap_password"
              ? "imap_password_verified"
              : "composio_server_verified",
        connectionTrustDetailsJson: JSON.stringify({
          reason:
            connectionType === "microsoft"
              ? "Owned Microsoft account verified before source creation"
              : connectionType === "imap_password"
                ? "IMAP mailbox login verified before source creation"
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
      await hydrateMemorySourceStoreForUser(userId);
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
        trustedImapConnection: connectionType === "imap_password" ? sourceConnectionTrusted(current) : false,
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
      await persistMemorySourceStoreForUser(userId);

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

    if (connectionType === "imap_password" && !nextMailboxUserId) {
      throw new Error("MAIL_SOURCE_CONNECTION_REQUIRED");
    }

    const routingContextChanged =
      nextMailboxUserId !== cleanOptionalText(current.mailboxUserId) ||
      nextConnectedAccountId !== cleanOptionalText(current.connectedAccountId) ||
      nextMicrosoftAccountId !== cleanOptionalText(current.microsoftAccountId);
    const shouldTrustConnection =
      connectionType === "microsoft"
        ? microsoftAccountChanged || !sourceConnectionTrusted(current)
        : connectionType === "imap_password"
          ? !sourceConnectionTrusted(current)
          : Boolean(input.trustedConnectedAccountId && (connectedAccountChanged || !sourceConnectionTrusted(current)));
    const trustPatch =
      shouldTrustConnection
        ? {
            connectionTrustedAt: new Date(),
            connectionTrustSource:
              connectionType === "microsoft"
                ? "microsoft_direct"
                : connectionType === "imap_password"
                  ? "imap_password_verified"
                  : "composio_server_verified",
            connectionTrustDetailsJson: JSON.stringify({
              reason:
                connectionType === "microsoft"
                  ? "Owned Microsoft account verified before source update"
                  : connectionType === "imap_password"
                    ? "Existing IMAP mailbox login remains trusted after metadata update"
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
      await hydrateMemorySourceStoreForUser(userId);
      const store = getMemorySourceStore(userId, false);
      if (!store.has(sourceId)) {
        throw new Error("MAIL_SOURCE_NOT_FOUND");
      }
      await deleteImapCredentialForSource(this.logger, userId, sourceId).catch(() => undefined);
      store.delete(sourceId);
      if (memoryActiveMailSourceByUser.get(userId) === sourceId) {
        memoryActiveMailSourceByUser.delete(userId);
        resolveMemoryActiveSourceId(userId);
      }
      pruneEmptyMemorySourceStore(userId);
      await persistMemorySourceStoreForUser(userId);
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

    await deleteImapCredentialForSource(this.logger, userId, current.id).catch(() => undefined);
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
      await hydrateMemorySourceStoreForUser(userId);
      const current = getMemorySourceStore(userId, false).get(sourceId);
      if (!current?.enabled) {
        throw new Error("MAIL_SOURCE_NOT_FOUND");
      }
      memoryActiveMailSourceByUser.set(userId, current.id);
      await persistMemorySourceStoreForUser(userId);
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
      await hydrateMemorySourceStoreForUser(userId);
      const current = getMemorySourceStore(userId, false).get(sourceId);
      if (!current) {
        return;
      }
      current.routingVerifiedAt = new Date(routingStatus.verifiedAt);
      current.routingStatusJson = JSON.stringify(routingStatus);
      current.updatedAt = new Date();
      await persistMemorySourceStoreForUser(userId);
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
      await hydrateMemorySourceStoreForUser(input.userId);
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
      await persistMemorySourceStoreForUser(input.userId);
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

  async upsertGoogleSourceForUser(input: {
    userId: string;
    email: string;
    label?: string;
  }): Promise<DbMailSourceSnapshot & { source: DbMailSourceProfileView }> {
    const prisma = await prismaOrNull(this.logger);
    const mailboxUserId = cleanOptionalText(input.email)?.toLowerCase();
    if (!mailboxUserId) {
      throw new Error("GOOGLE_ACCOUNT_NOT_FOUND");
    }

    const label = cleanOptionalText(input.label) ?? `Gmail ${mailboxUserId}`;

    if (!prisma) {
      await hydrateMemorySourceStoreForUser(input.userId);
      const store = getMemorySourceStore(input.userId, true);
      const existing = [...store.values()].find(
        (row) =>
          row.provider === "gmail" &&
          row.connectionType === "gmail_oauth" &&
          cleanOptionalText(row.mailboxUserId)?.toLowerCase() === mailboxUserId
      );
      const now = new Date();
      const row: MemoryMailSourceRow = existing
        ? {
            ...existing,
            label,
            emailHint: mailboxUserId,
            mailboxUserId,
            connectedAccountId: null,
            microsoftAccountId: null,
            connectionTrustedAt: now,
            connectionTrustSource: "gmail_direct_session",
            connectionTrustDetailsJson: JSON.stringify({
              reason: "Google direct OAuth account reconnected in the current session",
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
            provider: "gmail",
            connectionType: "gmail_oauth",
            emailHint: mailboxUserId,
            mailboxUserId,
            connectedAccountId: null,
            microsoftAccountId: null,
            connectionTrustedAt: now,
            connectionTrustSource: "gmail_direct_session",
            connectionTrustDetailsJson: JSON.stringify({
              reason: "Google direct OAuth account connected in the current session",
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
      await persistMemorySourceStoreForUser(input.userId);
      return {
        ...memorySnapshotForUser(input.userId),
        source: profileFromRow(row),
      };
    }

    const account = await prisma.googleAccount.findFirst({
      where: { userId: input.userId, email: mailboxUserId },
    });
    if (!account) {
      throw new Error("GOOGLE_ACCOUNT_NOT_FOUND");
    }

    const existing = await prisma.mailSource.findFirst({
      where: {
        userId: input.userId,
        provider: "gmail",
        connectionType: "gmail_oauth",
        mailboxUserId,
      },
    });

    const row = existing
      ? await prisma.mailSource.update({
          where: { id: existing.id },
          data: {
            label,
            emailHint: mailboxUserId,
            mailboxUserId,
            connectedAccountId: null,
            microsoftAccountId: null,
            connectionTrustedAt: new Date(),
            connectionTrustSource: "gmail_direct",
            connectionTrustDetailsJson: JSON.stringify({
              reason: "Google direct OAuth account persisted and reconnected",
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
            provider: "gmail",
            connectionType: "gmail_oauth",
            emailHint: mailboxUserId,
            mailboxUserId,
            connectedAccountId: null,
            microsoftAccountId: null,
            connectionTrustedAt: new Date(),
            connectionTrustSource: "gmail_direct",
            connectionTrustDetailsJson: JSON.stringify({
              reason: "Google direct OAuth account persisted and connected",
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

  async listReadyMicrosoftSourcesForBackground(): Promise<Array<{ userId: string; source: DbMailSourceProfileView }>> {
    const prisma = await prismaOrNull(this.logger);
    if (!prisma) {
      const files = await listJsonFiles(mailSourceFileStoreDir);
      const results: Array<{ userId: string; source: DbMailSourceProfileView }> = [];
      for (const fileName of files) {
        const snapshot = await readJsonFile<FileMailSourceSnapshot | null>(
          join(mailSourceFileStoreDir, fileName),
          null
        );
        if (!snapshot?.userId || !Array.isArray(snapshot.sources)) {
          continue;
        }
        for (const row of snapshot.sources) {
          const parsed = deserializeMemoryRow(row);
          if (!parsed) {
            continue;
          }
          const profile = profileFromRow(parsed);
          if (profile.enabled && profile.connectionType === "microsoft" && profile.ready) {
            results.push({ userId: snapshot.userId, source: profile });
          }
        }
      }
      return results;
    }

    const rows = await prisma.mailSource.findMany({
      where: {
        enabled: true,
        connectionType: "microsoft",
        connectionTrustedAt: { not: null },
      },
      orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
    });

    return rows
      .map((row: any) => ({
        userId: row.userId,
        source: profileFromRow(row),
      }))
      .filter((item: { userId: string; source: DbMailSourceProfileView }) => item.source.ready);
  }
}
