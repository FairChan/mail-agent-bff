import type { FastifyBaseLogger } from "fastify";
import { createClient, type RedisClientType } from "redis";
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

type RedisClient = RedisClientType<Record<string, never>, Record<string, never>>;

function redisSessionKey(sessionToken: string): string {
  return `${env.REDIS_KEY_PREFIX}:auth_session:${sessionToken}`;
}

function redisSessionTombstoneKey(sessionToken: string): string {
  return `${env.REDIS_KEY_PREFIX}:auth_session_cleared:${sessionToken}`;
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
    await client.connect();
    await client.ping();
    logger.info({ redisUrl: env.REDIS_URL }, "Redis auth session store initialized");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ message, redisUrl: env.REDIS_URL }, "Redis auth session store unavailable; fallback to memory");
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors on failed init.
    }
    return disabledStore();
  }

  const redisClient = client as RedisClient;

  return {
    enabled: true,
    async load(sessionToken: string) {
      const raw = await redisClient.get(redisSessionKey(sessionToken));
      if (!raw) {
        return null;
      }

      const parsed = parsePersistedAuthSession(raw);
      if (!parsed) {
        await redisClient.del(redisSessionKey(sessionToken));
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

      await redisClient.set(redisSessionKey(sessionToken), JSON.stringify(record), {
        PX: Math.max(1000, Math.floor(ttlMs)),
      });
    },
    async remove(sessionToken: string) {
      await redisClient.del(redisSessionKey(sessionToken));
    },
    async markCleared(sessionToken: string, ttlMs: number) {
      const tombstoneTtlMs = Math.max(1000, Math.floor(ttlMs));
      const key = redisSessionKey(sessionToken);
      const tombstoneKey = redisSessionTombstoneKey(sessionToken);
      await redisClient.multi().set(tombstoneKey, "1", { PX: tombstoneTtlMs }).del(key).exec();
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
