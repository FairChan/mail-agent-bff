import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { getPrismaClient } from "./persistence.js";
import type {
  EventCluster,
  MailKnowledgeRecord,
  MailQuadrantKB,
  PersonProfile,
} from "./mail-kb-service.js";

const DEFAULT_KB_ROOT = process.env.KB_DATA_DIR ?? "/root/.openclaw/workspace/mail-kb";
const KB_DATA_DIR = join(DEFAULT_KB_ROOT, "data");
const KB_MAILS_DIR = join(KB_DATA_DIR, "mails");
const KB_EVENTS_DIR = join(KB_DATA_DIR, "events");
const KB_PERSONS_DIR = join(KB_DATA_DIR, "persons");
const KB_DOCS_DIR = join(KB_DATA_DIR, "documents");

type ExportJobLogLevel = "info" | "warn" | "error";

export interface MailKnowledgeBaseExportReport {
  exportedAt: string;
  sourceId: string;
  userId: string;
  mailCount: number;
  eventCount: number;
  personCount: number;
  files: string[];
}

export interface ExportMailKnowledgeBaseOptions {
  userId: string;
  sourceId: string;
  logger?: FastifyBaseLogger | null;
  logProgress?: (level: ExportJobLogLevel, message: string) => void;
}

function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function writeText(filePath: string, content: string): void {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, content, "utf-8");
}

function safeParseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeQuadrant(
  candidate: string | null | undefined,
  importanceScore: number,
  urgencyScore: number
): MailQuadrantKB {
  if (
    candidate === "urgent_important" ||
    candidate === "not_urgent_important" ||
    candidate === "urgent_not_important" ||
    candidate === "not_urgent_not_important"
  ) {
    return candidate;
  }

  const imp = Number.isFinite(importanceScore) ? importanceScore : 0.5;
  const urg = Number.isFinite(urgencyScore) ? urgencyScore : 0.5;
  const important = imp >= 0.7;
  const urgent = urg >= 0.7;

  if (important && urgent) return "urgent_important";
  if (important && !urgent) return "not_urgent_important";
  if (!important && urgent) return "urgent_not_important";
  return "not_urgent_not_important";
}

function toScore10(rawScore: number): number {
  const base = Number.isFinite(rawScore) ? rawScore : 0.5;
  const scaled = base <= 1 ? base * 10 : base;
  return Math.max(1, Math.min(10, Math.round(scaled * 10) / 10));
}

function normalizeDate(value: unknown, fallback: string): string {
  const candidate = typeof value === "string" ? value : fallback;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => stringifyValue(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeKeyInfoList(value: unknown): string[] {
  const parsed = safeParseJson(value);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => stringifyValue(item)).filter(Boolean);
  }
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${stringifyValue(val)}`.trim())
      .filter((line) => line !== ":");
  }
  if (typeof parsed === "string" && parsed.trim()) {
    return [parsed.trim()];
  }
  return [];
}

function normalizeTagsFromKeyInfo(value: unknown, fallbackSubject: string): string[] {
  const parsed = safeParseJson(value);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const maybeTags = (parsed as Record<string, unknown>).tags;
    if (Array.isArray(maybeTags)) {
      const tags = maybeTags.map((tag) => stringifyValue(tag)).filter(Boolean);
      if (tags.length > 0) {
        return tags.slice(0, 8);
      }
    }
  }
  const subject = fallbackSubject.trim();
  if (!subject) {
    return [];
  }
  const tokens = subject
    .split(/[\s,，。;；:：|]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 4);
  return tokens;
}

function toMarkdownTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [head, divider, body].filter(Boolean).join("\n");
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash >>>= 0;
  }
  return hash.toString(36);
}

function fallbackSenderId(userId: string, email: string): string {
  return `PER_${stableHash(`${userId}::${email.toLowerCase()}`)}`;
}

function fallbackUnknownSenderId(userId: string): string {
  return `PER_${stableHash(`${userId}::unknown_sender`)}`;
}

export async function exportMailKnowledgeBaseDocuments(
  options: ExportMailKnowledgeBaseOptions
): Promise<MailKnowledgeBaseExportReport> {
  const { userId, sourceId, logger, logProgress } = options;
  const prisma = await getPrismaClient((logger ?? null) as unknown as FastifyBaseLogger);
  if (!prisma) {
    throw new Error("Prisma unavailable when exporting mail knowledge base documents");
  }

  const nowIso = new Date().toISOString();
  const log = (level: ExportJobLogLevel, message: string) => {
    if (level === "error") {
      logger?.error({ userId, sourceId }, message);
    } else if (level === "warn") {
      logger?.warn({ userId, sourceId }, message);
    } else {
      logger?.info({ userId, sourceId }, message);
    }
    logProgress?.(level, message);
  };

  log("info", "开始导出邮件知识库文档...");

  const summaries = await (prisma as any).mailSummary.findMany({
    where: { userId, sourceId },
    include: {
      scoreRecord: true,
      sender: true,
      event: { select: { id: true, title: true, summaryText: true } },
    },
    orderBy: { processedAt: "desc" },
  });

  const eventRows = await (prisma as any).mailEvent.findMany({
    where: { userId, sourceId },
    orderBy: { lastMailAt: "desc" },
  });

  const senderRows = await (prisma as any).senderProfile.findMany({
    where: { userId, sourceId },
    orderBy: { lastMailAt: "desc" },
  });

  const mailIdsByEvent = new Map<string, string[]>();
  for (const item of summaries as Array<any>) {
    if (!item?.eventId) continue;
    const list = mailIdsByEvent.get(item.eventId) ?? [];
    list.push(item.id);
    mailIdsByEvent.set(item.eventId, list);
  }

  const mailsBySender = new Map<string, Array<any>>();
  for (const item of summaries as Array<any>) {
    const senderId = typeof item.senderId === "string" && item.senderId.trim() ? item.senderId : null;
    const senderEmail =
      typeof item?.sender?.email === "string" && item.sender.email.trim() ? item.sender.email.trim().toLowerCase() : "";
    const groupingKey = senderId || senderEmail || fallbackUnknownSenderId(userId);
    const list = mailsBySender.get(groupingKey) ?? [];
    list.push(item);
    mailsBySender.set(groupingKey, list);
  }

  const personsIndex: Record<string, PersonProfile> = {};
  for (const sender of senderRows as Array<any>) {
    const senderEmail = (sender.email ?? "").toString().trim().toLowerCase();
    const personId =
      (sender.id ?? "").toString().trim() || fallbackSenderId(userId, senderEmail || "unknown@unknown.local");
    const groupedMails =
      mailsBySender.get(personId) ??
      (senderEmail ? mailsBySender.get(senderEmail) : undefined) ??
      [];
    const avgImportance =
      groupedMails.length > 0
        ? groupedMails.reduce((sum, mail) => sum + toScore10(Number(mail?.importanceScore ?? 0.5)), 0) / groupedMails.length
        : toScore10(0.5);

    const keyInfoObj = safeParseJson(sender.keyInfo);
    const role =
      (keyInfoObj && typeof keyInfoObj === "object" && !Array.isArray(keyInfoObj)
        ? stringifyValue((keyInfoObj as Record<string, unknown>).role)
        : "") || "未标注";

    personsIndex[personId] = {
      personId,
      email: senderEmail || "unknown@unknown.local",
      name: (sender.displayName ?? senderEmail ?? "未知发件人").toString(),
      profile: (sender.summaryText ?? "暂无人物画像摘要").toString(),
      role,
      keyInfo: normalizeKeyInfoList(sender.keyInfo),
      importance: Math.round(avgImportance * 10) / 10,
      recentInteractions: Number(sender.totalMailCount ?? groupedMails.length ?? 0),
      lastUpdated: normalizeDate(sender.updatedAt, nowIso),
    };
  }

  const eventsIndex: Record<string, EventCluster> = {};
  for (const event of eventRows as Array<any>) {
    const eventId = (event.id ?? "").toString().trim();
    if (!eventId) continue;
    eventsIndex[eventId] = {
      eventId,
      name: (event.title ?? "未命名事件").toString(),
      summary: (event.summaryText ?? "暂无事件摘要").toString(),
      keyInfo: normalizeKeyInfoList(event.keyInfo),
      relatedMailIds: mailIdsByEvent.get(eventId) ?? [],
      lastUpdated: normalizeDate(event.updatedAt ?? event.lastMailAt, nowIso),
      tags: normalizeTagsFromKeyInfo(event.keyInfo, (event.title ?? "").toString()),
    };
  }

  const mailsIndex: Record<string, MailKnowledgeRecord> = {};
  for (const item of summaries as Array<any>) {
    const mailId = (item.id ?? "").toString().trim();
    if (!mailId) continue;

    const senderEmail =
      typeof item?.sender?.email === "string" && item.sender.email.trim()
        ? item.sender.email.trim().toLowerCase()
        : "";
    const senderId =
      (item.senderId ?? "").toString().trim() ||
      (senderEmail ? fallbackSenderId(userId, senderEmail) : fallbackUnknownSenderId(userId));
    if (!personsIndex[senderId]) {
      personsIndex[senderId] = {
        personId: senderId,
        email: senderEmail || "unknown@unknown.local",
        name:
          (item?.sender?.displayName ?? senderEmail ?? "未知发件人").toString() || "未知发件人",
        profile: (item?.sender?.summaryText ?? "暂无人物画像摘要").toString(),
        role: "未标注",
        keyInfo: [],
        importance: toScore10(Number(item.importanceScore ?? 0.5)),
        recentInteractions: 1,
        lastUpdated: normalizeDate(item.processedAt, nowIso),
      };
    }

    const eventId = (item.eventId ?? "").toString().trim() || null;
    if (eventId && !eventsIndex[eventId]) {
      eventsIndex[eventId] = {
        eventId,
        name: (item?.event?.title ?? item.subject ?? "未命名事件").toString(),
        summary: (item?.event?.summaryText ?? item.summaryText ?? "暂无事件摘要").toString(),
        keyInfo: [],
        relatedMailIds: mailIdsByEvent.get(eventId) ?? [mailId],
        lastUpdated: normalizeDate(item.processedAt, nowIso),
        tags: normalizeTagsFromKeyInfo(null, (item?.event?.title ?? item.subject ?? "").toString()),
      };
    }

    const quadrant = normalizeQuadrant(
      (item?.scoreRecord?.quadrant ?? "").toString(),
      Number(item.importanceScore ?? 0.5),
      Number(item.urgencyScore ?? 0.5)
    );

    mailsIndex[mailId] = {
      mailId,
      rawId: (item.externalMsgId ?? "").toString(),
      subject: (item.subject ?? "(无主题)").toString(),
      personId: senderId,
      eventId,
      importanceScore: toScore10(Number(item.importanceScore ?? 0.5)),
      urgencyScore: toScore10(Number(item.urgencyScore ?? 0.5)),
      quadrant,
      summary: (item.summaryText ?? "暂无摘要").toString(),
      receivedAt: normalizeDate(item.processedAt, nowIso),
      processedAt: normalizeDate(item.processedAt, nowIso),
      webLink: typeof item.webLink === "string" ? item.webLink : undefined,
    };
  }

  const mailRows = Object.values(mailsIndex).sort(
    (left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime()
  );
  const eventRowsForDocs = Object.values(eventsIndex).sort(
    (left, right) => new Date(right.lastUpdated).getTime() - new Date(left.lastUpdated).getTime()
  );
  const personRows = Object.values(personsIndex).sort(
    (left, right) => right.recentInteractions - left.recentInteractions
  );

  ensureDir(KB_DATA_DIR);
  ensureDir(KB_MAILS_DIR);
  ensureDir(KB_EVENTS_DIR);
  ensureDir(KB_PERSONS_DIR);
  ensureDir(KB_DOCS_DIR);

  writeJson(join(KB_MAILS_DIR, "index.json"), mailsIndex);
  for (const mail of mailRows) {
    writeJson(join(KB_MAILS_DIR, `${mail.mailId}.json`), mail);
  }
  writeJson(join(KB_EVENTS_DIR, "index.json"), eventsIndex);
  writeJson(join(KB_PERSONS_DIR, "index.json"), personsIndex);

  const mailIdsDocPath = join(KB_DOCS_DIR, "mail-ids.md");
  const mailSubjectDocPath = join(KB_DOCS_DIR, "mail-subject-index.md");
  const mailScoreDocPath = join(KB_DOCS_DIR, "mail-score-index.md");
  const mailSummaryDocPath = join(KB_DOCS_DIR, "mail-summaries.md");
  const eventDocPath = join(KB_DOCS_DIR, "event-clusters.md");
  const senderDocPath = join(KB_DOCS_DIR, "sender-profiles.md");
  const baselineStatusPath = join(KB_DOCS_DIR, "baseline-status.json");

  writeText(
    mailIdsDocPath,
    [
      "# 邮件标识码清单",
      "",
      `生成时间：${nowIso}`,
      `邮件总数：${mailRows.length}`,
      "",
      ...mailRows.map((mail, index) => `${index + 1}. ${mail.mailId}`),
      "",
    ].join("\n")
  );

  writeText(
    mailSubjectDocPath,
    [
      "# 邮件题目索引（题目 + 标识码）",
      "",
      `生成时间：${nowIso}`,
      "",
      toMarkdownTable(
        ["标识码", "题目", "接收时间"],
        mailRows.map((mail) => [mail.mailId, mail.subject.replace(/\|/g, "\\|"), mail.receivedAt])
      ),
      "",
    ].join("\n")
  );

  writeText(
    mailScoreDocPath,
    [
      "# 邮件评分索引（重要性 + 紧急性）",
      "",
      `生成时间：${nowIso}`,
      "",
      toMarkdownTable(
        ["标识码", "重要性(1-10)", "紧急性(1-10)", "象限"],
        mailRows.map((mail) => [
          mail.mailId,
          String(mail.importanceScore),
          String(mail.urgencyScore),
          mail.quadrant,
        ])
      ),
      "",
    ].join("\n")
  );

  writeText(
    mailSummaryDocPath,
    [
      "# 邮件总结正文库",
      "",
      `生成时间：${nowIso}`,
      `邮件总数：${mailRows.length}`,
      "",
      ...mailRows.flatMap((mail) => [
        `## ${mail.mailId} | ${mail.subject}`,
        `- 原始ID：${mail.rawId}`,
        `- 发件人ID：${mail.personId}`,
        `- 事件ID：${mail.eventId ?? "无"}`,
        `- 重要性：${mail.importanceScore}/10`,
        `- 紧急性：${mail.urgencyScore}/10`,
        `- 象限：${mail.quadrant}`,
        `- 接收时间：${mail.receivedAt}`,
        "",
        mail.summary,
        "",
      ]),
    ].join("\n")
  );

  writeText(
    eventDocPath,
    [
      "# 事件聚类索引（事件ID + 归纳总结）",
      "",
      `生成时间：${nowIso}`,
      `事件总数：${eventRowsForDocs.length}`,
      "",
      ...eventRowsForDocs.flatMap((event) => [
        `## ${event.eventId} | ${event.name}`,
        `- 关联邮件数：${event.relatedMailIds.length}`,
        `- 最后更新：${event.lastUpdated}`,
        `- 标签：${event.tags.join(", ") || "无"}`,
        "",
        "### 事件归纳",
        event.summary,
        "",
        "### 关键信息",
        ...(event.keyInfo.length > 0 ? event.keyInfo.map((line) => `- ${line}`) : ["- 无"]),
        "",
        "### 关联邮件ID",
        ...(event.relatedMailIds.length > 0 ? event.relatedMailIds.map((mailId) => `- ${mailId}`) : ["- 无"]),
        "",
      ]),
    ].join("\n")
  );

  writeText(
    senderDocPath,
    [
      "# 发件人画像索引（人物ID + 归纳总结）",
      "",
      `生成时间：${nowIso}`,
      `发件人总数：${personRows.length}`,
      "",
      ...personRows.flatMap((person) => [
        `## ${person.personId} | ${person.name}`,
        `- 邮箱：${person.email}`,
        `- 角色：${person.role}`,
        `- 重要度：${person.importance}/10`,
        `- 交互次数：${person.recentInteractions}`,
        `- 最后更新：${person.lastUpdated}`,
        "",
        "### 人物画像",
        person.profile,
        "",
      ]),
    ].join("\n")
  );

  writeJson(baselineStatusPath, {
    backfillCompleted: true,
    exportedAt: nowIso,
    userId,
    sourceId,
    mailCount: mailRows.length,
    eventCount: eventRowsForDocs.length,
    personCount: personRows.length,
    note: "旧有邮件信息已完成归档，可直接用于问答检索。",
  });

  const report: MailKnowledgeBaseExportReport = {
    exportedAt: nowIso,
    userId,
    sourceId,
    mailCount: mailRows.length,
    eventCount: eventRowsForDocs.length,
    personCount: personRows.length,
    files: [
      mailIdsDocPath,
      mailSubjectDocPath,
      mailScoreDocPath,
      mailSummaryDocPath,
      eventDocPath,
      senderDocPath,
      baselineStatusPath,
      join(KB_MAILS_DIR, "index.json"),
      join(KB_EVENTS_DIR, "index.json"),
      join(KB_PERSONS_DIR, "index.json"),
    ],
  };

  writeJson(join(KB_DOCS_DIR, "export-report.json"), report);
  log("info", `知识库文档导出完成：邮件 ${report.mailCount}，事件 ${report.eventCount}，人物 ${report.personCount}。`);
  return report;
}
