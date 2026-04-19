import { createHash } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { createClient } from "redis";
import { env } from "./config.js";

export type PersistedAuthSession = {
  expiresAt: number;
  ttlMs: number;
  userId: string | null;
  legacy: boolean;
  user?: {
    id: string;
    email: string;
    displayName: string;
    locale: string;
  } | null;
};

export type RedisAuthSessionStore = {
  enabled: boolean;
  load: (sessionToken: string) => Promise<PersistedAuthSession | null>;
  save: (sessionToken: string, record: PersistedAuthSession) => Promise<void>;
  remove: (sessionToken: string) => Promise<void>;
  markCleared: (sessionToken: string, ttlMs: number) => Promise<void>;
  isCleared: (sessionToken: string) => Promise<boolean>;
  close: () => Promise<void>;
};

type RedisClient = ReturnType<typeof createClient>;

type DestroyableRedisClient = RedisClient & {
  destroy?: () => void;
};

function redisSessionKey(sessionToken: string): string {
  return `${env.REDIS_KEY_PREFIX}:auth_session:${hashSessionToken(sessionToken)}`;
}

function redisSessionTombstoneKey(sessionToken: string): string {
  return `${env.REDIS_KEY_PREFIX}:auth_session_cleared:${hashSessionToken(sessionToken)}`;
}

function legacyRedisSessionKey(sessionToken: string): string {
  return `${env.REDIS_KEY_PREFIX}:auth_session:${sessionToken}`;
}

function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

function parsePersistedAuthSession(payload: string): PersistedAuthSession | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const expiresAt = record.expiresAt;
  const ttlMs = record.ttlMs;
  const userId = record.userId;
  const legacy = record.legacy;
  const user = record.user;
  if (typeof expiresAt !== "number" || !Number.isInteger(expiresAt)) {
    return null;
  }
  if (typeof ttlMs !== "number" || !Number.isInteger(ttlMs) || ttlMs <= 0) {
    return null;
  }
  if (!(typeof userId === "string" || userId === null)) {
    return null;
  }
  if (typeof legacy !== "boolean") {
    return null;
  }
  if (!(user === null || user === undefined || (typeof user === "object" && !Array.isArray(user)))) {
    return null;
  }

  let parsedUser: PersistedAuthSession["user"] = null;
  if (user && typeof user === "object") {
    const userRecord = user as Record<string, unknown>;
    const id = userRecord.id;
    const email = userRecord.email;
    const displayName = userRecord.displayName;
    const locale = userRecord.locale;
    if (
      typeof id !== "string" ||
      typeof email !== "string" ||
      typeof displayName !== "string" ||
      typeof locale !== "string"
    ) {
      return null;
    }
    parsedUser = {
      id,
      email,
      displayName,
      locale,
    };
  }

  return {
    expiresAt,
    ttlMs,
    userId,
    legacy,
    user: parsedUser,
  };
}

function disabledStore(): RedisAuthSessionStore {
  return {
    enabled: false,
    async load() {
      return null;
    },
    async save() {
      return;
    },
    async remove() {
      return;
    },
    async markCleared() {
      return;
    },
    async isCleared() {
      return false;
    },
    async close() {
      return;
    },
  };
}

async function connectRedisClientWithDeadline(client: RedisClient, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Redis auth session store init timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function destroyRedisClient(client: RedisClient): void {
  try {
    (client as DestroyableRedisClient).destroy?.();
  } catch {
    // Ignore forced shutdown errors during failed init.
  }
}

export async function createRedisAuthSessionStore(logger: FastifyBaseLogger): Promise<RedisAuthSessionStore> {
  if (!env.redisAuthSessionsEnabled) {
    logger.info("Redis auth session store disabled via REDIS_AUTH_SESSIONS_ENABLED");
    return disabledStore();
  }

  const client = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
    },
  });

  client.on("error", (error) => {
    logger.warn({ message: error.message }, "Redis auth session store error");
  });

  try {
    await connectRedisClientWithDeadline(client, env.REDIS_CONNECT_TIMEOUT_MS);
    await client.ping();
    logger.info({ redisUrl: env.REDIS_URL }, "Redis auth session store initialized");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ message, redisUrl: env.REDIS_URL }, "Redis auth session store unavailable; fallback to memory");
    try {
      await client.disconnect();
    } catch {
      destroyRedisClient(client);
    }
    return disabledStore();
  }

  const redisClient = client as RedisClient;

  return {
    enabled: true,
    async load(sessionToken: string) {
      const raw = await redisClient.get(redisSessionKey(sessionToken));
      const payload = raw ?? (await redisClient.get(legacyRedisSessionKey(sessionToken)));
      if (!payload) {
        return null;
      }

      const parsed = parsePersistedAuthSession(payload);
      if (!parsed) {
        await redisClient.del([redisSessionKey(sessionToken), legacyRedisSessionKey(sessionToken)]);
        return null;
      }

      return parsed;
    },
    async save(sessionToken: string, record: PersistedAuthSession) {
      const ttlMs = record.expiresAt - Date.now();
      if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
        await redisClient.del(redisSessionKey(sessionToken));
        return;
      }

      const tombstoneExists = (await redisClient.exists(redisSessionTombstoneKey(sessionToken))) > 0;
      if (tombstoneExists) {
        await redisClient.del(redisSessionKey(sessionToken));
        return;
      }

      await redisClient
        .multi()
        .set(redisSessionKey(sessionToken), JSON.stringify(record), {
          PX: Math.max(1000, Math.floor(ttlMs)),
        })
        .del(legacyRedisSessionKey(sessionToken))
        .exec();
    },
    async remove(sessionToken: string) {
      await redisClient.del([redisSessionKey(sessionToken), legacyRedisSessionKey(sessionToken)]);
    },
    async markCleared(sessionToken: string, ttlMs: number) {
      const tombstoneTtlMs = Math.max(1000, Math.floor(ttlMs));
      const key = redisSessionKey(sessionToken);
      const legacyKey = legacyRedisSessionKey(sessionToken);
      const tombstoneKey = redisSessionTombstoneKey(sessionToken);
      await redisClient.multi().set(tombstoneKey, "1", { PX: tombstoneTtlMs }).del([key, legacyKey]).exec();
    },
    async isCleared(sessionToken: string) {
      const exists = await redisClient.exists(redisSessionTombstoneKey(sessionToken));
      return exists > 0;
    },
    async close() {
      try {
        await redisClient.quit();
      } catch {
        // Ignore shutdown errors to avoid blocking Fastify shutdown path.
      }
    },
  };
}
