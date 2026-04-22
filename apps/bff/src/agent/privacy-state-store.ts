import type { FastifyBaseLogger } from "fastify";
import { env } from "../config.js";
import { getPrismaClient } from "../persistence.js";
import {
  createPrivacyScope,
  type MailPrivacyScope,
  type MailPrivacyScopeSnapshot,
  type MailPrivacyScopeKind,
} from "../mail-privacy.js";
import { decryptSecret, encryptSecret } from "../secret-box.js";
import type { TenantContext } from "./types.js";

const agentPrivacyStateTtlMs = 7 * 24 * 60 * 60 * 1000;

type AgentPrivacyStateRow = {
  threadId: string;
  userId: string;
  sourceId: string;
  keyVersion: string;
  ciphertext: string;
  expiresAt: Date;
};

async function getPrivacyPrisma(logger: FastifyBaseLogger): Promise<any | null> {
  try {
    return (await getPrismaClient(logger)) as any;
  } catch (error) {
    logger.warn(
      {
        message: error instanceof Error ? error.message : String(error),
      },
      "Agent privacy state store unavailable; using ephemeral scope"
    );
    return null;
  }
}

async function cleanupExpiredRows(logger: FastifyBaseLogger): Promise<void> {
  const prisma = await getPrivacyPrisma(logger);
  if (!prisma?.agentPrivacyState?.deleteMany) {
    return;
  }

  try {
    await prisma.agentPrivacyState.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  } catch (error) {
    logger.warn(
      {
        message: error instanceof Error ? error.message : String(error),
      },
      "Failed to clean expired agent privacy states"
    );
  }
}

export async function loadAgentPrivacyScope(
  logger: FastifyBaseLogger,
  tenant: TenantContext,
  threadId: string,
  kind: MailPrivacyScopeKind = "agent_thread"
): Promise<MailPrivacyScope | null> {
  if (!env.mailPrivacyEnabled) {
    return null;
  }

  const prisma = await getPrivacyPrisma(logger);
  if (!prisma?.agentPrivacyState?.findUnique) {
    return createPrivacyScope({
      kind,
      scopeId: threadId,
      userId: tenant.userId,
      sourceId: tenant.sourceId,
    });
  }

  await cleanupExpiredRows(logger);

  const row = (await prisma.agentPrivacyState.findUnique({
    where: { threadId },
  })) as AgentPrivacyStateRow | null;

  if (!row || row.userId !== tenant.userId || row.sourceId !== tenant.sourceId) {
    return createPrivacyScope({
      kind,
      scopeId: threadId,
      userId: tenant.userId,
      sourceId: tenant.sourceId,
    });
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return createPrivacyScope({
      kind,
      scopeId: threadId,
      userId: tenant.userId,
      sourceId: tenant.sourceId,
    });
  }

  try {
    const snapshot = JSON.parse(decryptSecret(row.ciphertext)) as MailPrivacyScopeSnapshot;
    return createPrivacyScope({
      kind,
      scopeId: threadId,
      userId: tenant.userId,
      sourceId: tenant.sourceId,
      snapshot,
    });
  } catch (error) {
    logger.warn(
      {
        threadId,
        userId: tenant.userId,
        sourceId: tenant.sourceId,
        message: error instanceof Error ? error.message : String(error),
      },
      "Failed to load persisted agent privacy state, resetting thread scope"
    );
    return createPrivacyScope({
      kind,
      scopeId: threadId,
      userId: tenant.userId,
      sourceId: tenant.sourceId,
    });
  }
}

export async function saveAgentPrivacyScope(
  logger: FastifyBaseLogger,
  scope: MailPrivacyScope | null
): Promise<void> {
  if (!env.mailPrivacyEnabled || !scope) {
    return;
  }

  const snapshot = scope.snapshot();
  if (!scope.isDirty() && snapshot.mappings.length === 0) {
    return;
  }

  const prisma = await getPrivacyPrisma(logger);
  if (!prisma?.agentPrivacyState?.upsert) {
    return;
  }

  const expiresAt = new Date(Date.now() + agentPrivacyStateTtlMs);

  try {
    await prisma.agentPrivacyState.upsert({
      where: { threadId: snapshot.scopeId },
      create: {
        threadId: snapshot.scopeId,
        userId: snapshot.userId,
        sourceId: snapshot.sourceId,
        keyVersion: snapshot.keyVersion,
        ciphertext: encryptSecret(JSON.stringify(snapshot)),
        expiresAt,
      },
      update: {
        userId: snapshot.userId,
        sourceId: snapshot.sourceId,
        keyVersion: snapshot.keyVersion,
        ciphertext: encryptSecret(JSON.stringify(snapshot)),
        expiresAt,
      },
    });
  } catch (error) {
    logger.warn(
      {
        threadId: snapshot.scopeId,
        userId: snapshot.userId,
        sourceId: snapshot.sourceId,
        message: error instanceof Error ? error.message : String(error),
      },
      "Failed to persist agent privacy state; continuing with ephemeral scope"
    );
  }
}
