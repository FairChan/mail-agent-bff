import type { FastifyBaseLogger } from "fastify";
import { LlmGatewayService } from "./agent/llm-gateway.js";
import type { TenantContext } from "./agent/types.js";
import { createPrivacyScope, isMailPrivacyError } from "./mail-privacy.js";
import { personalTenantIdForUser } from "./tenant-isolation.js";
import {
  getMailMessageById,
  queryInboxMessagesPageForSource,
  type MailSourceContext,
} from "./mail.js";
import { getMailKnowledgeBaseStore } from "./mail-kb-store.js";

const DEFAULT_MAX_MAILS_PER_BACKFILL = 250;
const ANALYSIS_BATCH_SIZE = 6;
const DEFAULT_BACKFILL_WINDOW_DAYS = 30;
const ANALYSIS_BODY_CHAR_LIMIT = 1800;
const ANALYSIS_MAX_TOKENS = 4096;

function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
    hash >>>= 0;
  }
  return hash.toString(36);
}

export function makeMailId(sourceId: string, externalMsgId: string): string {
  return `MSG_${stableHash(`${sourceId}::${externalMsgId}`)}`;
}

export function makeEventId(userId: string, eventHash: string): string {
  return `EVT_${stableHash(`${userId}::${eventHash}`)}`;
}

export function makeSenderId(userId: string, email: string): string {
  return `PER_${stableHash(`${userId}::${email.trim().toLowerCase()}`)}`;
}

interface OutlookMailItem {
  mailId: string;
  id: string;
  subject: string;
  fromAddress: string;
  fromName: string;
  bodyPreview: string;
  bodyContent: string;
  receivedDateTime: string;
  importance: string;
  isRead: boolean;
  hasAttachments: boolean;
  webLink: string;
}

interface MailAnalysis {
  mailId: string;
  summaryText: string;
  importanceScore: number;
  urgencyScore: number;
  quadrant: "unprocessed" | "urgent_important" | "not_urgent_important" | "urgent_not_important" | "not_urgent_not_important";
  scoreReasoning: string;
  eventDecision: "reuse" | "new" | "none";
  eventId: string | null;
  eventTitle: string | null;
  eventSummary: string | null;
  eventKeyInfo: Record<string, unknown> | null;
  eventSummaryUpdate: string | null;
  senderDecision: "reuse" | "new";
  senderId: string;
  senderSummary: string;
  senderKeyInfo: Record<string, unknown> | null;
  senderSummaryUpdate: string | null;
}

export interface SummarizeResult {
  processedCount: number;
  newMailCount: number;
  updatedMailCount: number;
  newEventCount: number;
  updatedEventCount: number;
  newSenderCount: number;
  updatedSenderCount: number;
  errors: string[];
  horizon: string;
}

export interface SummarizeProgressUpdate {
  phase: "fetch" | "analyze" | "persist" | "done";
  message: string;
  processed: number;
  total: number;
  batchIndex?: number;
  batchTotal?: number;
  errors?: number;
}

export interface SummarizeMailInboxOptions {
  onProgress?: (update: SummarizeProgressUpdate) => void;
  windowDays?: number;
}

const ANALYSIS_PROMPT_TEMPLATE = (
  mails: OutlookMailItem[],
  existingEvents: Array<{ id: string; title: string; summaryText: string; keyInfo: string }>,
  existingSenders: Array<{ id: string; email: string; displayName: string; summaryText: string; keyInfo: string }>
): string => `你是一个邮件智能分析助手，代号 Mery。请用快速模式、直接输出结构化 JSON，对用户最近一段时间内的 ${mails.length} 封邮件完成总结归纳。不要展示推理过程，不要输出额外解释。

## 分析要求

对每一封邮件，你需要输出以下信息：

1. **邮件唯一标识码**：直接使用原始 mailId，不可更改
2. **邮件归纳总结**：用中文总结这封邮件的核心内容
3. **重要性评分**（0-1）：考虑发件人身份、邮件内容与用户工作的相关性
4. **紧急性评分**（0-1）：考虑截止日期、催促语气、时效性等
5. **象限分类**：
   - unprocessed（证据不足，先进入未处理）
   - urgent_important（紧急且重要）
   - not_urgent_important（重要不紧急）
   - urgent_not_important（紧急不重要）
   - not_urgent_not_important（不紧急不重要）
6. **打分理由**：简要说明评分依据

## 事件聚类

将相同话题/项目的邮件归为同一事件。若某封邮件与已有事件相关，请使用已有事件ID；否则创建新事件。

**已有事件列表**：
${existingEvents.length > 0 ? existingEvents.map((event) => `- ${event.id}: ${event.title}（${event.summaryText.slice(0, 80)}...）`).join("\n") : "（暂无历史事件）"}

对每封邮件判断：
- 若与已有事件相关：返回已有事件ID，并在 eventSummaryUpdate 中提供该事件的最新总结更新
- 若为全新事件：返回新事件ID（格式：EVT_xxxxxx）和 eventTitle、eventSummary、eventKeyInfo

## 发件人画像

**已有发件人列表**：
${existingSenders.length > 0 ? existingSenders.map((sender) => `- ${sender.id} (${sender.email}): ${sender.summaryText.slice(0, 60)}...`).join("\n") : "（暂无历史发件人画像）"}

对每位发件人：
- 若已存在：复用其ID，并更新 summaryText 和 keyInfo
- 若为新发件人：返回新 senderId（格式：PER_xxxxxx）和 senderSummary、senderKeyInfo

## 输出格式

请严格输出以下 JSON（不要有任何额外文本）：

\`\`\`json
{
  "analyses": [
    {
      "mailId": "原始mailId",
      "summaryText": "中文归纳总结（40-140字）",
      "importanceScore": 0.0,
      "urgencyScore": 0.0,
      "quadrant": "urgent_important",
      "scoreReasoning": "评分理由（20-50字）",
      "eventDecision": "reuse|new|none",
      "eventId": "事件ID或null",
      "eventTitle": "新事件标题或null",
      "eventSummary": "新事件总结（30-100字）或null",
      "eventKeyInfo": {"key": "value"}或null,
      "eventSummaryUpdate": "事件总结更新内容（若reuse则必填）或null",
      "senderDecision": "reuse|new",
      "senderId": "发件人ID",
      "senderSummary": "发件人总结（30-100字）",
      "senderKeyInfo": {"属性": "值"}或null,
      "senderSummaryUpdate": "发件人总结更新内容（若reuse则必填）或null"
    }
  ]
}
\`\`\`

## 邮件内容

${mails.map((mail, index) => `### 邮件 ${index + 1}（mailId: ${mail.mailId}）
- 主题：${mail.subject}
- 发件人：${mail.fromName} <${mail.fromAddress}>
- 时间：${mail.receivedDateTime}
- 重要性标记：${mail.importance}
- 已读状态：${mail.isRead ? "已读" : "未读"}
- 有附件：${mail.hasAttachments ? "是" : "否"}
- 内容预览：${mail.bodyPreview || "(无)"}
- 正文内容：${(mail.bodyContent || mail.bodyPreview || "(无内容)").slice(0, ANALYSIS_BODY_CHAR_LIMIT)}
---`).join("\n")}
`;

function sanitizeBodyContent(content: string): string {
  return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
}

function normalizeAnalysisScore(value: number | undefined, fallback = 0.5): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, Number(value)));
}

function normalizeQuadrant(value: string | undefined, importanceScore: number, urgencyScore: number) {
  if (
    value === "unprocessed" ||
    value === "urgent_important" ||
    value === "not_urgent_important" ||
    value === "urgent_not_important" ||
    value === "not_urgent_not_important"
  ) {
    return value;
  }
  if (!Number.isFinite(importanceScore) || !Number.isFinite(urgencyScore)) {
    return "unprocessed";
  }
  if (importanceScore <= 0 && urgencyScore <= 0) {
    return "unprocessed";
  }
  const important = importanceScore >= 0.7;
  const urgent = urgencyScore >= 0.7;
  if (important && urgent) return "urgent_important";
  if (important) return "not_urgent_important";
  if (urgent) return "urgent_not_important";
  return "not_urgent_not_important";
}

function keyInfoToList(value: Record<string, unknown> | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return Object.entries(value)
    .map(([key, raw]) => {
      if (raw === null || raw === undefined) {
        return "";
      }
      if (Array.isArray(raw)) {
        return `${key}: ${raw.join(", ")}`;
      }
      if (typeof raw === "object") {
        return `${key}: ${JSON.stringify(raw)}`;
      }
      return `${key}: ${String(raw)}`;
    })
    .filter(Boolean);
}

function senderRoleFromKeyInfo(value: Record<string, unknown> | null | undefined): string {
  if (!value) {
    return "未标注";
  }
  const candidate = value.role;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : "未标注";
}

function senderImportance(importanceScore: number, existingImportance?: number): number {
  return Math.max(existingImportance ?? 0, normalizeAnalysisScore(importanceScore));
}

function normalizeWindowDays(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKFILL_WINDOW_DAYS;
  }
  return Math.max(1, Math.min(90, Math.floor(Number(value))));
}

async function fetchMailBody(messageId: string, sourceContext?: MailSourceContext): Promise<string> {
  try {
    const detail = await getMailMessageById(messageId, sourceContext);
    return sanitizeBodyContent(detail.bodyContent);
  } catch {
    return "";
  }
}

function normalizeOutlookMessage(
  message: {
    id?: string;
    subject?: string;
    from?: { emailAddress?: { address?: string; name?: string } };
    bodyPreview?: string;
    body?: { content?: string };
    receivedDateTime?: string;
    importance?: string;
    isRead?: boolean;
    hasAttachments?: boolean;
    webLink?: string;
  },
  sourceId: string
): OutlookMailItem {
  const from = message.from?.emailAddress;
  const externalId = message.id?.trim() ?? "";
  return {
    mailId: makeMailId(sourceId, externalId),
    id: externalId,
    subject: message.subject?.trim() || "(无主题)",
    fromAddress: from?.address?.trim() || "unknown@local.invalid",
    fromName: from?.name?.trim() || from?.address?.trim() || "未知发件人",
    bodyPreview: message.bodyPreview?.trim() || "",
    bodyContent: sanitizeBodyContent(message.body?.content ?? ""),
    receivedDateTime: message.receivedDateTime || new Date().toISOString(),
    importance: message.importance || "normal",
    isRead: message.isRead ?? true,
    hasAttachments: message.hasAttachments ?? false,
    webLink: message.webLink || "",
  };
}

async function fetchRecentMailList(
  sourceContext: MailSourceContext,
  maxMessages: number,
  windowDays: number,
  onProgress?: (update: SummarizeProgressUpdate) => void
): Promise<OutlookMailItem[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffIso = cutoff.toISOString();

  const collected: OutlookMailItem[] = [];
  let skip = 0;
  while (collected.length < maxMessages) {
    const page = await queryInboxMessagesPageForSource(
      {
        limit: Math.min(50, maxMessages - collected.length),
        skip,
        receivedAfter: cutoffIso,
      },
      sourceContext
    );

    if (page.length === 0) {
      break;
    }

    for (const message of page) {
      const normalized = normalizeOutlookMessage(message, sourceContext.sourceId);
      const receivedAt = new Date(normalized.receivedDateTime);
      if (!Number.isNaN(receivedAt.getTime()) && receivedAt < cutoff) {
        return collected;
      }
      collected.push(normalized);
      if (collected.length >= maxMessages) {
        break;
      }
    }

    onProgress?.({
      phase: "fetch",
      message: `已拉取 ${collected.length} 封近 ${windowDays} 天邮件...`,
      processed: collected.length,
      total: maxMessages,
    });

    if (page.length < Math.min(50, maxMessages - skip)) {
      break;
    }
    skip += page.length;
  }

  return collected;
}

async function hydrateBatchBodies(
  mails: OutlookMailItem[],
  sourceContext: MailSourceContext
): Promise<OutlookMailItem[]> {
  return Promise.all(
    mails.map(async (mail) => {
      if (mail.bodyContent) {
        return mail;
      }
      const bodyContent = await fetchMailBody(mail.id, sourceContext);
      return {
        ...mail,
        bodyContent,
      };
    })
  );
}

function parseAnalysisResponse(content: string): MailAnalysis[] {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = jsonMatch ? jsonMatch[1].trim() : content.trim();
  const parsed = JSON.parse(candidate) as { analyses?: MailAnalysis[] };
  return Array.isArray(parsed.analyses) ? parsed.analyses : [];
}

async function analyzeMailsWithAgent(
  mails: OutlookMailItem[],
  existingEvents: Array<{ id: string; title: string; summaryText: string; keyInfo: string }>,
  existingSenders: Array<{ id: string; email: string; displayName: string; summaryText: string; keyInfo: string }>,
  logger: FastifyBaseLogger,
  llmGateway: LlmGatewayService,
  tenant: TenantContext
): Promise<MailAnalysis[]> {
  const privacyScope = createPrivacyScope({
    kind: "kb_job",
    scopeId: `kb_job:${tenant.sourceId}:${mails[0]?.mailId ?? "batch"}`,
    userId: tenant.userId,
    sourceId: tenant.sourceId,
  });
  const maskedMails = privacyScope.maskStructuredPayload(mails) as OutlookMailItem[];
  const maskedExistingEvents = privacyScope.maskStructuredPayload(existingEvents) as typeof existingEvents;
  const maskedExistingSenders = privacyScope.maskStructuredPayload(existingSenders) as typeof existingSenders;
  const content = await llmGateway.generateText({
    tenant,
    messages: [
      {
        role: "user",
        content: ANALYSIS_PROMPT_TEMPLATE(maskedMails, maskedExistingEvents, maskedExistingSenders),
      },
    ],
    timeoutMs: 30000,
    temperature: 0,
    maxTokens: ANALYSIS_MAX_TOKENS,
    enableThinking: false,
  });
  try {
    return parseAnalysisResponse(privacyScope.restoreText(content));
  } catch (error) {
    logger.error(
      {
        code: isMailPrivacyError(error) ? error.code : undefined,
        message: error instanceof Error ? error.message : String(error),
        responseLength: content.length,
      },
      "Mail analysis response parsing failed"
    );
    throw new Error("Mail analysis response parsing failed");
  }
}

async function persistAnalyses(
  userId: string,
  sourceId: string,
  mails: OutlookMailItem[],
  analyses: MailAnalysis[],
  result: SummarizeResult
): Promise<void> {
  const store = await getMailKnowledgeBaseStore(userId, sourceId);

  for (const mail of mails) {
    const analysis = analyses.find((item) => item.mailId === mail.mailId);
    if (!analysis) {
      result.errors.push(`邮件 ${mail.id}: 缺少 LLM 分析结果`);
      continue;
    }

    const normalizedImportance = normalizeAnalysisScore(analysis.importanceScore);
    const normalizedUrgency = normalizeAnalysisScore(analysis.urgencyScore);
    const senderId = analysis.senderId || makeSenderId(userId, mail.fromAddress);
    const existingPerson = store.getPersonByEmail(mail.fromAddress);
    const personResult = store.upsertPerson({
      personId: senderId,
      email: mail.fromAddress,
      name: mail.fromName,
      profile: analysis.senderSummaryUpdate ?? analysis.senderSummary,
      role: senderRoleFromKeyInfo(analysis.senderKeyInfo),
      importance: senderImportance(normalizedImportance, existingPerson?.importance),
      recentInteractions: (existingPerson?.recentInteractions ?? 0) + 1,
      lastUpdated: mail.receivedDateTime,
    });
    if (personResult.created) {
      result.newSenderCount += 1;
    } else {
      result.updatedSenderCount += 1;
    }

    let eventId: string | null = analysis.eventId;
    if (eventId) {
      const eventResult = store.upsertEvent({
        eventId,
        name: analysis.eventTitle ?? mail.subject,
        summary: analysis.eventSummaryUpdate ?? analysis.eventSummary ?? analysis.summaryText,
        keyInfo: keyInfoToList(analysis.eventKeyInfo),
        relatedMailIds: [mail.mailId],
        lastUpdated: mail.receivedDateTime,
        tags: [analysis.quadrant],
      });
      if (eventResult.created) {
        result.newEventCount += 1;
      } else {
        result.updatedEventCount += 1;
      }
    } else {
      eventId = null;
    }

    const existingMail = store.getMailByRawId(mail.id);
    const savedMail = store.upsertMail({
      mailId: mail.mailId,
      rawId: mail.id,
      subject: mail.subject,
      personId: personResult.record.personId,
      eventId,
      importanceScore: normalizedImportance,
      urgencyScore: normalizedUrgency,
      quadrant: normalizeQuadrant(
        analysis.quadrant,
        normalizedImportance,
        normalizedUrgency
      ) as any,
      summary: analysis.summaryText,
      receivedAt: mail.receivedDateTime,
      processedAt: new Date().toISOString(),
      webLink: mail.webLink,
    });

    if (savedMail.created && !existingMail) {
      result.newMailCount += 1;
    } else {
      result.updatedMailCount += 1;
    }
  }
}

export async function summarizeMailInbox(
  userId: string,
  sourceContext: MailSourceContext,
  sessionKey: string,
  logger: FastifyBaseLogger,
  limit = DEFAULT_MAX_MAILS_PER_BACKFILL,
  options?: SummarizeMailInboxOptions
): Promise<SummarizeResult> {
  const onProgress = options?.onProgress;
  const windowDays = normalizeWindowDays(options?.windowDays);
  const store = await getMailKnowledgeBaseStore(userId, sourceContext.sourceId);
  const llmGateway = new LlmGatewayService(logger);
  const tenant: TenantContext = {
    ...sourceContext,
    tenantId: personalTenantIdForUser(userId),
    userId,
    sourceId: sourceContext.sourceId,
    sessionToken: sessionKey,
    isLegacySession: false,
  };
  const result: SummarizeResult = {
    processedCount: 0,
    newMailCount: 0,
    updatedMailCount: 0,
    newEventCount: 0,
    updatedEventCount: 0,
    newSenderCount: 0,
    updatedSenderCount: 0,
    errors: [],
    horizon: `${windowDays}d`,
  };

  onProgress?.({
    phase: "fetch",
    message: `正在拉取近 ${windowDays} 天邮件...`,
    processed: 0,
    total: limit,
  });

  const recentMails = await fetchRecentMailList(sourceContext, limit, windowDays, onProgress);
  if (recentMails.length === 0) {
    onProgress?.({
      phase: "done",
      message: `近 ${windowDays} 天内没有可处理的邮件。`,
      processed: 0,
      total: 0,
    });
    return result;
  }

  const newMails = recentMails.filter((mail) => !store.getMailByRawId(mail.id));
  result.processedCount = recentMails.length - newMails.length;

  onProgress?.({
    phase: "fetch",
    message: `近 ${windowDays} 天共发现 ${recentMails.length} 封邮件，其中 ${newMails.length} 封需要新归纳。`,
    processed: result.processedCount,
    total: recentMails.length,
  });

  if (newMails.length === 0) {
    onProgress?.({
      phase: "done",
      message: "旧有邮件已经全部归档，无需重复处理。",
      processed: recentMails.length,
      total: recentMails.length,
    });
    return result;
  }

  const batchTotal = Math.ceil(newMails.length / ANALYSIS_BATCH_SIZE);
  for (let index = 0; index < newMails.length; index += ANALYSIS_BATCH_SIZE) {
    const batchIndex = Math.floor(index / ANALYSIS_BATCH_SIZE) + 1;
    const rawBatch = newMails.slice(index, index + ANALYSIS_BATCH_SIZE);
    const existingEvents = store.getAllEvents().map((event) => ({
      id: event.eventId,
      title: event.name,
      summaryText: event.summary,
      keyInfo: event.keyInfo.join("; "),
    }));
    const existingSenders = store.getAllPersons().map((person) => ({
      id: person.personId,
      email: person.email,
      displayName: person.name,
      summaryText: person.profile,
      keyInfo: person.role,
    }));
    onProgress?.({
      phase: "analyze",
      message: `正在准备第 ${batchIndex}/${batchTotal} 批邮件正文...`,
      processed: index,
      total: newMails.length,
      batchIndex,
      batchTotal,
      errors: result.errors.length,
    });

    try {
      const batch = await hydrateBatchBodies(rawBatch, sourceContext);
      onProgress?.({
        phase: "analyze",
        message: `正在分析第 ${batchIndex}/${batchTotal} 批邮件（${batch.length} 封）...`,
        processed: index,
        total: newMails.length,
        batchIndex,
        batchTotal,
        errors: result.errors.length,
      });
      const analyses = await analyzeMailsWithAgent(
        batch,
        existingEvents,
        existingSenders,
        logger,
        llmGateway,
        tenant
      );
      onProgress?.({
        phase: "persist",
        message: `正在写入第 ${batchIndex}/${batchTotal} 批结果...`,
        processed: index,
        total: newMails.length,
        batchIndex,
        batchTotal,
        errors: result.errors.length,
      });
      await persistAnalyses(userId, sourceContext.sourceId, batch, analyses, result);
      onProgress?.({
        phase: "persist",
        message: `第 ${batchIndex}/${batchTotal} 批完成，累计归纳 ${result.newMailCount + result.updatedMailCount} 封。`,
        processed: Math.min(index + batch.length, newMails.length),
        total: newMails.length,
        batchIndex,
        batchTotal,
        errors: result.errors.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ batchIndex, message }, "Mail batch analysis failed");
      result.errors.push(`批次 ${batchIndex}: ${message}`);
      onProgress?.({
        phase: "analyze",
        message: `第 ${batchIndex}/${batchTotal} 批失败：${message}`,
        processed: Math.min(index + rawBatch.length, newMails.length),
        total: newMails.length,
        batchIndex,
        batchTotal,
        errors: result.errors.length,
      });
    }
  }

  onProgress?.({
    phase: "done",
    message: `旧邮件归纳完成：新增 ${result.newMailCount} 封，更新 ${result.updatedMailCount} 封，失败 ${result.errors.length} 封。`,
    processed: newMails.length,
    total: newMails.length,
    errors: result.errors.length,
  });
  return result;
}

export async function summarizeSingleMail(
  userId: string,
  sourceId: string,
  messageId: string,
  sessionKey: string,
  logger: FastifyBaseLogger,
  sourceContext?: MailSourceContext
): Promise<void> {
  const detail = await getMailMessageById(messageId, sourceContext);
  const mailItem: OutlookMailItem = normalizeOutlookMessage(
    {
      id: detail.id,
      subject: detail.subject,
      from: {
        emailAddress: {
          address: detail.fromAddress,
          name: detail.fromName,
        },
      },
      bodyPreview: detail.bodyPreview,
      body: { content: detail.bodyContent },
      receivedDateTime: detail.receivedDateTime,
      importance: detail.importance,
      isRead: detail.isRead,
      hasAttachments: detail.hasAttachments,
      webLink: detail.webLink,
    },
    sourceId
  );
  const store = await getMailKnowledgeBaseStore(userId, sourceId);
  const llmGateway = new LlmGatewayService(logger);
  const tenant: TenantContext = {
    ...(sourceContext ?? { sourceId }),
    tenantId: personalTenantIdForUser(userId),
    userId,
    sourceId,
    sessionToken: sessionKey,
    isLegacySession: false,
  };
  const analyses = await analyzeMailsWithAgent(
    [mailItem],
    store.getAllEvents().map((event) => ({
      id: event.eventId,
      title: event.name,
      summaryText: event.summary,
      keyInfo: event.keyInfo.join("; "),
    })),
    store.getAllPersons().map((person) => ({
      id: person.personId,
      email: person.email,
      displayName: person.name,
      summaryText: person.profile,
      keyInfo: person.role,
    })),
    logger,
    llmGateway,
    tenant
  );
  const dummyResult: SummarizeResult = {
    processedCount: 0,
    newMailCount: 0,
    updatedMailCount: 0,
    newEventCount: 0,
    updatedEventCount: 0,
    newSenderCount: 0,
    updatedSenderCount: 0,
    errors: [],
    horizon: `${DEFAULT_BACKFILL_WINDOW_DAYS}d`,
  };
  await persistAnalyses(userId, sourceId, [mailItem], analyses, dummyResult);
}

export interface MailSummaryDoc {
  mailId: string;
  externalMsgId: string;
  subject: string;
  summaryText: string;
  importanceScore: number;
  urgencyScore: number;
  quadrant: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  eventId: string | null;
  eventTitle: string | null;
  processedAt: string;
  webLink?: string;
  knowledgeCard?: {
    savedAt: string;
    tags: string[];
  };
}

export async function queryMailSummaries(
  userId: string,
  sourceId: string,
  limit = 50,
  quadrant?: string
): Promise<MailSummaryDoc[]> {
  const store = await getMailKnowledgeBaseStore(userId, sourceId);
  return store
    .getAllMails(limit)
    .filter((mail) => (quadrant ? mail.quadrant === quadrant : true))
    .map((mail) => {
      const person = store.getPersonById(mail.personId);
      const event = mail.eventId ? store.getEventById(mail.eventId) : null;
      return {
        mailId: mail.mailId,
        externalMsgId: mail.rawId,
        subject: mail.subject,
        summaryText: mail.summary,
        importanceScore: mail.importanceScore,
        urgencyScore: mail.urgencyScore,
        quadrant: mail.quadrant,
        senderId: mail.personId,
        senderEmail: person?.email ?? "",
        senderName: person?.name ?? "",
        eventId: mail.eventId,
        eventTitle: event?.name ?? null,
        processedAt: mail.processedAt,
        ...(mail.webLink ? { webLink: mail.webLink } : {}),
        ...(mail.knowledgeCard ? { knowledgeCard: mail.knowledgeCard } : {}),
      };
    });
}

export interface EventDoc {
  eventId: string;
  title: string;
  summaryText: string;
  keyInfo: Record<string, unknown>;
  relatedMailCount: number;
  lastMailAt: string;
}

export async function queryEvents(
  userId: string,
  sourceId: string,
  limit = 20
): Promise<EventDoc[]> {
  const store = await getMailKnowledgeBaseStore(userId, sourceId);
  return store.getAllEvents().slice(0, limit).map((event) => ({
    eventId: event.eventId,
    title: event.name,
    summaryText: event.summary,
    keyInfo: Object.fromEntries(event.keyInfo.map((line, index) => [`item_${index + 1}`, line])),
    relatedMailCount: event.relatedMailIds.length,
    lastMailAt: event.lastUpdated,
  }));
}

export interface SenderDoc {
  senderId: string;
  email: string;
  displayName: string;
  summaryText: string;
  keyInfo: Record<string, unknown>;
  totalMailCount: number;
  lastMailAt: string;
}

export async function querySenderProfiles(
  userId: string,
  sourceId: string,
  limit = 50
): Promise<SenderDoc[]> {
  const store = await getMailKnowledgeBaseStore(userId, sourceId);
  return store.getAllPersons().slice(0, limit).map((person) => ({
    senderId: person.personId,
    email: person.email,
    displayName: person.name,
    summaryText: person.profile,
    keyInfo: {
      role: person.role,
      importance: person.importance,
    },
    totalMailCount: person.recentInteractions,
    lastMailAt: person.lastUpdated,
  }));
}

export async function searchKnowledgeBaseMailSummaries(
  userId: string,
  sourceId: string,
  query: string,
  limit = 10
): Promise<MailSummaryDoc[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  const store = await getMailKnowledgeBaseStore(userId, sourceId);
  const summaries = store.getAllMails().map((mail) => {
    const person = store.getPersonById(mail.personId);
      const event = mail.eventId ? store.getEventById(mail.eventId) : null;
      return {
      mailId: mail.mailId,
      externalMsgId: mail.rawId,
      subject: mail.subject,
      summaryText: mail.summary,
      importanceScore: mail.importanceScore,
      urgencyScore: mail.urgencyScore,
      quadrant: mail.quadrant,
      senderId: mail.personId,
      senderEmail: person?.email ?? "",
      senderName: person?.name ?? "",
        eventId: mail.eventId,
        eventTitle: event?.name ?? null,
        processedAt: mail.processedAt,
        ...(mail.webLink ? { webLink: mail.webLink } : {}),
        ...(mail.knowledgeCard ? { knowledgeCard: mail.knowledgeCard } : {}),
      };
    });
  return summaries
    .filter((mail) =>
      [
        mail.subject,
        mail.summaryText,
        mail.senderEmail,
        mail.senderName,
        mail.eventTitle ?? "",
        ...(mail.knowledgeCard?.tags ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    )
    .slice(0, limit);
}
