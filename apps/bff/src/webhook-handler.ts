/**
 * @fileoverview Mail Event Webhook Handler
 *
 * Architecture Overview:
 * ====================
 * This module implements the event-driven mail ingestion pipeline for Phase 1.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  Composio / Microsoft Graph                                                   │
 * │  OUTLOOK_NEW_MESSAGE_TRIGGER ──[messageId]──►  Ngrok Tunnel              │
 * │                                                   https://xxx.ngrok-free.app │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  BFF Webhook Receiver (this module)                                          │
 * │  POST /api/webhook/mail-event                                               │
 * │  POST /api/webhook/outlook-subscription                                      │
 * │  GET  /api/webhook/public-url                                                │
 * │  GET  /api/webhook/status                                                    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *           ┌────────────────────────┼────────────────────────┐
 *           ▼                        ▼                        ▼
 * ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐
 * │ OUTLOOK_GET_MESSAGE│  │ OpenClaw /hooks/agent│  │ SSE Push to WebUI      │
 * │ (fetch full mail) │  │ (wake sub-agent)  │  │ (real-time notification)│
 * └──────────────────┘  └──────────────────┘  └──────────────────────────┘
 *
 * Security Model:
 * ===============
 * - Webhook signatures are verified using HMAC-SHA256
 * - Each webhook is scoped to a specific sourceId + connectedAccountId
 * - Request rate limits: 120 req/min per IP for mail-event, 60 req/min for subscription
 * - Replay protection: timestamp + nonce validation (5-minute window)
 * - All webhooks bypass standard session auth but require API key + signature
 *
 * Composio OUTLOOK_NEW_MESSAGE_TRIGGER Payload:
 * =============================================
 * {
 *   "id": "msg_abc123",
 *   "type": "composio.trigger.message",
 *   "metadata": {
 *     "log_id": "log_abc123",
 *     "trigger_slug": "OUTLOOK_NEW_MESSAGE_TRIGGER",
 *     "trigger_id": "ti_xyz789",
 *     "connected_account_id": "ca_def456",
 *     "user_id": "user-id-123"
 *   },
 *   "data": { "message_id": "AAMkAGI2TAAA=" },
 *   "timestamp": "2026-01-15T10:30:00Z"
 * }
 *
 * Microsoft Graph Subscription Notification:
 * ===========================================
 * {
 *   "value": [{
 *     "subscriptionId": "sub_id",
 *     "subscriptionExpirationDateTime": "2026-04-08T00:00:00Z",
 *     "changeType": "created",
 *     "resource": "Users/{userId}/Messages/{msgId}",
 *     "clientState": "secretClientState",
 *     "notificationUrl": "https://bff/webhook/outlook-subscription"
 *   }]
 * }
 */

import { randomUUID, timingSafeEqual, createHmac } from "node:crypto";
import { z } from "zod";
import { queryAgent as gatewayQueryAgent } from "./gateway.js";
import {
  composioMultiExecuteArgs,
  normalizeSourceContext,
  getMailMessageById as fetchOutlookMessage,
  type MailSourceContext,
} from "./mail.js";
import {
  analyzeMail,
  aggregateAnalysisStats,
  type MailAnalysisResult,
  type AnalysisLocale,
  inferTimezone,
  normalizeDatetimeWithTimezone,
  type ParseOutcome,
} from "./mail-analysis.js";
import {
  pushUrgentNotification,
  type NotificationChannel,
  type NotificationPayload,
} from "./notification-service.js";
import {
  syncMailToCalendar,
  type CalendarSyncOptions,
} from "./calendar-service.js";
import {
  createDraftReplyForMail,
  type DraftReplyOptions,
} from "./draft-reply-service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload from Composio OUTLOOK_NEW_MESSAGE_TRIGGER */
export interface ComposioMailTriggerPayload {
  id: string;
  type: string;
  metadata: {
    log_id: string;
    trigger_slug: string;
    trigger_id: string;
    connected_account_id: string;
    user_id: string;
  };
  data: {
    message_id: string;
  };
  timestamp: string;
}

/** Microsoft Graph subscription notification payload */
export interface MicrosoftGraphNotification {
  value: Array<{
    subscriptionId: string;
    subscriptionExpirationDateTime: string;
    changeType: "created" | "updated" | "deleted";
    resource: string;
    clientState: string;
    notificationUrl: string;
  }>;
}

/** Result of processing a new mail event */
export interface ProcessedMailEvent {
  ok: boolean;
  messageId: string;
  sessionKey?: string;
  agentTriggered: boolean;
  summary?: string;
  quadrant?: string;
  error?: string;
  errorCode?: string;
  /** Phase 2: Full Zod-validated analysis result */
  analysis?: MailAnalysisResult;
  /** Phase 2: Parsing metadata */
  parseInfo?: {
    attemptCount: number;
    confidence?: number;
    insightType?: string;
    ddlDatetime?: string | null;
    actionableIntent?: boolean;
    keyEntities?: {
      sender_name?: string;
      deadline_description?: string | null;
      meeting_topic?: string | null;
      meeting_duration_minutes?: number;
      attachments?: string[];
      action_required_from?: string | null;
    };
    failed?: boolean;
    rawOutput?: string;
  };
  /** Phase 3: Multi-channel notification push result */
  notification?: {
    ok: boolean;
    channelsAttempted: number;
    channelsDelivered: number;
  };
  /** Phase 4: Calendar sync result */
  calendar?: {
    ok: boolean;
    skipped: boolean;
    reason?: string;
    eventId?: string;
    eventWebLink?: string;
  };
  /** Phase 4: Draft reply result */
  draftReply?: {
    ok: boolean;
    skipped: boolean;
    reason?: string;
    draftId?: string;
  };
}

/** Current webhook tunnel status */
export interface WebhookTunnelStatus {
  configured: boolean;
  tunnelUrl: string | null;
  localTarget: string;
  lastHeartbeat: string | null;
  uptimeSeconds: number;
}

// ---------------------------------------------------------------------------
// Webhook Configuration Store (in-memory for local/private stage)
// ---------------------------------------------------------------------------

const webhookConfig = {
  tunnelUrl: null as string | null,
  tunnelStartTime: null as number | null,
  secretKey: null as string | null, // HMAC signing key for outbound requests
  inboundApiKey: null as string | null, // API key for inbound webhook auth
};

/** Map from connectedAccountId -> { sourceId, sessionToken, lastPing } */
const subscribedSessions = new Map<
  string,
  { sourceId: string; sessionToken: string; lastPing: number }
>();

/** Replay protection: set of already-processed event IDs + timestamps */
const processedEvents = new Set<string>();
const PROCESSED_EVENT_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Replay Protection
// ---------------------------------------------------------------------------

function isReplayEvent(eventId: string, timestamp: string): boolean {
  const key = `${eventId}:${timestamp}`;
  if (processedEvents.has(key)) {
    return true;
  }
  processedEvents.add(key);

  // Clean up old entries periodically
  if (processedEvents.size > 10_000) {
    const cutoff = Date.now() - PROCESSED_EVENT_TTL_MS;
    for (const entry of processedEvents) {
      const [, ts] = entry.split(":");
      if (Number(ts) < cutoff) {
        processedEvents.delete(entry);
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Signature Verification
// ---------------------------------------------------------------------------

/**
 * Verify HMAC-SHA256 webhook signature.
 * Composio signs payloads with: HMAC-SHA256(secret, timestamp + "." + body)
 */
function verifyComposioSignature(
  timestamp: string,
  body: string,
  signature: string,
  secret: string
): boolean {
  try {
    const payload = `${timestamp}.${body}`;
    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const sigBuffer = Buffer.from(signature, "hex");
    const expBuffer = Buffer.from(expected, "hex");
    if (sigBuffer.length !== expBuffer.length) {
      return false;
    }
    return timingSafeEqual(sigBuffer, expBuffer);
  } catch {
    return false;
  }
}

/**
 * Verify Microsoft Graph clientState for subscription validation.
 */
function verifyMsGraphClientState(
  receivedState: string,
  expectedState: string
): boolean {
  try {
    if (receivedState.length !== expectedState.length) {
      return false;
    }
    return timingSafeEqual(
      Buffer.from(receivedState),
      Buffer.from(expectedState)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Rate Limiting (per-IP)
// ---------------------------------------------------------------------------

const webhookRateLimitMap = new Map<
  string,
  { count: number; windowStart: number }
>();
const WEBHOOK_RATE_LIMIT = 120; // requests per window
const WEBHOOK_RATE_WINDOW_MS = 60 * 1000; // 1 minute

function checkWebhookRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = webhookRateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > WEBHOOK_RATE_WINDOW_MS) {
    webhookRateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= WEBHOOK_RATE_LIMIT) {
    return false;
  }
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Core: Fetch full mail from Outlook and trigger agent
// ---------------------------------------------------------------------------

/**
 * Process a new mail event: fetch full content, trigger AI analysis.
 */
/**
 * Process a new mail event using Zod-constrained structured output pipeline.
 *
 * Algorithm:
 * 1. Fetch full mail from Outlook
 * 2. Analyze with Zod-constrained LLM (3 retries with error feedback)
 * 3. Validate ISO-8601 datetime and normalize timezone
 * 4. Return structured MailAnalysisResult
 *
 * Falls back gracefully: if analysis fails, returns partial result with error info.
 */
export async function processNewMailEvent(
  messageId: string,
  sourceContext: MailSourceContext,
  locale: AnalysisLocale = "zh-CN",
  userId?: string
): Promise<ProcessedMailEvent> {
  try {
    // 1. Fetch full mail from Outlook
    const mailDetail = await fetchOutlookMessage(messageId, sourceContext);

    if (!mailDetail) {
      return {
        ok: false,
        messageId,
        agentTriggered: false,
        error: "Failed to fetch mail from Outlook",
        errorCode: "MAIL_FETCH_FAILED",
      };
    }

    // 2. Run Zod-constrained structured analysis (up to 3 retries)
    const sessionKey = gatewaySessionKeyForSource(
      sourceContext.mailboxUserId ?? "unknown",
      sourceContext.connectedAccountId ?? ""
    );

    const analysisResult = await analyzeMail(
      {
        id: messageId,
        subject: mailDetail.subject ?? "(无主题)",
        fromName: mailDetail.fromName,
        fromAddress: mailDetail.fromAddress ?? "",
        bodyPreview: mailDetail.bodyPreview ?? mailDetail.bodyContent?.slice(0, 500) ?? "(无正文)",
        receivedDateTime: mailDetail.receivedDateTime ?? new Date().toISOString(),
        importance: mailDetail.importance ?? "normal",
        hasAttachments: mailDetail.hasAttachments ?? false,
      },
      {
        locale,
        sessionKey,
        userId: userId ?? sourceContext.mailboxUserId ?? "unknown",
      },
      gatewayQueryAgent
    );

    // 3. Handle analysis outcome
    if (analysisResult.ok) {
      const { data } = analysisResult;

      // Phase 3: Trigger multi-channel push for urgent_important mail
      let notificationResult = null;
      if (data.quadrant === "urgent_important") {
        try {
          const notificationPayload: NotificationPayload = {
            source: "mail",
            type: "urgent_mail",
            timestamp: new Date().toISOString(),
            mail: {
              id: messageId,
              subject: mailDetail.subject ?? "(无主题)",
              fromName: mailDetail.fromName,
              fromAddress: mailDetail.fromAddress ?? "",
              quadrant: data.quadrant,
              executiveSummary: data.executive_summary,
              ddlDatetime: data.ddl_datetime,
              actionableIntent: data.actionable_intent,
              confidence: data.confidence,
              insightType: data.insight_type,
              webLink: mailDetail.webLink,
            },
            analysis: data,
          };

          notificationResult = await pushUrgentNotification(
            notificationPayload,
            {
              userId: userId ?? sourceContext.mailboxUserId ?? "unknown",
              mailboxUserId: sourceContext.mailboxUserId,
              sessionKey,
              channels: ["browser"], // TODO: expand to dingtalk/wecom when channels are bound
            }
          );
        } catch (notifError) {
          // Notification failure should not fail the whole event
          console.error(
            `[webhook-handler] Notification push failed for ${messageId}:`,
            notifError instanceof Error ? notifError.message : String(notifError)
          );
        }
      }

      // Phase 4: Calendar sync for DDL/meeting/exam/event
      let calendarResult = null;
      try {
        const calendarOptions: CalendarSyncOptions = {
          locale,
          sourceContext,
        };
        calendarResult = await syncMailToCalendar(
          messageId,
          mailDetail.subject ?? "(无主题)",
          mailDetail.fromAddress ?? "unknown",
          data,
          calendarOptions
        );
      } catch (calError) {
        console.error(
          `[webhook-handler] Calendar sync failed for ${messageId}:`,
          calError instanceof Error ? calError.message : String(calError)
        );
      }

      // Phase 4: Draft reply for actionable emails (requires user opt-in)
      let draftResult = null;
      try {
        const draftOptions: DraftReplyOptions = {
          locale,
          sourceContext,
          userOptedIn: false, // TODO: read from user preferences
        };
        draftResult = await createDraftReplyForMail(
          messageId,
          mailDetail.subject ?? "(无主题)",
          mailDetail.fromName ?? "Unknown",
          data,
          draftOptions
        );
      } catch (draftError) {
        console.error(
          `[webhook-handler] Draft reply failed for ${messageId}:`,
          draftError instanceof Error ? draftError.message : String(draftError)
        );
      }

        return {
        ok: true,
        messageId,
        sessionKey,
        agentTriggered: true,
        summary: data.executive_summary,
        quadrant: data.quadrant,
        analysis: data,
        notification: notificationResult
          ? {
              ok: notificationResult.ok,
              channelsAttempted: notificationResult.channelsAttempted,
              channelsDelivered: notificationResult.channelsDelivered,
            }
          : undefined,
        calendar: calendarResult
          ? {
              ok: calendarResult.ok,
              skipped: calendarResult.skipped,
              reason: calendarResult.reason,
              eventId: calendarResult.eventId,
              eventWebLink: calendarResult.eventWebLink,
            }
          : undefined,
        draftReply: draftResult
          ? {
              ok: draftResult.ok,
              skipped: draftResult.skipped,
              reason: draftResult.reason,
              draftId: draftResult.draftId,
            }
          : undefined,
        parseInfo: {
          attemptCount: analysisResult.attemptCount,
          confidence: data.confidence,
          insightType: data.insight_type,
          ddlDatetime: data.ddl_datetime,
          actionableIntent: data.actionable_intent,
          keyEntities: data.key_entities,
        },
      };
    } else {
      // Analysis failed after all retries — return partial result
      return {
        ok: true,
        messageId,
        sessionKey,
        agentTriggered: false,
        error: `Analysis failed after ${analysisResult.attemptCount} attempts: ${analysisResult.error}`,
        errorCode: analysisResult.errorCode,
        parseInfo: {
          attemptCount: analysisResult.attemptCount,
          failed: true,
          rawOutput: analysisResult.rawOutput.slice(0, 500),
        },
      };
    }
  } catch (error) {
    return {
      ok: false,
      messageId,
      agentTriggered: false,
      error:
        error instanceof Error ? error.message : "Unknown processing error",
      errorCode: "PROCESSING_ERROR",
    };
  }
}

// ---------------------------------------------------------------------------
// Gateway Session Key (for OpenClaw /hooks/agent)
// ---------------------------------------------------------------------------

/**
 * Build a session key for the mail processor sub-agent.
 * This is used when calling OpenClaw's /hooks/agent endpoint.
 */
function gatewaySessionKeyForSource(
  mailboxUserId: string,
  connectedAccountId: string
): string {
  const raw = `mail-webhook:${mailboxUserId}:${connectedAccountId}`;
  return createHmac("sha256", "webhook-session-key-v1")
    .update(raw)
    .digest("hex");
}

// ---------------------------------------------------------------------------
// SSE Broadcaster — push new mail notification to WebUI clients
// ---------------------------------------------------------------------------

/** Active SSE streams waiting for mail notifications */
const mailNotificationStreams = new Map<
  string,
  {
    send: (payload: unknown) => void;
    sourceId: string;
    connectedAccountId: string;
    refCount: number;
  }
>();

/**
 * Register an SSE stream for mail notifications.
 */
export function registerMailNotificationStream(
  streamId: string,
  handlers: {
    send: (payload: unknown) => void;
    sourceId: string;
    connectedAccountId: string;
  }
): void {
  mailNotificationStreams.set(streamId, { ...handlers, refCount: 0 });
}

/**
 * Unregister an SSE stream.
 */
export function unregisterMailNotificationStream(streamId: string): void {
  mailNotificationStreams.delete(streamId);
}

/**
 * Increment reference count for a stream (called when stream starts being used).
 */
export function acquireStreamRef(streamId: string): boolean {
  const entry = mailNotificationStreams.get(streamId);
  if (entry) {
    entry.refCount++;
    return true;
  }
  return false;
}

/**
 * Decrement reference count for a stream (called when stream stops being used).
 */
export function releaseStreamRef(streamId: string): void {
  const entry = mailNotificationStreams.get(streamId);
  if (entry) {
    entry.refCount--;
    if (entry.refCount <= 0) {
      mailNotificationStreams.delete(streamId);
    }
  }
}

/**
 * Broadcast a new mail event to all matching SSE streams.
 */
export function broadcastNewMailEvent(
  processedEvent: ProcessedMailEvent,
  sourceContext: MailSourceContext
): void {
  const streamsToRemove: string[] = [];

  for (const [key, handlers] of mailNotificationStreams) {
    if (
      handlers.sourceId === sourceContext.sourceId ||
      handlers.connectedAccountId === sourceContext.connectedAccountId
    ) {
      try {
        handlers.send({
          type: "new_mail",
          messageId: processedEvent.messageId,
          quadrant: processedEvent.quadrant,
          summary: processedEvent.summary,
          agentTriggered: processedEvent.agentTriggered,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Stream is closed, mark for removal (do not remove during iteration)
        streamsToRemove.push(key);
      }
    }
  }

  // Clean up closed streams after iteration
  for (const key of streamsToRemove) {
    mailNotificationStreams.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Express/Fastify Route Handlers
// ---------------------------------------------------------------------------

/** Request schema for Composio mail event webhook */
export const composioMailEventSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  metadata: z.object({
    log_id: z.string().optional(),
    trigger_slug: z.string(),
    trigger_id: z.string().optional(),
    connected_account_id: z.string(),
    user_id: z.string().optional(),
  }),
  data: z.object({
    message_id: z.string(),
  }),
  timestamp: z.string().optional(),
});

/** Request schema for Microsoft Graph subscription notification */
export const msGraphNotificationSchema = z.object({
  value: z.array(
    z.object({
      subscriptionId: z.string(),
      subscriptionExpirationDateTime: z.string(),
      changeType: z.enum(["created", "updated", "deleted"]),
      resource: z.string(),
      clientState: z.string(),
      notificationUrl: z.string().optional(),
    })
  ),
});

/**
 * POST /api/webhook/mail-event
 *
 * Receives new mail event notifications from Composio OUTLOOK_NEW_MESSAGE_TRIGGER.
 *
 * Security:
 * - Requires `X-Webhook-Signature: <hmac-sha256>` header
 * - Requires `X-Webhook-Timestamp: <unix-ms>` header
 * - Rejects requests older than 5 minutes (replay protection)
 * - Rate limited: 120 req/min per IP
 *
 * Body: ComposioMailTriggerPayload (see above)
 */
export async function handleComposioMailEvent(
  body: unknown,
  rawBody: string,
  headers: {
    "x-webhook-signature"?: string;
    "x-webhook-timestamp"?: string;
    "x-forwarded-for"?: string;
    "x-real-ip"?: string;
  },
  ip: string
): Promise<{
  status: number;
  body: { ok: boolean; error?: string; errorCode?: string };
}> {
  // 1. Rate limit check
  if (!checkWebhookRateLimit(ip)) {
    return {
      status: 429,
      body: {
        ok: false,
        error: "Rate limit exceeded",
        errorCode: "WEBHOOK_RATE_LIMITED",
      },
    };
  }

  // 2. CRITICAL: Require webhook secret — refuse if not configured
  const secret = webhookConfig.secretKey;
  if (!secret) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "Webhook secret not configured",
        errorCode: "WEBHOOK_SECRET_NOT_CONFIGURED",
      },
    };
  }

  // 3. Require both signature and timestamp headers
  const sigHeader = headers["x-webhook-signature"];
  const tsHeader = headers["x-webhook-timestamp"];
  if (!sigHeader || !tsHeader) {
    return {
      status: 401,
      body: {
        ok: false,
        error: "Missing X-Webhook-Signature or X-Webhook-Timestamp header",
        errorCode: "WEBHOOK_MISSING_HEADERS",
      },
    };
  }

  // 4. Reject requests older than 5 minutes
  const tsNum = Number(tsHeader);
  if (!isNaN(tsNum) && Date.now() - tsNum > 5 * 60 * 1000) {
    return {
      status: 401,
      body: {
        ok: false,
        error: "Webhook timestamp expired",
        errorCode: "WEBHOOK_TIMESTAMP_EXPIRED",
      },
    };
  }

  // 5. Verify HMAC signature
  if (
    !verifyComposioSignature(tsHeader, rawBody, sigHeader.replace(/^sha256=/, ""), secret)
  ) {
    return {
      status: 401,
      body: {
        ok: false,
        error: "Invalid webhook signature",
        errorCode: "WEBHOOK_SIGNATURE_INVALID",
      },
    };
  }

  // 6. Parse payload
  const parseResult = composioMailEventSchema.safeParse(body);
  if (!parseResult.success) {
    return {
      status: 400,
      body: {
        ok: false,
        error: `Invalid payload: ${parseResult.error.message}`,
        errorCode: "WEBHOOK_INVALID_PAYLOAD",
      },
    };
  }

  const payload = parseResult.data;

  // 7. Replay protection
  const eventKey = payload.id ?? payload.metadata?.trigger_id ?? `${payload.metadata?.connected_account_id}:${payload.data.message_id}`;
  const timestamp = payload.timestamp ?? String(Date.now());
  if (eventKey && isReplayEvent(eventKey, timestamp)) {
    return {
      status: 200, // Return 200 to prevent Composio retries
      body: { ok: true }, // Already processed
    };
  }

  // 8. Look up source context from connected account
  const connectedAccountId = payload.metadata?.connected_account_id;
  const sessionEntry = subscribedSessions.get(connectedAccountId);
  if (!sessionEntry) {
    return {
      status: 404,
      body: {
        ok: false,
        error: `No active subscription for connected account: ${connectedAccountId}`,
        errorCode: "SUBSCRIPTION_NOT_FOUND",
      },
    };
  }

  // Update last ping
  sessionEntry.lastPing = Date.now();

  // 9. Build source context
  const sourceContext = normalizeSourceContext({
    sourceId: sessionEntry.sourceId,
    mailboxUserId: "me",
    connectedAccountId,
  });

  if (!sourceContext) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "Failed to build source context",
        errorCode: "SOURCE_CONTEXT_ERROR",
      },
    };
  }

  // 10. Process the new mail event (Phase 2: Zod-constrained analysis)
  const result = await processNewMailEvent(
    payload.data.message_id,
    sourceContext,
    "zh-CN", // TODO: derive from user session preferences
    payload.metadata?.user_id
  );

  // 11. Broadcast to SSE streams
  broadcastNewMailEvent(result, sourceContext);

  return {
    status: result.ok ? 200 : 500,
    body: {
      ok: result.ok,
      error: result.error,
      errorCode: result.errorCode,
    },
  };
}

/**
 * POST /api/webhook/outlook-subscription
 *
 * Receives Microsoft Graph subscription change notifications.
 * Requires clientState verification.
 *
 * Security:
 * - Verifies clientState matches configured secret
 * - Only processes "created" changeType (new mail)
 * - Rate limited: 60 req/min per IP
 */
export async function handleMsGraphNotification(
  body: unknown,
  headers: { "x-forwarded-for"?: string; "x-real-ip"?: string },
  ip: string,
  expectedClientState: string
): Promise<{
  status: number;
  body: { ok: boolean; processed?: number; error?: string; errorCode?: string };
}> {
  // Rate limit
  const subKey = `msgraph:${ip}`;
  if (!checkWebhookRateLimit(subKey)) {
    return {
      status: 429,
      body: { ok: false, errorCode: "WEBHOOK_RATE_LIMITED", error: "Rate limit exceeded" },
    };
  }

  // CRITICAL: Require clientState secret — refuse if not configured
  if (!expectedClientState) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "Microsoft Graph clientState not configured",
        errorCode: "MS_GRAPH_CLIENT_STATE_NOT_CONFIGURED",
      },
    };
  }

  const parseResult = msGraphNotificationSchema.safeParse(body);
  if (!parseResult.success) {
    return {
      status: 400,
      body: {
        ok: false,
        error: `Invalid payload: ${parseResult.error.message}`,
        errorCode: "WEBHOOK_INVALID_PAYLOAD",
      },
    };
  }

  const notifications = parseResult.data.value;
  let processed = 0;

  for (const notification of notifications) {
    // Verify clientState — non-empty expectedClientState is guaranteed by check above
    if (!verifyMsGraphClientState(notification.clientState, expectedClientState)) {
      continue; // Skip invalid notifications
    }

    // Only process new mail
    if (notification.changeType !== "created") {
      continue;
    }

    // Extract message ID from resource path
    // Format: "Users/{userId}/Messages/{msgId}"
    const resourceParts = notification.resource.split("/");
    const messageId = resourceParts[resourceParts.length - 1];

    if (!messageId || messageId.includes("{")) {
      continue; // Invalid resource format
    }

    // Find matching subscription
    const entry = subscribedSessions.get(notification.subscriptionId);
    if (!entry) {
      continue;
    }

    const sourceContext = normalizeSourceContext({
      sourceId: entry.sourceId,
      mailboxUserId: "me",
      connectedAccountId: notification.subscriptionId,
    });

    if (!sourceContext) continue;

    const result = await processNewMailEvent(
      messageId,
      sourceContext,
      "zh-CN",
      undefined
    );
    if (result.ok) processed++;

    broadcastNewMailEvent(result, sourceContext);
  }

  return {
    status: 200,
    body: { ok: true, processed },
  };
}

/**
 * POST /api/webhook/subscribe
 *
 * Register a new mail webhook subscription for a session.
 * This is called by the WebUI when a user connects to the notification stream.
 *
 * SECURITY: Requires X-API-Key header matching WEBHOOK_INBOUND_API_KEY.
 *
 * Body: { sourceId: string, connectedAccountId: string }
 * Note: sessionToken removed from body — identity is verified via API key
 */
export async function handleWebhookSubscribe(
  body: unknown,
  apiKey?: string
): Promise<{ ok: boolean; streamId?: string; error?: string; errorCode?: string }> {
  // CRITICAL: Require API key for all subscription registrations
  const configuredKey = webhookConfig.inboundApiKey;
  if (!configuredKey) {
    return {
      ok: false,
      error: "Webhook inbound API key not configured",
      errorCode: "WEBHOOK_NOT_CONFIGURED",
    };
  }

  const apiKeyMatches =
    apiKey &&
    apiKey.length === configuredKey.length &&
    timingSafeEqual(Buffer.from(apiKey), Buffer.from(configuredKey));

  if (!apiKeyMatches) {
    return {
      ok: false,
      error: "Unauthorized",
      errorCode: "INVALID_API_KEY",
    };
  }

  const schema = z.object({
    sourceId: z.string().min(1).max(80),
    connectedAccountId: z.string().min(1).max(80),
  });

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      error: `Invalid payload: ${result.error.message}`,
      errorCode: "WEBHOOK_INVALID_PAYLOAD",
    };
  }

  const { sourceId, connectedAccountId } = result.data;

  subscribedSessions.set(connectedAccountId, {
    sourceId,
    sessionToken: `api-key:${connectedAccountId}`,
    lastPing: Date.now(),
  });

  return {
    ok: true,
    streamId: `stream-${randomUUID().slice(0, 8)}`,
  };
}

/**
 * GET /api/webhook/public-url
 *
 * Returns the current configured public webhook URL.
 */
export function getWebhookTunnelStatus(): WebhookTunnelStatus {
  return {
    configured: webhookConfig.tunnelUrl !== null,
    tunnelUrl: webhookConfig.tunnelUrl,
    localTarget: "http://127.0.0.1:8787",
    lastHeartbeat: webhookConfig.tunnelStartTime
      ? new Date(webhookConfig.tunnelStartTime).toISOString()
      : null,
    uptimeSeconds: webhookConfig.tunnelStartTime
      ? Math.floor((Date.now() - webhookConfig.tunnelStartTime) / 1000)
      : 0,
  };
}

/**
 * Update the tunnel URL (called by the tunnel management script).
 */
export function updateTunnelUrl(url: string | null): void {
  webhookConfig.tunnelUrl = url;
  if (url) {
    webhookConfig.tunnelStartTime = Date.now();
  }
}

/**
 * Update webhook secrets (called during BFF initialization).
 */
export function setWebhookSecrets(secrets: {
  secretKey?: string;
  inboundApiKey?: string;
}): void {
  if (secrets.secretKey) {
    webhookConfig.secretKey = secrets.secretKey;
  }
  if (secrets.inboundApiKey) {
    webhookConfig.inboundApiKey = secrets.inboundApiKey;
  }
}

/**
 * Periodic cleanup of stale subscriptions (call from sweeper).
 */
export function purgeStaleSubscriptions(maxAgeMs: number = 30 * 60 * 1000): number {
  const now = Date.now();
  let purged = 0;
  for (const [key, entry] of subscribedSessions) {
    if (now - entry.lastPing > maxAgeMs) {
      subscribedSessions.delete(key);
      purged++;
    }
  }
  return purged;
}
