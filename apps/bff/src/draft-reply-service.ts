/**
 * @fileoverview Draft Reply Service — Safe Auto-Reply Draft Creation
 *
 * Phase 4: Creates draft email replies for actionable emails.
 *
 * SECURITY CRITICAL:
 * ===============
 * This service ONLY creates DRAFT replies. It NEVER sends emails directly.
 * This is enforced at multiple levels:
 *
 * 1. API level: Uses OUTLOOK_CREATE_DRAFT_REPLY (creates draft, no send)
 * 2. Scope level: Only activates for emails where actionable_intent === true
 * 3. User level: Requires explicit user opt-in via session preferences
 *
 * This function MUST NOT call OUTLOOK_SEND_EMAIL or any direct send tool.
 */

import { invokeTool } from "./gateway.js";
import {
  composioMultiExecuteArgs,
  type MailSourceContext,
} from "./mail.js";
import { inferTimezone } from "./mail-analysis.js";
import type { MailAnalysisResult, AnalysisLocale } from "./mail-analysis.js";
import type { MailSourceContext as MailCtx } from "./mail.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DraftReplyResult {
  ok: boolean;
  draftId?: string;
  skipped: boolean;
  reason?: string;
  error?: string;
}

export interface DraftReplyOptions {
  locale: AnalysisLocale;
  timezone?: string;
  sourceContext?: MailCtx;
  /** User has explicitly opted in to auto-draft creation */
  userOptedIn: boolean;
}

// ─── Draft Reply Prompt Builder ─────────────────────────────────────────────────

/**
 * Build a professional auto-draft reply based on the email analysis.
 *
 * Draft reply rules:
 * - Must be polite and professional
 * - Must not make commitments beyond acknowledgment
 * - Must include original message reference
 * - Must use the user's locale language
 * - Character limit: 500 (keeps draft concise, user can edit)
 */
function buildDraftReplyContent(
  mailSubject: string,
  senderName: string,
  analysis: MailAnalysisResult,
  locale: AnalysisLocale
): string {
  if (locale === "zh-CN") {
    const name = senderName || "您好";
    const insightNote = analysis.insight_type === "meeting"
      ? `关于${analysis.key_entities.meeting_topic || "会议邀请"}，我已收到通知。`
      : "";

    return `${name}，您好！

感谢您的来信，已收到。关于"${mailSubject}"，我已了解情况，会尽快处理。

${insightNote}

祝好
[由 AI 邮件助手自动起草，请审核后发送]`.slice(0, 500);
  }

  if (locale === "ja-JP") {
    const name = senderName || "您好";
    return `${name} 様

お世話になっております。 件名"${mailSubject}"のメールを拝受しました。

内容を確認し尽快に対応いたします。

、AIメールアシスタントが自動作成した下書きです。確認後に送信してください。`.slice(0, 500);
  }

  // en-US fallback
  const name = senderName || "Hi";
  return `${name},

Thank you for your email regarding "${mailSubject}". I have received your message and will get back to you shortly.

[Auto-generated draft by AI Mail Assistant — please review before sending]`.slice(0, 500);
}

// ─── Main Function ──────────────────────────────────────────────────────────────

/**
 * Create a draft email reply for an actionable email.
 *
 * Safety gates (all must pass):
 * 1. actionable_intent === true
 * 2. userOptedIn === true
 * 3. Draft does not already exist for this messageId (dedup)
 */

const recentDraftDedup = new Map<string, number>(); // key: messageId, value: timestamp
const DRAFT_DEDUP_MS = 60 * 60 * 1000; // 1 hour dedup
const MAX_STORE = 200;

function isDraftDuplicate(messageId: string): boolean {
  const last = recentDraftDedup.get(messageId);
  if (last && Date.now() - last < DRAFT_DEDUP_MS) {
    return true;
  }
  recentDraftDedup.set(messageId, Date.now());

  if (recentDraftDedup.size > MAX_STORE) {
    const cutoff = Date.now() - DRAFT_DEDUP_MS * 2;
    for (const [k, ts] of recentDraftDedup) {
      if (ts < cutoff) recentDraftDedup.delete(k);
    }
  }
  return false;
}

/**
 * Create a draft reply for the given mail.
 *
 * @param messageId - The Outlook message ID to reply to
 * @param mailSubject - Subject of the original email
 * @param senderName - Sender's display name
 * @param analysis - Zod-parsed mail analysis result
 * @param options - Configuration options
 *
 * @returns DraftReplyResult indicating success/failure
 *
 * @security This function ONLY creates a DRAFT. It never sends the email.
 */
export async function createDraftReplyForMail(
  messageId: string,
  mailSubject: string,
  senderName: string,
  analysis: MailAnalysisResult,
  options: DraftReplyOptions
): Promise<DraftReplyResult> {
  const { locale = "zh-CN", timezone, sourceContext, userOptedIn } = options;

  // Guard 1: User must have opted in
  if (!userOptedIn) {
    return {
      ok: true,
      skipped: true,
      reason: "User has not opted in to auto-draft creation",
    };
  }

  // Guard 2: Email must be actionable
  if (!analysis.actionable_intent) {
    return {
      ok: true,
      skipped: true,
      reason: "Email is not actionable (actionable_intent === false)",
    };
  }

  // Guard 3: Deduplication (no duplicate drafts within 1 hour)
  if (isDraftDuplicate(messageId)) {
    return {
      ok: true,
      skipped: true,
      reason: "Draft already created for this message within 1 hour",
    };
  }

  // Guard 4: Must have a valid messageId
  if (!messageId || messageId.trim() === "") {
    return {
      ok: false,
      skipped: true,
      reason: "Invalid messageId",
      error: "messageId is empty",
    };
  }

  // Build draft content
  const draftContent = buildDraftReplyContent(mailSubject, senderName, analysis, locale);

  try {
    // Call Composio OUTLOOK_CREATE_DRAFT_REPLY tool
    // This creates a draft reply in the user's mailbox
    // It does NOT send the email — the user must manually send
    const raw = await invokeTool({
      tool: "COMPOSIO_MULTI_EXECUTE_TOOL",
      args: composioMultiExecuteArgs(
        [
          {
            tool_slug: "OUTLOOK_CREATE_DRAFT_REPLY",
            arguments: {
              message_id: messageId.trim(),
              comment: draftContent,
            },
          },
        ],
        sourceContext
      ),
    });

    // Parse response
    const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);

    let draftId: string | undefined;
    try {
      const parsed = JSON.parse(rawStr);
      // Try to extract draft ID from various response formats
      draftId =
        parsed?.result?.id ||
        parsed?.id ||
        parsed?.response?.id ||
        parsed?.data?.id ||
        undefined;
    } catch {
      // Draft created but ID not extractable — that's OK
    }

    return {
      ok: true,
      draftId,
      skipped: false,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // Handle specific Composio errors
    if (errorMessage.includes("OUTLOOK_CREATE_DRAFT_REPLY")) {
      return {
        ok: false,
        skipped: false,
        error: `Draft creation failed (tool not available): ${errorMessage}`,
      };
    }

    if (errorMessage.includes("invalid message_id")) {
      return {
        ok: false,
        skipped: true,
        error: `Invalid message_id: ${errorMessage}`,
      };
    }

    return {
      ok: false,
      skipped: false,
      error: `Draft creation failed: ${errorMessage}`,
    };
  }
}
