import { z } from "zod";
import { invokeTool } from "./gateway.js";

const rawToolContentItemSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
}).passthrough();

const rawToolInvokeResultSchema = z.object({
  ok: z.boolean().optional(),
  content: z.array(rawToolContentItemSchema).optional(),
  result: z
    .object({
      content: z.array(rawToolContentItemSchema).optional(),
      details: z.unknown().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

const composioToolResultSchema = z.object({
  tool_slug: z.string().optional(),
  error: z.string().nullable().optional(),
  response: z
    .object({
      successful: z.boolean().optional(),
      data: z.unknown().optional(),
      error: z.string().nullable().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

const composioMultiExecutePayloadSchema = z.object({
  successful: z.boolean().optional(),
  data: z
    .object({
      results: z.array(composioToolResultSchema).optional(),
    })
    .passthrough()
    .optional(),
  error: z.string().nullable().optional(),
}).passthrough();

const outlookAddressSchema = z.object({
  emailAddress: z
    .object({
      address: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

const outlookMessageSchema = z.object({
  id: z.string().optional(),
  subject: z.string().optional(),
  from: outlookAddressSchema.optional(),
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

const outlookEventDateTimeSchema = z.object({
  dateTime: z.string().optional(),
  timeZone: z.string().optional(),
});

const outlookCreatedEventSchema = z.object({
  id: z.string().optional(),
  subject: z.string().optional(),
  webLink: z.string().optional(),
  start: outlookEventDateTimeSchema.optional(),
  end: outlookEventDateTimeSchema.optional(),
});

type RawToolInvokeResult = z.infer<typeof rawToolInvokeResultSchema>;
type ComposioMultiExecutePayload = z.infer<typeof composioMultiExecutePayloadSchema>;
type ComposioToolResult = z.infer<typeof composioToolResultSchema>;
type OutlookMessage = z.infer<typeof outlookMessageSchema>;
type OutlookCreatedEvent = z.infer<typeof outlookCreatedEventSchema>;

export type MailSourceContext = {
  sourceId: string;
  mailboxUserId?: string;
  connectedAccountId?: string;
};

export type MailQuadrant =
  | "urgent_important"
  | "not_urgent_important"
  | "urgent_not_important"
  | "not_urgent_not_important";

export type TriageMailItem = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
  importance: string;
  hasAttachments: boolean;
  webLink: string;
  quadrant: MailQuadrant;
  score: {
    urgency: number;
    importance: number;
  };
  reasons: string[];
};

export type MailTriageResponse = {
  generatedAt: string;
  total: number;
  counts: Record<MailQuadrant, number>;
  quadrants: Record<MailQuadrant, TriageMailItem[]>;
  allItems: TriageMailItem[];
};

export type MailDetailResponse = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedDateTime: string;
  importance: string;
  isRead: boolean;
  hasAttachments: boolean;
  webLink: string;
  bodyContentType: string;
  bodyContent: string;
  bodyPreview: string;
};

export type MailInboxViewerItem = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
  importance: string;
  hasAttachments: boolean;
  webLink: string;
};

export type MailInboxViewerResponse = {
  generatedAt: string;
  total: number;
  items: MailInboxViewerItem[];
};

export type MailInsightType = "ddl" | "meeting" | "exam" | "event";

export type MailInsightItem = {
  messageId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedDateTime: string;
  quadrant: MailQuadrant;
  type: MailInsightType;
  dueAt: string;
  dueDateLabel: string;
  confidence: number;
  evidence: string;
  reasons: string[];
};

export type MailSignalWithoutDate = {
  messageId: string;
  subject: string;
  fromName: string;
  quadrant: MailQuadrant;
  type: MailInsightType;
  evidence: string;
};

export type MailInsightsResponse = {
  generatedAt: string;
  horizonDays: number;
  timeZone: string;
  sourceCount: number;
  digest: {
    date: string;
    total: number;
    unread: number;
    urgentImportant: number;
    highImportance: number;
    upcomingCount: number;
    tomorrowDdlCount: number;
  };
  tomorrowDdl: MailInsightItem[];
  upcoming: MailInsightItem[];
  signalsWithoutDate: MailSignalWithoutDate[];
};

export type MailQaIntent =
  | "tomorrow_ddl"
  | "upcoming"
  | "unread_count"
  | "urgent_important"
  | "unknown";

export type MailQaReference = {
  messageId: string;
  subject: string;
  fromName: string;
  fromAddress?: string;
  receivedDateTime?: string;
  dueAt?: string;
  dueDateLabel?: string;
  evidence?: string;
  type?: MailInsightType;
  quadrant?: MailQuadrant;
};

export type MailQaResponse = {
  generatedAt: string;
  question: string;
  intent: MailQaIntent;
  answer: string;
  horizonDays: number;
  timeZone: string;
  references: MailQaReference[];
};

export type MailPriorityRuleField = "from" | "subject" | "body" | "any";

export type MailPriorityRule = {
  id: string;
  name: string;
  pattern: string;
  field: MailPriorityRuleField;
  quadrant: MailQuadrant;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MailCalendarSyncInput = {
  messageId: string;
  subject: string;
  type: MailInsightType;
  dueAt: string;
  dueDateLabel?: string;
  evidence?: string;
  timeZone?: string;
};

export type MailCalendarSyncResponse = {
  eventId: string;
  eventSubject: string;
  eventWebLink: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
};

export type MailCalendarDeleteResponse = {
  eventId: string;
  deleted: boolean;
  alreadyDeleted: boolean;
};

export type MailRoutingProbeResult = {
  ok: boolean;
  error?: string;
};

function extractGraphErrorCode(raw: string): string | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        code?: unknown;
      };
    };
    const code = parsed.error?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

type KeywordRule = {
  label: string;
  regex: RegExp;
};

type InsightDetection = {
  type: MailInsightType;
  confidence: number;
  evidence: string;
  reasons: string[];
};

type MailQaIntentAnalysis = {
  intent: MailQaIntent;
  requestedDays: number | null;
  typeFilter: MailInsightType | "all";
  onlyTomorrow: boolean;
};

type TimeHint = {
  hour: number;
  minute: number;
  matched: string;
  confidence: number;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type ZonedDateTimeParts = LocalDateParts & {
  hour: number;
  minute: number;
};

type DateHint = {
  localDate: LocalDateParts;
  matched: string;
  confidence: number;
};

const ddlRules: KeywordRule[] = [
  { label: "deadline", regex: /\bdeadline\b/i },
  { label: "ddl", regex: /\bddl\b/i },
  { label: "due", regex: /\bdue\b/i },
  { label: "overdue", regex: /\boverdue\b/i },
  { label: "submit by", regex: /\bsubmit\s+by\b/i },
  { label: "截止", regex: /截止|截至|到期/ },
  { label: "提交", regex: /提交|上交|交作业/ },
];

const meetingRules: KeywordRule[] = [
  { label: "meeting", regex: /\bmeeting\b/i },
  { label: "zoom/teams", regex: /\b(zoom|teams|webex)\b/i },
  { label: "office hours", regex: /\boffice\s+hours\b/i },
  { label: "interview", regex: /\binterview\b/i },
  { label: "seminar", regex: /\bseminar\b/i },
  { label: "会议", regex: /会议|组会|例会|答辩/ },
];

const examRules: KeywordRule[] = [
  { label: "exam", regex: /\bexam\b/i },
  { label: "quiz", regex: /\bquiz\b/i },
  { label: "midterm/final", regex: /\b(midterm|final)\b/i },
  { label: "test", regex: /\btest\b/i },
  { label: "考试", regex: /考试|测验|期中|期末/ },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeTimeZone(input: string | undefined): string {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  if (!input) {
    return fallback;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input }).format(new Date());
    return input;
  } catch {
    return fallback;
  }
}

function getZonedDateTimeParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);

  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;

  for (const part of parts) {
    if (part.type === "year") {
      year = Number(part.value);
    } else if (part.type === "month") {
      month = Number(part.value);
    } else if (part.type === "day") {
      day = Number(part.value);
    } else if (part.type === "hour") {
      hour = Number(part.value);
    } else if (part.type === "minute") {
      minute = Number(part.value);
    }
  }

  if (hour === 24) {
    hour = 0;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
  };
}

function dateKeyFromLocalDate(localDate: LocalDateParts): string {
  const year = String(localDate.year);
  const month = String(localDate.month).padStart(2, "0");
  const day = String(localDate.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateInTimeZone(
  date: Date,
  timeZone: string
): {
  dateKey: string;
  dateTimeLabel: string;
} {
  const local = getZonedDateTimeParts(date, timeZone);
  const dateKey = dateKeyFromLocalDate(local);
  const hour = String(local.hour).padStart(2, "0");
  const minute = String(local.minute).padStart(2, "0");

  return {
    dateKey,
    dateTimeLabel: `${dateKey} ${hour}:${minute}`,
  };
}

function formatIsoLocalDateTimeInTimeZone(date: Date, timeZone: string): string {
  const local = getZonedDateTimeParts(date, timeZone);
  const year = String(local.year);
  const month = String(local.month).padStart(2, "0");
  const day = String(local.day).padStart(2, "0");
  const hour = String(local.hour).padStart(2, "0");
  const minute = String(local.minute).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
}

function isValidLocalDate(date: LocalDateParts): boolean {
  const candidate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return (
    candidate.getUTCFullYear() === date.year &&
    candidate.getUTCMonth() === date.month - 1 &&
    candidate.getUTCDate() === date.day
  );
}

function addDaysToLocalDate(base: LocalDateParts, offsetDays: number): LocalDateParts {
  const moved = new Date(Date.UTC(base.year, base.month - 1, base.day + offsetDays));
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

function compareLocalDate(left: LocalDateParts, right: LocalDateParts): number {
  const leftMs = Date.UTC(left.year, left.month - 1, left.day);
  const rightMs = Date.UTC(right.year, right.month - 1, right.day);
  return leftMs - rightMs;
}

function dayOfWeekForLocalDate(localDate: LocalDateParts): number {
  return new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)).getUTCDay();
}

function resolveLocalDateTimeToUtcCandidates(
  localDate: LocalDateParts,
  hour: number,
  minute: number,
  timeZone: string
): Date[] {
  let guess = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day, hour, minute, 0, 0));

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = getZonedDateTimeParts(guess, timeZone);
    const desiredMs = Date.UTC(localDate.year, localDate.month - 1, localDate.day, hour, minute, 0, 0);
    const actualMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0);
    const deltaMinutes = Math.round((desiredMs - actualMs) / 60000);

    if (deltaMinutes === 0) {
      break;
    }

    guess = new Date(guess.getTime() + deltaMinutes * 60000);
  }

  const resolved = getZonedDateTimeParts(guess, timeZone);
  if (
    resolved.year !== localDate.year ||
    resolved.month !== localDate.month ||
    resolved.day !== localDate.day ||
    resolved.hour !== hour ||
    resolved.minute !== minute
  ) {
    return [];
  }

  const matches = new Set<number>();

  // DST fallback can create two UTC instants for the same local wall-clock time.
  for (let delta = -180; delta <= 180; delta += 1) {
    const candidate = new Date(guess.getTime() + delta * 60000);
    const parts = getZonedDateTimeParts(candidate, timeZone);
    if (
      parts.year === localDate.year &&
      parts.month === localDate.month &&
      parts.day === localDate.day &&
      parts.hour === hour &&
      parts.minute === minute
    ) {
      matches.add(candidate.getTime());
    }
  }

  if (matches.size === 0) {
    return [guess];
  }

  return [...matches]
    .sort((left, right) => left - right)
    .map((value) => new Date(value));
}

function parseToolTextJson(value: unknown): ComposioMultiExecutePayload {
  let raw: RawToolInvokeResult;

  try {
    raw = rawToolInvokeResultSchema.parse(value);
  } catch {
    throw new Error("Unexpected tool response shape");
  }

  const contentCandidates = [raw.result?.content, raw.content];
  let text: string | undefined;
  for (const content of contentCandidates) {
    const candidateText = content?.find((item) => item.type === "text")?.text;
    if (candidateText) {
      text = candidateText;
      break;
    }
  }
  if (!text) {
    throw new Error("Tool response missing text payload");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Tool text payload is not valid JSON");
  }

  const validated = composioMultiExecutePayloadSchema.safeParse(parsed);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    const issuePath = issue?.path?.join(".") || "unknown";
    const issueMessage = issue?.message || "unknown mismatch";
    throw new Error(`Parsed tool payload schema mismatch at ${issuePath}: ${issueMessage}`);
  }

  return validated.data;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractComposioResponseData(result: ComposioToolResult): unknown {
  const response = asRecord(result.response);
  if (!response) {
    return undefined;
  }

  if ("data" in response) {
    return response.data;
  }

  if ("value" in response || "messages" in response || "items" in response) {
    return response;
  }

  const nestedKeys = ["result", "output", "payload", "body", "response"];
  for (const key of nestedKeys) {
    const nested = asRecord(response[key]);
    if (!nested) {
      continue;
    }

    if ("data" in nested) {
      return nested.data;
    }

    if ("value" in nested || "messages" in nested || "items" in nested) {
      return nested;
    }
  }

  return undefined;
}

function isComposioResponseSuccessful(response: ComposioToolResult["response"]): boolean {
  if (response?.successful === true) {
    return true;
  }

  if (response?.successful === false) {
    return false;
  }

  const responseRecord = asRecord(response);
  if (!responseRecord) {
    return false;
  }

  const rawError = responseRecord.error;
  if (typeof rawError === "string" && rawError.trim().length > 0) {
    return false;
  }

  if ("data" in responseRecord || "value" in responseRecord || "messages" in responseRecord || "items" in responseRecord) {
    return true;
  }

  return false;
}

function isComposioPayloadSuccessful(payload: ComposioMultiExecutePayload): boolean {
  if (payload.successful === true) {
    return true;
  }

  if (payload.successful === false) {
    return false;
  }

  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    return false;
  }

  return Boolean(payload.data?.results && payload.data.results.length > 0);
}

function requireResultItem(
  payload: ComposioMultiExecutePayload,
  expectedToolSlug: "OUTLOOK_QUERY_EMAILS" | "OUTLOOK_GET_MESSAGE" | "OUTLOOK_CREATE_ME_EVENT"
): ComposioToolResult {
  if (!isComposioPayloadSuccessful(payload)) {
    throw new Error(payload.error ?? "Composio multi execute failed");
  }

  const result = payload.data?.results?.[0];
  if (!result) {
    throw new Error("Composio response does not contain any result item");
  }

  if (result.tool_slug !== expectedToolSlug) {
    throw new Error(`Unexpected tool slug: ${result.tool_slug ?? "unknown"}`);
  }

  if (!isComposioResponseSuccessful(result.response)) {
    throw new Error(result.response?.error ?? result.error ?? payload.error ?? `${expectedToolSlug} execution failed`);
  }

  return result;
}

function requireResultData(
  payload: ComposioMultiExecutePayload,
  expectedToolSlug: "OUTLOOK_QUERY_EMAILS" | "OUTLOOK_GET_MESSAGE" | "OUTLOOK_CREATE_ME_EVENT"
): Record<string, unknown> {
  const result = requireResultItem(payload, expectedToolSlug);
  const responseData = extractComposioResponseData(result);
  const data = asRecord(responseData);

  if (!data) {
    const responseKeys = asRecord(result.response) ? Object.keys(asRecord(result.response) ?? {}) : [];
    const responseKeysHint = responseKeys.length > 0 ? responseKeys.join(",") : "none";
    throw new Error(`${expectedToolSlug} response data is missing (response keys: ${responseKeysHint})`);
  }

  return data;
}

function extractOutlookQueryMessages(responseData: unknown): unknown[] | null {
  if (Array.isArray(responseData)) {
    return responseData;
  }

  const data = asRecord(responseData);
  if (!data) {
    return null;
  }

  const directKeys = ["value", "messages", "items"];
  for (const key of directKeys) {
    const candidate = data[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  const nestedKeys = ["data", "result", "payload", "body", "response"];
  for (const key of nestedKeys) {
    const nested = asRecord(data[key]);
    if (!nested) {
      continue;
    }
    for (const directKey of directKeys) {
      const candidate = nested[directKey];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function asMessagesFromMultiExecute(payload: ComposioMultiExecutePayload): OutlookMessage[] {
  const result = requireResultItem(payload, "OUTLOOK_QUERY_EMAILS");
  const responseData = extractComposioResponseData(result);
  const extractedMessages = extractOutlookQueryMessages(responseData);
  let messages: unknown[] = [];

  if (extractedMessages) {
    messages = extractedMessages;
  } else if (responseData !== undefined && responseData !== null) {
    const dataKeys = asRecord(responseData) ? Object.keys(asRecord(responseData) ?? {}) : [];
    const dataKeysHint = dataKeys.length > 0 ? dataKeys.join(",") : "none";
    throw new Error(`OUTLOOK_QUERY_EMAILS data.value schema mismatch (response data keys: ${dataKeysHint})`);
  }

  const parsed = z.array(outlookMessageSchema).safeParse(messages);
  if (!parsed.success) {
    throw new Error("OUTLOOK_QUERY_EMAILS data.value schema mismatch");
  }

  return parsed.data;
}

function asDetailFromMultiExecute(payload: ComposioMultiExecutePayload): OutlookMessage {
  const data = requireResultData(payload, "OUTLOOK_GET_MESSAGE");
  const parsed = outlookMessageSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error("OUTLOOK_GET_MESSAGE response schema mismatch");
  }

  return parsed.data;
}

function asCreateEventFromMultiExecute(payload: ComposioMultiExecutePayload): OutlookCreatedEvent {
  const data = requireResultData(payload, "OUTLOOK_CREATE_ME_EVENT");
  const candidate =
    "data" in data && data.data && typeof data.data === "object"
      ? (data.data as Record<string, unknown>)
      : data;
  const parsed = outlookCreatedEventSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new Error("OUTLOOK_CREATE_ME_EVENT response schema mismatch");
  }

  return parsed.data;
}

function normalizeSourceContext(sourceContext?: MailSourceContext): MailSourceContext | null {
  if (!sourceContext) {
    return null;
  }

  const sourceId = sourceContext.sourceId.trim();
  if (!sourceId) {
    return null;
  }

  const mailboxUserId = sourceContext.mailboxUserId?.trim();
  const connectedAccountId = sourceContext.connectedAccountId?.trim();

  return {
    sourceId,
    ...(mailboxUserId ? { mailboxUserId } : {}),
    ...(connectedAccountId ? { connectedAccountId } : {}),
  };
}

function withSourceAwareToolArguments(
  toolSlug: string,
  args: Record<string, unknown>,
  sourceContext: MailSourceContext | null
): Record<string, unknown> {
  if (!sourceContext?.mailboxUserId) {
    return args;
  }

  if (
    toolSlug !== "OUTLOOK_QUERY_EMAILS" &&
    toolSlug !== "OUTLOOK_GET_MESSAGE" &&
    toolSlug !== "OUTLOOK_CREATE_ME_EVENT" &&
    toolSlug !== "OUTLOOK_GET_EVENT" &&
    toolSlug !== "OUTLOOK_DELETE_EVENT"
  ) {
    return args;
  }

  if ("user_id" in args && typeof args.user_id === "string" && args.user_id.trim().length > 0) {
    if (args.user_id.trim() !== "me") {
      return args;
    }
  }

  return {
    ...args,
    user_id: sourceContext.mailboxUserId,
  };
}

function composioMultiExecuteArgs(
  tools: Array<{
    tool_slug: string;
    arguments: Record<string, unknown>;
  }>,
  sourceContext?: MailSourceContext
): Record<string, unknown> {
  const normalizedContext = normalizeSourceContext(sourceContext);

  const scopedTools = tools.map((item) => ({
    tool_slug: item.tool_slug,
    arguments: withSourceAwareToolArguments(item.tool_slug, item.arguments, normalizedContext),
  }));

  return {
    tools: scopedTools,
    ...(normalizedContext?.connectedAccountId
      ? { connected_account_id: normalizedContext.connectedAccountId }
      : {}),
  };
}

export async function probeOutlookRouting(
  sourceContext?: Pick<MailSourceContext, "mailboxUserId" | "connectedAccountId">
): Promise<MailRoutingProbeResult> {
  const context: MailSourceContext = {
    sourceId: "source_probe",
    ...(sourceContext?.mailboxUserId ? { mailboxUserId: sourceContext.mailboxUserId } : {}),
    ...(sourceContext?.connectedAccountId
      ? { connectedAccountId: sourceContext.connectedAccountId }
      : {}),
  };

  const runProbeTool = async (
    toolSlug: "OUTLOOK_GET_ME" | "OUTLOOK_QUERY_EMAILS",
    args: Record<string, unknown>
  ) => {
    const raw = await invokeTool({
      tool: "COMPOSIO_MULTI_EXECUTE_TOOL",
      args: composioMultiExecuteArgs(
        [
          {
            tool_slug: toolSlug,
            arguments: args,
          },
        ],
        context
      ),
    });

    const payload = parseToolTextJson(raw);
    if (!isComposioPayloadSuccessful(payload)) {
      throw new Error(payload.error ?? `${toolSlug} probe failed`);
    }

    const result = payload.data?.results?.[0];
    if (!result) {
      throw new Error(`${toolSlug} probe returned no result item`);
    }

    if (!isComposioResponseSuccessful(result.response)) {
      throw new Error(result.response?.error ?? `${toolSlug} probe failed`);
    }
  };

  const shouldFallbackFromGetMeProbe = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error);
    if (/unauthorized|forbidden|insufficient|invalid (auth|token)|401|403/i.test(message)) {
      return false;
    }

    return /OUTLOOK_GET_ME|tool not available|unexpected tool slug|not implemented|1 out of 1 tools failed/i.test(
      message
    );
  };

  try {
    // Prefer lightweight account probe. If unavailable upstream, fall back to query probe.
    try {
      await runProbeTool("OUTLOOK_GET_ME", {});
    } catch (error) {
      if (!shouldFallbackFromGetMeProbe(error)) {
        throw error;
      }
      await runProbeTool("OUTLOOK_QUERY_EMAILS", {
        folder: "inbox",
        top: 1,
        orderby: "receivedDateTime desc",
        select: ["id"],
      });
    }

    // If mailbox routing context is provided, explicitly verify mailbox-level routing.
    if (context.mailboxUserId) {
      await runProbeTool("OUTLOOK_QUERY_EMAILS", {
        folder: "inbox",
        top: 1,
        orderby: "receivedDateTime desc",
        select: ["id"],
      });
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function stripHtmlTags(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function quadrantLabel(quadrant: MailQuadrant): string {
  if (quadrant === "urgent_important") {
    return "紧急且重要";
  }

  if (quadrant === "not_urgent_important") {
    return "重要不紧急";
  }

  if (quadrant === "urgent_not_important") {
    return "紧急不重要";
  }

  return "不紧急不重要";
}

function firstMatchedPriorityRule(
  input: {
    subject: string;
    fromAddress: string;
    bodyPreview: string;
  },
  rules: MailPriorityRule[]
): MailPriorityRule | null {
  if (rules.length === 0) {
    return null;
  }

  const sortedRules = [...rules].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    return left.id.localeCompare(right.id);
  });

  const subject = input.subject.toLowerCase();
  const fromAddress = input.fromAddress.toLowerCase();
  const bodyPreview = input.bodyPreview.toLowerCase();
  const anyText = `${subject}\n${fromAddress}\n${bodyPreview}`;

  for (const rule of sortedRules) {
    if (!rule.enabled) {
      continue;
    }

    const normalizedPattern = rule.pattern.trim().toLowerCase();
    if (!normalizedPattern) {
      continue;
    }

    if (rule.field === "from" && fromAddress.includes(normalizedPattern)) {
      return rule;
    }

    if (rule.field === "subject" && subject.includes(normalizedPattern)) {
      return rule;
    }

    if (rule.field === "body" && bodyPreview.includes(normalizedPattern)) {
      return rule;
    }

    if (rule.field === "any" && anyText.includes(normalizedPattern)) {
      return rule;
    }
  }

  return null;
}

function forceScoresByQuadrant(
  urgency: number,
  importance: number,
  quadrant: MailQuadrant
): {
  urgency: number;
  importance: number;
} {
  if (quadrant === "urgent_important") {
    return {
      urgency: Math.max(urgency, 3),
      importance: Math.max(importance, 3),
    };
  }

  if (quadrant === "not_urgent_important") {
    return {
      urgency: Math.min(urgency, 2),
      importance: Math.max(importance, 3),
    };
  }

  if (quadrant === "urgent_not_important") {
    return {
      urgency: Math.max(urgency, 3),
      importance: Math.min(importance, 2),
    };
  }

  return {
    urgency: Math.min(urgency, 2),
    importance: Math.min(importance, 2),
  };
}

function normalizeMessage(message: OutlookMessage, priorityRules: MailPriorityRule[] = []): TriageMailItem | null {
  const id = message.id?.trim();
  if (!id) {
    return null;
  }

  const subject = (message.subject ?? "(No Subject)").trim();
  const fromAddress = message.from?.emailAddress?.address?.trim() ?? "";
  const fromName = message.from?.emailAddress?.name?.trim() || fromAddress || "Unknown Sender";
  const bodyPreview = (message.bodyPreview ?? "").trim();
  const receivedDateTime = message.receivedDateTime ?? "";
  const importance = (message.importance ?? "normal").toLowerCase();
  const isRead = Boolean(message.isRead);
  const hasAttachments = Boolean(message.hasAttachments);
  const webLink = message.webLink ?? "";

  const scored = classifyMessage({
    subject,
    fromAddress,
    bodyPreview,
    importance,
    isRead,
    hasAttachments,
    receivedDateTime,
  }, priorityRules);

  return {
    id,
    subject,
    fromName,
    fromAddress,
    bodyPreview,
    receivedDateTime,
    isRead,
    importance,
    hasAttachments,
    webLink,
    quadrant: scored.quadrant,
    score: {
      urgency: scored.urgency,
      importance: scored.importance,
    },
    reasons: scored.reasons,
  };
}

function normalizeInboxViewerMessage(message: OutlookMessage): MailInboxViewerItem | null {
  const id = message.id?.trim();
  if (!id) {
    return null;
  }

  const fromAddress = message.from?.emailAddress?.address?.trim() ?? "";
  const fromName = message.from?.emailAddress?.name?.trim() || fromAddress || "Unknown Sender";

  return {
    id,
    subject: (message.subject ?? "(No Subject)").trim(),
    fromName,
    fromAddress,
    bodyPreview: (message.bodyPreview ?? "").trim(),
    receivedDateTime: message.receivedDateTime ?? "",
    isRead: Boolean(message.isRead),
    importance: (message.importance ?? "normal").toLowerCase(),
    hasAttachments: Boolean(message.hasAttachments),
    webLink: message.webLink ?? "",
  };
}

function classifyMessage(input: {
  subject: string;
  fromAddress: string;
  bodyPreview: string;
  importance: string;
  isRead: boolean;
  hasAttachments: boolean;
  receivedDateTime: string;
},
priorityRules: MailPriorityRule[] = []): {
  quadrant: MailQuadrant;
  urgency: number;
  importance: number;
  reasons: string[];
} {
  const text = `${input.subject}\n${input.bodyPreview}`.toLowerCase();
  const fromAddress = input.fromAddress.toLowerCase();
  const reasons: string[] = [];

  let urgency = 0;
  let importance = 0;

  const urgentKeywords: Array<{ label: string; regex: RegExp }> = [
    { label: "urgent", regex: /\burgent\b/ },
    { label: "asap", regex: /\basap\b/ },
    { label: "immediately", regex: /\bimmediately\b/ },
    { label: "action required", regex: /\baction\s+required\b/ },
    { label: "final reminder", regex: /\bfinal\s+reminder\b/ },
    { label: "deadline", regex: /\bdeadline\b/ },
    { label: "ddl", regex: /\bddl\b/ },
    { label: "due-by", regex: /\bdue\s+(by|on|tomorrow|today)\b/ },
    { label: "今天/明天/今晚", regex: /(今天|明天|今晚)/ },
    { label: "截止/尽快/马上", regex: /(截止|尽快|马上)/ },
  ];

  const importantKeywords: Array<{ label: string; regex: RegExp }> = [
    { label: "exam", regex: /\bexam\b/ },
    { label: "quiz", regex: /\bquiz\b/ },
    { label: "assignment", regex: /\bassignment\b/ },
    { label: "project", regex: /\bproject\b/ },
    { label: "thesis", regex: /\bthesis\b/ },
    { label: "advisor/professor", regex: /\b(advisor|professor)\b/ },
    { label: "tuition/scholarship", regex: /\b(tuition|scholarship)\b/ },
    { label: "course/meeting/interview", regex: /\b(course|meeting|interview)\b/ },
    { label: "midterm/final", regex: /\b(midterm|final)\b/ },
    { label: "考试/作业/课程", regex: /(考试|作业|课程)/ },
    { label: "导师/论文/答辩", regex: /(导师|论文|答辩)/ },
    { label: "奖学金/学费/会议", regex: /(奖学金|学费|会议)/ },
  ];

  if (input.importance === "high") {
    urgency += 2;
    importance += 2;
    reasons.push("发件方标记为高重要性");
  }

  if (!input.isRead) {
    urgency += 1;
    reasons.push("未读邮件");
  }

  if (input.hasAttachments) {
    importance += 1;
    reasons.push("包含附件");
  }

  if (/\.edu$/.test(fromAddress) || /(university|college|school)/.test(fromAddress)) {
    importance += 1;
    reasons.push("来自学校/教育域名");
  }

  if (/(noreply|no-reply|notification|alert)/.test(fromAddress)) {
    importance -= 1;
    reasons.push("系统通知类发件地址");
  }

  let matchedUrgent = 0;
  for (const keyword of urgentKeywords) {
    if (keyword.regex.test(text)) {
      urgency += 1;
      matchedUrgent += 1;
      reasons.push(`命中紧急关键词: ${keyword.label}`);
      if (matchedUrgent >= 2) {
        break;
      }
    }
  }

  let matchedImportant = 0;
  for (const keyword of importantKeywords) {
    if (keyword.regex.test(text)) {
      importance += 1;
      matchedImportant += 1;
      reasons.push(`命中重要关键词: ${keyword.label}`);
      if (matchedImportant >= 3) {
        break;
      }
    }
  }

  const received = Date.parse(input.receivedDateTime);
  if (!Number.isNaN(received)) {
    const ageHours = (Date.now() - received) / 3600000;
    if (ageHours <= 6) {
      urgency += 1;
      reasons.push("近 6 小时新邮件");
    }
  }

  const matchedRule = firstMatchedPriorityRule(
    {
      subject: input.subject,
      fromAddress: input.fromAddress,
      bodyPreview: input.bodyPreview,
    },
    priorityRules
  );
  if (matchedRule) {
    const forced = forceScoresByQuadrant(urgency, importance, matchedRule.quadrant);
    urgency = forced.urgency;
    importance = forced.importance;
    reasons.unshift(
      `命中自定义规则: ${matchedRule.name} -> ${quadrantLabel(matchedRule.quadrant)}`
    );
  }

  const isUrgent = urgency >= 3;
  const isImportant = importance >= 3;

  let quadrant: MailQuadrant;

  if (isUrgent && isImportant) {
    quadrant = "urgent_important";
  } else if (!isUrgent && isImportant) {
    quadrant = "not_urgent_important";
  } else if (isUrgent && !isImportant) {
    quadrant = "urgent_not_important";
  } else {
    quadrant = "not_urgent_not_important";
  }

  return {
    quadrant,
    urgency,
    importance,
    reasons,
  };
}

function matchesByRules(text: string, rules: KeywordRule[], maxMatches: number): string[] {
  const matches: string[] = [];

  for (const rule of rules) {
    if (rule.regex.test(text)) {
      matches.push(rule.label);
      if (matches.length >= maxMatches) {
        break;
      }
    }
  }

  return matches;
}

function detectInsightType(text: string): InsightDetection | null {
  const ddlMatches = matchesByRules(text, ddlRules, 2);
  if (ddlMatches.length > 0) {
    return {
      type: "ddl",
      confidence: clamp(0.84 + (ddlMatches.length - 1) * 0.05, 0.84, 0.95),
      evidence: ddlMatches.join(" + "),
      reasons: ddlMatches.map((item) => `命中 DDL 信号: ${item}`),
    };
  }

  const examMatches = matchesByRules(text, examRules, 2);
  if (examMatches.length > 0) {
    return {
      type: "exam",
      confidence: clamp(0.8 + (examMatches.length - 1) * 0.05, 0.8, 0.92),
      evidence: examMatches.join(" + "),
      reasons: examMatches.map((item) => `命中考试信号: ${item}`),
    };
  }

  const meetingMatches = matchesByRules(text, meetingRules, 2);
  if (meetingMatches.length > 0) {
    return {
      type: "meeting",
      confidence: clamp(0.78 + (meetingMatches.length - 1) * 0.05, 0.78, 0.9),
      evidence: meetingMatches.join(" + "),
      reasons: meetingMatches.map((item) => `命中会议信号: ${item}`),
    };
  }

  return null;
}

function extractTimeHint(text: string): TimeHint | null {
  const hhmm = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (hhmm) {
    return {
      hour: Number(hhmm[1]),
      minute: Number(hhmm[2]),
      matched: hhmm[0],
      confidence: 0.95,
    };
  }

  const ampm = text.match(/\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i);
  if (ampm) {
    const rawHour = Number(ampm[1]);
    const marker = ampm[2].toLowerCase();
    let hour = rawHour % 12;
    if (marker === "pm") {
      hour += 12;
    }

    return {
      hour,
      minute: 0,
      matched: ampm[0],
      confidence: 0.85,
    };
  }

  const cnTime = text.match(/(上午|下午|晚上|中午)?\s*([01]?\d|2[0-3])点(?:([0-5]?\d)分?)?/);
  if (cnTime) {
    const marker = cnTime[1] ?? "";
    let hour = Number(cnTime[2]);
    const minute = cnTime[3] ? Number(cnTime[3]) : 0;

    if ((marker === "下午" || marker === "晚上") && hour < 12) {
      hour += 12;
    }

    if (marker === "中午" && hour < 11) {
      hour += 12;
    }

    return {
      hour,
      minute,
      matched: cnTime[0],
      confidence: 0.8,
    };
  }

  return null;
}

function extractAbsoluteDateHint(text: string, anchorDate: LocalDateParts): DateHint | null {
  const ymd = text.match(/\b(20\d{2})[\/.\-](0?[1-9]|1[0-2])[\/.\-](0?[1-9]|[12]\d|3[01])\b/);
  if (ymd) {
    const localDate = {
      year: Number(ymd[1]),
      month: Number(ymd[2]),
      day: Number(ymd[3]),
    };
    if (isValidLocalDate(localDate)) {
      return {
        localDate,
        matched: ymd[0],
        confidence: 0.95,
      };
    }
  }

  const ymdCn = text.match(/(20\d{2})年(0?[1-9]|1[0-2])月([0-3]?\d)[日号]?/);
  if (ymdCn) {
    const localDate = {
      year: Number(ymdCn[1]),
      month: Number(ymdCn[2]),
      day: Number(ymdCn[3]),
    };
    if (isValidLocalDate(localDate)) {
      return {
        localDate,
        matched: ymdCn[0],
        confidence: 0.95,
      };
    }
  }

  const md = text.match(/\b(0?[1-9]|1[0-2])[\/.\-](0?[1-9]|[12]\d|3[01])\b/);
  if (md) {
    const month = Number(md[1]);
    const day = Number(md[2]);

    let localDate: LocalDateParts = { year: anchorDate.year, month, day };
    if (isValidLocalDate(localDate)) {
      const staleThreshold = addDaysToLocalDate(anchorDate, -2);
      if (compareLocalDate(localDate, staleThreshold) < 0) {
        localDate = { year: anchorDate.year + 1, month, day };
      }
    }

    if (isValidLocalDate(localDate)) {
      return {
        localDate,
        matched: md[0],
        confidence: 0.82,
      };
    }
  }

  const mdCn = text.match(/(?:^|[^\d])(0?[1-9]|1[0-2])月([0-3]?\d)[日号]/);
  if (mdCn) {
    const month = Number(mdCn[1]);
    const day = Number(mdCn[2]);

    let localDate: LocalDateParts = { year: anchorDate.year, month, day };
    if (isValidLocalDate(localDate)) {
      const staleThreshold = addDaysToLocalDate(anchorDate, -2);
      if (compareLocalDate(localDate, staleThreshold) < 0) {
        localDate = { year: anchorDate.year + 1, month, day };
      }
    }

    if (isValidLocalDate(localDate)) {
      return {
        localDate,
        matched: `${month}月${day}日`,
        confidence: 0.8,
      };
    }
  }

  return null;
}

function extractRelativeDateHint(text: string, anchorDate: LocalDateParts): DateHint | null {
  const relativeRules: Array<{ regex: RegExp; offset: number; label: string; confidence: number }> = [
    { regex: /(day\s+after\s+tomorrow|后天)/i, offset: 2, label: "后天/day after tomorrow", confidence: 0.78 },
    { regex: /(tomorrow|明天)/i, offset: 1, label: "明天/tomorrow", confidence: 0.8 },
    { regex: /(today|tonight|今天|今晚)/i, offset: 0, label: "今天/today", confidence: 0.76 },
  ];

  for (const rule of relativeRules) {
    const matched = text.match(rule.regex);
    if (!matched) {
      continue;
    }

    const localDate = addDaysToLocalDate(anchorDate, rule.offset);
    return {
      localDate,
      matched: matched[0] || rule.label,
      confidence: rule.confidence,
    };
  }

  return null;
}

function extractWeekdayDateHint(text: string, anchorDate: LocalDateParts): DateHint | null {
  const enWeekdayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const zhWeekdayMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 0,
    天: 0,
  };

  const en = text.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (en) {
    const isNextWeek = Boolean(en[1]);
    const weekday = enWeekdayMap[en[2].toLowerCase()];
    const current = dayOfWeekForLocalDate(anchorDate);
    let delta = (weekday - current + 7) % 7;

    if (isNextWeek) {
      delta = delta === 0 ? 7 : delta;
    } else if (delta === 0) {
      delta = 7;
    }

    const localDate = addDaysToLocalDate(anchorDate, delta);
    return {
      localDate,
      matched: en[0],
      confidence: isNextWeek ? 0.7 : 0.64,
    };
  }

  const zh = text.match(/(下周)?(?:周|星期)(一|二|三|四|五|六|日|天)/);
  if (zh) {
    const isNextWeek = Boolean(zh[1]);
    const weekday = zhWeekdayMap[zh[2]];
    const current = dayOfWeekForLocalDate(anchorDate);
    let delta = (weekday - current + 7) % 7;

    if (isNextWeek) {
      delta = delta === 0 ? 7 : delta;
    } else if (delta === 0) {
      delta = 7;
    }

    const localDate = addDaysToLocalDate(anchorDate, delta);
    return {
      localDate,
      matched: zh[0],
      confidence: isNextWeek ? 0.7 : 0.64,
    };
  }

  return null;
}

function extractDateHint(text: string, anchorDate: LocalDateParts): DateHint | null {
  return (
    extractAbsoluteDateHint(text, anchorDate) ??
    extractRelativeDateHint(text, anchorDate) ??
    extractWeekdayDateHint(text, anchorDate)
  );
}

function defaultTimeByType(type: MailInsightType): { hour: number; minute: number } {
  if (type === "ddl") {
    return { hour: 23, minute: 59 };
  }

  if (type === "meeting") {
    return { hour: 9, minute: 0 };
  }

  if (type === "exam") {
    return { hour: 9, minute: 0 };
  }

  return { hour: 12, minute: 0 };
}

function eventDurationMinutesByType(type: MailInsightType): number {
  if (type === "ddl") {
    return 30;
  }

  if (type === "meeting") {
    return 60;
  }

  if (type === "exam") {
    return 120;
  }

  return 60;
}

function extractDueDateTime(
  text: string,
  now: Date,
  type: MailInsightType,
  timeZone: string
): {
  dueAt: Date;
  confidence: number;
  evidence: string;
} | null {
  const anchor = getZonedDateTimeParts(now, timeZone);
  const anchorDate: LocalDateParts = {
    year: anchor.year,
    month: anchor.month,
    day: anchor.day,
  };

  const dateHint = extractDateHint(text, anchorDate);
  if (!dateHint) {
    return null;
  }

  const timeHint = extractTimeHint(text);
  const fallbackTime = defaultTimeByType(type);

  const dueCandidates = resolveLocalDateTimeToUtcCandidates(
    dateHint.localDate,
    timeHint?.hour ?? fallbackTime.hour,
    timeHint?.minute ?? fallbackTime.minute,
    timeZone
  );
  if (dueCandidates.length === 0) {
    return null;
  }

  const dueAt =
    (() => {
      const futureCandidates = dueCandidates.filter((candidate) => candidate.getTime() >= now.getTime());
      if (futureCandidates.length === 0) {
        return dueCandidates[dueCandidates.length - 1];
      }

      if (futureCandidates.length > 1) {
        // For DST fallback ambiguity, prefer the later candidate to avoid early triggering.
        return futureCandidates[futureCandidates.length - 1];
      }

      return futureCandidates[0];
    })();

  const confidence = clamp(dateHint.confidence * (timeHint ? timeHint.confidence : 0.93), 0.58, 0.99);
  const evidence = timeHint ? `${dateHint.matched} ${timeHint.matched}` : dateHint.matched;

  return {
    dueAt,
    confidence,
    evidence,
  };
}

function quadrantPriority(quadrant: MailQuadrant): number {
  if (quadrant === "urgent_important") {
    return 0;
  }

  if (quadrant === "not_urgent_important") {
    return 1;
  }

  if (quadrant === "urgent_not_important") {
    return 2;
  }

  return 3;
}

const maxReliableOutlookInboxTop = 35;
const outlookInboxFallbackTop = 20;

async function queryInboxMessagesForSource(
  limit: number,
  sourceContext?: MailSourceContext
): Promise<OutlookMessage[]> {
  const requestedTop = Math.max(5, Math.min(limit, 100));

  const executeQuery = async (top: number, skip: number): Promise<OutlookMessage[]> => {
    const raw = await invokeTool({
      tool: "COMPOSIO_MULTI_EXECUTE_TOOL",
      args: composioMultiExecuteArgs(
        [
          {
            tool_slug: "OUTLOOK_QUERY_EMAILS",
            arguments: {
              folder: "inbox",
              top,
              ...(skip > 0 ? { skip } : {}),
              orderby: "receivedDateTime desc",
              select: [
                "id",
                "subject",
                "from",
                "bodyPreview",
                "receivedDateTime",
                "importance",
                "isRead",
                "hasAttachments",
                "webLink",
              ],
            },
          },
        ],
        sourceContext
      ),
    });

    const payload = parseToolTextJson(raw);
    return asMessagesFromMultiExecute(payload);
  };

  const collected: OutlookMessage[] = [];
  const seenMessageIds = new Set<string>();
  let skip = 0;
  while (collected.length < requestedTop) {
    const remaining = requestedTop - collected.length;
    const pageTop = Math.min(maxReliableOutlookInboxTop, remaining);
    let effectivePageTop = pageTop;
    let pageMessages = await executeQuery(pageTop, skip);

    // Some Outlook/Composio combinations return an empty list for larger `top`.
    // Retry once with a smaller `top` to avoid "empty inbox" false negatives.
    if (pageMessages.length === 0 && pageTop > outlookInboxFallbackTop) {
      const fallbackTop = Math.min(outlookInboxFallbackTop, pageTop - 1);
      if (fallbackTop >= 5) {
        pageMessages = await executeQuery(fallbackTop, skip);
        effectivePageTop = fallbackTop;
      }
    }

    if (pageMessages.length === 0) {
      break;
    }

    let appended = 0;
    for (const message of pageMessages) {
      const id = message.id?.trim();
      if (id) {
        if (seenMessageIds.has(id)) {
          continue;
        }
        seenMessageIds.add(id);
      }
      collected.push(message);
      appended += 1;
      if (collected.length >= requestedTop) {
        break;
      }
    }

    if (appended === 0) {
      break;
    }

    if (pageMessages.length < effectivePageTop) {
      break;
    }

    skip += pageMessages.length;
  }

  return collected;
}

async function fetchInboxNormalized(
  limit: number,
  priorityRules: MailPriorityRule[] = [],
  sourceContext?: MailSourceContext
): Promise<TriageMailItem[]> {
  const cappedLimit = Math.max(5, Math.min(limit, 100));
  const messages = await queryInboxMessagesForSource(cappedLimit, sourceContext);

  return messages
    .slice(0, cappedLimit)
    .map((message) => normalizeMessage(message, priorityRules))
    .filter((item): item is TriageMailItem => item !== null);
}

export async function listInboxForViewer(
  limit: number,
  sourceContext?: MailSourceContext
): Promise<MailInboxViewerResponse> {
  const cappedLimit = Math.max(5, Math.min(limit, 60));
  const messages = await queryInboxMessagesForSource(cappedLimit, sourceContext);
  const items = messages
    .slice(0, cappedLimit)
    .map((message) => normalizeInboxViewerMessage(message))
    .filter((item): item is MailInboxViewerItem => item !== null);

  return {
    generatedAt: new Date().toISOString(),
    total: items.length,
    items,
  };
}

export async function triageInbox(
  limit: number,
  priorityRules: MailPriorityRule[] = [],
  sourceContext?: MailSourceContext
): Promise<MailTriageResponse> {
  const normalized = await fetchInboxNormalized(limit, priorityRules, sourceContext);

  const quadrants: Record<MailQuadrant, TriageMailItem[]> = {
    urgent_important: [],
    not_urgent_important: [],
    urgent_not_important: [],
    not_urgent_not_important: [],
  };

  for (const item of normalized) {
    quadrants[item.quadrant].push(item);
  }

  return {
    generatedAt: new Date().toISOString(),
    total: normalized.length,
    counts: {
      urgent_important: quadrants.urgent_important.length,
      not_urgent_important: quadrants.not_urgent_important.length,
      urgent_not_important: quadrants.urgent_not_important.length,
      not_urgent_not_important: quadrants.not_urgent_not_important.length,
    },
    quadrants,
    allItems: normalized,
  };
}

export async function buildMailInsights(
  limit: number,
  horizonDays: number,
  timeZone?: string,
  priorityRules: MailPriorityRule[] = [],
  sourceContext?: MailSourceContext
): Promise<MailInsightsResponse> {
  const cappedHorizon = clamp(Math.floor(horizonDays), 1, 30);
  const allItems = await fetchInboxNormalized(limit, priorityRules, sourceContext);
  const resolvedTimeZone = normalizeTimeZone(timeZone);

  const now = new Date();
  const nowInTz = getZonedDateTimeParts(now, resolvedTimeZone);
  const todayDate: LocalDateParts = {
    year: nowInTz.year,
    month: nowInTz.month,
    day: nowInTz.day,
  };
  const todayKey = dateKeyFromLocalDate(todayDate);
  const tomorrowKey = dateKeyFromLocalDate(addDaysToLocalDate(todayDate, 1));
  const horizonLastDate = addDaysToLocalDate(todayDate, cappedHorizon - 1);

  const upcoming: MailInsightItem[] = [];
  const signalsWithoutDate: MailSignalWithoutDate[] = [];

  for (const item of allItems) {
    const text = `${item.subject}\n${item.bodyPreview}`;
    const typeDetection = detectInsightType(text);

    const dueForTyped = typeDetection
      ? extractDueDateTime(text, now, typeDetection.type, resolvedTimeZone)
      : null;
    const dueFallback = !typeDetection ? extractDueDateTime(text, now, "event", resolvedTimeZone) : null;

    const type = typeDetection?.type ?? (dueFallback ? "event" : null);
    const due = dueForTyped ?? dueFallback;

    if (!type) {
      continue;
    }

    if (!due) {
      if (typeDetection) {
        signalsWithoutDate.push({
          messageId: item.id,
          subject: item.subject,
          fromName: item.fromName,
          quadrant: item.quadrant,
          type,
          evidence: typeDetection.evidence,
        });
      }

      continue;
    }

    if (due.dueAt < now) {
      continue;
    }

    const dueLocal = getZonedDateTimeParts(due.dueAt, resolvedTimeZone);
    const dueDate: LocalDateParts = {
      year: dueLocal.year,
      month: dueLocal.month,
      day: dueLocal.day,
    };

    if (compareLocalDate(dueDate, todayDate) < 0 || compareLocalDate(dueDate, horizonLastDate) > 0) {
      continue;
    }

    const typeConfidence = typeDetection?.confidence ?? 0.63;
    const dueInTz = formatDateInTimeZone(due.dueAt, resolvedTimeZone);

    upcoming.push({
      messageId: item.id,
      subject: item.subject,
      fromName: item.fromName,
      fromAddress: item.fromAddress,
      receivedDateTime: item.receivedDateTime,
      quadrant: item.quadrant,
      type,
      dueAt: due.dueAt.toISOString(),
      dueDateLabel: dueInTz.dateTimeLabel,
      confidence: clamp((typeConfidence + due.confidence) / 2, 0.58, 0.99),
      evidence: typeDetection ? `${typeDetection.evidence}; ${due.evidence}` : due.evidence,
      reasons: [...item.reasons, ...(typeDetection?.reasons ?? [])],
    });
  }

  upcoming.sort((left, right) => {
    const timeDiff = Date.parse(left.dueAt) - Date.parse(right.dueAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    const quadrantDiff = quadrantPriority(left.quadrant) - quadrantPriority(right.quadrant);
    if (quadrantDiff !== 0) {
      return quadrantDiff;
    }

    return right.confidence - left.confidence;
  });

  signalsWithoutDate.sort((left, right) => {
    const quadrantDiff = quadrantPriority(left.quadrant) - quadrantPriority(right.quadrant);
    if (quadrantDiff !== 0) {
      return quadrantDiff;
    }

    return left.subject.localeCompare(right.subject, "zh-CN");
  });

  const tomorrowDdl = upcoming
    .filter(
      (item) => item.type === "ddl" && formatDateInTimeZone(new Date(item.dueAt), resolvedTimeZone).dateKey === tomorrowKey
    )
    .slice(0, 20);

  return {
    generatedAt: now.toISOString(),
    horizonDays: cappedHorizon,
    timeZone: resolvedTimeZone,
    sourceCount: allItems.length,
    digest: {
      date: todayKey,
      total: allItems.length,
      unread: allItems.filter((item) => !item.isRead).length,
      urgentImportant: allItems.filter((item) => item.quadrant === "urgent_important").length,
      highImportance: allItems.filter((item) => item.importance === "high").length,
      upcomingCount: upcoming.length,
      tomorrowDdlCount: tomorrowDdl.length,
    },
    tomorrowDdl,
    upcoming,
    signalsWithoutDate: signalsWithoutDate.slice(0, 12),
  };
}

function insightTypeTag(type: MailInsightType): string {
  if (type === "ddl") {
    return "DDL";
  }

  if (type === "meeting") {
    return "Meeting";
  }

  if (type === "exam") {
    return "Exam";
  }

  return "Event";
}

function insightTypeCnLabel(type: MailInsightType): string {
  if (type === "ddl") {
    return "DDL";
  }

  if (type === "meeting") {
    return "会议";
  }

  if (type === "exam") {
    return "考试";
  }

  return "事项";
}

function parseRequestedDays(question: string): number | null {
  const zhMatch = question.match(/([1-9]\d?)\s*天/);
  if (zhMatch) {
    return clamp(Number(zhMatch[1]), 1, 30);
  }

  const enMatch = question.match(/\b(?:next|in)\s+([1-9]\d?)\s+days?\b/i);
  if (enMatch) {
    return clamp(Number(enMatch[1]), 1, 30);
  }

  return null;
}

function detectQuestionTypeFilter(question: string): MailInsightType | "all" {
  const hasDdl = /(ddl|deadline|截止|截至|到期|due)/i.test(question);
  const hasMeeting = /(meeting|会议|组会|答辩|seminar)/i.test(question);
  const hasExam = /(exam|quiz|test|midterm|final|考试|测验|期中|期末)/i.test(question);
  const hasEvent = /(event|事项|活动|提醒|schedule|安排)/i.test(question);

  const hitCount = [hasDdl, hasMeeting, hasExam, hasEvent].filter(Boolean).length;
  if (hitCount !== 1) {
    return "all";
  }

  if (hasDdl) {
    return "ddl";
  }

  if (hasMeeting) {
    return "meeting";
  }

  if (hasExam) {
    return "exam";
  }

  return "event";
}

function analyzeMailQuestion(question: string): MailQaIntentAnalysis {
  const trimmed = question.trim();
  const hasTomorrow = /(明天|tomorrow)/i.test(trimmed);
  const hasDdl = /(ddl|deadline|截止|截至|到期|due)/i.test(trimmed);
  const hasUnread = /(未读|unread)/i.test(trimmed);
  const hasUrgent = /(紧急|urgent|asap|马上|尽快)/i.test(trimmed);
  const hasImportant = /(重要|important)/i.test(trimmed);
  const hasUpcoming = /(未来|接下来|近期|本周|这周|下周|upcoming|next|future)/i.test(trimmed);

  if (hasTomorrow && hasDdl) {
    return {
      intent: "tomorrow_ddl",
      requestedDays: parseRequestedDays(trimmed),
      typeFilter: "ddl",
      onlyTomorrow: true,
    };
  }

  if (hasUnread) {
    return {
      intent: "unread_count",
      requestedDays: parseRequestedDays(trimmed),
      typeFilter: "all",
      onlyTomorrow: false,
    };
  }

  if (hasUrgent && hasImportant) {
    return {
      intent: "urgent_important",
      requestedDays: parseRequestedDays(trimmed),
      typeFilter: "all",
      onlyTomorrow: false,
    };
  }

  const typeFilter = detectQuestionTypeFilter(trimmed);
  if (hasUpcoming || typeFilter !== "all" || hasTomorrow) {
    return {
      intent: "upcoming",
      requestedDays: parseRequestedDays(trimmed),
      typeFilter,
      onlyTomorrow: hasTomorrow,
    };
  }

  return {
    intent: "unknown",
    requestedDays: parseRequestedDays(trimmed),
    typeFilter: "all",
    onlyTomorrow: false,
  };
}

function insightToQaReference(item: MailInsightItem): MailQaReference {
  return {
    messageId: item.messageId,
    subject: item.subject,
    fromName: item.fromName,
    fromAddress: item.fromAddress,
    receivedDateTime: item.receivedDateTime,
    dueAt: item.dueAt,
    dueDateLabel: item.dueDateLabel,
    evidence: item.evidence,
    type: item.type,
    quadrant: item.quadrant,
  };
}

function triageToQaReference(item: TriageMailItem): MailQaReference {
  return {
    messageId: item.id,
    subject: item.subject,
    fromName: item.fromName,
    fromAddress: item.fromAddress,
    receivedDateTime: item.receivedDateTime,
    quadrant: item.quadrant,
  };
}

function tomorrowDateKey(timeZone: string): string {
  const nowLocal = getZonedDateTimeParts(new Date(), timeZone);
  const today: LocalDateParts = {
    year: nowLocal.year,
    month: nowLocal.month,
    day: nowLocal.day,
  };
  return dateKeyFromLocalDate(addDaysToLocalDate(today, 1));
}

export async function answerMailQuestion(input: {
  question: string;
  limit: number;
  horizonDays: number;
  timeZone?: string;
  priorityRules?: MailPriorityRule[];
  sourceContext?: MailSourceContext;
}): Promise<MailQaResponse> {
  const question = input.question.trim();
  if (!question) {
    throw new Error("question is required");
  }

  const analysis = analyzeMailQuestion(question);
  const cappedLimit = clamp(Math.floor(input.limit), 5, 100);
  const fallbackHorizon = clamp(Math.floor(input.horizonDays), 1, 30);
  const resolvedHorizon = analysis.requestedDays ?? fallbackHorizon;
  const priorityRules = input.priorityRules ?? [];

  if (analysis.intent === "urgent_important") {
    const triage = await triageInbox(cappedLimit, priorityRules, input.sourceContext);
    const urgentItems = triage.quadrants.urgent_important.slice(0, 8);

    const answer =
      urgentItems.length === 0
        ? "当前没有识别到“紧急且重要”邮件。"
        : `当前有 ${triage.counts.urgent_important} 封“紧急且重要”邮件，我先列出最需要处理的 ${urgentItems.length} 封。`;

    return {
      generatedAt: new Date().toISOString(),
      question,
      intent: analysis.intent,
      answer,
      horizonDays: resolvedHorizon,
      timeZone: normalizeTimeZone(input.timeZone),
      references: urgentItems.map(triageToQaReference),
    };
  }

  const insights = await buildMailInsights(
    cappedLimit,
    resolvedHorizon,
    input.timeZone,
    priorityRules,
    input.sourceContext
  );

  if (analysis.intent === "unread_count") {
    return {
      generatedAt: new Date().toISOString(),
      question,
      intent: analysis.intent,
      answer: `当前收件箱共 ${insights.digest.total} 封，未读 ${insights.digest.unread} 封，紧急且重要 ${insights.digest.urgentImportant} 封。`,
      horizonDays: insights.horizonDays,
      timeZone: insights.timeZone,
      references: insights.upcoming.slice(0, 3).map(insightToQaReference),
    };
  }

  if (analysis.intent === "tomorrow_ddl") {
    const items = insights.tomorrowDdl.slice(0, 10);
    return {
      generatedAt: new Date().toISOString(),
      question,
      intent: analysis.intent,
      answer:
        items.length === 0
          ? "明天没有识别到 DDL。"
          : `明天共识别到 ${insights.digest.tomorrowDdlCount} 个 DDL，我先列出前 ${items.length} 个。`,
      horizonDays: insights.horizonDays,
      timeZone: insights.timeZone,
      references: items.map(insightToQaReference),
    };
  }

  if (analysis.intent === "upcoming") {
    let filtered = insights.upcoming;
    if (analysis.typeFilter !== "all") {
      filtered = filtered.filter((item) => item.type === analysis.typeFilter);
    }

    if (analysis.onlyTomorrow) {
      const tomorrowKey = tomorrowDateKey(insights.timeZone);
      filtered = filtered.filter(
        (item) =>
          formatDateInTimeZone(new Date(item.dueAt), insights.timeZone).dateKey === tomorrowKey
      );
    }

    const references = filtered.slice(0, 10).map(insightToQaReference);
    const scopeLabel = analysis.onlyTomorrow
      ? "明天"
      : `未来 ${insights.horizonDays} 天`;
    const typeLabel =
      analysis.typeFilter === "all"
        ? "事项"
        : insightTypeCnLabel(analysis.typeFilter);
    const answer =
      references.length === 0
        ? `${scopeLabel}没有识别到相关${typeLabel}。`
        : `${scopeLabel}共识别到 ${filtered.length} 条相关${typeLabel}，已展示前 ${references.length} 条。`;

    return {
      generatedAt: new Date().toISOString(),
      question,
      intent: analysis.intent,
      answer,
      horizonDays: insights.horizonDays,
      timeZone: insights.timeZone,
      references,
    };
  }

  const fallbackReferences = insights.upcoming.slice(0, 5).map(insightToQaReference);
  return {
    generatedAt: new Date().toISOString(),
    question,
    intent: "unknown",
    answer:
      "我还没完全理解你的问题。可以试试：明天有哪些DDL、未来7天有哪些会议、未读邮件有多少、紧急重要邮件有哪些？",
    horizonDays: insights.horizonDays,
    timeZone: insights.timeZone,
    references: fallbackReferences,
  };
}

export async function createCalendarEventFromInsight(
  input: MailCalendarSyncInput,
  sourceContext?: MailSourceContext
): Promise<MailCalendarSyncResponse> {
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    throw new Error("Invalid dueAt timestamp");
  }

  if (dueAt.getTime() < Date.now() - 2 * 60 * 60 * 1000) {
    throw new Error("dueAt is too far in the past");
  }

  const resolvedTimeZone = normalizeTimeZone(input.timeZone);
  const durationMinutes = eventDurationMinutesByType(input.type);

  const eventStart =
    input.type === "ddl" ? new Date(dueAt.getTime() - durationMinutes * 60000) : new Date(dueAt.getTime());
  let eventEnd =
    input.type === "ddl" ? new Date(dueAt.getTime()) : new Date(dueAt.getTime() + durationMinutes * 60000);

  if (eventEnd.getTime() <= eventStart.getTime()) {
    eventEnd = new Date(eventStart.getTime() + 30 * 60000);
  }

  const eventSubject = `[MailAgent:${insightTypeTag(input.type)}] ${input.subject}`.slice(0, 220);
  const derivedDueDateLabel = formatDateInTimeZone(dueAt, resolvedTimeZone).dateTimeLabel;
  const derivedEvidence = `server_inferred:${input.type}`;
  const eventBody = [
    "Created by OpenClaw Mail Agent",
    `Message ID: ${input.messageId}`,
    `Insight Type: ${input.type}`,
    `Evidence: ${derivedEvidence}`,
    `Source Due Label: ${derivedDueDateLabel}`,
    `Created At: ${new Date().toISOString()}`,
  ].join("\n");

  const startDateTime = formatIsoLocalDateTimeInTimeZone(eventStart, resolvedTimeZone);
  const endDateTime = formatIsoLocalDateTimeInTimeZone(eventEnd, resolvedTimeZone);

  const raw = await invokeTool({
    tool: "COMPOSIO_MULTI_EXECUTE_TOOL",
    args: composioMultiExecuteArgs(
      [
        {
          tool_slug: "OUTLOOK_CREATE_ME_EVENT",
          arguments: {
            subject: eventSubject,
            start: {
              dateTime: startDateTime,
              timeZone: resolvedTimeZone,
            },
            end: {
              dateTime: endDateTime,
              timeZone: resolvedTimeZone,
            },
            body: {
              contentType: "Text",
              content: eventBody,
            },
            allowNewTimeProposals: false,
          },
        },
      ],
      sourceContext
    ),
  });

  const payload = parseToolTextJson(raw);
  const createdEvent = asCreateEventFromMultiExecute(payload);
  const eventId = createdEvent.id?.trim();
  if (!eventId) {
    throw new Error("Created calendar event missing id");
  }

  return {
    eventId,
    eventSubject: createdEvent.subject?.trim() || eventSubject,
    eventWebLink: createdEvent.webLink?.trim() ?? "",
    start: {
      dateTime: createdEvent.start?.dateTime?.trim() || startDateTime,
      timeZone: createdEvent.start?.timeZone?.trim() || resolvedTimeZone,
    },
    end: {
      dateTime: createdEvent.end?.dateTime?.trim() || endDateTime,
      timeZone: createdEvent.end?.timeZone?.trim() || resolvedTimeZone,
    },
  };
}

export async function deleteCalendarEventById(
  eventId: string,
  sourceContext?: MailSourceContext
): Promise<MailCalendarDeleteResponse> {
  const normalizedEventId = eventId.trim();
  if (normalizedEventId.length < 8) {
    throw new Error("Invalid eventId");
  }

  const raw = await invokeTool({
    tool: "COMPOSIO_MULTI_EXECUTE_TOOL",
    args: composioMultiExecuteArgs(
      [
        {
          tool_slug: "OUTLOOK_DELETE_EVENT",
          arguments: {
            event_id: normalizedEventId,
          },
        },
      ],
      sourceContext
    ),
  });

  const payload = parseToolTextJson(raw);
  const result = payload.data?.results?.[0];
  if (!result) {
    throw new Error("Composio response does not contain any result item");
  }

  if (result.tool_slug !== "OUTLOOK_DELETE_EVENT") {
    throw new Error(`Unexpected tool slug: ${result.tool_slug ?? "unknown"}`);
  }

  if (result.response?.successful === true) {
    return {
      eventId: normalizedEventId,
      deleted: true,
      alreadyDeleted: false,
    };
  }

  const responseData = asRecord(result.response?.data);
  const statusCodeRaw = responseData?.status_code;
  const statusCode =
    typeof statusCodeRaw === "number"
      ? statusCodeRaw
      : typeof statusCodeRaw === "string"
        ? Number.parseInt(statusCodeRaw, 10)
        : NaN;
  const errorText = result.response?.error ?? result.error ?? payload.error ?? "";
  const graphErrorCode = extractGraphErrorCode(errorText);
  const alreadyDeleted =
    statusCode === 404 ||
    graphErrorCode === "ErrorItemNotFound" ||
    /ErrorItemNotFound/i.test(errorText);

  if (alreadyDeleted) {
    const normalizedContext = normalizeSourceContext(sourceContext);
    if (normalizedContext?.mailboxUserId) {
      const stillExistsInSource = await isCalendarEventExisting(normalizedEventId, normalizedContext);
      if (stillExistsInSource) {
        throw new Error("OUTLOOK_DELETE_EVENT_SOURCE_CONTEXT_MISMATCH");
      }
    }

    return {
      eventId: normalizedEventId,
      deleted: false,
      alreadyDeleted: true,
    };
  }

  throw new Error(errorText || "OUTLOOK_DELETE_EVENT execution failed");
}

export async function isCalendarEventExisting(
  eventId: string,
  sourceContext?: MailSourceContext
): Promise<boolean> {
  const normalizedEventId = eventId.trim();
  if (normalizedEventId.length < 8) {
    return false;
  }

  const raw = await invokeTool({
    tool: "COMPOSIO_MULTI_EXECUTE_TOOL",
    args: composioMultiExecuteArgs(
      [
        {
          tool_slug: "OUTLOOK_GET_EVENT",
          arguments: {
            event_id: normalizedEventId,
          },
        },
      ],
      sourceContext
    ),
  });

  const payload = parseToolTextJson(raw);
  const result = payload.data?.results?.[0];
  if (!result) {
    throw new Error("Composio response does not contain any result item");
  }

  if (result.tool_slug !== "OUTLOOK_GET_EVENT") {
    throw new Error(`Unexpected tool slug: ${result.tool_slug ?? "unknown"}`);
  }

  if (result.response?.successful === true) {
    return true;
  }

  const responseData = asRecord(result.response?.data);
  const statusCodeRaw = responseData?.status_code;
  const statusCode =
    typeof statusCodeRaw === "number"
      ? statusCodeRaw
      : typeof statusCodeRaw === "string"
        ? Number.parseInt(statusCodeRaw, 10)
        : NaN;
  const errorText = result.response?.error ?? result.error ?? payload.error ?? "";
  const graphErrorCode = extractGraphErrorCode(errorText);

  if (statusCode === 404 || graphErrorCode === "ErrorItemNotFound" || /ErrorItemNotFound/i.test(errorText)) {
    return false;
  }

  throw new Error(errorText || "OUTLOOK_GET_EVENT execution failed");
}

export async function getMailMessageById(
  messageId: string,
  sourceContext?: MailSourceContext
): Promise<MailDetailResponse> {
  const raw = await invokeTool({
    tool: "COMPOSIO_MULTI_EXECUTE_TOOL",
    args: composioMultiExecuteArgs(
      [
        {
          tool_slug: "OUTLOOK_GET_MESSAGE",
          arguments: {
            message_id: messageId,
            select: [
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
            ],
          },
        },
      ],
      sourceContext
    ),
  });

  const payload = parseToolTextJson(raw);
  const detail = asDetailFromMultiExecute(payload);

  const bodyContent = detail.body?.content ?? "";

  return {
    id: detail.id ?? messageId,
    subject: detail.subject ?? "(No Subject)",
    fromName: detail.from?.emailAddress?.name ?? detail.from?.emailAddress?.address ?? "Unknown Sender",
    fromAddress: detail.from?.emailAddress?.address ?? "",
    receivedDateTime: detail.receivedDateTime ?? "",
    importance: (detail.importance ?? "normal").toLowerCase(),
    isRead: Boolean(detail.isRead),
    hasAttachments: Boolean(detail.hasAttachments),
    webLink: detail.webLink ?? "",
    bodyContentType: detail.body?.contentType ?? "text",
    bodyContent,
    bodyPreview: detail.bodyPreview ?? stripHtmlTags(bodyContent).slice(0, 320),
  };
}
