import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type ImapMailConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
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

const maxImapBodyBytes = 512_000;

function createImapClient(config: ImapMailConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    clientInfo: {
      name: "Mery Mail Agent",
      vendor: "Mery",
      version: "1.0.0",
    },
    connectionTimeout: 20_000,
    greetingTimeout: 16_000,
    socketTimeout: 60_000,
    logger: false,
  });
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function previewFromBody(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return normalizeWhitespace(value.replace(/<[^>]*>/g, " ")).slice(0, 500);
}

function extractFirstAddress(parsed: any, envelope: any): { address: string; name: string } {
  const parsedAddress = parsed?.from?.value?.[0];
  const envelopeAddress = Array.isArray(envelope?.from) ? envelope.from[0] : null;
  const address = String(parsedAddress?.address ?? envelopeAddress?.address ?? "").trim();
  const name = String(parsedAddress?.name ?? envelopeAddress?.name ?? address).trim();
  return { address, name };
}

function receivedDate(parsed: any, internalDate: unknown, envelope: any): string {
  const candidates = [parsed?.date, envelope?.date, internalDate];
  for (const candidate of candidates) {
    const date = candidate instanceof Date ? candidate : candidate ? new Date(candidate) : null;
    if (date && !Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return new Date().toISOString();
}

async function messageFromFetchResult(message: any): Promise<GraphLikeMailMessage> {
  const parsed: any = message.source ? await simpleParser(message.source) : {};
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const text = typeof parsed.text === "string" ? parsed.text : "";
  const bodyContent = html || text || "";
  const from = extractFirstAddress(parsed, message.envelope);
  const subject = String(parsed.subject ?? message.envelope?.subject ?? "(无主题)");
  const id = `imap:${message.uid}`;

  return {
    id,
    subject,
    from: {
      emailAddress: {
        address: from.address,
        name: from.name,
      },
    },
    bodyPreview: previewFromBody(text || html),
    receivedDateTime: receivedDate(parsed, message.internalDate, message.envelope),
    importance: "normal",
    isRead: message.flags instanceof Set ? message.flags.has("\\Seen") : false,
    hasAttachments: Array.isArray(parsed.attachments) ? parsed.attachments.length > 0 : false,
    webLink: "",
    body: {
      contentType: html ? "html" : "text",
      content: bodyContent,
    },
  };
}

function uidFromMessageId(messageId: string): number {
  const raw = messageId.startsWith("imap:") ? messageId.slice("imap:".length) : messageId;
  const uid = Number(raw);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error("IMAP_MESSAGE_ID_INVALID");
  }
  return uid;
}

export async function verifyImapConnection(config: ImapMailConfig): Promise<void> {
  const client = createImapClient(config);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

export async function listImapInboxMessages(
  config: ImapMailConfig,
  options: {
    limit: number;
    skip?: number;
    receivedAfter?: string;
  }
): Promise<GraphLikeMailMessage[]> {
  const client = createImapClient(config);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    const searchQuery: { all?: true; since?: Date } = { all: true };
    if (options.receivedAfter?.trim()) {
      const since = new Date(options.receivedAfter);
      if (!Number.isNaN(since.getTime())) {
        searchQuery.since = since;
      }
    }

    const matched = await client.search(searchQuery, { uid: true });
    const uids = Array.isArray(matched) ? matched : [];
    const skip = Math.max(0, Math.trunc(options.skip ?? 0));
    const limit = Math.max(1, Math.min(Math.trunc(options.limit), 100));
    const selected = uids
      .sort((left, right) => right - left)
      .slice(skip, skip + limit)
      .sort((left, right) => left - right);

    if (selected.length === 0) {
      return [];
    }

    const messages: GraphLikeMailMessage[] = [];
    for await (const message of client.fetch(
      selected,
      {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        source: { maxLength: maxImapBodyBytes },
      },
      { uid: true }
    )) {
      messages.push(await messageFromFetchResult(message));
    }

    return messages.sort((left, right) => {
      const leftTime = left.receivedDateTime ? new Date(left.receivedDateTime).getTime() : 0;
      const rightTime = right.receivedDateTime ? new Date(right.receivedDateTime).getTime() : 0;
      return rightTime - leftTime;
    });
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

export async function getImapMessageById(
  config: ImapMailConfig,
  messageId: string
): Promise<GraphLikeMailMessage> {
  const client = createImapClient(config);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    const uid = uidFromMessageId(messageId);
    const message = await client.fetchOne(
      uid,
      {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        source: { maxLength: maxImapBodyBytes },
      },
      { uid: true }
    );
    if (!message) {
      throw new Error("IMAP_MESSAGE_NOT_FOUND");
    }
    return messageFromFetchResult(message);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
