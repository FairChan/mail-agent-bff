import { createHash } from "node:crypto";
import { join } from "node:path";
import type { NotificationPreferences } from "@mail-agent/shared-types";
import { readJsonFile, writeJsonFile } from "./runtime/json-file-store.js";
import { runtimePaths } from "./runtime/paths.js";

export type PersistedNotificationPreferences = Required<NotificationPreferences>;

type NotificationPreferencesRecord = {
  version: 1;
  userScope: string;
  sourceId: string;
  preferences: PersistedNotificationPreferences;
  updatedAt: string;
};

const notificationPreferencesDir = join(runtimePaths.dataDir, "notification-preferences");

function notificationPreferenceScopeHash(userId: string, sourceId: string): string {
  return createHash("sha256").update(`mail-notification-preferences:${userId}:${sourceId}`).digest("hex").slice(0, 24);
}

function notificationPreferenceUserScope(userId: string): string {
  return createHash("sha256").update(`mail-notification-preferences-user:${userId}`).digest("hex").slice(0, 16);
}

function notificationPreferencesPath(userId: string, sourceId: string): string {
  return join(notificationPreferencesDir, `${notificationPreferenceScopeHash(userId, sourceId)}.json`);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeHour(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(23, Math.round(value)));
}

function normalizeMinute(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(59, Math.round(value)));
}

function normalizeTimeZone(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return fallback;
  }
}

function normalizeUpdatedAt(value: unknown): string {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

export function normalizeNotificationPreferences(
  value: Partial<NotificationPreferences> | null | undefined,
  fallbackTimeZone = "UTC"
): PersistedNotificationPreferences {
  return {
    urgentPushEnabled: normalizeBoolean(value?.urgentPushEnabled, true),
    dailyDigestEnabled: normalizeBoolean(value?.dailyDigestEnabled, true),
    digestHour: normalizeHour(value?.digestHour, 20),
    digestMinute: normalizeMinute(value?.digestMinute, 0),
    digestTimeZone: normalizeTimeZone(value?.digestTimeZone, fallbackTimeZone),
    updatedAt: normalizeUpdatedAt(value?.updatedAt),
  };
}

function sanitizeRecord(
  raw: NotificationPreferencesRecord | null,
  userId: string,
  sourceId: string,
  fallbackTimeZone?: string
): PersistedNotificationPreferences | null {
  if (!raw || raw.version !== 1 || raw.sourceId !== sourceId) {
    return null;
  }

  const expectedUserScope = notificationPreferenceUserScope(userId);
  if (raw.userScope !== expectedUserScope) {
    return null;
  }

  return normalizeNotificationPreferences(raw.preferences, fallbackTimeZone);
}

export async function getSavedNotificationPreferences(
  userId: string,
  sourceId: string,
  fallbackTimeZone?: string
): Promise<PersistedNotificationPreferences | null> {
  const record = await readJsonFile<NotificationPreferencesRecord | null>(
    notificationPreferencesPath(userId, sourceId),
    null
  );
  return sanitizeRecord(record, userId, sourceId, fallbackTimeZone);
}

export async function saveNotificationPreferences(
  userId: string,
  sourceId: string,
  preferences: Partial<NotificationPreferences>
): Promise<PersistedNotificationPreferences> {
  const normalized = normalizeNotificationPreferences(preferences, preferences.digestTimeZone);
  const record: NotificationPreferencesRecord = {
    version: 1,
    userScope: notificationPreferenceUserScope(userId),
    sourceId,
    preferences: normalized,
    updatedAt: normalized.updatedAt,
  };

  await writeJsonFile(notificationPreferencesPath(userId, sourceId), record);
  return normalized;
}
