/**
 * 邮件路由
 * 包含 /api/mail/* 所有邮件相关端点
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { MailSourceContext, MailPriorityRule } from "../mail.js";
import {
  answerMailQuestion,
  buildMailInsights,
  createCalendarEventFromInsight,
  deleteCalendarEventById,
  getMailMessageById,
  isCalendarEventExisting,
  listInboxForViewer,
  probeOutlookRouting,
  triageInbox,
} from "../mail.js";
import type {
  MailSourceProfile,
  MailSourceRoutingStatus,
  SessionNotificationPreferences,
  SessionNotificationState,
  MailCalendarSyncInput,
} from "../types/mail-session.js";

export type MailDeps = {
  sessionTokenForRequest: (request: FastifyRequest) => string | null;
  getMailSourceProfileView: (sourceId: string, sessionToken: string) => MailSourceProfile | null;
  getActiveMailSourceId: (sessionToken: string) => string | null;
  setActiveMailSourceId: (sessionToken: string, sourceId: string) => void;
  getMailSourcesBySession: () => Map<string, Map<string, MailSourceProfile>>;
  getActiveMailSourceBySession: () => Map<string, string>;
  getSourceRoutingStatusBySession: () => Map<string, MailSourceRoutingStatus>;
  getCustomPriorityRulesBySession: () => Map<string, Map<string, MailPriorityRule>>;
  getNotificationPrefsBySession: () => Map<string, SessionNotificationPreferences>;
  getNotificationStateBySession: () => Map<string, SessionNotificationState>;
  getNotificationSeenUrgentTtlMs: () => number;
  getCalendarSyncTtlMs: () => number;
  getMaxAiSummaryCacheEntries: () => number;
  getAiSummaryCache: () => Map<string, { expiresAt: number; summary: string }>;
  getAiSummaryCacheTtlMs: () => number;
  getAiSummaryBatchSize: () => number;
  getAiSummaryMaxLength: () => number;
  getAiSummaryRequestBudgetMs: () => number;
  getAiSummaryResponseSchema: () => z.ZodType<unknown>;
  getNotificationStreamIntervalMs: () => number;
  getNotificationStreamKeepaliveMs: () => number;
  recordMetric: (operation: string, durationMs: number, success: boolean) => void;
  recordBatchMetric: (operation: string, count: number) => void;
  calendarSyncRecords: Map<string, { expiresAt: number; result: Awaited<ReturnType<typeof createCalendarEventFromInsight>> }>;
};

const MAIL_RATE_LIMITS = {
  triage: { perMin: 36, windowMs: 60000 },
  insights: { perMin: 36, windowMs: 60000 },
  message: { perMin: 80, windowMs: 60000 },
  query: { perMin: 24, windowMs: 60000 },
  inboxView: { perMin: 60, windowMs: 60000 },
  priorityRulesRead: { perMin: 60, windowMs: 60000 },
  priorityRulesWrite: { perMin: 24, windowMs: 60000 },
  sourcesRead: { perMin: 60, windowMs: 60000 },
  sourcesWrite: { perMin: 20, windowMs: 60000 },
  sourcesVerify: { perMin: 20, windowMs: 60000 },
  notificationsRead: { perMin: 60, windowMs: 60000 },
  notificationsWrite: { perMin: 24, windowMs: 60000 },
  calendarSync: { perMin: 20, windowMs: 60000 },
};

function checkRateLimit(
  rateLimitMap: Map<string, { count: number; windowStart: number }>,
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const existing = rateLimitMap.get(key);
  if (!existing || now - existing.windowStart >= windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (existing.count >= limit) {
    return false;
  }
  existing.count++;
  return true;
}

const rateLimitMaps = {
  triage: new Map<string, { count: number; windowStart: number }>(),
  insights: new Map<string, { count: number; windowStart: number }>(),
  message: new Map<string, { count: number; windowStart: number }>(),
  query: new Map<string, { count: number; windowStart: number }>(),
  inboxView: new Map<string, { count: number; windowStart: number }>(),
  priorityRulesRead: new Map<string, { count: number; windowStart: number }>(),
  priorityRulesWrite: new Map<string, { count: number; windowStart: number }>(),
  sourcesRead: new Map<string, { count: number; windowStart: number }>(),
  sourcesWrite: new Map<string, { count: number; windowStart: number }>(),
  sourcesVerify: new Map<string, { count: number; windowStart: number }>(),
  notificationsRead: new Map<string, { count: number; windowStart: number }>(),
  notificationsWrite: new Map<string, { count: number; windowStart: number }>(),
  calendarSync: new Map<string, { count: number; windowStart: number }>(),
};

export function registerMailRoutes(server: FastifyInstance, deps: MailDeps) {
  // ========== 辅助函数 ==========

  function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const token = deps.sessionTokenForRequest(request);
    if (!token) {
      reply.status(401);
      return null;
    }
    return token;
  }

  function requireMailSource(
    request: FastifyRequest,
    reply: FastifyReply,
    sessionToken: string
  ): MailSourceProfile | null {
    const activeSourceId = deps.getActiveMailSourceId(sessionToken);
    if (!activeSourceId) {
      reply.status(400);
      void reply.send({ ok: false, error: "No active mail source. Please connect Outlook first." });
      return null;
    }

    const profile = deps.getMailSourceProfileView(activeSourceId, sessionToken);
    if (!profile) {
      reply.status(404);
      void reply.send({ ok: false, error: "Mail source not found" });
      return null;
    }

    return profile;
  }

  function buildSourceContext(profile: MailSourceProfile): MailSourceContext {
    return {
      sourceId: profile.id,
      mailboxUserId: profile.mailboxUserId,
      connectedAccountId: profile.connectedAccountId,
    };
  }

  // ========== 邮件源管理 ==========

  server.get("/api/mail/sources", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const sources = deps.getMailSourcesBySession().get(sessionToken);
    const activeSourceId = deps.getActiveMailSourceBySession().get(sessionToken) ?? "";

    deps.recordMetric("mail_sources_list", 0, true);
    return {
      ok: true,
      result: {
        sources: Array.from(sources?.values() ?? []),
        activeSourceId,
      },
    };
  });

  server.post("/api/mail/sources", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const body = request.body as Record<string, unknown>;
    const name = String(body.name ?? "My Outlook");
    const mailboxUserId = body.mailboxUserId ? String(body.mailboxUserId) : undefined;
    const connectedAccountId = body.connectedAccountId ? String(body.connectedAccountId) : undefined;

    const id = `source_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const profile: MailSourceProfile = {
      id,
      name,
      provider: "outlook",
      emailHint: mailboxUserId ?? "outlook",
      mailboxUserId,
      connectedAccountId,
      enabled: true,
      ready: false,
      createdAt: now,
      updatedAt: now,
    };

    let sources = deps.getMailSourcesBySession().get(sessionToken);
    if (!sources) {
      sources = new Map();
      deps.getMailSourcesBySession().set(sessionToken, sources);
    }
    sources.set(id, profile);

    if (!deps.getActiveMailSourceId(sessionToken)) {
      deps.setActiveMailSourceId(sessionToken, id);
    }

    deps.recordMetric("mail_sources_create", 0, true);
    reply.status(201);
    return {
      ok: true,
      result: { source: profile, activeSourceId: deps.getActiveMailSourceId(sessionToken) ?? id },
    };
  });

  server.post("/api/mail/sources/update", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const body = request.body as Record<string, unknown>;
    const sourceId = String(body.id);
    const name = body.name ? String(body.name) : undefined;
    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : undefined;

    const profile = deps.getMailSourceProfileView(sourceId, sessionToken);
    if (!profile) {
      reply.status(404);
      return { ok: false, error: "Mail source not found" };
    }

    if (name) profile.name = name;
    if (enabled !== undefined) profile.enabled = enabled;
    profile.updatedAt = new Date().toISOString();

    deps.recordMetric("mail_sources_update", 0, true);
    return {
      ok: true,
      result: { source: profile, activeSourceId: deps.getActiveMailSourceId(sessionToken) ?? sourceId },
    };
  });

  server.post("/api/mail/sources/delete", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const body = request.body as Record<string, unknown>;
    const sourceId = String(body.id);

    const sources = deps.getMailSourcesBySession().get(sessionToken);
    if (!sources?.has(sourceId)) {
      reply.status(404);
      return { ok: false, error: "Mail source not found" };
    }

    sources.delete(sourceId);

    let activeSourceId = deps.getActiveMailSourceId(sessionToken);
    if (activeSourceId === sourceId) {
      const remaining = Array.from(sources.keys());
      activeSourceId = remaining[0] ?? "";
      deps.setActiveMailSourceId(sessionToken, activeSourceId);
    }

    deps.recordMetric("mail_sources_delete", 0, true);
    return { ok: true, result: { id: sourceId, deleted: true, activeSourceId } };
  });

  server.post("/api/mail/sources/select", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const body = request.body as Record<string, unknown>;
    const sourceId = String(body.sourceId);

    const profile = deps.getMailSourceProfileView(sourceId, sessionToken);
    if (!profile) {
      reply.status(404);
      return { ok: false, error: "Mail source not found" };
    }

    deps.setActiveMailSourceId(sessionToken, sourceId);
    return { ok: true, result: { activeSourceId: sourceId } };
  });

  server.post("/api/mail/sources/verify", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const body = request.body as Record<string, unknown>;
    const sourceId = String(body.sourceId);

    const profile = deps.getMailSourceProfileView(sourceId, sessionToken);
    if (!profile) {
      reply.status(404);
      return { ok: false, error: "Mail source not found" };
    }

    const routingResult = await probeOutlookRouting({
      mailboxUserId: profile.mailboxUserId,
      connectedAccountId: profile.connectedAccountId,
    });

    const routingStatus: MailSourceRoutingStatus = {
      verifiedAt: new Date().toISOString(),
      routingVerified: routingResult.ok,
      failFast: !routingResult.ok,
      message: routingResult.ok ? "Outlook routing verified" : (routingResult.error ?? "Verification failed"),
      mailbox: {
        required: true,
        status: routingResult.ok ? "verified" : "failed",
        verified: routingResult.ok,
        message: routingResult.ok ? "OK" : (routingResult.error ?? "Failed"),
      },
      connectedAccount: {
        required: false,
        status: "skipped",
        verified: true,
        message: "Not required",
      },
    };

    deps.getSourceRoutingStatusBySession().set(sessionToken, routingStatus);
    profile.ready = routingResult.ok;
    profile.routingStatus = routingStatus;

    return {
      ok: true,
      result: { sourceId, ready: routingResult.ok, routingStatus },
    };
  });

  // ========== 邮件分类 (四象限) ==========

  server.get("/api/mail/triage", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const activeSourceId = deps.getActiveMailSourceId(sessionToken);
    if (!activeSourceId) {
      reply.status(400);
      return { ok: false, error: "No active mail source" };
    }

    const profile = requireMailSource(request, reply, sessionToken);
    if (!profile) return;

    if (!checkRateLimit(rateLimitMaps.triage, sessionToken, MAIL_RATE_LIMITS.triage.perMin, MAIL_RATE_LIMITS.triage.windowMs)) {
      reply.status(429);
      return { ok: false, error: "Rate limit exceeded for triage" };
    }

    const queryParams = request.query as Record<string, unknown>;
    const limit = Math.min(100, Math.max(5, Number(queryParams.limit ?? 50)));

    const rulesMap = deps.getCustomPriorityRulesBySession().get(sessionToken);
    const rules = Array.from(rulesMap?.values() ?? []).filter((r) => r.enabled);

    try {
      const result = await triageInbox(limit, rules, buildSourceContext(profile));
      deps.recordMetric("mail_triage", Date.now() - start, true);
      return {
        ok: true,
        sourceId: activeSourceId,
        result,
      };
    } catch (err) {
      deps.recordMetric("mail_triage", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });

  // ========== 邮件洞察 (DDL/会议) ==========

  server.get("/api/mail/insights", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const profile = requireMailSource(request, reply, sessionToken);
    if (!profile) return;

    if (!checkRateLimit(rateLimitMaps.insights, sessionToken, MAIL_RATE_LIMITS.insights.perMin, MAIL_RATE_LIMITS.insights.windowMs)) {
      reply.status(429);
      return { ok: false, error: "Rate limit exceeded for insights" };
    }

    const queryParams = request.query as Record<string, unknown>;
    const limit = Math.min(100, Math.max(5, Number(queryParams.limit ?? 50)));
    const horizonDays = Math.min(30, Math.max(1, Number(queryParams.horizonDays ?? 7)));
    const timeZone = queryParams.timeZone ? String(queryParams.timeZone) : undefined;

    const rulesMap = deps.getCustomPriorityRulesBySession().get(sessionToken);
    const rules = Array.from(rulesMap?.values() ?? []).filter((r) => r.enabled);

    try {
      const result = await buildMailInsights(limit, horizonDays, timeZone, rules, buildSourceContext(profile));
      deps.recordMetric("mail_insights", Date.now() - start, true);
      return {
        ok: true,
        sourceId: profile.id,
        result,
      };
    } catch (err) {
      deps.recordMetric("mail_insights", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });

  // ========== 收件箱列表 ==========

  server.get("/api/mail/inbox/view", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const profile = requireMailSource(request, reply, sessionToken);
    if (!profile) return;

    if (!checkRateLimit(rateLimitMaps.inboxView, sessionToken, MAIL_RATE_LIMITS.inboxView.perMin, MAIL_RATE_LIMITS.inboxView.windowMs)) {
      reply.status(429);
      return { ok: false, error: "Rate limit exceeded" };
    }

    const queryParams = request.query as Record<string, unknown>;
    const limit = Math.min(60, Math.max(5, Number(queryParams.limit ?? 30)));

    try {
      const result = await listInboxForViewer(limit, buildSourceContext(profile));
      deps.recordMetric("mail_inbox_view", Date.now() - start, true);
      return { ok: true, result };
    } catch (err) {
      deps.recordMetric("mail_inbox_view", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });

  // ========== 邮件详情 ==========

  server.get("/api/mail/message", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const profile = requireMailSource(request, reply, sessionToken);
    if (!profile) return;

    if (!checkRateLimit(rateLimitMaps.message, sessionToken, MAIL_RATE_LIMITS.message.perMin, MAIL_RATE_LIMITS.message.windowMs)) {
      reply.status(429);
      return { ok: false, error: "Rate limit exceeded" };
    }

    const queryParams = request.query as Record<string, unknown>;
    const messageId = String(queryParams.messageId ?? "");

    if (!messageId) {
      reply.status(400);
      return { ok: false, error: "messageId is required" };
    }

    try {
      const result = await getMailMessageById(messageId, buildSourceContext(profile));
      deps.recordMetric("mail_message_get", Date.now() - start, true);
      return { ok: true, result };
    } catch (err) {
      deps.recordMetric("mail_message_get", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });

  // ========== 邮件问答 ==========

  server.post("/api/mail/query", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const profile = requireMailSource(request, reply, sessionToken);
    if (!profile) return;

    if (!checkRateLimit(rateLimitMaps.query, sessionToken, MAIL_RATE_LIMITS.query.perMin, MAIL_RATE_LIMITS.query.windowMs)) {
      reply.status(429);
      return { ok: false, error: "Rate limit exceeded" };
    }

    const body = request.body as Record<string, unknown>;
    const question = String(body.question ?? "");

    if (!question) {
      reply.status(400);
      return { ok: false, error: "question is required" };
    }

    const queryParams = request.query as Record<string, unknown>;
    const limit = Math.min(100, Math.max(5, Number(queryParams.limit ?? 50)));
    const horizonDays = Math.min(30, Math.max(1, Number(queryParams.horizonDays ?? 7)));
    const timeZone = queryParams.timeZone ? String(queryParams.timeZone) : undefined;

    const rulesMap = deps.getCustomPriorityRulesBySession().get(sessionToken);
    const rules = Array.from(rulesMap?.values() ?? []).filter((r) => r.enabled);

    try {
      const result = await answerMailQuestion({
        question,
        limit,
        horizonDays,
        timeZone,
        priorityRules: rules,
        sourceContext: buildSourceContext(profile),
      });
      deps.recordMetric("mail_query", Date.now() - start, true);
      return { ok: true, result: { answer: result.answer } };
    } catch (err) {
      deps.recordMetric("mail_query", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });

  // ========== 优先级规则 ==========

  server.get("/api/mail/priority-rules", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const rulesMap = deps.getCustomPriorityRulesBySession().get(sessionToken);
    const rules = Array.from(rulesMap?.values() ?? []);

    deps.recordMetric("mail_priority_rules_list", 0, true);
    return { ok: true, result: { rules } };
  });

  server.post("/api/mail/priority-rules", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const body = request.body as Record<string, unknown>;
    const rule: MailPriorityRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: String(body.name ?? "Unnamed Rule"),
      pattern: String(body.pattern ?? ""),
      field: (body.field as MailPriorityRule["field"]) ?? "any",
      quadrant: (body.quadrant as MailPriorityRule["quadrant"]) ?? "urgent_important",
      priority: Number(body.priority ?? 0),
      enabled: body.enabled !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let rulesMap = deps.getCustomPriorityRulesBySession().get(sessionToken);
    if (!rulesMap) {
      rulesMap = new Map();
      deps.getCustomPriorityRulesBySession().set(sessionToken, rulesMap);
    }
    rulesMap.set(rule.id, rule);

    deps.recordMetric("mail_priority_rules_create", 0, true);
    reply.status(201);
    return { ok: true, result: { rule } };
  });

  server.post("/api/mail/priority-rules/update", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const body = request.body as Record<string, unknown>;
    const ruleId = String(body.id);
    const rulesMap = deps.getCustomPriorityRulesBySession().get(sessionToken);
    const rule = rulesMap?.get(ruleId);

    if (!rule) {
      reply.status(404);
      return { ok: false, error: "Rule not found" };
    }

    if (body.name !== undefined) rule.name = String(body.name);
    if (body.pattern !== undefined) rule.pattern = String(body.pattern);
    if (body.field !== undefined) rule.field = body.field as MailPriorityRule["field"];
    if (body.quadrant !== undefined) rule.quadrant = body.quadrant as MailPriorityRule["quadrant"];
    if (body.priority !== undefined) rule.priority = Number(body.priority);
    if (body.enabled !== undefined) rule.enabled = Boolean(body.enabled);
    rule.updatedAt = new Date().toISOString();

    deps.recordMetric("mail_priority_rules_update", 0, true);
    return { ok: true, result: { rule } };
  });

  server.post("/api/mail/priority-rules/delete", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const body = request.body as Record<string, unknown>;
    const ruleId = String(body.id);
    const rulesMap = deps.getCustomPriorityRulesBySession().get(sessionToken);

    if (!rulesMap?.has(ruleId)) {
      reply.status(404);
      return { ok: false, error: "Rule not found" };
    }

    rulesMap.delete(ruleId);
    deps.recordMetric("mail_priority_rules_delete", 0, true);
    return { ok: true, result: { deleted: true } };
  });

  // ========== 日历同步 ==========

  server.post("/api/mail/calendar/sync", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const profile = requireMailSource(request, reply, sessionToken);
    if (!profile) return;

    if (!checkRateLimit(rateLimitMaps.calendarSync, sessionToken, MAIL_RATE_LIMITS.calendarSync.perMin, MAIL_RATE_LIMITS.calendarSync.windowMs)) {
      reply.status(429);
      return { ok: false, error: "Rate limit exceeded" };
    }

    const body = request.body as Record<string, unknown>;
    const input: MailCalendarSyncInput = {
      messageId: String(body.messageId ?? ""),
      subject: String(body.subject ?? ""),
      type: (body.type as MailCalendarSyncInput["type"]) ?? "event",
      dueAt: String(body.dueAt ?? ""),
      dueDateLabel: body.dueDateLabel ? String(body.dueDateLabel) : undefined,
      evidence: body.evidence ? String(body.evidence) : undefined,
      timeZone: body.timeZone ? String(body.timeZone) : undefined,
    };

    // 检查是否已同步过（去重）
    const syncKey = `${profile.id}:${input.messageId}`;
    const existingSync = deps.calendarSyncRecords.get(syncKey);
    if (existingSync && existingSync.expiresAt > Date.now()) {
      deps.recordMetric("mail_calendar_sync", Date.now() - start, true);
      return {
        ok: true,
        sourceId: profile.id,
        result: existingSync.result,
        deduplicated: true,
      };
    }

    try {
      const result = await createCalendarEventFromInsight(input, buildSourceContext(profile));

      // 缓存同步记录
      deps.calendarSyncRecords.set(syncKey, {
        expiresAt: Date.now() + deps.getCalendarSyncTtlMs(),
        result,
      });

      deps.recordMetric("mail_calendar_sync", Date.now() - start, true);
      return {
        ok: true,
        sourceId: profile.id,
        result,
        deduplicated: false,
      };
    } catch (err) {
      deps.recordMetric("mail_calendar_sync", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });

  server.post("/api/mail/calendar/delete", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const profile = requireMailSource(request, reply, sessionToken);
    if (!profile) return;

    const body = request.body as Record<string, unknown>;
    const eventId = String(body.eventId ?? "");

    if (!eventId) {
      reply.status(400);
      return { ok: false, error: "eventId is required" };
    }

    try {
      const result = await deleteCalendarEventById(eventId, buildSourceContext(profile));
      deps.recordMetric("mail_calendar_delete", Date.now() - start, true);
      return {
        ok: true,
        sourceId: profile.id,
        result,
      };
    } catch (err) {
      deps.recordMetric("mail_calendar_delete", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });

  // ========== 通知偏好 ==========

  server.get("/api/mail/notifications/preferences", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const prefs = deps.getNotificationPrefsBySession().get(sessionToken) ?? {
      urgentPushEnabled: true,
      dailyDigestEnabled: true,
      digestHour: 8,
      digestMinute: 0,
      digestTimeZone: "Asia/Shanghai",
    };

    return { ok: true, result: prefs };
  });

  server.post("/api/mail/notifications/preferences", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const body = request.body as Record<string, unknown>;
    const prefs: SessionNotificationPreferences = {
      urgentPushEnabled: body.urgentPushEnabled !== false,
      dailyDigestEnabled: body.dailyDigestEnabled !== false,
      digestHour: Number(body.digestHour ?? 8),
      digestMinute: Number(body.digestMinute ?? 0),
      digestTimeZone: String(body.digestTimeZone ?? "Asia/Shanghai"),
    };

    deps.getNotificationPrefsBySession().set(sessionToken, prefs);
    return { ok: true, result: prefs };
  });

  server.get("/api/mail/notifications/poll", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = requireAuth(request, reply);
    if (!sessionToken) return;

    const profile = requireMailSource(request, reply, sessionToken);
    if (!profile) return;

    const prefs = deps.getNotificationPrefsBySession().get(sessionToken) ?? {
      urgentPushEnabled: true,
      dailyDigestEnabled: true,
      digestHour: 8,
      digestMinute: 0,
      digestTimeZone: "Asia/Shanghai",
    };

    const state = deps.getNotificationStateBySession().get(sessionToken) ?? {
      seenUrgentMessageIds: new Map(),
      lastDigestDateKey: null,
      lastDigestSentAt: null,
    };

    const triage = await triageInbox(20, [], buildSourceContext(profile));
    const urgentItems = triage.quadrants.urgent_important;

    const newUrgentItems = urgentItems.filter(
      (item) =>
        !state.seenUrgentMessageIds.has(item.id) &&
        Date.now() - Date.parse(item.receivedDateTime) < deps.getNotificationSeenUrgentTtlMs()
    );

    for (const item of newUrgentItems) {
      state.seenUrgentMessageIds.set(item.id, Date.now());
    }

    return {
      ok: true,
      result: {
        hasNewUrgent: newUrgentItems.length > 0,
        newUrgentItems: prefs.urgentPushEnabled ? newUrgentItems : [],
        unreadCount: triage.counts.urgent_important,
      },
    };
  });
}
