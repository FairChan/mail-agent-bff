import { createHash, randomUUID } from "node:crypto";
import { mkdir, appendFile, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env } from "../config.js";
import { runtimePaths } from "./paths.js";

export type MemoryScope = {
  userId: string;
  sourceId?: string;
};

export type AgentMemoryKind = "interaction" | "fact" | "preference" | "incident";

export type AgentMemoryRecord = {
  id: string;
  kind: AgentMemoryKind;
  content: string;
  createdAt: string;
  sourceId?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
};

type MemorySnapshot = {
  recent: AgentMemoryRecord[];
  longTerm: AgentMemoryRecord[];
};

function hashScope(scope: MemoryScope): string {
  return createHash("sha256")
    .update(`${scope.userId}::${scope.sourceId ?? "default"}`)
    .digest("hex")
    .slice(0, 24);
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function filePaths(scope: MemoryScope) {
  const scopedDir = join(runtimePaths.dataDir, "memory", hashScope(scope));
  return {
    scopedDir,
    recent: join(scopedDir, "recent.json"),
    longTerm: join(scopedDir, "long-term.json"),
    daily: join(scopedDir, "daily", `${todayDateKey()}.md`),
    incidents: join(scopedDir, "incidents.jsonl"),
  };
}

async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function readMemoryFile(path: string): Promise<AgentMemoryRecord[]> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is AgentMemoryRecord => {
      return Boolean(
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string" &&
        typeof (item as Record<string, unknown>).content === "string" &&
        typeof (item as Record<string, unknown>).kind === "string"
      );
    });
  } catch {
    return [];
  }
}

async function writeMemoryFile(path: string, records: AgentMemoryRecord[]): Promise<void> {
  await ensureParent(path);
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

function scoreRecord(record: AgentMemoryRecord, query: string): number {
  const haystack = `${record.content} ${record.tags.join(" ")} ${record.kind}`.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += token.length >= 4 ? 3 : 1;
    }
  }

  return score;
}

export class FileMemoryStore {
  private readonly maxEntries: number;
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(maxEntries = env.agentMemoryMaxEntries) {
    this.maxEntries = maxEntries;
  }

  private async withScopeLock<T>(scope: MemoryScope, operation: () => Promise<T>): Promise<T> {
    const key = hashScope(scope);
    const previous = this.writeQueues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.writeQueues.set(key, previous.then(() => current));
    await previous;

    try {
      return await operation();
    } finally {
      release();
      if (this.writeQueues.get(key) === current) {
        this.writeQueues.delete(key);
      }
    }
  }

  async append(scope: MemoryScope, input: {
    kind: AgentMemoryKind;
    content: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<AgentMemoryRecord> {
    return this.withScopeLock(scope, async () => {
      const record: AgentMemoryRecord = {
        id: randomUUID(),
        kind: input.kind,
        content: input.content.trim(),
        createdAt: new Date().toISOString(),
        ...(scope.sourceId ? { sourceId: scope.sourceId } : {}),
        tags: input.tags?.filter((item) => item.trim().length > 0) ?? [],
        ...(input.metadata ? { metadata: input.metadata } : {}),
      };

      const paths = filePaths(scope);
      const recent = await readMemoryFile(paths.recent);
      const nextRecent = [record, ...recent].slice(0, this.maxEntries);
      await writeMemoryFile(paths.recent, nextRecent);

      if (record.kind === "fact" || record.kind === "preference") {
        const longTerm = await readMemoryFile(paths.longTerm);
        const nextLongTerm = [record, ...longTerm].slice(0, Math.max(50, Math.floor(this.maxEntries / 2)));
        await writeMemoryFile(paths.longTerm, nextLongTerm);
      }

      await ensureParent(paths.daily);
      const sourceLabel = scope.sourceId ? ` source=${scope.sourceId}` : "";
      await appendFile(
        paths.daily,
        `- [${record.createdAt}] kind=${record.kind}${sourceLabel}: ${record.content}\n`,
        "utf8"
      );

      if (record.kind === "incident") {
        await ensureParent(paths.incidents);
        await appendFile(paths.incidents, `${JSON.stringify(record)}\n`, "utf8");
      }

      return record;
    });
  }

  async recent(scope: MemoryScope, limit = 8): Promise<AgentMemoryRecord[]> {
    const paths = filePaths(scope);
    const recent = await readMemoryFile(paths.recent);
    return recent.slice(0, Math.max(1, limit));
  }

  async recall(scope: MemoryScope, query: string, limit = 5): Promise<AgentMemoryRecord[]> {
    const paths = filePaths(scope);
    const snapshot: MemorySnapshot = {
      recent: await readMemoryFile(paths.recent),
      longTerm: await readMemoryFile(paths.longTerm),
    };

    const unique = new Map<string, AgentMemoryRecord>();
    for (const record of [...snapshot.longTerm, ...snapshot.recent]) {
      unique.set(record.id, record);
    }

    return Array.from(unique.values())
      .map((record) => ({ record, score: scoreRecord(record, query) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.record.createdAt.localeCompare(left.record.createdAt))
      .slice(0, Math.max(1, limit))
      .map((item) => item.record);
  }
}

export function createMemoryStore(): FileMemoryStore {
  return new FileMemoryStore();
}
