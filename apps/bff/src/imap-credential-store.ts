import { createHash } from "node:crypto";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { decryptSecret, encryptSecret } from "./secret-box.js";
import { getPrismaClient } from "./persistence.js";
import { runtimePaths } from "./runtime/paths.js";
import { readJsonFile, writeJsonFile } from "./runtime/json-file-store.js";

export type ImapCredentialInput = {
  userId: string;
  sourceId: string;
  username: string;
  host: string;
  port: number;
  secure: boolean;
  password: string;
};

export type ImapCredential = ImapCredentialInput;

type FileImapCredentialRecord = Omit<ImapCredentialInput, "password"> & {
  kind: "imap_password";
  secretCiphertext: string;
  createdAt: string;
  updatedAt: string;
};

type FileImapCredentialSnapshot = {
  version: 1;
  records: FileImapCredentialRecord[];
};

type PrismaLike = any;

const imapCredentialDir = join(runtimePaths.dataDir, "mail-source-credentials");
const fallbackLogger = console as unknown as FastifyBaseLogger;

function fileScopeKey(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

function fileStorePathForUser(userId: string): string {
  return join(imapCredentialDir, `${fileScopeKey(userId)}.json`);
}

async function prismaOrNull(logger: FastifyBaseLogger): Promise<PrismaLike | null> {
  const prisma = (await getPrismaClient(logger)) as PrismaLike;
  if (!prisma?.mailSourceCredential) {
    return null;
  }
  return prisma;
}

async function readFileSnapshot(userId: string): Promise<FileImapCredentialSnapshot> {
  const snapshot = await readJsonFile<FileImapCredentialSnapshot | null>(
    fileStorePathForUser(userId),
    null
  );
  if (!snapshot || !Array.isArray(snapshot.records)) {
    return { version: 1, records: [] };
  }
  return {
    version: 1,
    records: snapshot.records.filter(
      (record) => record.userId === userId && record.kind === "imap_password"
    ),
  };
}

export async function saveImapCredential(
  loggerOrInput: FastifyBaseLogger | ImapCredentialInput,
  maybeInput?: ImapCredentialInput
): Promise<void> {
  const logger = maybeInput ? (loggerOrInput as FastifyBaseLogger) : fallbackLogger;
  const input = maybeInput ?? (loggerOrInput as ImapCredentialInput);
  const encrypted = encryptSecret(input.password);
  const prisma = await prismaOrNull(logger);
  if (prisma) {
    await prisma.mailSourceCredential.upsert({
      where: { sourceId: input.sourceId },
      update: {
        userId: input.userId,
        kind: "imap_password",
        username: input.username,
        host: input.host,
        port: input.port,
        secure: input.secure,
        secretCiphertext: encrypted,
      },
      create: {
        userId: input.userId,
        sourceId: input.sourceId,
        kind: "imap_password",
        username: input.username,
        host: input.host,
        port: input.port,
        secure: input.secure,
        secretCiphertext: encrypted,
      },
    });
    return;
  }

  const snapshot = await readFileSnapshot(input.userId);
  const now = new Date().toISOString();
  const records = snapshot.records.filter((record) => record.sourceId !== input.sourceId);
  records.push({
    userId: input.userId,
    sourceId: input.sourceId,
    kind: "imap_password",
    username: input.username,
    host: input.host,
    port: input.port,
    secure: input.secure,
    secretCiphertext: encrypted,
    createdAt: now,
    updatedAt: now,
  });
  await writeJsonFile(fileStorePathForUser(input.userId), { version: 1, records });
}

export async function getImapCredentialForSource(
  loggerOrUserId: FastifyBaseLogger | string,
  userIdOrSourceId: string,
  maybeSourceId?: string
): Promise<ImapCredential | null> {
  const logger = maybeSourceId ? (loggerOrUserId as FastifyBaseLogger) : fallbackLogger;
  const userId = maybeSourceId ? userIdOrSourceId : (loggerOrUserId as string);
  const sourceId = maybeSourceId ?? userIdOrSourceId;
  const prisma = await prismaOrNull(logger);
  if (prisma) {
    const record = await prisma.mailSourceCredential.findFirst({
      where: {
        userId,
        sourceId,
        kind: "imap_password",
      },
    });
    if (!record) {
      return null;
    }
    return {
      userId,
      sourceId,
      username: record.username,
      host: record.host,
      port: record.port,
      secure: Boolean(record.secure),
      password: decryptSecret(record.secretCiphertext),
    };
  }

  const snapshot = await readFileSnapshot(userId);
  const record = snapshot.records.find((item) => item.sourceId === sourceId);
  if (!record) {
    return null;
  }
  return {
    userId,
    sourceId,
    username: record.username,
    host: record.host,
    port: record.port,
    secure: Boolean(record.secure),
    password: decryptSecret(record.secretCiphertext),
  };
}

export async function deleteImapCredentialForSource(
  loggerOrUserId: FastifyBaseLogger | string,
  userIdOrSourceId: string,
  maybeSourceId?: string
): Promise<void> {
  const logger = maybeSourceId ? (loggerOrUserId as FastifyBaseLogger) : fallbackLogger;
  const userId = maybeSourceId ? userIdOrSourceId : (loggerOrUserId as string);
  const sourceId = maybeSourceId ?? userIdOrSourceId;
  const prisma = await prismaOrNull(logger);
  if (prisma) {
    await prisma.mailSourceCredential.deleteMany({
      where: {
        userId,
        sourceId,
        kind: "imap_password",
      },
    });
    return;
  }

  const snapshot = await readFileSnapshot(userId);
  const records = snapshot.records.filter((item) => item.sourceId !== sourceId);
  if (records.length === snapshot.records.length) {
    return;
  }
  await writeJsonFile(fileStorePathForUser(userId), { version: 1, records });
}
