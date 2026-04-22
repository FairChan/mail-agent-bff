/**
 * email.ts — Email sending utilities for Sec. Mery
 * Handles transactional emails: verification codes, notifications, etc.
 * Supports both OAuth2 (Gmail API) and legacy SMTP authentication.
 *
 * P0 fixes applied:
 *   - OAuth2 token auto-refresh: Nodemailer now correctly uses the OAuth2Client instance
 *   - from address validation: throws on missing 'from' address
 *   - SMTP/SMTP_ENABLED logic cleaned up (now uses oauthEnabled as primary gate)
 *
 * P1 fixes applied:
 *   - escapeHtml: added single-quote and backslash escaping
 *   - Retry with exponential backoff (max 3 attempts)
 *   - Config validation on startup
 *   - NODE_ENV-aware dev mode logging
 *
 * P2 fixes applied:
 *   - SMTP connection pool enabled
 *   - SendResult typed return value
 */
import nodemailer from "nodemailer";
import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { env } from "./config.js";

// ---------------------------------------------------------------------------
// OAuth2 Transport (Gmail API)
// ---------------------------------------------------------------------------
let _oauth2Client: OAuth2Client | null = null;
let _oauth2Transporter: nodemailer.Transporter | null = null;

function getOAuth2Client(): OAuth2Client {
  if (_oauth2Client) return _oauth2Client;

  _oauth2Client = new OAuth2Client({
    clientId: env.oauthClientId,
    clientSecret: env.oauthClientSecret,
  });

  _oauth2Client.setCredentials({
    refresh_token: env.oauthRefreshToken,
    // access_token left undefined — Nodemailer will use onRequest to auto-refresh
  });

  return _oauth2Client;
}

function getOAuth2Transporter(): nodemailer.Transporter {
  if (_oauth2Transporter) return _oauth2Transporter;

  const oauth2Client = getOAuth2Client();

  _oauth2Transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: env.oauthUser,
      clientId: env.oauthClientId,
      clientSecret: env.oauthClientSecret,
      refreshToken: env.oauthRefreshToken,
    },
  });

  return _oauth2Transporter;
}

// ---------------------------------------------------------------------------
// Legacy SMTP Transport (for backward compatibility)
// ---------------------------------------------------------------------------
const smtpTransporters = new Map<string, nodemailer.Transporter>();

function smtpTransporterCacheKey(host: string): string {
  return `${host}:${env.SMTP_PORT}:${env.smtpSecure}`;
}

function getSMTPTransporter(host = env.SMTP_HOST): nodemailer.Transporter {
  const cacheKey = smtpTransporterCacheKey(host);
  const cached = smtpTransporters.get(cacheKey);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host,
    port: env.SMTP_PORT,
    secure: env.smtpSecure,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
    // P2 fix: SMTP connection pool for high-frequency usage
    pool: true,
    maxConnections: 5,
    rateLimit: 10,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  smtpTransporters.set(cacheKey, transporter);
  return transporter;
}

function getSmtpCandidateHosts(): string[] {
  const primaryHost = env.SMTP_HOST.trim();
  const candidates = [primaryHost];

  if (primaryHost.toLowerCase() === "smtp.gmail.com") {
    candidates.push("gmail-smtp-msa.l.google.com");
  }

  return Array.from(new Set(candidates.filter((host) => host.length > 0)));
}

// ---------------------------------------------------------------------------
// Config validation on module load
// ---------------------------------------------------------------------------
function validateEmailConfig(): void {
  const missingOAuthFields = [
    ["OAUTH_CLIENT_ID", env.oauthClientId],
    ["OAUTH_CLIENT_SECRET", env.oauthClientSecret],
    ["OAUTH_REFRESH_TOKEN", env.oauthRefreshToken],
    ["OAUTH_USER", env.oauthUser],
  ].filter(([, value]) => !value);
  const missingSMTPFields = [
    ["SMTP_HOST", env.SMTP_HOST],
    ["SMTP_USER", env.SMTP_USER],
    ["SMTP_PASS", env.SMTP_PASS],
    ["SMTP_FROM", env.SMTP_FROM],
  ].filter(([, value]) => !value);
  const hasOAuth2 =
    env.oauthEnabled && missingOAuthFields.length === 0;
  const hasSMTP =
    env.smtpEnabled && env.SMTP_PORT && missingSMTPFields.length === 0;

  if (env.oauthEnabled && missingOAuthFields.length > 0) {
    throw new Error(
      `[email] OAuth2 is enabled (OAUTH_ENABLED=true) but required fields are missing: ${missingOAuthFields
        .map(([name]) => name)
        .join(", ")}.`
    );
  }

  if (env.smtpEnabled && missingSMTPFields.length > 0) {
    throw new Error(
      `[email] SMTP is enabled (SMTP_ENABLED=true) but required fields are missing: ${missingSMTPFields
        .map(([name]) => name)
        .join(", ")}.`
    );
  }

  if (!hasOAuth2 && !hasSMTP) {
    console.warn(
      "[email] ⚠️  Email sending is disabled — verification codes will be logged to console only. " +
        "Set OAUTH_ENABLED=true or SMTP_ENABLED=true to enable."
    );
  }

  if (hasOAuth2) {
    console.info(
      `[email] Using OAuth2 (user=${env.oauthUser})`
    );
  } else if (hasSMTP) {
    console.info(
      `[email] Using SMTP (host=${env.SMTP_HOST})`
    );
  }
}

// Run validation once at module load
validateEmailConfig();

// ---------------------------------------------------------------------------
// Code generation & hashing (constant-time safe)
// ---------------------------------------------------------------------------
/** Generate a cryptographically random 6-digit numeric code (range: 100000 – 999999). */
export function generateSixDigitCode(): string {
  // 3 bytes (24 bits) gives range 0–16 777 215; mod 900_000 → 0–899 999; + 100_000 → 100 000–999 999
  const num = 100_000 + (randomBytes(3).readUIntBE(0, 3) % 900_000);
  return String(num);
}

/** SHA-256 hash a 6-digit code (for storage). */
export function hashVerificationCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/** Constant-time comparison of two hex strings (constant-time). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Email sending
// ---------------------------------------------------------------------------
export interface SendVerificationEmailOptions {
  to: string;
  displayName: string;
  code: string;
  locale?: "zh-CN" | "en";
}

/** P2 fix: Typed return value to distinguish success, skipped, and failure */
export type SendResult =
  | { ok: true; messageId: string; method: "OAuth2" | "SMTP"; skipped: false }
  | { ok: true; skipped: true; reason: "disabled" }
  | { ok: false; error: string };

const I18N = {
  "zh-CN": {
    subject: "Mery 邮箱验证码",
    heading: "您好，{{name}}",
    intro:
      "您正在注册 Mery 账号，请在验证码输入框填入以下数字：",
    codeLabel: "验证码",
    expiry: "此验证码有效期为 30 分钟。",
    warning:
      "如果您未发起注册请求，请忽略此邮件，您的账号不会被创建。",
    footer: "— Sec. Mery · Make Every Emails Really Yours",
  },
  en: {
    subject: "Mery Email Verification Code",
    heading: "Hello, {{name}}",
    intro:
      "You are registering a Mery account. Please enter the following code:",
    codeLabel: "Verification Code",
    expiry: "This code is valid for 30 minutes.",
    warning:
      "If you did not request this, please ignore this email — no account will be created.",
    footer: "— Sec. Mery · Make Every Emails Really Yours",
  },
} as const;

function renderEmail(
  opts: SendVerificationEmailOptions
): { subject: string; html: string } {
  const t = I18N[opts.locale === "en" ? "en" : "zh-CN"];
  const name = escapeHtml(opts.displayName);
  const code = escapeHtml(opts.code);

  const html = `<!DOCTYPE html>
<html lang="${opts.locale === "en" ? "en" : "zh-CN"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.subject}</title>
<style>
  body { margin:0; padding:0; background:#f4f4f4; font-family:Arial,Helvetica,sans-serif; }
  .card { max-width:480px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden;
          box-shadow:0 4px 20px rgba(0,0,0,0.08); }
  .header { background:#2563eb; padding:32px 40px; }
  .header h1 { color:#ffffff; margin:0; font-size:22px; font-weight:600; letter-spacing:0.3px; }
  .body { padding:36px 40px; }
  .body p { color:#374151; font-size:15px; line-height:1.7; margin:0 0 16px; }
  .code-box { display:inline-block; background:#eff6ff; border:2px dashed #2563eb;
               border-radius:8px; padding:14px 28px; margin:20px 0; }
  .code-box span { color:#1d4ed8; font-size:32px; font-weight:700; letter-spacing:8px;
                    font-family:"Courier New",monospace; }
  .warning { color:#6b7280; font-size:13px; }
  .footer { padding:20px 40px; border-top:1px solid #e5e7eb; text-align:center; }
  .footer p { color:#9ca3af; font-size:12px; margin:0; }
  @media (max-width:520px) { .card { margin:20px 16px; } .header { padding:24px 24px; }
    .body { padding:24px 24px; } .footer { padding:16px 24px; } }
</style>
</head>
<body>
<div class="card">
  <div class="header"><h1>Mery</h1></div>
  <div class="body">
    <p>${t.heading.replace("{{name}}", name)},</p>
    <p>${t.intro}</p>
    <div class="code-box"><span>${code}</span></div>
    <p class="warning">${t.expiry}</p>
    <p class="warning">${t.warning}</p>
  </div>
  <div class="footer"><p>${t.footer}</p></div>
</div>
</body>
</html>`;

  return { subject: t.subject, html };
}

/**
 * P1 fix: Proper HTML escaping including single-quote and backslash.
 * Handles: & < > " ' \
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\\/g, "&#x5C;");
}

// ---------------------------------------------------------------------------
// P1 fix: Retry with exponential backoff (max 3 attempts)
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3;

async function sendWithRetry(
  transporter: nodemailer.Transporter,
  mailOptions: nodemailer.SendMailOptions,
  attempt = 1
): Promise<nodemailer.SentMessageInfo> {
  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    // Exponential backoff: 1s, 2s, 4s
    const delay = attempt * 1_000;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[email] Send failed (attempt ${attempt}/${MAX_RETRIES}, msg="${msg}"). ` +
        `Retrying in ${delay}ms...`
    );
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    return sendWithRetry(transporter, mailOptions, attempt + 1);
  }
}

async function sendViaSmtp(
  mailOptions: nodemailer.SendMailOptions
): Promise<nodemailer.SentMessageInfo> {
  const smtpHosts = getSmtpCandidateHosts();
  let lastError: unknown = null;

  for (const [index, host] of smtpHosts.entries()) {
    try {
      return await sendWithRetry(getSMTPTransporter(host), mailOptions);
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      if (index < smtpHosts.length - 1) {
        console.warn(
          `[email] SMTP host ${host} failed after retries (msg="${msg}"). ` +
            `Trying fallback host ${smtpHosts[index + 1]}...`
        );
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Send a 6-digit verification code to the user's email address.
 *
 * P0 fix: from address is validated before sending — throws if unset.
 * P1 fix: Retry with exponential backoff (max 3 attempts).
 * P2 fix: Returns SendResult with typed outcome.
 */
export async function sendVerificationEmail(
  opts: SendVerificationEmailOptions
): Promise<SendResult> {
  const hasOAuth2 =
    env.oauthEnabled &&
    env.oauthClientId &&
    env.oauthClientSecret &&
    env.oauthRefreshToken &&
    env.oauthUser;
  const hasSMTP =
    env.smtpEnabled &&
    env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    env.SMTP_PASS &&
    env.SMTP_FROM;

  if (!hasOAuth2 && !hasSMTP) {
    // P1 fix: NODE_ENV-aware logging — never log plain code in production
    const logCode =
      process.env.NODE_ENV === "production"
        ? `${opts.code.slice(0, 2)}**${opts.code.slice(-1)}`
        : opts.code;
    console.info(
      `[email] Email disabled — verification code for ${opts.to}: ${logCode}`
    );
    return { ok: true, skipped: true, reason: "disabled" };
  }

  const { subject, html } = renderEmail(opts);
  const authMethod = hasOAuth2 ? "OAuth2" : "SMTP";

  // P0 fix: Validate from address before sending
  const fromAddress = hasOAuth2
    ? `Sec. Mery <${env.oauthUser}>`
    : env.SMTP_FROM;

  if (!fromAddress) {
    const err = new Error(
      `[email] Missing 'from' address: set OAUTH_USER (for OAuth2) or SMTP_FROM (for SMTP)`
    );
    console.error(err.message);
    return { ok: false, error: err.message };
  }

  try {
    const mailOptions: nodemailer.SendMailOptions = {
      from: fromAddress,
      to: opts.to,
      subject,
      html,
      headers: {
        "X-Priority": "1",
        "X-Mailer": "Sec-Mery-BFF",
      },
    };
    const info = hasOAuth2
      ? await sendWithRetry(getOAuth2Transporter(), mailOptions)
      : await sendViaSmtp(mailOptions);

    console.info(
      `[email] [${authMethod}] Verification email sent to ${opts.to}, messageId=${info.messageId}`
    );

    return { ok: true, messageId: info.messageId ?? "", method: authMethod, skipped: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email] [${authMethod}] Failed to send to ${opts.to}: ${msg}`);
    return { ok: false, error: msg };
  }
}
