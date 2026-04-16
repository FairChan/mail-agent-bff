/**
 * @fileoverview Mail AI Analysis — Zod-Constrained Structured Output Pipeline
 *
 * Phase 2: Implements a robust LLM → Structured JSON pipeline for mail analysis.
 *
 * Architecture:
 * =============
 * Input Mail
 *     ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Prompt Builder (buildAnalysisPrompt)                         │
 * │ - Few-shot examples per language                            │
 * │ - Embedded Zod schema (human-readable + machine-verifiable)  │
 * │ - Multi-language: zh-CN / en-US / ja-JP                    │
 * └─────────────────────────────────────────────────────────────┘
 *     ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │ LLM Call (queryAgent)                                        │
 * │ - 30s timeout                                               │
 * │ - Sub-agent context: mail processor                          │
 * └─────────────────────────────────────────────────────────────┘
 *     ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Parser (parseStructuredOutput)                               │
 * │ ① Extract raw text (markdown strip)                         │
 * │ ② JSON.parse attempt #1                                      │
 * │ ③ JSON repair attempt (common issues)                        │
 * │ ④ Retry with error feedback (up to 3 tries)                  │
 * │ ⑤ Zod validation                                             │
 * │ ⑥ Timezone + ISO-8601 verification                           │
 * └─────────────────────────────────────────────────────────────┘
 *     ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Analysis Result (MailAnalysisResult)                          │
 * │ - quadrant / executive_summary / ddl_datetime                │
 * │ - actionable_intent / confidence / key_entities               │
 * │ - insight_type / notes                                       │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Retry Strategy:
 * ===============
 * Each retry includes:
 * - The Zod schema (so model self-corrects format)
 * - The previous invalid output (so model sees its mistake)
 * - The parse error message (so model understands what went wrong)
 * - A shorter version of the prompt (avoid context window bloat)
 *
 * ISO-8601 + IANA Timezone:
 * ==========================
 * - Dates are validated as ISO-8601 with timezone suffix
 * - Timezone must match IANA registry (e.g., +08:00, Asia/Shanghai)
 * - Invalid dates trigger retry with explicit format hint
 */

import { z } from "zod";
import { queryAgent } from "./gateway.js";

// ─── Zod Schema ───────────────────────────────────────────────────────────────

/** Valid quadrant values */
export const MAIL_QUADRANT_SCHEMA = z.enum([
  "urgent_important",
  "not_urgent_important",
  "urgent_not_important",
  "not_urgent_not_important",
]);

/** Insight type detection */
export const INSIGHT_TYPE_SCHEMA = z.enum([
  "ddl",
  "meeting",
  "exam",
  "event",
  "notification",
  "other",
]);

/**
 * ISO-8601 datetime validator:
 * - Accepts: "2026-04-08T23:59:00", "2026-04-08T23:59:00+08:00", "2026-04-08T23:59:00Z"
 * - Rejects: invalid date strings, wrong format, unknown timezone offsets
 */
const isoDateTimeString = z.string().refine(
  (val) => {
    if (val === null) return false;
    // Must be ISO-8601 format: YYYY-MM-DDTHH:mm:ss[.sss][Z|±HH:mm]
    const isoPattern =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
    if (!isoPattern.test(val)) return false;
    // Verify it parses to a valid date
    const parsed = new Date(val);
    return !isNaN(parsed.getTime());
  },
  { message: "Must be a valid ISO-8601 datetime (e.g., 2026-04-08T23:59:00+08:00)" }
);

/**
 * IANA timezone offset validator:
 * - Validates timezone offset format: +HH:mm or -HH:mm
 * - Accepts common values: +08:00, -05:00, Z (+00:00)
 * - Common Chinese timezones: +08:00 (Asia/Shanghai, Asia/Hong_Kong)
 */
const ianaTimezoneOffset = z.string().refine(
  (val) => {
    if (!val || val === "null") return false;
    // Accept Z, +HH:mm, -HH:mm
    if (val === "Z") return true;
    const offsetPattern = /^[+-]\d{2}:\d{2}$/;
    if (!offsetPattern.test(val)) return false;
    const offsetMinutes = parseInt(val.slice(1, 3)) * 60 + parseInt(val.slice(4, 6));
    return offsetMinutes >= -720 && offsetMinutes <= 840;
  },
  {
    message:
      "Timezone must be IANA format: +08:00, -05:00, or Z (+00:00). Common: +08:00 (Asia/Shanghai)",
  }
);

/** Core LLM output schema */
export const mailAnalysisSchema = z.object({
  /**
   * Eisenhower matrix quadrant classification.
   * - urgent_important: deadline today, critical decision needed
   * - not_urgent_important: valuable but can wait
   * - urgent_not_important: needs quick response but low value
   * - not_urgent_not_important: noise, can batch-process
   */
  quadrant: MAIL_QUADRANT_SCHEMA,

  /**
   * One-sentence summary in user's locale.
   * - zh-CN: 20-50 Chinese characters
   * - en-US: 12-28 English words
   * - ja-JP: 25-70 Japanese characters
   * Focus on: action items, deadlines, key context.
   */
  executive_summary: z.string().min(5).max(200),

  /**
   * ISO-8601 datetime of deadline or meeting start time.
   * - Format: "YYYY-MM-DDTHH:mm:ss+08:00" (preferred)
   * - Format: "YYYY-MM-DDTHH:mm:ssZ" (UTC)
   * - Set to null if no deadline/meeting detected.
   * Timezone must be IANA-compliant (+HH:mm or Z).
   */
  ddl_datetime: z
    .string()
    .transform((val) => {
      if (val === null || val === "null" || val.trim() === "") return null;
      return val.trim();
    })
    .refine((val) => val === null || isoDateTimeString.parse(val) === val, {
      message: "Invalid ISO-8601 datetime",
    })
    .nullable()
    .default(null),

  /**
   * Whether this email requires a reply or action from the user.
   * - true: meeting invites, requests, urgent matters
   * - false: newsletters, auto-replies, notifications
   */
  actionable_intent: z.boolean(),

  /**
   * Analysis confidence score: 0.0 (no confidence) to 1.0 (very confident).
   * - >= 0.9: clear-cut case, explicit keywords match
   * - 0.7-0.9: good match, some ambiguity
   * - 0.5-0.7: uncertain, vague content
   * - < 0.5: very uncertain, treat as low priority
   */
  confidence: z.number().min(0).max(1).default(0.5),

  /**
   * Extracted key entities from the email.
   */
  key_entities: z
    .object({
      /** Sender name or organization */
      sender_name: z.string().default("Unknown"),
      /** Human-readable deadline description */
      deadline_description: z.string().nullable().default(null),
      /** Meeting topic (if detected) */
      meeting_topic: z.string().nullable().default(null),
      /** Estimated meeting duration in minutes */
      meeting_duration_minutes: z.number().int().min(15).max(480).default(60),
      /** Attachment filenames, if any */
      attachments: z.array(z.string()).default([]),
      /** Who needs to respond */
      action_required_from: z.string().nullable().default(null),
    })
    .passthrough(),

  /**
   * Type of insight detected in this email.
   */
  insight_type: INSIGHT_TYPE_SCHEMA.default("other"),

  /**
   * Optional notes for additional context.
   */
  notes: z.string().max(500).nullable().default(null),
});

/** Parsed LLM output type */
export type MailAnalysisResult = z.infer<typeof mailAnalysisSchema>;

// ─── IANA Timezone Registry ───────────────────────────────────────────────────

/**
 * Valid IANA timezone offsets for common use cases.
 * Used for display and fallback when timezone detection fails.
 */
export const IANA_COMMON_OFFSETS: Record<string, string> = {
  "+00:00": "UTC",
  Z: "UTC (+00:00)",
  "+08:00": "Asia/Shanghai (中国/新加坡)",
  "+09:00": "Asia/Tokyo (日本)",
  "-05:00": "US/Eastern",
  "-08:00": "US/Pacific",
};

/**
 * Detect IANA timezone from user's locale.
 * Returns the most likely timezone based on language/country.
 */
export function inferTimezone(locale: string): string {
  const localeLower = locale.toLowerCase();
  if (localeLower.startsWith("zh")) return "+08:00"; // Asia/Shanghai
  if (localeLower.startsWith("ja")) return "+09:00"; // Asia/Tokyo
  if (localeLower.startsWith("ko")) return "+09:00"; // Asia/Seoul
  if (localeLower.startsWith("en") && !localeLower.includes("us")) return "+00:00"; // UK
  if (localeLower.includes("us")) return "-08:00"; // US/Pacific (default)
  return "+08:00"; // Default to China
}

/**
 * Normalize a datetime string to include timezone offset.
 * - If input has no timezone → append inferred timezone
 * - If input is invalid → return null
 */
export function normalizeDatetimeWithTimezone(
  datetime: string | null | undefined,
  inferredTimezone: string = "+08:00"
): string | null {
  if (!datetime || datetime === "null" || datetime.trim() === "") {
    return null;
  }

  const trimmed = datetime.trim();

  // Already has timezone suffix
  if (/T\d{2}:\d{2}:\d{2}[Z+-]/.test(trimmed)) {
    try {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch {
      return null;
    }
  }

  // No timezone → append inferred
  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const offset = inferredTimezone === "Z" ? "+00:00" : inferredTimezone;
      return d.toISOString().replace("Z", offset);
    }
  } catch {
    // fall through
  }

  return null;
}

// ─── Prompt Input Sanitization ─────────────────────────────────────────────────

/**
 * Sanitize untrusted mail data before inserting into prompt.
 *
 * SECURITY (HIGH-2): Prevents prompt injection attacks where an attacker
 * crafts malicious mail content to break out of the prompt context.
 *
 * Strategy:
 * - Strip/replace characters that could terminate the prompt context
 * - Remove markdown formatting to prevent context breakout
 * - Escape special characters that could be interpreted as prompt syntax
 * - Truncate long fields to prevent DoS
 */
function sanitizeForPrompt(input: string, fieldName: string, maxLen = 1000): string {
  if (!input) return "(empty)";

  // Truncate first to limit processing
  let text = input.slice(0, maxLen);

  // Remove characters that could break prompt context
  text = text
    // Remove backticks to prevent markdown/prompt injection
    .replace(/`/g, "'")
    // Remove/normalize newlines (keep spaces, not literal \n)
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    // Remove potential prompt injection keywords
    .replace(/^#+\s*/gm, "") // markdown headings
    .replace(/\*\*|__/g, "") // bold markers
    // Strip XML-style tags
    .replace(/<[^>]+>/g, "")
    // Remove unicode control characters
    .replace(/[\x00-\x1F\x7F]/g, "")
    // SECURITY (MEDIUM-5): Remove zero-width and bidirectional control characters
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width, BOM
    .replace(/[\u202A-\u202E]/g, "") // bidirectional control chars
    .replace(/[\u2066-\u2069]/g, "") // directional isolate chars
    .trim();

  if (text.length === 0) return "(empty)";

  // Verify we didn't accidentally create a dangerous string
  const suspicious = [
    "```",
    "SYSTEM:",
    "SYSTEM ",
    "INSTRUCTION:",
    "Ignore previous",
    "Disregard all",
    "You are now",
    "Previous message",
  ];
  for (const pattern of suspicious) {
    if (text.toUpperCase().includes(pattern.toUpperCase())) {
      // Replace suspicious content with safe placeholder
      return `(内容已过滤: ${fieldName})`;
    }
  }

  return text;
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

export type AnalysisLocale = "zh-CN" | "en-US" | "ja-JP";

interface PromptContext {
  subject: string;
  fromName: string;
  fromAddress: string;
  bodyPreview: string;
  receivedDateTime: string;
  importance: string;
  hasAttachments: boolean;
  locale: AnalysisLocale;
  timezone: string;
  /** Previous attempt (for retry) */
  previousOutput?: string;
  /** Parse error message (for retry) */
  parseError?: string;
  /** Attempt number (1-based) */
  attempt?: number;
}

/**
 * Build analysis prompt with few-shot examples.
 * Retry prompts are shorter and include error feedback.
 */
export function buildAnalysisPrompt(ctx: PromptContext): string {
  const isRetry = ctx.attempt !== undefined && ctx.attempt > 1;
  const parts: string[] = [];

  // System instruction
  parts.push(getSystemInstruction(ctx.locale));

  // Schema block (always present for machine verification)
  parts.push(getSchemaBlock(ctx.locale));

  // Few-shot examples (only on first attempt)
  if (!isRetry) {
    parts.push(getFewShotExamples(ctx.locale));
  }

  // Mail data
  parts.push(getMailDataBlock(ctx));

  // Retry-specific feedback
  if (isRetry && (ctx.previousOutput || ctx.parseError)) {
    parts.push(getRetryFeedbackBlock(ctx.previousOutput, ctx.parseError, ctx.locale));
  }

  // Output instruction
  parts.push(getOutputInstruction(ctx.locale, isRetry));

  return parts.join("\n\n");
}

function getSystemInstruction(locale: AnalysisLocale): string {
  switch (locale) {
    case "zh-CN":
      return `你是邮件分析助手，负责分析邮件并输出结构化 JSON。你的输出必须严格遵循下方 Schema 格式，不得包含 markdown 代码块或其他任何格式。`;
    case "ja-JP":
      return `あなたはメール分析アシスタントです。メールを分析し、下の Schema 形式の構造化 JSON を出力する必要があります。マークダウンコードブロックやその他の形式は一切含めないでください。`;
    case "en-US":
    default:
      return `You are a mail analysis assistant. Analyze emails and output structured JSON strictly following the Schema below. Do NOT include markdown code blocks or any other formatting.`;
  }
}

function getSchemaBlock(locale: AnalysisLocale): string {
  return `## REQUIRED OUTPUT SCHEMA

\`\`\`typescript
{
  quadrant: "urgent_important" | "not_urgent_important" | "urgent_not_important" | "not_urgent_not_important",
  executive_summary: string,  // ${locale === "zh-CN" ? "20-50个汉字" : locale === "ja-JP" ? "25-70文字" : "12-28 words"},
  ddl_datetime: string | null,  // ISO-8601: "2026-04-08T23:59:00+08:00" (required if deadline/meeting detected, null otherwise)
  actionable_intent: boolean,
  confidence: number,  // 0.0-1.0
  key_entities: {
    sender_name: string,
    deadline_description: string | null,
    meeting_topic: string | null,
    meeting_duration_minutes: number,  // 15-480
    attachments: string[],
    action_required_from: string | null,
  },
  insight_type: "ddl" | "meeting" | "exam" | "event" | "notification" | "other",
  notes: string | null,
}
\`\`\``;
}

/**
 * SECURITY (MEDIUM-2): Returns STATIC hardcoded few-shot examples.
 *
 * IMPORTANT: This function returns only static template strings.
 * - No user data is interpolated into the examples
 * - The dynamic dates are computed at module load time for demonstration
 * - Examples are immutable and cannot be influenced by external input
 *
 * This design prevents template injection attacks by ensuring
 * user-controlled data never reaches this function.
 */
function getFewShotExamples(locale: AnalysisLocale): string {
  switch (locale) {
    case "zh-CN":
      return `## 示例

【示例1 - 紧急DDL】
邮件:
- 主题: 项目 deadline 明天 23:59
- 发件人: 项目经理 张三
- 正文: 请在明天23:59前提交最终报告，过期不候。

输出:
\`\`\`json
{
  "quadrant": "urgent_important",
  "executive_summary": "项目明天23:59截止，需提交最终报告，请立即处理。",
  "ddl_datetime": "${new Date(Date.now() + 86400000).toISOString().replace("Z", "+08:00")}",
  "actionable_intent": true,
  "confidence": 0.92,
  "key_entities": {
    "sender_name": "项目经理 张三",
    "deadline_description": "明天23:59",
    "meeting_topic": null,
    "meeting_duration_minutes": 60,
    "attachments": [],
    "action_required_from": "你"
  },
  "insight_type": "ddl",
  "notes": null
}
\`\`\`

【示例2 - 会议邀请】
邮件:
- 主题: 组会通知 - 周五下午3点
- 发件人: 导师 李老师
- 正文: 周五下午3点Zoom开会讨论论文进度，请准时参加。

输出:
\`\`\`json
{
  "quadrant": "not_urgent_important",
  "executive_summary": "导师邀请周五下午3点参加Zoom组会讨论论文进度。",
  "ddl_datetime": "${getNextWeekdayISO(5, 15, 0)}",
  "actionable_intent": true,
  "confidence": 0.88,
  "key_entities": {
    "sender_name": "导师 李老师",
    "deadline_description": "周五下午3点",
    "meeting_topic": "论文进度讨论",
    "meeting_duration_minutes": 90,
    "attachments": [],
    "action_required_from": "你"
  },
  "insight_type": "meeting",
  "notes": null
}
\`\`\`

【示例3 - 通知类】
邮件:
- 主题: 系统更新通知
- 发件人: noreply@system.com
- 正文: 系统将于今晚2点进行例行维护。

输出:
\`\`\`json
{
  "quadrant": "not_urgent_not_important",
  "executive_summary": "系统今晚2点例行维护，无需用户操作。",
  "ddl_datetime": null,
  "actionable_intent": false,
  "confidence": 0.85,
  "key_entities": {
    "sender_name": "系统通知",
    "deadline_description": "今晚2点",
    "meeting_topic": null,
    "meeting_duration_minutes": 60,
    "attachments": [],
    "action_required_from": null
  },
  "insight_type": "notification",
  "notes": null
}
\`\`\``;

    case "ja-JP":
      return `## 例

【例1 - 緊急デッドライン】
メール: テーマ「プロジェクト deadline 明日 23:59」、送信者「项目经理」、本文「明日23:59までに最終レポートを提出してください」

出力:
{
  "quadrant": "urgent_important",
  "executive_summary": "プロジェクト明日23:59截止、最終レポートの提出が必要です。",
  "ddl_datetime": "${new Date(Date.now() + 86400000).toISOString().replace("Z", "+09:00")}",
  "actionable_intent": true,
  "confidence": 0.90,
  "key_entities": { "sender_name": "项目经理", "deadline_description": "明日23:59", "meeting_topic": null, "meeting_duration_minutes": 60, "attachments": [], "action_required_from": "あなた" },
  "insight_type": "ddl",
  "notes": null
}`;

    default:
      return `## Examples

【Example 1 - Urgent DDL】
Mail: Subject "Project deadline tomorrow 23:59", From "PM Zhang", Body "Submit final report by tomorrow 23:59"

Output:
{
  "quadrant": "urgent_important",
  "executive_summary": "Project deadline tomorrow at 23:59, final report must be submitted immediately.",
  "ddl_datetime": "${new Date(Date.now() + 86400000).toISOString().replace("Z", "+08:00")}",
  "actionable_intent": true,
  "confidence": 0.92,
  "key_entities": { "sender_name": "PM Zhang", "deadline_description": "Tomorrow 23:59", "meeting_topic": null, "meeting_duration_minutes": 60, "attachments": [], "action_required_from": "you" },
  "insight_type": "ddl",
  "notes": null
}`;
  }
}

function getMailDataBlock(ctx: PromptContext): string {
  const importance = ctx.importance || "normal";
  return `## 邮件数据 / Mail Data

- 主题 (Subject): ${sanitizeForPrompt(ctx.subject, "subject", 500)}
- 发件人 (From): ${sanitizeForPrompt(ctx.fromName, "fromName", 200)} <${sanitizeForPrompt(ctx.fromAddress, "fromAddress", 200)}>
- 收到时间 (Received): ${sanitizeForPrompt(ctx.receivedDateTime, "receivedDateTime", 50)}
- 重要程度 (Importance): ${importance}
- 附件数量 (Attachments): ${ctx.hasAttachments ? "有附件" : "无附件"}
- 正文预览 (Body Preview): ${sanitizeForPrompt(ctx.bodyPreview, "bodyPreview", 2000)}`;
}

function getRetryFeedbackBlock(
  previousOutput: string | undefined,
  parseError: string | undefined,
  locale: AnalysisLocale
): string {
  const lang = locale === "zh-CN" ? "中文" : locale === "ja-JP" ? "日本語" : "English";

  // SECURITY (HIGH-2): Sanitize previous output to prevent injection
  const safePreviousOutput = previousOutput
    ? sanitizeForPrompt(previousOutput.slice(0, 500), "previousOutput", 500)
    : "(empty)";

  return [
    `## ⚠️ PREVIOUS OUTPUT PARSE FAILED`,
    ``,
    `Your previous output could NOT be parsed as valid JSON:`,
    parseError ? `  Error: ${sanitizeForPrompt(parseError, "parseError", 200)}` : "  Unknown parse error",
    ``,
    `Previous output preview (do NOT repeat this):`,
    safePreviousOutput,
    ``,
    `Common mistakes to AVOID:`,
    `- Do NOT wrap output in markdown code blocks`,
    `- Do NOT include trailing commas or comments`,
    `- Do NOT use single quotes — use double quotes for all strings`,
    `- JSON keys must be double-quoted`,
    `- ddl_datetime must be ISO-8601 format (e.g., "2026-04-08T23:59:00+08:00")`,
    `- confidence must be a number, not a string`,
    ``,
    `Output ${lang} text only, no markdown, no explanation.`,
  ].join("\n");
}

function getOutputInstruction(locale: AnalysisLocale, isRetry: boolean): string {
  const instructions: Record<AnalysisLocale, string> = {
    "zh-CN": isRetry
      ? `请输出 JSON（不包含 markdown 代码块）：`
      : `请分析上述邮件，严格按照 Schema 输出 JSON（不包含 markdown 代码块）：`,
    "en-US": isRetry
      ? `Output JSON only (no markdown):`
      : `Analyze the above email, output JSON strictly following the Schema (no markdown):`,
    "ja-JP": isRetry
      ? `JSONのみを出力してください（マークダウンなし）：`
      : `上記のメールを分析し、Schemaに従ってJSONを出力してください（マークダウンなし）：`,
  };
  return instructions[locale];
}

// ─── Helper: next weekday ISO datetime ──────────────────────────────────────

/** Get ISO datetime for next occurrence of a weekday at given hour/minute */
function getNextWeekdayISO(weekday: number, hour: number, minute: number): string {
  const now = new Date();
  const result = new Date(now);
  const currentDay = now.getDay(); // 0=Sun, 6=Sat
  let daysUntil = weekday - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  result.setDate(now.getDate() + daysUntil);
  result.setHours(hour, minute, 0, 0);
  return result.toISOString().replace("Z", "+08:00");
}

// ─── JSON Repair ─────────────────────────────────────────────────────────────

/** Maximum input length for JSON repair to prevent DoS */
const JSON_REPAIR_MAX_INPUT_CHARS = 50_000;
/** Maximum output length after repair (prevent memory exhaustion) */
const JSON_REPAIR_MAX_OUTPUT_CHARS = 100_000;

/**
 * Attempt to repair common JSON issues before parsing.
 *
 * Handles: trailing commas, comments, unescaped control chars.
 * SECURITY: Does NOT do blanket quote replacement (avoids breaking string content).
 * SECURITY: Enforces length limits to prevent DoS.
 *
 * @returns Repaired JSON string, or null if repair fails or input too large.
 */
function repairJson(raw: string): string | null {
  if (raw.length > JSON_REPAIR_MAX_INPUT_CHARS) {
    return null; // Input too large — refuse to process
  }

  let text = raw.trim();
  if (text.length > JSON_REPAIR_MAX_OUTPUT_CHARS) {
    return null; // Output would be too large
  }

  // Strip markdown code block markers
  text = text.replace(/^```json\s*/i, "");
  text = text.replace(/^```\s*/i, "");
  text = text.replace(/\s*```$/i, "");

  // Strip comments (both // and /* */ style)
  text = text.replace(/\/\/.*$/gm, "");
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");

  // Fix trailing commas before ] or }
  text = text.replace(/,(\s*[}\]])/g, "$1");

  // SECURITY FIX (HIGH-1): Do NOT blanket-replace single quotes.
  // Single-quoted strings in JSON are invalid and we should NOT try to
  // "fix" them — doing so would corrupt legitimate string content.
  // If the LLM outputs single quotes, the model should be corrected via
  // the retry feedback prompt instead.

  // Remove control characters (except valid JSON whitespace)
  text = text.replace(/[\x00-\x1F\x7F]/g, "");

  // Remove BOM
  text = text.replace(/\uFEFF/g, "");

  if (text.length > JSON_REPAIR_MAX_OUTPUT_CHARS) {
    return null;
  }

  try {
    JSON.parse(text);
    return text;
  } catch {
    // Second pass: fix trailing commas more aggressively
    const cleaned = text
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\x00-\x1F\x7F]/g, "");

    if (cleaned.length > JSON_REPAIR_MAX_OUTPUT_CHARS) {
      return null;
    }

    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      return null;
    }
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export interface ParseResult {
  ok: true;
  data: MailAnalysisResult;
  attemptCount: number;
  rawOutput: string;
}

export interface ParseFailure {
  ok: false;
  error: string;
  errorCode:
    | "PARSE_JSON_FAILED"
    | "PARSE_ZOD_VALIDATION_FAILED"
    | "PARSE_TIMEOUT"
    | "PARSE_LLM_ERROR";
  attemptCount: number;
  rawOutput: string;
  details?: z.ZodError;
}

export type ParseOutcome = ParseResult | ParseFailure;

const MAX_RETRIES = 3;
const RETRY_TIMEOUT_MS = 35_000; // Slightly longer than LLM timeout

/**
 * Parse LLM output with validation and retry.
 * Attempts:
 * 1. Direct parse → Zod validation
 * 2. JSON repair → Zod validation
 * 3. Retry with error feedback (up to 3 total tries)
 */
export async function parseStructuredOutput(
  rawOutput: string | null | undefined,
  parseError: string | undefined,
  attemptNumber: number,
  locale: AnalysisLocale,
  timezone: string,
  queryAgentFn: typeof queryAgent
): Promise<ParseResult | ParseFailure> {
  if (!rawOutput || rawOutput.trim() === "") {
    return {
      ok: false,
      error: "Empty LLM output",
      errorCode: "PARSE_LLM_ERROR",
      attemptCount: attemptNumber,
      rawOutput: rawOutput ?? "",
    };
  }

  // Try 1: Direct parse
  let parsed = tryParseJson(rawOutput);
  let repairAttempts = 0;

  // Try 2: JSON repair (only on first attempt)
  if (!parsed && attemptNumber === 1) {
    const repaired = repairJson(rawOutput);
    if (repaired) {
      parsed = tryParseJson(repaired);
      repairAttempts = 1;
    }
  }

  if (!parsed) {
    return {
      ok: false,
      error: parseError ?? "Failed to parse JSON from LLM output",
      errorCode: "PARSE_JSON_FAILED",
      attemptCount: attemptNumber,
      rawOutput,
    };
  }

  // Zod validation
  const validationResult = mailAnalysisSchema.safeParse(parsed);
  if (!validationResult.success) {
    return {
      ok: false,
      error: formatZodError(validationResult.error, locale),
      errorCode: "PARSE_ZOD_VALIDATION_FAILED",
      attemptCount: attemptNumber,
      rawOutput,
      details: validationResult.error,
    };
  }

  // Normalize ddl_datetime with timezone
  const data = validationResult.data;
  if (data.ddl_datetime) {
    const normalized = normalizeDatetimeWithTimezone(data.ddl_datetime, timezone);
    if (normalized) {
      data.ddl_datetime = normalized;
    }
  }

  return {
    ok: true,
    data,
    attemptCount: attemptNumber + repairAttempts,
    rawOutput,
  };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatZodError(error: z.ZodError, locale: AnalysisLocale): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    // SECURITY (MEDIUM-4): Sanitize input preview to prevent sensitive data leakage
    const inputPreview = (() => {
      const val = issue.input;
      if (val === null || val === undefined) return "undefined";
      if (typeof val === "string") {
        // Truncate long strings, show type + preview
        return val.length > 50 ? `"${val.slice(0, 50)}..."` : JSON.stringify(val);
      }
      if (typeof val === "number" || typeof val === "boolean") {
        return String(val);
      }
      if (Array.isArray(val)) return `Array(${val.length})`;
      if (typeof val === "object") return "Object";
      return typeof val;
    })();
    return `  - Field "${path}": ${issue.message} (got: ${inputPreview})`;
  });
  return `Zod validation failed:\n${issues.join("\n")}`;
}

// ─── Main Analysis Function ───────────────────────────────────────────────────

interface MailForAnalysis {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  bodyPreview: string;
  receivedDateTime: string;
  importance: string;
  hasAttachments: boolean;
}

interface AnalysisOptions {
  locale: AnalysisLocale;
  timezone?: string;
  sessionKey?: string;
  userId?: string;
}

/**
 * Main entry point: analyze a single mail item with Zod-constrained structured output.
 *
 * Algorithm:
 * 1. Build prompt with few-shot examples (first attempt) or error feedback (retry)
 * 2. Call LLM via queryAgent
 * 3. Parse output with JSON repair
 * 4. Validate with Zod schema
 * 5. Retry on failure (up to 3 times)
 * 6. Normalize timezone
 */
export async function analyzeMail(
  mail: MailForAnalysis,
  options: AnalysisOptions,
  queryAgentFn: typeof queryAgent
): Promise<ParseResult | ParseFailure> {
  const locale = options.locale ?? "zh-CN";
  const timezone = options.timezone ?? inferTimezone(locale);

  let lastError: string | undefined;
  let lastRawOutput: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const prompt = buildAnalysisPrompt({
      subject: mail.subject,
      fromName: mail.fromName,
      fromAddress: mail.fromAddress,
      bodyPreview: mail.bodyPreview,
      receivedDateTime: mail.receivedDateTime,
      importance: mail.importance,
      hasAttachments: mail.hasAttachments,
      locale,
      timezone,
      previousOutput: attempt > 1 ? lastRawOutput : undefined,
      parseError: attempt > 1 ? lastError : undefined,
      attempt,
    });

    let rawOutput: string | null = null;
    let llmError: string | undefined;

    try {
      const response = (await queryAgentFn({
        message: prompt,
        user: options.userId,
        sessionKey: options.sessionKey,
        timeoutMs: RETRY_TIMEOUT_MS,
      })) as { output?: { text?: string } | string };

      if (typeof response === "object" && response !== null) {
        const out = (response as Record<string, unknown>).output;
        if (typeof out === "string") {
          rawOutput = out;
        } else if (out && typeof out === "object") {
          rawOutput = String((out as Record<string, unknown>).text ?? "");
        }
      }
    } catch (err) {
      llmError = err instanceof Error ? err.message : "LLM call failed";
    }

    if (llmError) {
      lastError = llmError;
      lastRawOutput = rawOutput ?? "";
      continue;
    }

    lastRawOutput = rawOutput ?? "";

    const result = await parseStructuredOutput(
      rawOutput,
      lastError,
      attempt,
      locale,
      timezone,
      queryAgentFn
    );

    if (!result.ok) {
      // TypeScript narrows result to ParseFailure here
      lastError = (result as ParseFailure).error;
    } else {
      return result;
    }
  }

  // All retries exhausted
  return {
    ok: false,
    error: lastError ?? "All parse retries exhausted",
    errorCode: "PARSE_LLM_ERROR",
    attemptCount: MAX_RETRIES,
    rawOutput: lastRawOutput ?? "",
  };
}

// ─── Batch Analysis ───────────────────────────────────────────────────────────

/**
 * Analyze multiple mails with parallel execution and rate limiting.
 */
export async function analyzeMailBatch(
  mails: MailForAnalysis[],
  options: AnalysisOptions,
  queryAgentFn: typeof queryAgent,
  concurrencyLimit: number = 3
): Promise<Map<string, ParseOutcome>> {
  const results = new Map<string, ParseOutcome>();

  // Process in batches to avoid overwhelming the LLM
  for (let i = 0; i < mails.length; i += concurrencyLimit) {
    const batch = mails.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map(async (mail) => {
        const result = await analyzeMail(mail, options, queryAgentFn);
        return [mail.id, result] as const;
      })
    );

    for (const [id, result] of batchResults) {
      results.set(id, result);
    }
  }

  return results;
}

// ─── Aggregate Stats ─────────────────────────────────────────────────────────

/** Aggregate statistics from analysis results */
export function aggregateAnalysisStats(
  results: Map<string, ParseOutcome>
): {
  total: number;
  successful: number;
  failed: number;
  byQuadrant: Record<string, number>;
  byInsightType: Record<string, number>;
  avgConfidence: number;
  highPriorityCount: number;
  actionRequiredCount: number;
} {
  let successful = 0;
  const byQuadrant: Record<string, number> = {};
  const byInsightType: Record<string, number> = {};
  let totalConfidence = 0;
  let highPriorityCount = 0;
  let actionRequiredCount = 0;

  for (const result of results.values()) {
    if (!result.ok) continue;
    successful++;

    const { data } = result;
    byQuadrant[data.quadrant] = (byQuadrant[data.quadrant] ?? 0) + 1;
    byInsightType[data.insight_type] = (byInsightType[data.insight_type] ?? 0) + 1;
    totalConfidence += data.confidence;

    if (
      data.quadrant === "urgent_important" ||
      data.confidence >= 0.85
    ) {
      highPriorityCount++;
    }
    if (data.actionable_intent) {
      actionRequiredCount++;
    }
  }

  return {
    total: results.size,
    successful,
    failed: results.size - successful,
    byQuadrant,
    byInsightType,
    avgConfidence: successful > 0 ? totalConfidence / successful : 0,
    highPriorityCount,
    actionRequiredCount,
  };
}
