import { createHash, randomBytes } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { env } from "./config.js";
import { getPrismaClient } from "./persistence.js";
import { decryptSecret, encryptSecret } from "./secret-box.js";

const microsoftGraphBaseUrl = "https://graph.microsoft.com/v1.0";
const microsoftStateTtlMs = 10 * 60 * 1000;
const microsoftTokenRefreshSkewMs = 60 * 1000;
const maxMicrosoftAuthStates = 5000;
const maxMicrosoftSessionEntries = 5000;
const maxMicrosoftAccountsPerSession = 16;

const graphErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const microsoftProfileSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  mail: z.string().nullable().optional(),
  userPrincipalName: z.string().optional(),
});

const microsoftMessageSchema = z.object({
  id: z.string().optional(),
  subject: z.string().optional(),
  from: z
    .object({
      emailAddress: z
        .object({
          address: z.string().optional(),
          name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  bodyPreview: z.string().optional(),
  receivedDateTime: z.string().optional(),
  importance: z.string().optional(),
  isRead: z.boolean().optional(),
  hasAttachments: z.boolean().optional(),
  webLink: z.string().optional(),
  body: z
    .object({
      contentType: z.string().optional(),
      content: z.string().optional(),
    })
    .optional(),
});

const microsoftMessageListSchema = z.object({
  value: z.array(microsoftMessageSchema),
});

const microsoftEventSchema = z.object({
  id: z.string().optional(),
  subject: z.string().optional(),
  webLink: z.string().optional(),
  start: z
    .object({
      dateTime: z.string().optional(),
      timeZone: z.string().optional(),
    })
    .optional(),
  end: z
    .object({
      dateTime: z.string().optional(),
      timeZone: z.string().optional(),
    })
    .optional(),
});

const microsoftTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.coerce.number().int().positive().optional(),
  ext_expires_in: z.coerce.number().int().positive().optional(),
  id_token: z.string().optional(),
});

type MicrosoftProfile = z.infer<typeof microsoftProfileSchema>;
type MicrosoftMessage = z.infer<typeof microsoftMessageSchema>;
type MicrosoftEvent = z.infer<typeof microsoftEventSchema>;
type MicrosoftTokenResponse = z.infer<typeof microsoftTokenSchema>;

type MicrosoftAuthState = {
  sessionToken: string;
  verifier: string;
  appOrigin: string;
  attemptId: string;
  createdAt: number;
};

type MicrosoftAccountRecord = {
  accountId: string;
  displayName: string;
  email: string;
  tenantId: string | null;
  scope: string[];
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  createdAt: string;
  updatedAt: string;
};

export type MicrosoftAccountView = {
  accountId: string;
  displayName: string;
  email: string;
  mailboxUserIdHint: string;
  tenantId: string | null;
  scope: string[];
  createdAt: string;
  updatedAt: string;
};

const microsoftAuthStates = new Map<string, MicrosoftAuthState>();
const microsoftAccountsBySession = new Map<string, Map<string, MicrosoftAccountRecord>>();
const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;

export class MicrosoftGraphHttpError extends Error {
  status: number;
  graphCode: string | null;

  constructor(status: number, message: string, graphCode: string | null = null) {
    super(message);
    this.name = "MicrosoftGraphHttpError";
    this.status = status;
    this.graphCode = graphCode;
  }
}

export class MicrosoftDirectAuthSessionInactiveError extends Error {
  sessionToken: string;
  appOrigin: string;
  attemptId: string;

  constructor(input: { sessionToken: string; appOrigin: string; attemptId: string }) {
    super("Local session expired before Microsoft authorization could be completed");
    this.name = "MicrosoftDirectAuthSessionInactiveError";
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

function cleanupExpiredMicrosoftAuthStates(now = Date.now()): void {
  for (const [state, entry] of microsoftAuthStates.entries()) {
    if (entry.createdAt + microsoftStateTtlMs < now) {
      microsoftAuthStates.delete(state);
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

function microsoftTenantId(): string {
  return env.microsoftTenantId || "common";
}

function microsoftAuthorizeEndpoint(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenantId())}/oauth2/v2.0/authorize`;
}

function microsoftTokenEndpoint(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenantId())}/oauth2/v2.0/token`;
}

function normalizedMicrosoftScopes(): string[] {
  const raw = env.microsoftScopes.trim();
  const scopes = raw.length > 0 ? raw.split(/\s+/u) : [];
  const deduped = Array.from(new Set(scopes.filter((item) => item.length > 0)));
  if (deduped.length > 0) {
    return deduped;
  }
  return ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read", "Calendars.ReadWrite"];
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

function mailboxUserIdHintFromProfile(profile: MicrosoftProfile): string {
  const candidates = [profile.mail, profile.userPrincipalName]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  return candidates[0] ?? "me";
}

function accountViewFromRecord(record: MicrosoftAccountRecord): MicrosoftAccountView {
  return {
    accountId: record.accountId,
    displayName: record.displayName,
    email: record.email,
    mailboxUserIdHint: record.email || "me",
    tenantId: record.tenantId,
    scope: [...record.scope],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseBoundary<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const issue = parsed.error.issues[0];
  throw new Error(`${label} validation failed: ${issue?.message ?? "unknown schema error"}`);
}

function getMicrosoftAccountStore(sessionToken: string, createIfMissing: boolean): Map<string, MicrosoftAccountRecord> {
  const existing = microsoftAccountsBySession.get(sessionToken);
  if (existing) {
    return existing;
  }
  if (!createIfMissing) {
    return new Map<string, MicrosoftAccountRecord>();
  }

  const created = new Map<string, MicrosoftAccountRecord>();
  microsoftAccountsBySession.set(sessionToken, created);
  enforceMapLimit(microsoftAccountsBySession, maxMicrosoftSessionEntries);
  return created;
}

function takeMicrosoftAuthState(state: string): MicrosoftAuthState | null {
  cleanupExpiredMicrosoftAuthStates();
  const authState = microsoftAuthStates.get(state) ?? null;
  if (authState) {
    microsoftAuthStates.delete(state);
  }
  return authState;
}

function getMicrosoftAccountRecord(sessionToken: string, accountId: string): MicrosoftAccountRecord | null {
  const store = getMicrosoftAccountStore(sessionToken, false);
  return store.get(accountId) ?? null;
}

async function loadMicrosoftAccountRecordForUser(
  logger: FastifyBaseLogger,
  userId: string,
  accountId: string
): Promise<MicrosoftAccountRecord | null> {
  const prisma = (await getPrismaClient(logger)) as any;
  if (!prisma?.microsoftAccount?.findFirst) {
    return null;
  }

  const row = await prisma.microsoftAccount.findFirst({
    where: { userId, accountId },
  });
  if (!row) {
    return null;
  }

  return {
    accountId: row.accountId,
    displayName: row.displayName,
    email: row.email,
    tenantId: row.tenantId,
    scope: Array.isArray(row.scope) ? row.scope : [],
    accessToken: decryptSecret(row.accessTokenCiphertext),
    refreshToken: row.refreshTokenCiphertext ? decryptSecret(row.refreshTokenCiphertext) : null,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt).getTime(),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function upsertMicrosoftAccountRecord(sessionToken: string, record: MicrosoftAccountRecord): MicrosoftAccountRecord {
  const store = getMicrosoftAccountStore(sessionToken, true);
  store.set(record.accountId, record);
  enforceMapLimit(store, maxMicrosoftAccountsPerSession);
  enforceMapLimit(microsoftAccountsBySession, maxMicrosoftSessionEntries);
  return record;
}

export async function persistMicrosoftAccountForUser(input: {
  logger: FastifyBaseLogger;
  userId: string;
  sessionToken: string;
  accountId: string;
}): Promise<MicrosoftAccountView> {
  const record = getMicrosoftAccountRecord(input.sessionToken, input.accountId);
  if (!record) {
    throw new Error("Microsoft account session not found");
  }

  const prisma = (await getPrismaClient(input.logger)) as any;
  if (!prisma?.microsoftAccount?.upsert) {
    throw new Error("MICROSOFT_ACCOUNT_STORE_UNAVAILABLE");
  }

  const now = new Date();
  await prisma.microsoftAccount.upsert({
    where: {
      userId_accountId: {
        userId: input.userId,
        accountId: record.accountId,
      },
    },
    create: {
      userId: input.userId,
      accountId: record.accountId,
      email: record.email,
      displayName: record.displayName,
      mailboxUserIdHint: record.email || "me",
      tenantId: record.tenantId,
      scope: record.scope,
      accessTokenCiphertext: encryptSecret(record.accessToken),
      refreshTokenCiphertext: record.refreshToken ? encryptSecret(record.refreshToken) : null,
      expiresAt: new Date(record.expiresAt),
      createdAt: now,
      updatedAt: now,
    },
    update: {
      email: record.email,
      displayName: record.displayName,
      mailboxUserIdHint: record.email || "me",
      tenantId: record.tenantId,
      scope: record.scope,
      accessTokenCiphertext: encryptSecret(record.accessToken),
      refreshTokenCiphertext: record.refreshToken ? encryptSecret(record.refreshToken) : null,
      expiresAt: new Date(record.expiresAt),
      updatedAt: now,
    },
  });

  return accountViewFromRecord(record);
}

async function requestMicrosoftToken(body: Record<string, string>): Promise<MicrosoftTokenResponse> {
  const response = await fetch(microsoftTokenEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: encodeFormBody(body),
  });

  const text = await response.text();
  const json = parseJsonText(text, "Microsoft token endpoint");
  if (!response.ok) {
    const parsedError = graphErrorEnvelopeSchema.safeParse(json);
    const message =
      parsedError.success && parsedError.data.error?.message
        ? parsedError.data.error.message
        : `Microsoft token exchange failed with status ${response.status}`;
    const graphCode = parsedError.success ? parsedError.data.error?.code ?? null : null;
    throw new MicrosoftGraphHttpError(response.status, message, graphCode);
  }

  return parseBoundary(microsoftTokenSchema, json, "Microsoft token response");
}

async function fetchMicrosoftProfileByToken(accessToken: string): Promise<MicrosoftProfile> {
  const response = await fetch(
    `${microsoftGraphBaseUrl}/me?$select=id,displayName,mail,userPrincipalName`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  const text = await response.text();
  const json = parseJsonText(text, "Microsoft profile endpoint");
  if (!response.ok) {
    const parsedError = graphErrorEnvelopeSchema.safeParse(json);
    const message =
      parsedError.success && parsedError.data.error?.message
        ? parsedError.data.error.message
        : `Microsoft profile fetch failed with status ${response.status}`;
    const graphCode = parsedError.success ? parsedError.data.error?.code ?? null : null;
    throw new MicrosoftGraphHttpError(response.status, message, graphCode);
  }

  return parseBoundary(microsoftProfileSchema, json, "Microsoft profile response");
}

async function ensureMicrosoftAccessToken(
  sessionToken: string,
  accountId: string,
  userId?: string
): Promise<string> {
  let record = getMicrosoftAccountRecord(sessionToken, accountId);
  if (!record && userId) {
    record = await loadMicrosoftAccountRecordForUser(noopLogger, userId, accountId);
    if (record) {
      upsertMicrosoftAccountRecord(sessionToken, record);
    }
  }
  if (!record) {
    throw new Error("Microsoft account session not found");
  }

  if (record.expiresAt > Date.now() + microsoftTokenRefreshSkewMs) {
    return record.accessToken;
  }

  if (!record.refreshToken) {
    throw new Error("Microsoft refresh token is not available");
  }

  const token = await requestMicrosoftToken({
    client_id: env.microsoftClientId,
    ...(env.microsoftClientSecret ? { client_secret: env.microsoftClientSecret } : {}),
    grant_type: "refresh_token",
    refresh_token: record.refreshToken,
    redirect_uri: env.microsoftRedirectUri,
    scope: normalizedMicrosoftScopes().join(" "),
  });

  const refreshed: MicrosoftAccountRecord = {
    ...record,
    accessToken: token.access_token,
    refreshToken: token.refresh_token?.trim() || record.refreshToken,
    scope: token.scope ? token.scope.split(/\s+/u).filter((item) => item.length > 0) : record.scope,
    expiresAt: Date.now() + ((token.expires_in ?? 3600) * 1000),
    updatedAt: new Date().toISOString(),
  };

  upsertMicrosoftAccountRecord(sessionToken, refreshed);
  if (userId) {
    const prisma = (await getPrismaClient(noopLogger)) as any;
    if (prisma?.microsoftAccount?.updateMany) {
      await prisma.microsoftAccount.updateMany({
        where: { userId, accountId: refreshed.accountId },
        data: {
          accessTokenCiphertext: encryptSecret(refreshed.accessToken),
          refreshTokenCiphertext: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : null,
          scope: refreshed.scope,
          expiresAt: new Date(refreshed.expiresAt),
          updatedAt: new Date(),
        },
      });
    }
  }
  return refreshed.accessToken;
}

async function requestMicrosoftGraphJson(
  sessionToken: string,
  accountId: string,
  path: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
  userId?: string
): Promise<unknown> {
  const accessToken = await ensureMicrosoftAccessToken(sessionToken, accountId, userId);
  const response = await fetch(`${microsoftGraphBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
      ...init?.headers,
    },
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const json = parseJsonText(text, `Microsoft Graph ${init?.method ?? "GET"} ${path}`);
  if (!response.ok) {
    const parsedError = graphErrorEnvelopeSchema.safeParse(json);
    const message =
      parsedError.success && parsedError.data.error?.message
        ? parsedError.data.error.message
        : `Microsoft Graph request failed with status ${response.status}`;
    const graphCode = parsedError.success ? parsedError.data.error?.code ?? null : null;
    throw new MicrosoftGraphHttpError(response.status, message, graphCode);
  }

  return json;
}

export function isMicrosoftDirectAuthConfigured(): boolean {
  return env.microsoftClientId.length > 0 && env.microsoftRedirectUri.length > 0;
}

export function beginMicrosoftDirectAuth(input: {
  sessionToken: string;
  appOrigin: string;
  attemptId: string;
}): { state: string; authorizeUrl: string; expiresAt: string } {
  cleanupExpiredMicrosoftAuthStates();

  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = createPkceChallenge(verifier);
  const state = randomBytes(24).toString("hex");
  const createdAt = Date.now();

  microsoftAuthStates.set(state, {
    sessionToken: input.sessionToken,
    verifier,
    appOrigin: input.appOrigin,
    attemptId: input.attemptId,
    createdAt,
  });
  enforceMapLimit(microsoftAuthStates, maxMicrosoftAuthStates);

  const params = new URLSearchParams({
    client_id: env.microsoftClientId,
    response_type: "code",
    redirect_uri: env.microsoftRedirectUri,
    response_mode: "query",
    scope: normalizedMicrosoftScopes().join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });

  return {
    state,
    authorizeUrl: `${microsoftAuthorizeEndpoint()}?${params.toString()}`,
    expiresAt: new Date(createdAt + microsoftStateTtlMs).toISOString(),
  };
}

export async function completeMicrosoftDirectAuth(input: {
  state: string;
  code: string;
  ensureSessionActive?: (sessionToken: string) => boolean | Promise<boolean>;
}): Promise<{ sessionToken: string; appOrigin: string; attemptId: string; account: MicrosoftAccountView }> {
  const authState = takeMicrosoftAuthState(input.state);
  if (!authState) {
    throw new Error("Microsoft authorization state expired");
  }

  if (input.ensureSessionActive && !(await input.ensureSessionActive(authState.sessionToken))) {
    throw new MicrosoftDirectAuthSessionInactiveError(authState);
  }

  const token = await requestMicrosoftToken({
    client_id: env.microsoftClientId,
    ...(env.microsoftClientSecret ? { client_secret: env.microsoftClientSecret } : {}),
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: env.microsoftRedirectUri,
    code_verifier: authState.verifier,
  });

  const profile = await fetchMicrosoftProfileByToken(token.access_token);
  if (input.ensureSessionActive && !(await input.ensureSessionActive(authState.sessionToken))) {
    throw new MicrosoftDirectAuthSessionInactiveError(authState);
  }

  const mailboxUserIdHint = mailboxUserIdHintFromProfile(profile);
  const nowIso = new Date().toISOString();
  const record: MicrosoftAccountRecord = {
    accountId: profile.id,
    displayName: profile.displayName?.trim() || mailboxUserIdHint,
    email: mailboxUserIdHint === "me" ? "" : mailboxUserIdHint,
    tenantId: env.microsoftTenantId || null,
    scope: token.scope ? token.scope.split(/\s+/u).filter((item) => item.length > 0) : normalizedMicrosoftScopes(),
    accessToken: token.access_token,
    refreshToken: token.refresh_token?.trim() || null,
    expiresAt: Date.now() + ((token.expires_in ?? 3600) * 1000),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const previous = getMicrosoftAccountRecord(authState.sessionToken, record.accountId);
  const merged: MicrosoftAccountRecord = previous
    ? {
        ...previous,
        ...record,
        createdAt: previous.createdAt,
        updatedAt: nowIso,
      }
    : record;

  upsertMicrosoftAccountRecord(authState.sessionToken, merged);
  return {
    sessionToken: authState.sessionToken,
    appOrigin: authState.appOrigin,
    attemptId: authState.attemptId,
    account: accountViewFromRecord(merged),
  };
}

export function consumeMicrosoftDirectAuthState(state: string): {
  sessionToken: string;
  appOrigin: string;
  attemptId: string;
} | null {
  const authState = takeMicrosoftAuthState(state);
  if (!authState) {
    return null;
  }

  return {
    sessionToken: authState.sessionToken,
    appOrigin: authState.appOrigin,
    attemptId: authState.attemptId,
  };
}

export function getMicrosoftAccountView(sessionToken: string, accountId: string): MicrosoftAccountView | null {
  const record = getMicrosoftAccountRecord(sessionToken, accountId);
  return record ? accountViewFromRecord(record) : null;
}

export async function verifyMicrosoftMailboxAccess(sessionToken: string, accountId: string, userId?: string): Promise<{
  ok: boolean;
  mailboxUserIdHint: string | null;
  error?: string;
}> {
  try {
    const [profileRaw] = await Promise.all([
      requestMicrosoftGraphJson(
        sessionToken,
        accountId,
        "/me?$select=id,displayName,mail,userPrincipalName",
        { method: "GET" },
        undefined,
        userId
      ),
      requestMicrosoftGraphJson(
        sessionToken,
        accountId,
        "/me/messages?$top=1&$select=id&$orderby=receivedDateTime%20desc",
        { method: "GET" },
        undefined,
        userId
      ),
    ]);
    const profile = parseBoundary(microsoftProfileSchema, profileRaw, "Microsoft mailbox verification profile");
    return {
      ok: true,
      mailboxUserIdHint: mailboxUserIdHintFromProfile(profile),
    };
  } catch (error) {
    return {
      ok: false,
      mailboxUserIdHint: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function listMicrosoftInboxMessages(
  sessionToken: string,
  accountId: string,
  limit: number,
  userId?: string
): Promise<MicrosoftMessage[]> {
  const top = Math.max(5, Math.min(limit, 100));
  const payload = await requestMicrosoftGraphJson(
    sessionToken,
    accountId,
    `/me/messages?$top=${top}&$orderby=receivedDateTime%20desc&$select=id,subject,from,bodyPreview,receivedDateTime,importance,isRead,hasAttachments,webLink`,
    { method: "GET" },
    undefined,
    userId
  );
  return parseBoundary(microsoftMessageListSchema, payload, "Microsoft inbox list response").value;
}

export async function getMicrosoftMessageById(
  sessionToken: string,
  accountId: string,
  messageId: string,
  userId?: string
): Promise<MicrosoftMessage> {
  const select = [
    "id",
    "subject",
    "from",
    "body",
    "bodyPreview",
    "receivedDateTime",
    "importance",
    "isRead",
    "hasAttachments",
    "webLink",
  ].join(",");
  const payload = await requestMicrosoftGraphJson(
    sessionToken,
    accountId,
    `/me/messages/${encodeURIComponent(messageId)}?$select=${encodeURIComponent(select)}`,
    { method: "GET" },
    undefined,
    userId
  );
  return parseBoundary(microsoftMessageSchema, payload, "Microsoft message response");
}

export async function createMicrosoftEvent(
  sessionToken: string,
  accountId: string,
  input: {
    subject: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    body: { contentType: string; content: string };
    allowNewTimeProposals: boolean;
  },
  userId?: string
): Promise<MicrosoftEvent> {
  const payload = await requestMicrosoftGraphJson(
    sessionToken,
    accountId,
    "/me/events",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    {
      Prefer: `outlook.timezone="${input.start.timeZone}"`,
    },
    userId
  );
  return parseBoundary(microsoftEventSchema, payload, "Microsoft event creation response");
}

export async function getMicrosoftEventById(
  sessionToken: string,
  accountId: string,
  eventId: string,
  userId?: string
): Promise<MicrosoftEvent> {
  const payload = await requestMicrosoftGraphJson(
    sessionToken,
    accountId,
    `/me/events/${encodeURIComponent(eventId)}?$select=id,subject,webLink,start,end`,
    { method: "GET" },
    undefined,
    userId
  );
  return parseBoundary(microsoftEventSchema, payload, "Microsoft event response");
}

export async function deleteMicrosoftEventById(
  sessionToken: string,
  accountId: string,
  eventId: string,
  userId?: string
): Promise<void> {
  await requestMicrosoftGraphJson(
    sessionToken,
    accountId,
    `/me/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
    undefined,
    userId
  );
}
