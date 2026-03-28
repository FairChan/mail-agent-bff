import type { FastifyBaseLogger } from "fastify";

type PrismaClientLike = {
  user: {
    findUnique: (args: { where: { email?: string; id?: string } }) => Promise<{
      id: string;
      email: string;
      displayName: string;
      locale: string;
      passwordSalt: string;
      passwordHash: string;
      createdAt: Date;
      updatedAt: Date;
    } | null>;
    create: (args: {
      data: {
        email: string;
        displayName: string;
        locale: string;
        passwordSalt: string;
        passwordHash: string;
      };
    }) => Promise<{
      id: string;
      email: string;
      displayName: string;
      locale: string;
      passwordSalt: string;
      passwordHash: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    update: (args: {
      where: { id: string };
      data: {
        locale: string;
      };
    }) => Promise<{
      id: string;
      email: string;
      displayName: string;
      locale: string;
      passwordSalt: string;
      passwordHash: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
  };
};

let prismaClientSingleton: PrismaClientLike | null = null;
let prismaInitAttempted = false;

export async function getPrismaClient(logger: FastifyBaseLogger): Promise<PrismaClientLike | null> {
  if (prismaInitAttempted) {
    return prismaClientSingleton;
  }

  prismaInitAttempted = true;
  const enabled = (process.env.PRISMA_AUTH_ENABLED ?? "false").trim().toLowerCase();
  const isEnabled = enabled === "1" || enabled === "true" || enabled === "yes";
  if (!isEnabled) {
    logger.info("Prisma auth store disabled via PRISMA_AUTH_ENABLED");
    return null;
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim().length === 0) {
    throw new Error("Prisma auth store enabled but DATABASE_URL is missing");
  }

  try {
    const { PrismaClient } = await import("@prisma/client");
    const client = new PrismaClient({
      log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
    }) as unknown as PrismaClientLike;

    // Fast fail to avoid hanging first auth request if DB is unreachable.
    await client.user.findUnique({
      where: {
        email: "__prisma_probe_nonexistent__@true-sight.local",
      },
    });

    prismaClientSingleton = client;
    logger.info("Prisma auth store initialized");
    return prismaClientSingleton;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ message }, "Prisma init failed");
    throw new Error(`Prisma auth store initialization failed: ${message}`);
  }
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown };
  return record.code === "P2002";
}
