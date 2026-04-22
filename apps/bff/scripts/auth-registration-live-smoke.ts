import "dotenv/config";
import { randomBytes } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "../src/config.js";

type JsonResponse<T> = {
  response: Response;
  json: T | null;
  text: string;
};

type RegisterResponse = {
  pending?: boolean;
  email?: string;
  expiresInSeconds?: number;
  resendAvailableInSeconds?: number;
  delivery?: string;
  error?: string;
};

type VerifyResponse = {
  user?: {
    email?: string;
  };
  error?: string;
};

type SessionResponse = {
  authenticated?: boolean;
  user?: {
    email?: string;
  };
};

type LogoutResponse = {
  ok?: boolean;
  error?: string;
};

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildMailboxAlias(seedAddress: string): string {
  const normalized = seedAddress.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    throw new Error("SMTP_USER must be a valid mailbox address.");
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const uniqueTag = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  return `${localPart}+verify${uniqueTag}@${domain}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const headers = new Headers(init?.headers ?? undefined);
  const hasBody = init?.body !== undefined && init.body !== null;
  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });
  const text = await response.text();
  const json = text.length > 0 ? (JSON.parse(text) as T) : null;
  return { response, json, text };
}

function extractSixDigitCode(parts: Array<string | null | undefined>): string | null {
  for (const part of parts) {
    if (!part) {
      continue;
    }
    const match = part.match(/\b(\d{6})\b/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function waitForVerificationCode(targetAddress: string, startedAt: number) {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    logger: false,
  });

  await client.connect();
  try {
    await client.mailboxOpen("INBOX");
    const deadline = Date.now() + 90_000;

    while (Date.now() < deadline) {
      const uids = await client.search({ since: new Date(startedAt - 60_000) });
      for (const uid of [...uids].reverse()) {
        const message = await client.fetchOne(uid, {
          source: true,
          internalDate: true,
        });
        const parsed = await simpleParser(message.source);
        if ((parsed.to?.text ?? "").trim().toLowerCase() !== targetAddress) {
          continue;
        }

        const code = extractSixDigitCode([
          parsed.text,
          parsed.html ? String(parsed.html) : null,
          message.source.toString("utf8"),
        ]);
        if (code) {
          return {
            code,
            uid,
            subject: parsed.subject ?? null,
            receivedAt: message.internalDate?.toISOString() ?? null,
          };
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  } finally {
    await client.logout().catch(() => {});
  }

  throw new Error(`Timed out waiting for verification email sent to ${targetAddress}.`);
}

async function main() {
  if (!env.smtpEnabled) {
    throw new Error("SMTP_ENABLED=true is required for the auth registration live smoke.");
  }
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error("SMTP_USER and SMTP_PASS are required for the auth registration live smoke.");
  }

  const startedAt = Date.now();
  const alias = buildMailboxAlias(env.SMTP_USER);
  const password = "Password123";
  const displayName = "SMTP Flow";
  const baseUrl = `http://${env.HOST}:${env.PORT}`;

  const register = await fetchJson<RegisterResponse>(`${baseUrl}/api/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      email: alias,
      username: displayName,
      password,
    }),
  });
  if (!register.response.ok) {
    throw new Error(`Register failed: ${register.text}`);
  }

  const mail = await waitForVerificationCode(alias, startedAt);

  const verify = await fetchJson<VerifyResponse>(`${baseUrl}/api/auth/verify`, {
    method: "POST",
    body: JSON.stringify({
      email: alias,
      code: mail.code,
    }),
  });
  if (!verify.response.ok) {
    throw new Error(`Verify failed: ${verify.text}`);
  }

  const verifyCookie = verify.response.headers.get("set-cookie");
  if (!verifyCookie) {
    throw new Error("Verify succeeded but no session cookie was returned.");
  }
  const verifyCookieHeader = verifyCookie.split(";")[0];

  const sessionAfterVerify = await fetchJson<SessionResponse>(`${baseUrl}/api/auth/session`, {
    headers: {
      cookie: verifyCookieHeader,
    },
  });
  assertCondition(
    sessionAfterVerify.response.ok &&
      sessionAfterVerify.json?.authenticated === true &&
      sessionAfterVerify.json?.user?.email === alias,
    `Session after verification was not authenticated for ${alias}: ${sessionAfterVerify.text}`,
  );

  const logout = await fetchJson<LogoutResponse>(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      cookie: verifyCookieHeader,
    },
  });
  assertCondition(
    logout.response.ok && logout.json?.ok === true,
    `Logout failed after verification for ${alias}: ${logout.text}`,
  );

  const sessionAfterLogout = await fetchJson<SessionResponse>(`${baseUrl}/api/auth/session`, {
    headers: {
      cookie: verifyCookieHeader,
    },
  });
  assertCondition(
    sessionAfterLogout.response.ok && sessionAfterLogout.json?.authenticated === false,
    `Session remained authenticated after logout for ${alias}: ${sessionAfterLogout.text}`,
  );

  const login = await fetchJson<VerifyResponse>(`${baseUrl}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: alias,
      password,
    }),
  });
  if (!login.response.ok) {
    throw new Error(`Login failed: ${login.text}`);
  }

  const loginCookie = login.response.headers.get("set-cookie");
  if (!loginCookie) {
    throw new Error("Login succeeded but no session cookie was returned.");
  }
  const loginCookieHeader = loginCookie.split(";")[0];

  const sessionAfterLogin = await fetchJson<SessionResponse>(`${baseUrl}/api/auth/session`, {
    headers: {
      cookie: loginCookieHeader,
    },
  });
  assertCondition(
    sessionAfterLogin.response.ok &&
      sessionAfterLogin.json?.authenticated === true &&
      sessionAfterLogin.json?.user?.email === alias,
    `Session after login was not authenticated for ${alias}: ${sessionAfterLogin.text}`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        alias,
        register: {
          pending: register.json?.pending ?? false,
          delivery: register.json?.delivery ?? null,
        },
        mail: {
          uid: mail.uid,
          subject: mail.subject,
          receivedAt: mail.receivedAt,
          codeFound: true,
        },
        verify: {
          ok: verify.response.ok,
          user: verify.json?.user?.email ?? null,
        },
        sessionAfterVerify: {
          authenticated: sessionAfterVerify.json?.authenticated ?? false,
          user: sessionAfterVerify.json?.user?.email ?? null,
        },
        logout: {
          ok: logout.response.ok,
          apiOk: logout.json?.ok ?? false,
        },
        sessionAfterLogout: {
          authenticated: sessionAfterLogout.json?.authenticated ?? false,
          user: sessionAfterLogout.json?.user?.email ?? null,
        },
        login: {
          ok: login.response.ok,
          user: login.json?.user?.email ?? null,
        },
        sessionAfterLogin: {
          authenticated: sessionAfterLogin.json?.authenticated ?? false,
          user: sessionAfterLogin.json?.user?.email ?? null,
        },
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
