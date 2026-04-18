import { createHash } from "node:crypto";
import { join } from "node:path";
import { runtimePaths } from "./runtime/paths.js";
import { listJsonFiles, readJsonFile, writeJsonFile } from "./runtime/json-file-store.js";

export type OutlookSyncMode = "poll" | "webhook" | "hybrid";

export type OutlookSyncState = {
  userId: string;
  sourceId: string;
  microsoftAccountId: string;
  mailboxUserId: string;
  connectionType: "microsoft";
  label: string;
  emailHint: string;
  timeZone: string | null;
  enabled: boolean;
  mode: OutlookSyncMode;
  initializedAt: string;
  updatedAt: string;
  subscriptionId: string | null;
  clientState: string | null;
  resource: string;
  notificationUrl: string | null;
  lifecycleNotificationUrl: string | null;
  subscriptionExpirationDateTime: string | null;
  subscriptionStatus: "idle" | "active" | "expiring" | "needs_recreate" | "disabled" | "error";
  deltaLink: string | null;
  nextDeltaLink: string | null;
  lastDeltaSyncAt: string | null;
  lastWebhookAt: string | null;
  lastProcessingAt: string | null;
  lastSeenMessageId: string | null;
  lastSeenReceivedDateTime: string | null;
  lastError: string | null;
  dirtyReason: string | null;
};

type OutlookSyncSnapshot = {
  version: 1;
  state: OutlookSyncState;
};

const storeDir = join(runtimePaths.dataDir, "outlook-sync");
const writeQueues = new Map<string, Promise<void>>();

function stateKey(userId: string, sourceId: string): string {
  return createHash("sha256").update(`${userId}::${sourceId}`).digest("hex").slice(0, 24);
}

function statePath(userId: string, sourceId: string): string {
  return join(storeDir, `${stateKey(userId, sourceId)}.json`);
}

async function withStateLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  writeQueues.set(key, previous.then(() => current));
  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (writeQueues.get(key) === current) {
      writeQueues.delete(key);
    }
  }
}

export function createOutlookSyncState(input: {
  userId: string;
  sourceId: string;
  microsoftAccountId: string;
  mailboxUserId: string;
  label: string;
  emailHint: string;
  timeZone?: string | null;
  enabled?: boolean;
  mode?: OutlookSyncMode;
}): OutlookSyncState {
  const now = new Date().toISOString();
  return {
    userId: input.userId,
    sourceId: input.sourceId,
    microsoftAccountId: input.microsoftAccountId,
    mailboxUserId: input.mailboxUserId,
    connectionType: "microsoft",
    label: input.label,
    emailHint: input.emailHint,
    timeZone: input.timeZone ?? null,
    enabled: input.enabled ?? true,
    mode: input.mode ?? "poll",
    initializedAt: now,
    updatedAt: now,
    subscriptionId: null,
    clientState: null,
    resource: "/me/mailFolders('inbox')/messages",
    notificationUrl: null,
    lifecycleNotificationUrl: null,
    subscriptionExpirationDateTime: null,
    subscriptionStatus: input.enabled === false ? "disabled" : "idle",
    deltaLink: null,
    nextDeltaLink: null,
    lastDeltaSyncAt: null,
    lastWebhookAt: null,
    lastProcessingAt: null,
    lastSeenMessageId: null,
    lastSeenReceivedDateTime: null,
    lastError: null,
    dirtyReason: "initial_sync",
  };
}

export async function getOutlookSyncState(
  userId: string,
  sourceId: string
): Promise<OutlookSyncState | null> {
  const snapshot = await readJsonFile<OutlookSyncSnapshot | null>(statePath(userId, sourceId), null);
  return snapshot?.state ?? null;
}

export async function saveOutlookSyncState(state: OutlookSyncState): Promise<OutlookSyncState> {
  const key = `${state.userId}:${state.sourceId}`;
  return withStateLock(key, async () => {
    const next: OutlookSyncState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(statePath(state.userId, state.sourceId), {
      version: 1,
      state: next,
    } satisfies OutlookSyncSnapshot);
    return next;
  });
}

export async function updateOutlookSyncState(
  userId: string,
  sourceId: string,
  mutate: (current: OutlookSyncState | null) => OutlookSyncState
): Promise<OutlookSyncState> {
  const key = `${userId}:${sourceId}`;
  return withStateLock(key, async () => {
    const current = await getOutlookSyncState(userId, sourceId);
    const next = {
      ...mutate(current),
      updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(statePath(userId, sourceId), {
      version: 1,
      state: next,
    } satisfies OutlookSyncSnapshot);
    return next;
  });
}

export async function listOutlookSyncStates(): Promise<OutlookSyncState[]> {
  const files = await listJsonFiles(storeDir);
  const states: OutlookSyncState[] = [];
  for (const fileName of files) {
    const snapshot = await readJsonFile<OutlookSyncSnapshot | null>(join(storeDir, fileName), null);
    if (snapshot?.state) {
      states.push(snapshot.state);
    }
  }
  return states.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

export async function findOutlookSyncStateBySubscriptionId(
  subscriptionId: string
): Promise<OutlookSyncState | null> {
  const states = await listOutlookSyncStates();
  return states.find((state) => state.subscriptionId === subscriptionId) ?? null;
}
