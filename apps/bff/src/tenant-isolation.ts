import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { runtimePaths } from "./runtime/paths.js";

export type TenantAuditOutcome = "success" | "failure" | "denied";

export type TenantAuditEvent = {
  tenantId: string;
  actorUserId?: string | null;
  sourceId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: TenantAuditOutcome;
  requestId?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  sessionHash?: string | null;
  metadata?: Record<string, unknown>;
};

export type PersistedTenantAuditEvent = TenantAuditEvent & {
  id: string;
  at: string;
  outcome: TenantAuditOutcome;
};

const auditDirName = "audit-log";
const maxMetadataDepth = 5;

export function stableScopeHash(value: string, length = 24): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

export function personalTenantIdForUser(userId: string): string {
  return `personal_${stableScopeHash(`user:${userId}`, 24)}`;
}

export function tenantScopedRouteKey(input: {
  base: string;
  sessionToken?: string | null;
  userId?: string | null;
  sourceId?: string | null;
}): string {
  const userScope = input.userId?.trim()
    ? `tenant:${personalTenantIdForUser(input.userId)}`
    : input.sessionToken?.trim()
      ? `session:${stableScopeHash(`session:${input.sessionToken}`, 20)}`
      : "anon";
  const sourceScope = input.sourceId?.trim() ? `:source:${stableScopeHash(input.sourceId, 12)}` : "";
  return `${input.base}:${userScope}${sourceScope}`;
}

export function hashNetworkIdentifier(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? stableScopeHash(`network:${trimmed}`, 20) : null;
}

export function publicMailKbArtifactPath(filename: string): string {
  return `mail-kb://documents/${filename}`;
}

export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > maxMetadataDepth) {
    return "[truncated]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return value.length > 512 ? `${value.slice(0, 512)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeAuditMetadata(item, depth + 1));
  }
  if (typeof value !== "object") {
    return String(value);
  }

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveAuditKey(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeAuditMetadata(raw, depth + 1);
  }
  return output;
}

export function appendTenantAuditEvent(
  event: TenantAuditEvent,
  logger?: FastifyBaseLogger | null
): PersistedTenantAuditEvent | null {
  const tenantId = event.tenantId.trim();
  if (!tenantId) {
    return null;
  }

  const now = new Date();
  const persisted: PersistedTenantAuditEvent = {
    ...event,
    id: stableScopeHash(`${tenantId}:${event.action}:${event.resourceType}:${now.toISOString()}:${randomUUID()}`, 32),
    at: now.toISOString(),
    tenantId,
    outcome: event.outcome ?? "success",
    ...(event.metadata ? { metadata: sanitizeAuditMetadata(event.metadata) as Record<string, unknown> } : {}),
  };

  const filePath = tenantAuditLogPath(tenantId, now);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, `${JSON.stringify(persisted)}\n`, "utf-8");
    return persisted;
  } catch (error) {
    logger?.warn(
      {
        tenantId,
        action: event.action,
        resourceType: event.resourceType,
        message: error instanceof Error ? error.message : String(error),
      },
      "Tenant audit log write failed"
    );
    return null;
  }
}

export function readTenantAuditEvents(tenantId: string, limit: number): PersistedTenantAuditEvent[] {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const now = new Date();
  const months = [0, 1, 2].map((offset) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)));
  const events: PersistedTenantAuditEvent[] = [];

  for (const month of months) {
    const filePath = tenantAuditLogPath(tenantId, month);
    if (!existsSync(filePath)) {
      continue;
    }
    const lines = readFileSync(filePath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .reverse();
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as PersistedTenantAuditEvent);
      } catch {
        // Ignore malformed audit lines rather than failing the whole audit view.
      }
      if (events.length >= safeLimit) {
        return events;
      }
    }
  }

  return events;
}

function tenantAuditLogPath(tenantId: string, date: Date): string {
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return join(runtimePaths.dataDir, auditDirName, stableScopeHash(tenantId, 24), `${month}.jsonl`);
}

function isSensitiveAuditKey(key: string): boolean {
  return /(token|secret|password|ciphertext|api[-_]?key|authorization|cookie|credential|refresh|access)/i.test(key);
}
