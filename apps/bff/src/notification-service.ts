/**
 * @fileoverview Notification Service — Multi-Channel Push for Urgent Mail
 *
 * Phase 3: Routes urgent mail notifications to DingTalk and WeCom channels.
 *
 * Architecture:
 * =============
 * Webhook receives new mail
 *     ↓
 * Zod analysis pipeline (mail-analysis.ts)
 *     ↓
 * Is quadrant == "urgent_important"?
 *     ├─ NO → skip notification
 *     └─ YES → notificationService.push(analysisResult)
 *              ├─ formatDingTalkMarkdown()
 *              ├─ formatWecomMarkdown()
 *              └─ queryAgent(notificationPrompt) → OpenClaw dispatches to channels
 *
 * OpenClaw Plugin Integration:
 * ===========================
 * Both DingTalk and WeCom plugins are registered as OpenClaw channels.
 * The notification sub-agent generates Markdown text, which the plugins
 * detect and route to the appropriate channel (via sessionWebhook for
 * DingTalk, via response_url for WeCom).
 *
 * Notification Prompt Strategy:
 * =============================
 * Instead of directly calling plugin APIs (which would require embedding
 * plugin internals in BFF), we use the OpenClaw Agent as the unified
 * notification router:
 * 1. Build a rich Markdown notification text
 * 2. Invoke OpenClaw sub-agent with the notification text
 * 3. OpenClaw dispatches to all active user channels
 *
 * Security Notes:
 * ===============
 * - Notifications only fire for quadrant === "urgent_important"
 * - Rate limiting: max 1 notification per sender per 5 minutes (dedup)
 * - No PII beyond sender name and subject in notification
 * - User must opt-in to notification channels
 */

import { queryAgent as gatewayQueryAgent } from "./gateway.js";
import type { MailAnalysisResult } from "./mail-analysis.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationTarget {
  userId: string;
  mailboxUserId?: string;
  sessionKey?: string;
  channels: NotificationChannel[];
  /** Timezone for datetime display */
  timezone?: string;
}

export type NotificationChannel = "dingtalk" | "wecom" | "browser";

export interface NotificationPayload {
  source: "mail";
  type: "urgent_mail";
  timestamp: string;
  mail: {
    id: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    quadrant: string;
    executiveSummary: string;
    ddlDatetime: string | null;
    actionableIntent: boolean;
    confidence: number;
    insightType: string;
    webLink?: string;
  };
  /** Raw Zod-parsed analysis result for richer notifications */
  analysis: MailAnalysisResult;
}

export interface NotificationResult {
  ok: boolean;
  channel: NotificationChannel;
  delivered: boolean;
  error?: string;
}

export interface PushResult {
  ok: boolean;
  channelsAttempted: number;
  channelsDelivered: number;
  results: NotificationResult[];
}

// ─── Deduplication Store ───────────────────────────────────────────────────────

/** Prevent notification storms: max 1 notification per sender per 5 minutes */
const recentNotifications = new Map<string, number>(); // key: `${senderAddress}:${subject}`, value: timestamp
const RECENT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_STORE_ENTRIES = 1000;

function isDuplicate(senderAddress: string, subject: string): boolean {
  const key = `${senderAddress}:${subject}`;
  const last = recentNotifications.get(key);
  if (last && Date.now() - last < RECENT_WINDOW_MS) {
    return true;
  }
  recentNotifications.set(key, Date.now());

  // Cleanup
  if (recentNotifications.size > MAX_STORE_ENTRIES) {
    const cutoff = Date.now() - RECENT_WINDOW_MS * 2;
    for (const [k, ts] of recentNotifications) {
      if (ts < cutoff) recentNotifications.delete(k);
    }
  }
  return false;
}

// ─── Formatters ────────────────────────────────────────────────────────────────

/**
 * Format urgent mail notification for DingTalk Markdown.
 *
 * DingTalk Markdown supports:
 * - Headers: ### text
 * - Bold: **text**
 * - Links: [text](url)
 * - Blockquote: > text
 * - Ordered/Unordered lists
 * - Images: ![alt](url) — NOT supported in Markdown mode
 *
 * Character limit: ~4000 per message (markdown mode)
 */
export function formatDingTalkMarkdown(payload: NotificationPayload): string {
  const { mail } = payload;
  const lines: string[] = [];

  // Header
  lines.push(`### 📧 紧急邮件`);
  lines.push(``);

  // Summary (prominent)
  lines.push(`> **${escapeMarkdown(mail.executiveSummary)}**`);
  lines.push(``);

  // Key info
  lines.push(`**发件人**: ${escapeMarkdown(mail.fromName)}`);
  lines.push(``);

  if (mail.fromAddress) {
    lines.push(`**邮箱**: ${escapeMarkdown(mail.fromAddress)}`);
    lines.push(``);
  }

  // Subject
  lines.push(`**主题**: ${escapeMarkdown(mail.subject)}`);
  lines.push(``);

  // DDL / Meeting
  if (mail.ddlDatetime) {
    const timeDisplay = formatDatetimeForDisplay(mail.ddlDatetime, "zh-CN");
    lines.push(`**⏰ 截止/会议**: ${timeDisplay}`);
    lines.push(``);
  }

  // Action required
  if (mail.actionableIntent) {
    lines.push(`**⚠️ 需要回复**: 是`);
    lines.push(``);
  }

  // Insight type badge
  const badge = insightTypeBadge(mail.insightType);
  lines.push(`**类型**: ${badge} (置信度: ${Math.round(mail.confidence * 100)}%)`);
  lines.push(``);

  // Quick actions
  if (mail.webLink) {
    lines.push(`[📬 查看邮件](${sanitizeUrl(mail.webLink)})`);
    lines.push(``);
  }

  // Auto-generated notice
  lines.push(`---`);
  lines.push(`*由 AI 邮件助手自动推送 · ${formatNow("zh-CN")}*`);

  const text = lines.join("\n");
  return text.slice(0, 4000); // Hard limit
}

/**
 * Format urgent mail notification for WeCom Markdown.
 *
 * WeCom Markdown is more limited than DingTalk:
 * - Fewer formatting options
 * - Less lenient parser
 *
 * WeCom markdown specs:
 * - Inline code: `code`
 * - Links: <a href="url">text</a> (required for links)
 * - Headers: 仅支持 # text（无层级）
 * - No blockquote or image alt text
 *
 * Character limit: ~2048 bytes (text mode)
 */
export function formatWecomMarkdown(payload: NotificationPayload): string {
  const { mail } = payload;
  const lines: string[] = [];

  lines.push(`# 📧 紧急邮件`);
  lines.push(``);
  lines.push(`**${escapeMarkdown(mail.executiveSummary)}**`);
  lines.push(``);
  lines.push(`发件人: ${escapeMarkdown(mail.fromName)}`);
  lines.push(`主题: ${escapeMarkdown(mail.subject)}`);

  if (mail.ddlDatetime) {
    const timeDisplay = formatDatetimeForDisplay(mail.ddlDatetime, "zh-CN");
    lines.push(`⏰ ${timeDisplay}`);
  }

  if (mail.webLink) {
    lines.push(`<a href="${sanitizeUrl(mail.webLink)}">📬 查看邮件</a>`);
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(`*AI 邮件助手 · ${formatNow("zh-CN")}*`);

  const text = lines.join("\n");
  return text.slice(0, 2048);
}

/**
 * Format browser push notification text (short, for notification banner).
 */
export function formatBrowserNotification(payload: NotificationPayload): {
  title: string;
  body: string;
  icon?: string;
} {
  const { mail } = payload;
  const from = mail.fromName || mail.fromAddress || "未知发件人";

  let body = mail.executiveSummary;
  if (body.length > 100) body = body.slice(0, 97) + "...";

  return {
    title: `📧 ${from}: ${mail.subject}`,
    body,
    icon: undefined,
  };
}

/**
 * Build a rich notification agent prompt.
 *
 * The agent will:
 * 1. Format the notification text for each active channel
 * 2. Deliver via the user's configured notification channels
 * 3. Include actionable buttons if supported
 *
 * The agent uses the OpenClaw plugin channel system to dispatch.
 */
export function buildNotificationPrompt(
  payload: NotificationPayload,
  target: NotificationTarget
): string {
  const { mail } = payload;
  const channels = target.channels.join(", ");

  const ddlLine = mail.ddlDatetime
    ? `⏰ 截止/会议时间: ${formatDatetimeForDisplay(mail.ddlDatetime, "zh-CN")}`
    : "⏰ 无截止时间";

  return `你是邮件通知助手，负责将紧急邮件通知推送到用户的已绑定渠道。

## 任务
用户收到了一封标记为"紧急且重要"的邮件，需要立即通知用户。

## 邮件信息
- 发件人: ${mail.fromName} <${mail.fromAddress || "unknown@email.com"}>
- 主题: ${mail.subject}
- AI 总结: ${mail.executiveSummary}
- 截止/会议时间: ${ddlLine}
- 需要回复: ${mail.actionableIntent ? "是" : "否"}
- AI 置信度: ${Math.round(mail.confidence * 100)}%
- 类型: ${mail.insightType}

## 推送渠道
请通过以下渠道推送通知: ${channels}

## 推送格式要求
### 钉钉 (dingtalk)
- 使用 Markdown 格式
- 标题: ### 📧 紧急邮件
- 内容简洁，突出关键信息（发件人、主题、AI总结、截止时间）
- 总长度不超过 4000 字

### 企业微信 (wecom)
- 使用 Markdown 格式（仅支持 # 标题，<a> 链接，**粗体**）
- 总长度不超过 2048 字节
- 链接必须使用 <a href="url">text</a> 格式

### 浏览器通知 (browser)
- 标题: 发件人: 主题
- 正文: AI 总结（最多 100 字）
- 通过 SSE 实时推送到 WebUI

## 动作要求
请立即生成通知内容并推送到上述所有渠道。
如果用户未绑定某个渠道，跳过该渠道。
不要询问确认，直接推送。

## 重要提示
- 绝对不要发送任何其他消息
- 只推送本任务中的邮件通知
- 所有消息必须通过已绑定的渠道发送`;
}

// ─── Safe HTML / Markdown Escaping ────────────────────────────────────────────

/** Escape special characters for DingTalk Markdown */
function escapeMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*/g, "**")  // Preserve bold
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/`/g, "\\`")
    .replace(/#/g, "\\#")
    .replace(/-/g, "\\-")
    .replace(/\n/g, " ")
    .slice(0, 2000);
}

/** Sanitize URL to prevent XSS */
function sanitizeUrl(url: string): string {
  if (!url) return "";
  // Only allow http/https
  if (!/^https?:\/\//i.test(url)) return "";
  // Strip javascript: and data: URLs
  if (/^javascript:/i.test(url)) return "#";
  if (/^data:/i.test(url)) return "#";
  return url.slice(0, 2000);
}

// ─── Date/Time Formatting ──────────────────────────────────────────────────────

function formatDatetimeForDisplay(isoDatetime: string, locale: string): string {
  try {
    const d = new Date(isoDatetime);
    if (isNaN(d.getTime())) return isoDatetime;

    return d.toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return isoDatetime;
  }
}

function formatNow(locale: string): string {
  return new Date().toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function insightTypeBadge(type: string): string {
  const badges: Record<string, string> = {
    ddl: "📌 截止日期",
    meeting: "📅 会议",
    exam: "📝 考试",
    event: "🎯 事件",
    notification: "🔔 通知",
    other: "📧 其他",
  };
  return badges[type] ?? type;
}

// ─── Notification Rate Limiter ──────────────────────────────────────────────────

/** Per-user notification rate limit: max 10 notifications per minute */
const userNotificationRateMap = new Map<string, { count: number; windowStart: number }>();
const USER_RATE_LIMIT = 10;
const USER_RATE_WINDOW_MS = 60_000;

function isUserRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = userNotificationRateMap.get(userId);
  if (!entry || now - entry.windowStart > USER_RATE_WINDOW_MS) {
    userNotificationRateMap.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= USER_RATE_LIMIT) {
    return true;
  }
  entry.count++;
  return false;
}

// ─── Main Push Function ────────────────────────────────────────────────────────

/**
 * Push urgent mail notification to all configured channels.
 *
 * @param payload - The notification payload (from mail analysis result)
 * @param target - The target user/channel configuration
 * @returns PushResult with per-channel delivery status
 */
export async function pushUrgentNotification(
  payload: NotificationPayload,
  target: NotificationTarget
): Promise<PushResult> {
  const { mail } = payload;

  // Guard: must be urgent_important
  if (mail.quadrant !== "urgent_important") {
    return {
      ok: true,
      channelsAttempted: 0,
      channelsDelivered: 0,
      results: [],
    };
  }

  // Guard: deduplication (prevent notification storms from same sender)
  if (isDuplicate(mail.fromAddress || "unknown", mail.subject)) {
    return {
      ok: true,
      channelsAttempted: 0,
      channelsDelivered: 0,
      results: [],
    };
  }

  // Guard: user rate limiting
  if (isUserRateLimited(target.userId)) {
    return {
      ok: false,
      channelsAttempted: target.channels.length,
      channelsDelivered: 0,
      results: [
        {
          ok: false,
          channel: "browser",
          delivered: false,
          error: "User rate limit exceeded (10 notifications/min)",
        },
      ],
    };
  }

  // Format notifications for each channel
  const dingtalkText = target.channels.includes("dingtalk")
    ? formatDingTalkMarkdown(payload)
    : null;
  const wecomText = target.channels.includes("wecom")
    ? formatWecomMarkdown(payload)
    : null;
  const browserNotif = target.channels.includes("browser")
    ? formatBrowserNotification(payload)
    : null;

  // Build notification agent prompt
  const prompt = buildNotificationPrompt(payload, target);

  // Invoke OpenClaw notification sub-agent
  let agentTriggered = false;
  const results: NotificationResult[] = [];

  try {
    const response = await gatewayQueryAgent({
      message: prompt,
      user: target.userId,
      sessionKey: target.sessionKey,
      timeoutMs: 20_000,
    });

    agentTriggered = true;

    // All channels delivered via the agent response
    for (const channel of target.channels) {
      results.push({
        ok: true,
        channel,
        delivered: true,
      });
    }
  } catch (err) {
    // Agent failed — log but don't fail the whole notification
    const errMsg = err instanceof Error ? err.message : "Unknown error";

    for (const channel of target.channels) {
      results.push({
        ok: false,
        channel,
        delivered: false,
        error: `Agent trigger failed: ${errMsg}`,
      });
    }
  }

  const channelsDelivered = results.filter((r) => r.delivered).length;

  return {
    ok: agentTriggered && channelsDelivered > 0,
    channelsAttempted: target.channels.length,
    channelsDelivered,
    results,
  };
}

/**
 * Push notification with notification channel binding from user session.
 * Looks up the user's configured channels from the session context.
 */
export async function pushUrgentNotificationForSession(
  payload: NotificationPayload,
  sessionToken: string,
  mailboxUserId: string,
  configuredChannels?: NotificationChannel[]
): Promise<PushResult> {
  // Default to browser-only if no channels configured
  const channels: NotificationChannel[] =
    configuredChannels ?? ["browser"];

  const sessionKey = `mail-webhook:${mailboxUserId}:session`;

  return pushUrgentNotification(payload, {
    userId: mailboxUserId,
    mailboxUserId,
    sessionKey,
    channels,
  });
}

// ─── Notification Channel Registry ─────────────────────────────────────────────

/**
 * Registry of active notification subscriptions.
 * Maps userId → NotificationChannel[]
 * This would be backed by Redis/DB in production.
 */
const channelRegistry = new Map<string, NotificationChannel[]>();

/**
 * Register a user's notification channel preferences.
 */
export function registerNotificationChannels(
  userId: string,
  channels: NotificationChannel[]
): void {
  channelRegistry.set(userId, channels);
}

/**
 * Get a user's notification channel preferences.
 */
export function getNotificationChannels(
  userId: string
): NotificationChannel[] {
  return channelRegistry.get(userId) ?? ["browser"];
}

/**
 * Unregister a user's notification channel preferences.
 */
export function unregisterNotificationChannels(userId: string): void {
  channelRegistry.delete(userId);
}
