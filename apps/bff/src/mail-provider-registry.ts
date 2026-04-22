import { z } from "zod";
import type {
  MailProviderDescriptor,
  MailSourceConnectionType,
  MailSourceProvider,
} from "@mail-agent/shared-types";

export const mailSourceProviderSchema = z.enum([
  "outlook",
  "gmail",
  "icloud",
  "netease163",
  "qq",
  "aliyun",
  "custom_imap",
]);

export const mailSourceConnectionTypeSchema = z.enum([
  "composio",
  "microsoft",
  "gmail_oauth",
  "imap_password",
  "imap_oauth2",
]);

export type RegisteredMailSourceProvider = z.infer<typeof mailSourceProviderSchema>;
export type RegisteredMailSourceConnectionType = z.infer<typeof mailSourceConnectionTypeSchema>;

const providerCatalog: MailProviderDescriptor[] = [
  {
    id: "outlook",
    label: "Microsoft Outlook",
    connectionTypes: ["microsoft", "composio"],
    capabilities: ["mail_read", "calendar_write", "push", "oauth"],
    notes: [
      "Recommended path. Uses Microsoft Graph OAuth and supports mailbox read, calendar write, and webhook/poll processing.",
    ],
    setupUrl: "https://learn.microsoft.com/graph/auth-v2-user",
  },
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    connectionTypes: ["gmail_oauth", "imap_password"],
    capabilities: ["mail_read", "oauth", "imap"],
    imap: {
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      usernameHint: "email",
    },
    notes: [
      "Primary path uses Google OAuth plus the Gmail API for direct mailbox reads. IMAP remains available as a fallback for app-password-based onboarding.",
    ],
    setupUrl: "https://developers.google.com/workspace/gmail/imap/imap-smtp",
  },
  {
    id: "icloud",
    label: "Apple iCloud Mail",
    connectionTypes: ["imap_password"],
    capabilities: ["mail_read", "imap"],
    imap: {
      host: "imap.mail.me.com",
      port: 993,
      secure: true,
      usernameHint: "email",
    },
    notes: [
      "Requires an Apple app-specific password. IMAP reads mail only; calendar writing needs a future CalDAV/EventKit-style integration.",
    ],
    setupUrl: "https://support.apple.com/102525",
  },
  {
    id: "netease163",
    label: "网易 163 邮箱",
    connectionTypes: ["imap_password"],
    capabilities: ["mail_read", "imap"],
    imap: {
      host: "imap.163.com",
      port: 993,
      secure: true,
      usernameHint: "email",
    },
    notes: [
      "Use the client authorization code generated after enabling POP3/SMTP/IMAP in 163 Mail settings.",
    ],
  },
  {
    id: "qq",
    label: "QQ 邮箱",
    connectionTypes: ["imap_password"],
    capabilities: ["mail_read", "imap"],
    imap: {
      host: "imap.qq.com",
      port: 993,
      secure: true,
      usernameHint: "email",
    },
    notes: [
      "Use the authorization code generated after enabling IMAP/SMTP in QQ Mail account settings.",
    ],
  },
  {
    id: "aliyun",
    label: "阿里邮箱",
    connectionTypes: ["imap_password"],
    capabilities: ["mail_read", "imap"],
    imap: {
      host: "imap.aliyun.com",
      port: 993,
      secure: true,
      usernameHint: "email",
    },
    notes: [
      "Free personal Aliyun Mail uses imap.aliyun.com. Enterprise Ali Mail often uses imap.qiye.aliyun.com or imap.mxhichina.com; override the host when needed.",
    ],
    setupUrl: "https://help.aliyun.com/document_detail/465307.html",
  },
  {
    id: "custom_imap",
    label: "Custom IMAP",
    connectionTypes: ["imap_password"],
    capabilities: ["mail_read", "imap"],
    notes: [
      "For school or enterprise mailboxes that expose a standard IMAP endpoint. Calendar write requires a provider-specific integration.",
    ],
  },
];

const providerById = new Map(providerCatalog.map((provider) => [provider.id, provider]));

export function getMailProviderCatalog(): MailProviderDescriptor[] {
  return providerCatalog.map((provider) => ({
    ...provider,
    connectionTypes: [...provider.connectionTypes],
    capabilities: [...provider.capabilities],
    notes: [...provider.notes],
    ...(provider.imap ? { imap: { ...provider.imap } } : {}),
  }));
}

export function getMailProviderDescriptor(
  provider: MailSourceProvider
): MailProviderDescriptor | null {
  return providerById.get(provider) ?? null;
}

export function isMailSourceProvider(value: unknown): value is MailSourceProvider {
  return typeof value === "string" && mailSourceProviderSchema.safeParse(value).success;
}

export function isMailSourceConnectionType(value: unknown): value is MailSourceConnectionType {
  return typeof value === "string" && mailSourceConnectionTypeSchema.safeParse(value).success;
}

export function providerSupportsConnectionType(
  provider: MailSourceProvider,
  connectionType: MailSourceConnectionType
): boolean {
  return getMailProviderDescriptor(provider)?.connectionTypes.includes(connectionType) ?? false;
}

export function resolveImapDefaults(provider: MailSourceProvider): MailProviderDescriptor["imap"] | null {
  return getMailProviderDescriptor(provider)?.imap ?? null;
}
