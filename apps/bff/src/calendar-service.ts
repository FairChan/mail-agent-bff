/**
 * @fileoverview Calendar Service — Automatic DDL/Meeting Calendar Sync
 *
 * Phase 4: Detects DDL and meeting emails from the Zod analysis result,
 * automatically creates Outlook calendar events via Composio OUTLOOK_CREATE_ME_EVENT.
 *
 * Architecture:
 * =============
 * processNewMailEvent() → MailAnalysisResult
 *     ↓
 * syncMailToCalendar()
 *     ├─ insight_type === "ddl" || "meeting" || "exam"?
 *     │   └─ YES → createCalendarEventFromInsight()
 *     └─ NO → skip
 *
 * Event creation follows:
 * - ISO-8601 datetime (validated in mail-analysis.ts)
 * - IANA timezone normalization
 * - Event duration based on insight_type
 * - Dedup: skip if event for same subject already exists today
 */

import { createCalendarEventFromInsight, type MailCalendarSyncInput } from "./mail.js";
import { normalizeDatetimeWithTimezone, inferTimezone } from "./mail-analysis.js";
import type { MailAnalysisResult, AnalysisLocale } from "./mail-analysis.js";
import type { MailSourceContext } from "./mail.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarSyncResult {
  ok: boolean;
  eventId?: string;
  eventSubject?: string;
  eventWebLink?: string;
  eventStart?: string;
  eventEnd?: string;
  skipped: boolean;
  reason?: string;
  error?: string;
}

export interface CalendarSyncOptions {
  locale: AnalysisLocale;
  timezone?: string;
  sourceContext?: MailSourceContext;
}

// ─── Event Duration by Type ────────────────────────────────────────────────────

/** Default event duration in minutes, by insight type */
const DURATION_BY_TYPE: Record<string, number> = {
  ddl: 30,      // Short reminder: 30 min
  meeting: 60,  // Standard meeting: 60 min
  exam: 90,     // Exam duration: 90 min
  event: 60,     // General event: 60 min
  notification: 15,
  other: 30,
};

function getEventDurationMinutes(insightType: string): number {
  return DURATION_BY_TYPE[insightType] ?? 30;
}

// ─── Deduplication ─────────────────────────────────────────────────────────────

/** Prevent duplicate calendar events for same subject on same day */
const recentEventDeduplication = new Map<string, number>(); // key: `${senderAddress}:${subject}:${date}`, value: timestamp
const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const MAX_STORE_ENTRIES = 500;

function isRecentEventDuplicate(
  senderAddress: string,
  subject: string,
  dueAt: string
): boolean {
  const date = dueAt.slice(0, 10); // YYYY-MM-DD
  const key = `${senderAddress}:${subject}:${date}`;
  const last = recentEventDeduplication.get(key);

  if (last && Date.now() - last < DEDUP_WINDOW_MS) {
    return true;
  }

  recentEventDeduplication.set(key, Date.now());

  if (recentEventDeduplication.size > MAX_STORE_ENTRIES) {
    const cutoff = Date.now() - DEDUP_WINDOW_MS * 2;
    for (const [k, ts] of recentEventDeduplication) {
      if (ts < cutoff) recentEventDeduplication.delete(k);
    }
  }

  return false;
}

// ─── Main Sync Function ─────────────────────────────────────────────────────────

/**
 * Sync a mail to Outlook calendar if it contains a DDL or meeting.
 *
 * Conditions:
 * - insight_type must be one of: ddl, meeting, exam, event
 * - ddl_datetime must be a valid ISO-8601 datetime
 * - due date must not be more than 2 hours in the past
 * - No duplicate event for same subject on same day (30-min dedup window)
 */
export async function syncMailToCalendar(
  mailId: string,
  subject: string,
  senderAddress: string,
  analysisResult: MailAnalysisResult,
  options: CalendarSyncOptions
): Promise<CalendarSyncResult> {
  const { locale = "zh-CN", timezone, sourceContext } = options;
  const tz = timezone ?? inferTimezone(locale);

  // Guard: must have a valid ddl_datetime
  if (!analysisResult.ddl_datetime) {
    return {
      ok: true,
      skipped: true,
      reason: "No ddl_datetime in analysis result",
    };
  }

  // Guard: must be a calendar-worthy insight type
  const calendarTypes = ["ddl", "meeting", "exam", "event"];
  if (!calendarTypes.includes(analysisResult.insight_type)) {
    return {
      ok: true,
      skipped: true,
      reason: `insight_type "${analysisResult.insight_type}" does not require calendar event`,
    };
  }

  // Guard: due date must not be too far in the past
  const dueDate = new Date(analysisResult.ddl_datetime);
  if (isNaN(dueDate.getTime())) {
    return {
      ok: false,
      skipped: true,
      reason: "Invalid ddl_datetime",
      error: "ddl_datetime is not a valid date",
    };
  }

  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  if (dueDate.getTime() < Date.now() - TWO_HOURS_MS) {
    return {
      ok: true,
      skipped: true,
      reason: "ddl_datetime is more than 2 hours in the past",
    };
  }

  // Guard: deduplication (same subject on same day)
  if (isRecentEventDuplicate(senderAddress, subject, analysisResult.ddl_datetime)) {
    return {
      ok: true,
      skipped: true,
      reason: "Duplicate event (same subject on same day within 30 min)",
    };
  }

  // Normalize datetime with timezone
  const normalizedDueAt = normalizeDatetimeWithTimezone(analysisResult.ddl_datetime, tz);
  if (!normalizedDueAt) {
    return {
      ok: false,
      skipped: false,
      error: "Failed to normalize ddl_datetime with timezone",
    };
  }

  // Build calendar sync input
  const calendarInput: MailCalendarSyncInput = {
    messageId: mailId,
    subject,
    type: analysisResult.insight_type as "ddl" | "meeting" | "exam" | "event",
    dueAt: normalizedDueAt,
    dueDateLabel: analysisResult.key_entities.deadline_description ?? undefined,
    evidence: `ai_inferred:${analysisResult.insight_type}`,
    timeZone: tz,
  };

  try {
    const response = await createCalendarEventFromInsight(calendarInput, sourceContext);

    return {
      ok: true,
      eventId: response.eventId,
      eventSubject: response.eventSubject,
      eventWebLink: response.eventWebLink,
      eventStart: response.start.dateTime,
      eventEnd: response.end.dateTime,
      skipped: false,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // Handle known error codes gracefully
    if (errorMessage.includes("event already exists")) {
      return {
        ok: true,
        skipped: true,
        reason: "Event already exists in calendar",
        error: errorMessage,
      };
    }

    if (errorMessage.includes("timeZone")) {
      return {
        ok: false,
        skipped: false,
        error: `Calendar sync failed (timezone): ${errorMessage}`,
      };
    }

    return {
      ok: false,
      skipped: false,
      error: `Calendar sync failed: ${errorMessage}`,
    };
  }
}
