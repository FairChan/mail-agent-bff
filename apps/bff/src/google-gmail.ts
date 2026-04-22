import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { env } from "./config.js";
import { getPrismaClient } from "./persistence.js";
import { decryptSecret, encryptSecret } from "./secret-box.js";
import { runtimePaths } from "./runtime/paths.js";
import { readJsonFile, writeJsonFile } from "./runtime/json-file-store.js";

const googleAuthorizeBaseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const gmailApiBaseUrl = "https://gmail.googleapis.com/gmail/v1";
const googleStateTtlMs = 10 * 60 * 1000;
const googleTokenRefreshSkewMs = 60 * 1000;
const maxGoogleAuthStates = 5000;
const maxGoogleSessionEntries = 5000;
const maxGoogleAccountsPerSession = 16;
const gmailMessageMetadataConcurrency = 4;
const gmailMessageMetadataRetryCount = 1;

const googleTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.coerce.number().int().positive().optional(),
});

const gmailProfileSchema = z.object({
  emailAddress: z.string().email(),
  messagesTotal: z.coerce.number().int().optional(),
  threadsTotal: z.coerce.number().int().optional(),
  historyId: z.string().optional(),
});

const gmailMessageIdListSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        threadId: z.string().optional(),
      })
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

const gmailHeaderSchema = z.object({
  name: z.string().optional(),
  value: z.string().optional(),
});

const gmailMessagePartBodySchema = z.object({
  size: z.coerce.number().int().nonnegative().optional(),
  data: z.string().optional(),
  attachmentId: z.string().optional(),
});

const gmailMessagePartSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      partId: z.string().optional(),
      mimeType: z.string().optional(),
      filename: z.string().optional(),
      headers: z.array(gmailHeaderSchema).optional(),
      body: gmailMessagePartBodySchema.optional(),
      parts: z.array(gmailMessagePartSchema).optional(),
    })
    .passthrough()
);

const gmailMessageSchema = z
  .object({
    id: z.string().min(1),
    threadId: z.string().optional(),
    labelIds: z.array(z.string()).optional(),
    snippet: z.string().optional(),
    internalDate: z.string().optional(),
    payload: gmailMessagePartSchema.optional(),
  })
  .passthrough();

type GoogleTokenResponse = z.infer<typeof googleTokenSchema>;
type GmailProfile = z.infer<typeof gmailProfileSchema>;
type GmailMessage = z.infer<typeof gmailMessageSchema>;

type GoogleAuthState = {
  sessionToken: string;
  verifier: string;
  appOrigin: string;
  attemptId: string;
  createdAt: number;
};

type GoogleAccountRecord = {
  email: string;
  accessToken: string;
  refreshToken: string | null;
  scope: string[];
  expiresAt: number;
  createdAt: string;
  updatedAt: string;
};

type GoogleAccountRecordSnapshot = {
  email: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
  scope: string[];
  expiresAt: number;
  createdAt: string;
  updatedAt: string;
};

type GoogleAccountFileSnapshot = {
  version: 1;
  userId: string;
  accounts: GoogleAccountRecordSnapshot[];
};

export type GoogleAccountView = {
  email: string;
  mailboxUserIdHint: string;
  scope: string[];
  createdAt: string;
  updatedAt: string;
};

type GraphLikeMailMessage = {
  id: string;
  subject?: string;
  from?: {
    emailAddress?: {
      address?: string;
      name?: string;
    };
  };
  bodyPreview?: string;
  receivedDateTime?: string;
  importance?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  webLink?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
};

const googleAuthStates = new Map<string, GoogleAuthState>();
const googleAccountsBySession = new Map<string, Map<string, GoogleAccountRecord>>();
const googleAccountFileStoreDir = join(runtimePaths.dataDir, "google-accounts");
const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

export class GoogleGmailHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleGmailHttpError";
    this.status = status;
  }
}

export class GoogleDirectAuthSessionInactiveError extends Error {
  sessionToken: string;
  appOrigin: string;
  attemptId: string;

  constructor(input: { sessionToken: string; appOrigin: string; attemptId: string }) {
    super("Local session expired before Google authorization could be completed");
    this.name = "GoogleDirectAuthSessionInactiveError";
    this.sessionToken = input.sessionToken;
    this.appOrigin = input.appOrigin;
    this.attemptId = input.attemptId;
  }
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

function cleanupExpiredGoogleAuthStates(now = Date.now()): void {
  for (const [state, entry] of googleAuthStates.entries()) {
    if (entry.createdAt + googleStateTtlMs < now) {
      googleAuthStates.delete(state);
    }
  }
}

function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkceChallenge(verifier: string): string {
  return base64UrlEncode(createHash("sha256").update(verifier).digest());
}

function normalizedGoogleScopes(): string[] {
  const raw = env.googleScopes.trim();
  const scopes = raw.length > 0 ? raw.split(/\s+/u) : [];
  const deduped = Array.from(new Set(scopes.filter((item) => item.length > 0)));
  if (deduped.length > 0) {
    return deduped;
  }
  return ["https://www.googleapis.com/auth/gmail.readonly"];
}

function encodeFormBody(body: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    params.set(key, value);
  }
  return params.toString();
}

function parseJsonText(text: string, label: string): unknown {
  if (text.length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned a non-JSON response`);
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function googleAccountFilePath(userId: string): string {
  return join(
    googleAccountFileStoreDir,
    `${createHash("sha256").update(userId).digest("hex").slice(0, 24)}.json`
  );
}

function serializeGoogleAccountRecord(record: GoogleAccountRecord): GoogleAccountRecordSnapshot {
  return {
    email: record.email,
    accessTokenCiphertext: encryptSecret(record.accessToken),
    refreshTokenCiphertext: record.refreshToken ? encryptSecret(record.refreshToken) : null,
    scope: [...record.scope],
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function deserializeGoogleAccountRecord(snapshot: GoogleAccountRecordSnapshot): GoogleAccountRecord | null {
  if (!snapshot?.email || !snapshot.accessTokenCiphertext) {
    return null;
  }

  return {
    email: normalizeEmail(snapshot.email),
    accessToken: decryptSecret(snapshot.accessTokenCiphertext),
    refreshToken: snapshot.refreshTokenCiphertext ? decryptSecret(snapshot.refreshTokenCiphertext) : null,
    scope: Array.isArray(snapshot.scope) ? snapshot.scope : [],
    expiresAt: Number.isFinite(snapshot.expiresAt) ? snapshot.expiresAt : Date.now(),
    createdAt: snapshot.createdAt ?? new Date().toISOString(),
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
  };
}

async function readGoogleAccountFileSnapshot(userId: string): Promise<GoogleAccountFileSnapshot | null> {
  const snapshot = await readJsonFile<GoogleAccountFileSnapshot | null>(
    googleAccountFilePath(userId),
    null
  );
  if (!snapshot || snapshot.userId !== userId || !Array.isArray(snapshot.accounts)) {
    return null;
  }
  return snapshot;
}

async function writeGoogleAccountFileSnapshot(
  userId: string,
  records: GoogleAccountRecord[]
): Promise<void> {
  const snapshot: GoogleAccountFileSnapshot = {
    version: 1,
    userId,
    accounts: records
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(serializeGoogleAccountRecord),
  };
  await writeJsonFile(googleAccountFilePath(userId), snapshot);
}

function parseBoundary<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  const issue = parsed.error.issues[0];
  throw new Error(`${label} validation failed: ${issue?.message ?? "unknown schema error"}`);
}

function accountViewFromRecord(record: GoogleAccountRecord): GoogleAccountView {
  return {
    email: record.email,
    mailboxUserIdHint: record.email,
    scope: [...record.scope],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function getGoogleAccountStore(sessionToken: string, createIfMissing: boolean): Map<string, GoogleAccountRecord> {
  const existing = googleAccountsBySession.get(sessionToken);
  if (existing) {
    return existing;
  }
  if (!createIfMissing) {
    return new Map<string, GoogleAccountRecord>();
  }

  const created = new Map<string, GoogleAccountRecord>();
  googleAccountsBySession.set(sessionToken, created);
  enforceMapLimit(googleAccountsBySession, maxGoogleSessionEntries);
  return created;
}

function takeGoogleAuthState(state: string): GoogleAuthState | null {
  cleanupExpiredGoogleAuthStates();
  const authState = googleAuthStates.get(state) ?? null;
  if (authState) {
    googleAuthStates.delete(state);
  }
  return authState;
}

function getGoogleAccountRecord(sessionToken: string, email: string): GoogleAccountRecord | null {
  const store = getGoogleAccountStore(sessionToken, false);
  return store.get(normalizeEmail(email)) ?? null;
}

async function loadGoogleAccountRecordForUser(
  logger: FastifyBaseLogger,
  userId: string,
  email: string
): Promise<GoogleAccountRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  const prisma = (await getPrismaClient(logger)) as any;
  if (!prisma?.googleAccount?.findFirst) {
    if (!env.mailSourceMemoryFallbackEnabled) {
      return null;
    }
    const snapshot = await readGoogleAccountFileSnapshot(userId);
    if (!snapshot) {
      return null;
    }
    for (const record of snapshot.accounts) {
      if (normalizeEmail(record.email) !== normalizedEmail) {
        continue;
      }
      return deserializeGoogleAccountRecord(record);
    }
    return null;
  }

  const row = await prisma.googleAccount.findFirst({
    where: { userId, email: normalizedEmail },
  });
  if (!row) {
    return null;
  }

  return {
    email: normalizeEmail(row.email),
    accessToken: decryptSecret(row.accessTokenCiphertext),
    refreshToken: row.refreshTokenCiphertext ? decryptSecret(row.refreshTokenCiphertext) : null,
    scope: Array.isArray(row.scope) ? row.scope : [],
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt).getTime(),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function upsertGoogleAccountRecord(sessionToken: string, record: GoogleAccountRecord): GoogleAccountRecord {
  const store = getGoogleAccountStore(sessionToken, true);
  store.set(normalizeEmail(record.email), record);
  enforceMapLimit(store, maxGoogleAccountsPerSession);
  enforceMapLimit(googleAccountsBySession, maxGoogleSessionEntries);
  return record;
}

export async function persistGoogleAccountForUser(input: {
  logger: FastifyBaseLogger;
  userId: string;
  sessionToken: string;
  email: string;
}): Promise<GoogleAccountView> {
  const record = getGoogleAccountRecord(input.sessionToken, input.email);
  if (!record) {
    throw new Error("Google account session not found");
  }

  const prisma = (await getPrismaClient(input.logger)) as any;
  if (!prisma) {
    if (!env.mailSourceMemoryFallbackEnabled) {
      throw new Error("GOOGLE_ACCOUNT_STORE_UNAVAILABLE");
    }
    const snapshot = await readGoogleAccountFileSnapshot(input.userId);
    const existing = snapshot?.accounts ?? [];
    const next = existing.filter((candidate) => normalizeEmail(candidate.email) !== record.email);
    next.push(serializeGoogleAccountRecord(record));
    await writeGoogleAccountFileSnapshot(
      input.userId,
      next
        .map(deserializeGoogleAccountRecord)
        .filter((candidate): candidate is GoogleAccountRecord => candidate !== null)
    );
    return accountViewFromRecord(record);
  }

  if (!prisma.googleAccount?.upsert) {
    throw new Error("GOOGLE_ACCOUNT_STORE_UNAVAILABLE");
  }

  const now = new Date();
  await prisma.googleAccount.upsert({
    where: {
      userId_email: {
        userId: input.userId,
        email: record.email,
      },
    },
    create: {
      userId: input.userId,
      email: record.email,
      mailboxUserIdHint: record.email,
      scope: record.scope,
      accessTokenCiphertext: encryptSecret(record.accessToken),
      refreshTokenCiphertext: record.refreshToken ? encryptSecret(record.refreshToken) : null,
      expiresAt: new Date(record.expiresAt),
      createdAt: now,
      updatedAt: now,
    },
    update: {
      mailboxUserIdHint: record.email,
      scope: record.scope,
      accessTokenCiphertext: encryptSecret(record.accessToken),
      refreshTokenCiphertext: record.refreshToken ? encryptSecret(record.refreshToken) : null,
      expiresAt: new Date(record.expiresAt),
      updatedAt: now,
    },
  });

  return accountViewFromRecord(record);
}

async function requestGoogleToken(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const response = await fetch(googleTokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: encodeFormBody(body),
  });

  const text = await response.text();
  const json = parseJsonText(text, "Google token endpoint");
  if (!response.ok) {
    const message =
      typeof (json as { error_description?: unknown })?.error_description === "string"
        ? String((json as { error_description?: unknown }).error_description)
        : `Google token exchange failed with status ${response.status}`;
    throw new GoogleGmailHttpError(response.status, message);
  }

  return parseBoundary(googleTokenSchema, json, "Google token response");
}

async function fetchGmailProfileByToken(accessToken: string): Promise<GmailProfile> {
  const response = await fetch(`${gmailApiBaseUrl}/users/me/profile`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const json = parseJsonText(text, "Gmail profile endpoint");
  if (!response.ok) {
    const message =
      typeof (json as { error?: { message?: unknown } })?.error?.message === "string"
        ? String((json as { error?: { message?: unknown } }).error?.message)
        : `Gmail profile fetch failed with status ${response.status}`;
    throw new GoogleGmailHttpError(response.status, message);
  }

  return parseBoundary(gmailProfileSchema, json, "Gmail profile response");
}

async function ensureGoogleAccessToken(
  sessionToken: string,
  email: string,
  userId?: string
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  let record = getGoogleAccountRecord(sessionToken, normalizedEmail);
  if (!record && userId) {
    record = await loadGoogleAccountRecordForUser(noopLogger, userId, normalizedEmail);
    if (record) {
      upsertGoogleAccountRecord(sessionToken, record);
    }
  }
  if (!record) {
    throw new Error("Google account session not found");
  }

  if (record.expiresAt > Date.now() + googleTokenRefreshSkewMs) {
    return record.accessToken;
  }

  if (!record.refreshToken) {
    throw new Error("Google refresh token is not available");
  }

  const token = await requestGoogleToken({
    client_id: env.googleClientId,
    ...(env.googleClientSecret ? { client_secret: env.googleClientSecret } : {}),
    grant_type: "refresh_token",
    refresh_token: record.refreshToken,
  });

  const refreshed: GoogleAccountRecord = {
    ...record,
    accessToken: token.access_token,
    refreshToken: token.refresh_token?.trim() || record.refreshToken,
    scope: token.scope ? token.scope.split(/\s+/u).filter((item) => item.length > 0) : record.scope,
    expiresAt: Date.now() + ((token.expires_in ?? 3600) * 1000),
    updatedAt: new Date().toISOString(),
  };

  upsertGoogleAccountRecord(sessionToken, refreshed);
  if (userId) {
    const prisma = (await getPrismaClient(noopLogger)) as any;
    if (prisma?.googleAccount?.updateMany) {
      await prisma.googleAccount.updateMany({
        where: { userId, email: refreshed.email },
        data: {
          accessTokenCiphertext: encryptSecret(refreshed.accessToken),
          refreshTokenCiphertext: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : null,
          scope: refreshed.scope,
          expiresAt: new Date(refreshed.expiresAt),
          updatedAt: new Date(),
        },
      });
    } else if (env.mailSourceMemoryFallbackEnabled) {
      const snapshot = await readGoogleAccountFileSnapshot(userId);
      const existing = snapshot?.accounts ?? [];
      const next = existing.filter((candidate) => normalizeEmail(candidate.email) !== refreshed.email);
      next.push(serializeGoogleAccountRecord(refreshed));
      await writeGoogleAccountFileSnapshot(
        userId,
        next
          .map(deserializeGoogleAccountRecord)
          .filter((candidate): candidate is GoogleAccountRecord => candidate !== null)
      );
    }
  }
  return refreshed.accessToken;
}

async function requestGmailJson(
  sessionToken: string,
  email: string,
  path: string,
  init?: RequestInit,
  userId?: string
): Promise<unknown> {
  const accessToken = await ensureGoogleAccessToken(sessionToken, email, userId);
  const requestUrl = /^https?:\/\//i.test(path) ? path : `${gmailApiBaseUrl}${path}`;
  const response = await fetch(requestUrl, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const json = parseJsonText(text, `Gmail API ${init?.method ?? "GET"} ${requestUrl}`);
  if (!response.ok) {
    const message =
      typeof (json as { error?: { message?: unknown } })?.error?.message === "string"
        ? String((json as { error?: { message?: unknown } }).error?.message)
        : `Gmail API request failed with status ${response.status}`;
    throw new GoogleGmailHttpError(response.status, message);
  }

  return json;
}

export function isGoogleDirectAuthConfigured(): boolean {
  return env.googleClientId.length > 0 && env.googleRedirectUri.length > 0;
}

export function beginGoogleDirectAuth(input: {
  sessionToken: string;
  appOrigin: string;
  attemptId: string;
}): { state: string; authorizeUrl: string; expiresAt: string } {
  cleanupExpiredGoogleAuthStates();

  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = createPkceChallenge(verifier);
  const state = randomBytes(24).toString("hex");
  const createdAt = Date.now();

  googleAuthStates.set(state, {
    sessionToken: input.sessionToken,
    verifier,
    appOrigin: input.appOrigin,
    attemptId: input.attemptId,
    createdAt,
  });
  enforceMapLimit(googleAuthStates, maxGoogleAuthStates);

  const params = new URLSearchParams({
    client_id: env.googleClientId,
    response_type: "code",
    redirect_uri: env.googleRedirectUri,
    scope: normalizedGoogleScopes().join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
  });

  return {
    state,
    authorizeUrl: `${googleAuthorizeBaseUrl}?${params.toString()}`,
    expiresAt: new Date(createdAt + googleStateTtlMs).toISOString(),
  };
}

export async function completeGoogleDirectAuth(input: {
  state: string;
  code: string;
  ensureSessionActive?: (sessionToken: string) => boolean | Promise<boolean>;
}): Promise<{ sessionToken: string; appOrigin: string; attemptId: string; account: GoogleAccountView }> {
  const authState = takeGoogleAuthState(input.state);
  if (!authState) {
    throw new Error("Google authorization state expired");
  }

  if (input.ensureSessionActive && !(await input.ensureSessionActive(authState.sessionToken))) {
    throw new GoogleDirectAuthSessionInactiveError(authState);
  }

  const token = await requestGoogleToken({
    client_id: env.googleClientId,
    ...(env.googleClientSecret ? { client_secret: env.googleClientSecret } : {}),
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: env.googleRedirectUri,
    code_verifier: authState.verifier,
  });

  const profile = await fetchGmailProfileByToken(token.access_token);
  if (input.ensureSessionActive && !(await input.ensureSessionActive(authState.sessionToken))) {
    throw new GoogleDirectAuthSessionInactiveError(authState);
  }

  const nowIso = new Date().toISOString();
  const record: GoogleAccountRecord = {
    email: normalizeEmail(profile.emailAddress),
    accessToken: token.access_token,
    refreshToken: token.refresh_token?.trim() || null,
    scope: token.scope ? token.scope.split(/\s+/u).filter((item) => item.length > 0) : normalizedGoogleScopes(),
    expiresAt: Date.now() + ((token.expires_in ?? 3600) * 1000),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const previous = getGoogleAccountRecord(authState.sessionToken, record.email);
  const merged: GoogleAccountRecord = previous
    ? {
        ...previous,
        ...record,
        createdAt: previous.createdAt,
        updatedAt: nowIso,
      }
    : record;

  upsertGoogleAccountRecord(authState.sessionToken, merged);
  return {
    sessionToken: authState.sessionToken,
    appOrigin: authState.appOrigin,
    attemptId: authState.attemptId,
    account: accountViewFromRecord(merged),
  };
}

export function consumeGoogleDirectAuthState(state: string): {
  sessionToken: string;
  appOrigin: string;
  attemptId: string;
} | null {
  const authState = takeGoogleAuthState(state);
  if (!authState) {
    return null;
  }

  return {
    sessionToken: authState.sessionToken,
    appOrigin: authState.appOrigin,
    attemptId: authState.attemptId,
  };
}

export function getGoogleAccountView(sessionToken: string, email: string): GoogleAccountView | null {
  const record = getGoogleAccountRecord(sessionToken, email);
  return record ? accountViewFromRecord(record) : null;
}

export function clearGoogleDirectAuthSessionState(sessionToken: string): void {
  googleAccountsBySession.delete(sessionToken);
  for (const [state, authState] of googleAuthStates.entries()) {
    if (authState.sessionToken === sessionToken) {
      googleAuthStates.delete(state);
    }
  }
}

export async function verifyGoogleMailboxAccess(
  sessionToken: string,
  email: string,
  userId?: string
): Promise<{
  ok: boolean;
  mailboxUserIdHint: string | null;
  error?: string;
}> {
  try {
    const [profileRaw] = await Promise.all([
      requestGmailJson(sessionToken, email, "/users/me/profile", { method: "GET" }, userId),
      requestGmailJson(
        sessionToken,
        email,
        "/users/me/messages?labelIds=INBOX&maxResults=1",
        { method: "GET" },
        userId
      ),
    ]);
    const profile = parseBoundary(gmailProfileSchema, profileRaw, "Gmail mailbox verification profile");
    return {
      ok: true,
      mailboxUserIdHint: normalizeEmail(profile.emailAddress),
    };
  } catch (error) {
    return {
      ok: false,
      mailboxUserIdHint: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function decodeBase64Url(value: string): string {
  if (!value) {
    return "";
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractHeaderValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string {
  const match = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return typeof match?.value === "string" ? match.value.trim() : "";
}

function parseFromHeader(raw: string): { name: string; address: string } {
  const value = raw.trim();
  const match = value.match(/^(.*?)(?:<([^>]+)>)?$/);
  const address = (match?.[2] ?? value).trim().replace(/^"|"$/g, "");
  const name = (match?.[1] ?? address).trim().replace(/^"|"$/g, "") || address;
  return { name, address };
}

function gmailImportance(labelIds: string[] | undefined): string {
  return labelIds?.includes("IMPORTANT") ? "high" : "normal";
}

function gmailIsRead(labelIds: string[] | undefined): boolean {
  return !labelIds?.includes("UNREAD");
}

function gmailReceivedDateTime(message: GmailMessage): string {
  if (typeof message.internalDate === "string" && message.internalDate.trim().length > 0) {
    const timestamp = Number.parseInt(message.internalDate, 10);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return new Date(timestamp).toISOString();
    }
  }
  const dateHeader = extractHeaderValue(message.payload?.headers, "Date");
  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function gmailHasAttachments(part: any): boolean {
  if (!part || typeof part !== "object") {
    return false;
  }
  if (typeof part.filename === "string" && part.filename.trim().length > 0) {
    return true;
  }
  if (typeof part.body?.attachmentId === "string" && part.body.attachmentId.trim().length > 0) {
    return true;
  }
  if (Array.isArray(part.parts)) {
    return part.parts.some((child: any) => gmailHasAttachments(child));
  }
  return false;
}

function extractBodies(part: any): { html: string; text: string } {
  if (!part || typeof part !== "object") {
    return { html: "", text: "" };
  }

  const mimeType = typeof part.mimeType === "string" ? part.mimeType.toLowerCase() : "";
  if (mimeType === "text/html") {
    return {
      html: decodeBase64Url(typeof part.body?.data === "string" ? part.body.data : ""),
      text: "",
    };
  }
  if (mimeType === "text/plain") {
    return {
      html: "",
      text: decodeBase64Url(typeof part.body?.data === "string" ? part.body.data : ""),
    };
  }
  if (Array.isArray(part.parts)) {
    return part.parts.reduce(
      (accumulator: { html: string; text: string }, child: any) => {
        const next = extractBodies(child);
        return {
          html: accumulator.html || next.html,
          text: accumulator.text || next.text,
        };
      },
      { html: "", text: "" }
    );
  }
  return { html: "", text: "" };
}

function normalizeGmailMessage(message: GmailMessage, includeBody: boolean): GraphLikeMailMessage {
  const subject = extractHeaderValue(message.payload?.headers, "Subject") || "(无主题)";
  const from = parseFromHeader(extractHeaderValue(message.payload?.headers, "From"));
  const bodies = includeBody ? extractBodies(message.payload) : { html: "", text: "" };
  const bodyContent = bodies.html || bodies.text || "";

  return {
    id: message.id,
    subject,
    from: {
      emailAddress: {
        address: from.address,
        name: from.name,
      },
    },
    bodyPreview: message.snippet?.trim() || "",
    receivedDateTime: gmailReceivedDateTime(message),
    importance: gmailImportance(message.labelIds),
    isRead: gmailIsRead(message.labelIds),
    hasAttachments: gmailHasAttachments(message.payload),
    webLink: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(message.id)}`,
    ...(includeBody
      ? {
          body: {
            contentType: bodies.html ? "html" : "text",
            content: bodyContent,
          },
        }
      : {}),
  };
}

function receivedAfterQuery(receivedAfter: string | undefined): string {
  if (!receivedAfter?.trim()) {
    return "";
  }
  const parsed = new Date(receivedAfter);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `after:${yyyy}/${mm}/${dd}`;
}

async function fetchGmailMessageMetadata(
  sessionToken: string,
  email: string,
  messageId: string,
  userId?: string
): Promise<GmailMessage> {
  const params = new URLSearchParams({
    format: "metadata",
  });
  params.append("metadataHeaders", "Subject");
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "Date");
  const payload = await requestGmailJson(
    sessionToken,
    email,
    `/users/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`,
    { method: "GET" },
    userId
  );
  return parseBoundary(gmailMessageSchema, payload, "Gmail message metadata response");
}

function isRetryableGmailMetadataError(error: unknown): boolean {
  if (error instanceof GoogleGmailHttpError) {
    return error.status === 429 || error.status >= 500;
  }

  if (error instanceof Error) {
    return /fetch failed/i.test(error.message) || /network/i.test(error.message);
  }

  return false;
}

async function fetchGmailMessageMetadataWithRetry(
  sessionToken: string,
  email: string,
  messageId: string,
  userId?: string
): Promise<GmailMessage> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= gmailMessageMetadataRetryCount; attempt += 1) {
    try {
      return await fetchGmailMessageMetadata(sessionToken, email, messageId, userId);
    } catch (error) {
      lastError = error;
      if (attempt >= gmailMessageMetadataRetryCount || !isRetryableGmailMetadataError(error)) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function listGoogleInboxMessages(
  sessionToken: string,
  email: string,
  limit: number,
  userId?: string
): Promise<GraphLikeMailMessage[]> {
  return listGoogleInboxMessagesPage(sessionToken, email, { top: limit, userId });
}

export async function listGoogleInboxMessagesPage(
  sessionToken: string,
  email: string,
  options: {
    top: number;
    skip?: number;
    receivedAfter?: string;
    userId?: string;
  }
): Promise<GraphLikeMailMessage[]> {
  const top = Math.max(5, Math.min(options.top, 100));
  const skip = Math.max(0, Math.trunc(options.skip ?? 0));
  const targetCount = skip + top;
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < targetCount) {
    const params = new URLSearchParams({
      labelIds: "INBOX",
      maxResults: String(Math.min(100, Math.max(top, targetCount - ids.length))),
    });
    const afterQuery = receivedAfterQuery(options.receivedAfter);
    if (afterQuery) {
      params.set("q", afterQuery);
    }
    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const payload = await requestGmailJson(
      sessionToken,
      email,
      `/users/me/messages?${params.toString()}`,
      { method: "GET" },
      options.userId
    );
    const page = parseBoundary(gmailMessageIdListSchema, payload, "Gmail inbox list response");
    const nextIds = (page.messages ?? []).map((item) => item.id);
    ids.push(...nextIds);
    if (!page.nextPageToken || nextIds.length === 0) {
      break;
    }
    pageToken = page.nextPageToken;
  }

  const selected = ids.slice(skip, skip + top);
  const messages: GmailMessage[] = [];
  let firstFailure: unknown = null;
  let failureCount = 0;

  for (let index = 0; index < selected.length; index += gmailMessageMetadataConcurrency) {
    const chunk = selected.slice(index, index + gmailMessageMetadataConcurrency);
    const settled = await Promise.allSettled(
      chunk.map((messageId) =>
        fetchGmailMessageMetadataWithRetry(sessionToken, email, messageId, options.userId)
      )
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        messages.push(result.value);
        continue;
      }

      if (!firstFailure) {
        firstFailure = result.reason;
      }
      failureCount += 1;
    }
  }

  if (firstFailure) {
    const message =
      firstFailure instanceof Error ? firstFailure.message : String(firstFailure);
    const status =
      firstFailure instanceof GoogleGmailHttpError && (firstFailure.status === 429 || firstFailure.status >= 500)
        ? firstFailure.status
        : 502;
    throw new GoogleGmailHttpError(
      status,
      `Gmail metadata fetch incomplete (${failureCount}/${selected.length}); retrying avoids missing urgent mail: ${message}`
    );
  }

  return messages.map((message) => normalizeGmailMessage(message, false));
}

export async function getGoogleMessageById(
  sessionToken: string,
  email: string,
  messageId: string,
  userId?: string
): Promise<GraphLikeMailMessage> {
  const params = new URLSearchParams({
    format: "full",
  });
  const payload = await requestGmailJson(
    sessionToken,
    email,
    `/users/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`,
    { method: "GET" },
    userId
  );
  const message = parseBoundary(gmailMessageSchema, payload, "Gmail message response");
  return normalizeGmailMessage(message, true);
}
