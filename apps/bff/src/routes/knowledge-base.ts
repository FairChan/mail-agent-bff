/**
 * 知识库和摘要路由
 * 包含 /api/mail-kb/* 和 /api/mail/summarize/* 端点
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  MailKnowledgeRecord,
  EventCluster,
  PersonProfile,
  MailScoreIndex,
  KnowledgeBaseStats,
} from "@mail-agent/shared-types";

export type KnowledgeBaseDeps = {
  sessionTokenForRequest: (request: FastifyRequest) => string | null;
  mailKnowledgeBase: {
    getStats: () => KnowledgeBaseStats;
    getAllMails: (limit?: number) => MailKnowledgeRecord[];
    getMailById: (mailId: string) => MailKnowledgeRecord | null;
    getAllEvents: () => EventCluster[];
    getEventById: (eventId: string) => EventCluster | null;
    getAllPersons: () => PersonProfile[];
    getPersonById: (personId: string) => PersonProfile | null;
    getAllSubjectIndexes: () => Array<{ mailId: string; subject: string; receivedAt: string }>;
    getAllScoreIndexes: () => MailScoreIndex[];
    saveMail: (record: MailKnowledgeRecord) => void;
    saveEvent: (event: EventCluster) => void;
    savePerson: (person: PersonProfile) => void;
    saveScoreIndex: (index: MailScoreIndex) => void;
  };
  summarizeMailInbox: (
    messages: Array<{ id: string; subject: string; from: string; bodyPreview: string }>,
    locale?: string
  ) => Promise<Array<{ id: string; summary: string }>>;
  queryMailSummaries: (ids: string[]) => Promise<Map<string, string>>;
  queryEvents: () => Promise<EventCluster[]>;
  querySenderProfiles: () => Promise<PersonProfile[]>;
  exportMailKnowledgeBaseDocuments: () => Record<string, unknown>;
  recordMetric: (operation: string, durationMs: number, success: boolean) => void;
};

export function registerKnowledgeBaseRoutes(server: FastifyInstance, deps: KnowledgeBaseDeps) {
  function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const token = deps.sessionTokenForRequest(request);
    if (!token) {
      reply.status(401);
      return null;
    }
    return token;
  }

  // ========== /api/mail-kb/* 路由 ==========

  // 知识库统计
  server.get("/api/mail-kb/stats", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const stats = deps.mailKnowledgeBase.getStats();
    deps.recordMetric("mail_kb_stats", Date.now() - start, true);
    return { ok: true, result: stats };
  });

  // 获取所有邮件记录
  server.get("/api/mail-kb/mails", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const queryParams = request.query as Record<string, unknown>;
    const limit = Math.min(200, Math.max(1, Number(queryParams.limit ?? 50)));
    const offset = Math.max(0, Number(queryParams.offset ?? 0));

    const allMails = deps.mailKnowledgeBase.getAllMails(limit + offset);
    const mails = allMails.slice(offset, offset + limit);

    deps.recordMetric("mail_kb_mails_list", Date.now() - start, true);
    return {
      ok: true,
      result: {
        mails,
        total: allMails.length,
        limit,
        offset,
      },
    };
  });

  // 获取单封邮件记录
  server.get("/api/mail-kb/mails/:mailId", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const params = request.params as Record<string, unknown>;
    const mailId = String(params.mailId ?? "");

    const mail = deps.mailKnowledgeBase.getMailById(mailId);
    if (!mail) {
      reply.status(404);
      return { ok: false, error: "Mail record not found" };
    }

    deps.recordMetric("mail_kb_mail_get", Date.now() - start, true);
    return { ok: true, result: mail };
  });

  // 获取邮件题目索引
  server.get("/api/mail-kb/subjects", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const indexes = deps.mailKnowledgeBase.getAllSubjectIndexes();
    return { ok: true, result: { subjects: indexes } };
  });

  // 获取评分索引
  server.get("/api/mail-kb/scores", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const scores = deps.mailKnowledgeBase.getAllScoreIndexes();
    return { ok: true, result: { scores } };
  });

  // 获取所有事件聚类
  server.get("/api/mail-kb/events", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const events = deps.mailKnowledgeBase.getAllEvents();
    deps.recordMetric("mail_kb_events_list", Date.now() - start, true);
    return { ok: true, result: { events } };
  });

  // 获取单个事件聚类
  server.get("/api/mail-kb/events/:eventId", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const params = request.params as Record<string, unknown>;
    const eventId = String(params.eventId ?? "");

    const event = deps.mailKnowledgeBase.getEventById(eventId);
    if (!event) {
      reply.status(404);
      return { ok: false, error: "Event not found" };
    }

    return { ok: true, result: event };
  });

  // 获取所有人物画像
  server.get("/api/mail-kb/persons", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const persons = deps.mailKnowledgeBase.getAllPersons();
    deps.recordMetric("mail_kb_persons_list", Date.now() - start, true);
    return { ok: true, result: { persons } };
  });

  // 获取单个人物画像
  server.get("/api/mail-kb/persons/:personId", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const params = request.params as Record<string, unknown>;
    const personId = String(params.personId ?? "");

    const person = deps.mailKnowledgeBase.getPersonById(personId);
    if (!person) {
      reply.status(404);
      return { ok: false, error: "Person not found" };
    }

    return { ok: true, result: person };
  });

  // 创建邮件记录
  server.post("/api/mail-kb/mails", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const body = request.body as Record<string, unknown>;
    const mail: MailKnowledgeRecord = {
      mailId: String(body.mailId ?? `MAIL-${Date.now()}`),
      rawId: String(body.rawId ?? ""),
      subject: String(body.subject ?? ""),
      personId: String(body.personId ?? ""),
      eventId: body.eventId ? String(body.eventId) : null,
      importanceScore: Number(body.importanceScore ?? 5),
      urgencyScore: Number(body.urgencyScore ?? 5),
      quadrant: (body.quadrant as MailKnowledgeRecord["quadrant"]) ?? "unprocessed",
      summary: String(body.summary ?? ""),
      receivedAt: String(body.receivedAt ?? new Date().toISOString()),
      processedAt: new Date().toISOString(),
      webLink: body.webLink ? String(body.webLink) : undefined,
    };

    deps.mailKnowledgeBase.saveMail(mail);
    deps.recordMetric("mail_kb_mail_create", Date.now() - start, true);
    reply.status(201);
    return { ok: true, result: mail };
  });

  // 创建事件聚类
  server.post("/api/mail-kb/events", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const body = request.body as Record<string, unknown>;
    const event: EventCluster = {
      eventId: String(body.eventId ?? `EVT-${Date.now()}`),
      name: String(body.name ?? ""),
      summary: String(body.summary ?? ""),
      keyInfo: Array.isArray(body.keyInfo) ? body.keyInfo.map(String) : [],
      relatedMailIds: Array.isArray(body.relatedMailIds) ? body.relatedMailIds.map(String) : [],
      lastUpdated: new Date().toISOString(),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    };

    deps.mailKnowledgeBase.saveEvent(event);
    reply.status(201);
    return { ok: true, result: event };
  });

  // 创建人物画像
  server.post("/api/mail-kb/persons", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const body = request.body as Record<string, unknown>;
    const person: PersonProfile = {
      personId: String(body.personId ?? `PRS-${Date.now()}`),
      email: String(body.email ?? ""),
      name: String(body.name ?? ""),
      profile: String(body.profile ?? ""),
      role: String(body.role ?? ""),
      importance: Number(body.importance ?? 5),
      recentInteractions: Number(body.recentInteractions ?? 0),
      lastUpdated: new Date().toISOString(),
      avatarUrl: body.avatarUrl ? String(body.avatarUrl) : undefined,
    };

    deps.mailKnowledgeBase.savePerson(person);
    reply.status(201);
    return { ok: true, result: person };
  });

  // 导出知识库
  server.get("/api/mail-kb/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const documents = deps.exportMailKnowledgeBaseDocuments();
    reply.header("Content-Type", "application/json");
    reply.header("Content-Disposition", `attachment; filename="mail-kb-${new Date().toISOString().split("T")[0]}.json"`);
    return documents;
  });

  // ========== /api/mail/summarize/* 路由 ==========

  // 批量生成摘要
  server.post("/api/mail/summarize", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const body = request.body as Record<string, unknown>;
    const messages: Array<{ id: string; subject: string; from: string; bodyPreview: string }> = Array.isArray(body.messages)
      ? body.messages.map((m) => ({
          id: String((m as Record<string, unknown>).id ?? ""),
          subject: String((m as Record<string, unknown>).subject ?? ""),
          from: String((m as Record<string, unknown>).from ?? ""),
          bodyPreview: String((m as Record<string, unknown>).bodyPreview ?? ""),
        }))
      : [];

    if (messages.length === 0) {
      reply.status(400);
      return { ok: false, error: "messages array is required and must not be empty" };
    }

    const locale = body.locale ? String(body.locale) : "zh-CN";

    try {
      const summaries = await deps.summarizeMailInbox(messages, locale);
      deps.recordMetric("mail_summarize_batch", Date.now() - start, true);
      return { ok: true, result: { summaries } };
    } catch (err) {
      deps.recordMetric("mail_summarize_batch", Date.now() - start, false);
      reply.status(500);
      return { ok: false, error: String(err) };
    }
  });

  // 查询已有摘要
  server.get("/api/mail/summaries", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const queryParams = request.query as Record<string, unknown>;
    const idsParam = queryParams.ids;
    const ids = Array.isArray(idsParam)
      ? idsParam.map(String)
      : typeof idsParam === "string"
        ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

    if (ids.length === 0) {
      return { ok: true, result: { summaries: {} } };
    }

    const summaries = await deps.queryMailSummaries(ids);
    const result: Record<string, string> = {};
    for (const [id, summary] of summaries) {
      result[id] = summary;
    }

    return { ok: true, result: { summaries: result } };
  });

  // 获取事件
  server.get("/api/mail/events", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const events = await deps.queryEvents();
    return { ok: true, result: { events } };
  });

  // 获取发件人画像
  server.get("/api/mail/senders", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = requireAuth(request, reply);
    if (!token) return;

    const persons = await deps.querySenderProfiles();
    return { ok: true, result: { persons } };
  });

  // 为新邮件生成摘要
  server.post("/api/mail/summarize/new", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const body = request.body as Record<string, unknown>;
    const message: { id: string; subject: string; from: string; bodyPreview: string } = {
      id: String(body.id ?? ""),
      subject: String(body.subject ?? ""),
      from: String(body.from ?? ""),
      bodyPreview: String(body.bodyPreview ?? ""),
    };

    if (!message.id || !message.subject) {
      reply.status(400);
      return { ok: false, error: "id and subject are required" };
    }

    try {
      const summaries = await deps.summarizeMailInbox([message], String(body.locale ?? "zh-CN"));
      deps.recordMetric("mail_summarize_single", Date.now() - start, true);
      return { ok: true, result: summaries[0] ?? { id: message.id, summary: "" } };
    } catch (err) {
      deps.recordMetric("mail_summarize_single", Date.now() - start, false);
      reply.status(500);
      return { ok: false, error: String(err) };
    }
  });
}
