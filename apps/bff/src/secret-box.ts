import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./config.js";

const algorithm = "aes-256-gcm";
const version = "v1";

function toBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function encryptionKey(): Buffer | null {
  const raw = env.appEncryptionKey.trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("base64:")) {
    const decoded = Buffer.from(raw.slice("base64:".length), "base64");
    if (decoded.length !== 32) {
      throw new Error("APP_ENCRYPTION_KEY base64 value must decode to 32 bytes");
    }
    return decoded;
  }

  const maybeBase64 = Buffer.from(raw, "base64");
  if (maybeBase64.length === 32 && maybeBase64.toString("base64").replace(/=+$/g, "") === raw.replace(/=+$/g, "")) {
    return maybeBase64;
  }

  if (raw.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY must be at least 32 characters or base64:32-bytes");
  }

  return createHash("sha256").update(raw).digest();
}

export function hasAppEncryptionKey(): boolean {
  return env.appEncryptionKey.trim().length > 0;
}

export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY is required to encrypt provider credentials");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, toBase64Url(iv), toBase64Url(tag), toBase64Url(ciphertext)].join(":");
}

export function decryptSecret(ciphertext: string): string {
  const key = encryptionKey();
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY is required to decrypt provider credentials");
  }

  const [prefix, ivRaw, tagRaw, bodyRaw] = ciphertext.split(":");
  if (prefix !== version || !ivRaw || !tagRaw || !bodyRaw) {
    throw new Error("Unsupported encrypted secret format");
  }

  const decipher = createDecipheriv(algorithm, key, fromBase64Url(ivRaw));
  decipher.setAuthTag(fromBase64Url(tagRaw));
  return Buffer.concat([decipher.update(fromBase64Url(bodyRaw)), decipher.final()]).toString("utf8");
}
