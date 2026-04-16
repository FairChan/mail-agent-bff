/**
 * 邮件智能总结归纳系统
 *
 * 功能：
 * 1. 邮件唯一标识码生成 + 总结
 * 2. 邮件评分（重要性 + 紧急性）
 * 3. 事件聚类
 * 4. 发件人脸谱画像
 * 5. 自然语言触发总结 API
 */

import { invokeTool } from "./gateway.js";
import { env } from "./config.js";
import {
  type MailSourceContext,
  type MailDetailResponse,
  queryInboxMessagesForSource,
  getMailMessageById,
} from "./mail.js";
import { getPrismaClient } from "./persistence.js";
import type { FastifyBaseLogger } from "fastify";
import { mailKnowledgeBase } from "./mail-kb-service.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const MAX_EMAILS_PER_BATCH = 30;   // 每次最多处理邮件数

// ---------------------------------------------------------------------------
// ID 生成器（基于内容哈希，稳定可复现）
// ---------------------------------------------------------------------------

/** 对字符串求稳定 hash，用于生成唯一标识码 */
function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

/**
 * 邮件唯一标识码生成（身份证）
 * ID格式：MSG_{stableHash(sourceId + "::" + externalMsgId)}
 * 基于内容哈希，保证同一封邮件生成相同的ID
 */
export function makeMailId(sourceId: string, externalMsgId: string): string {
  return `MSG_${stableHash(sourceId + "::" + externalMsgId)}`;
}

/**
 * 事件唯一标识码
 * ID格式：EVT_{stableHash(userId + "::" + eventHash)}
 * eventHash 可以是事件标题的哈希或主题关键词
 */
export function makeEventId(userId: string, eventHash: string): string {
  return `EVT_${stableHash(userId + "::" + eventHash)}`;
}

/**
 * 发件人唯一标识码（脸谱画像ID）
 * ID格式：PER_{stableHash(userId + "::" + email)}
 * 邮箱小写后哈希，保证同一发件人始终生成相同ID
 */
export function makeSenderId(userId: string, email: string): string {
  return `PER_${stableHash(userId + "::" + email.toLowerCase())}`;
}

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

interface OutlookMailItem {
  mailId: string;  // 唯一标识码（身份证）
  id: string;      // 邮件在 Outlook 中的原始 ID
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
  importanceScore: number; // 0-1
  urgencyScore: number;  // 0-1
  quadrant: string;
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
  senderKeyInfo: Record<string, unknown>;
  senderSummaryUpdate: string | null;
}

// ---------------------------------------------------------------------------
// 邮件数据获取
// ---------------------------------------------------------------------------

/** 从 Outlook 获取邮件列表（复用 mail.ts 的解析逻辑） */
async function fetchMailList(
  limit: number,
  sourceContext?: MailSourceContext
): Promise<OutlookMailItem[]> {
  const messages = await queryInboxMessagesForSource(limit, sourceContext);
  return messages.map(normalizeOutlookMessage);
}

/** 从 Outlook 获取单封邮件正文 */
async function fetchMailBody(
  messageId: string,
  sourceContext?: MailSourceContext
): Promise<string> {
  try {
    const msg = await getMailMessageById(messageId, sourceContext);
    if (!msg) return "";
    // 移除 HTML 标签
    return msg.bodyContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
  } catch {
    return "";
  }
}

/** 将 OutlookMessage 转为我们需要的格式 */
function normalizeOutlookMessage(msg: { id?: string; subject?: string; from?: { emailAddress?: { address?: string; name?: string } }; bodyPreview?: string; body?: { content?: string }; receivedDateTime?: string; importance?: string; isRead?: boolean; hasAttachments?: boolean; webLink?: string }): OutlookMailItem {
  const from = msg.from?.emailAddress;
  const externalId = msg.id ?? "";
  return {
    mailId: `MSG_${stableHash(externalId)}`,
    id: externalId,
    subject: msg.subject ?? "(无主题)",
    fromAddress: from?.address ?? "",
    fromName: from?.name ?? from?.address ?? "未知发件人",
    bodyPreview: msg.bodyPreview ?? "",
    bodyContent: msg.body?.content ?? "",
    receivedDateTime: msg.receivedDateTime ?? new Date().toISOString(),
    importance: msg.importance ?? "normal",
    isRead: msg.isRead ?? true,
    hasAttachments: msg.hasAttachments ?? false,
    webLink: msg.webLink ?? "",
  };
}

// ---------------------------------------------------------------------------
// OpenClaw Agent 分析（调用 LLM）
// ---------------------------------------------------------------------------

const ANALYSIS_PROMPT_TEMPLATE = (
  mails: Array<{
    mailId: string;
    subject: string;
    fromAddress: string;
    fromName: string;
    bodyPreview: string;
    bodyContent: string;
    receivedDateTime: string;
    importance: string;
    isRead: boolean;
    hasAttachments: boolean;
  }>,
  existingEvents: Array<{ id: string; title: string; summaryText: string; keyInfo: string }>,
  existingSenders: Array<{ id: string; email: string; displayName: string; summaryText: string; keyInfo: string }>
): string => `你是一个邮件智能分析助手，代号 Mery。请对用户近一个月的 {N} 封邮件进行深度总结归纳。

## 分析要求

对每一封邮件，你需要输出以下信息：

1. **邮件唯一标识码**：直接使用原始 mailId，不可更改
2. **邮件归纳总结**：用中文总结这封邮件的核心内容
3. **重要性评分**（0-1）：考虑发件人身份、邮件内容与用户工作的相关性
4. **紧急性评分**（0-1）：考虑截止日期、催促语气、时效性等
5. **象限分类**：
   - urgent_important（紧急且重要）
   - not_urgent_important（重要不紧急）
   - urgent_not_important（紧急不重要）
   - not_urgent_not_important（不紧急不重要）
6. **打分理由**：简要说明评分依据

## 事件聚类

将相同话题/项目的邮件归为同一事件。若某封邮件与已有事件相关，请使用已有事件ID；否则创建新事件。

**已有事件列表**：
${existingEvents.length > 0 ? existingEvents.map(e => `- ${e.id}: ${e.title}（${e.summaryText.slice(0, 80)}...）`).join("\n") : "（暂无历史事件）"}

对每封邮件判断：
- 若与已有事件相关：返回已有事件ID，并在 eventSummaryUpdate 中提供该事件的最新总结更新
- 若为全新事件：返回新事件ID（格式：EVT_xxxxxx）和 eventTitle、eventSummary、eventKeyInfo

## 发件人画像

**已有发件人列表**：
${existingSenders.length > 0 ? existingSenders.map(s => `- ${s.id} (${s.email}): ${s.summaryText.slice(0, 60)}...`).join("\n") : "（暂无历史发件人画像）"}

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
      "summaryText": "中文归纳总结（50-200字）",
      "importanceScore": 0.0-1.0,
      "urgencyScore": 0.0-1.0,
      "quadrant": "象限名称",
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

${mails.map((m, i) => `### 邮件 ${i + 1}（mailId: ${m.mailId}）
- 主题：${m.subject}
- 发件人：${m.fromName} <${m.fromAddress}>
- 时间：${m.receivedDateTime}
- 重要性标记：${m.importance}
- 已读状态：${m.isRead ? "已读" : "未读"}
- 有附件：${m.hasAttachments ? "是" : "否"}
- 内容预览：${m.bodyPreview || "(无)"}
- 正文内容：${(m.bodyContent || m.bodyPreview || "(无内容)").slice(0, 3000)}
${"---"}`).join("\n")}
`;

/**
 * 调用 OpenClaw Agent 分析一批邮件
 */
async function analyzeMailsWithAgent(
  mails: OutlookMailItem[],
  existingEvents: Array<{ id: string; title: string; summaryText: string; keyInfo: string }>,
  existingSenders: Array<{ id: string; email: string; displayName: string; summaryText: string; keyInfo: string }>,
  logger: FastifyBaseLogger,
  _sessionKey?: string
): Promise<MailAnalysis[]> {
  const prompt = ANALYSIS_PROMPT_TEMPLATE(mails, existingEvents, existingSenders);

  try {
    const apiKey = env.siliconFlowApiKey;
    const baseUrl = env.siliconFlowBaseUrl;
    const model = env.siliconFlowModel;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      throw new Error(`SiliconFlow API 错误 ${status}: ${text}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content ?? "";
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
    const parsed = JSON.parse(jsonStr) as { analyses: MailAnalysis[] };
    return parsed.analyses ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "SiliconFlow LLM summarization failed");
    throw new Error(`邮件分析失败：${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 核心总结流程
// ---------------------------------------------------------------------------

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
}

/**
 * 对用户近30天邮件进行完整总结归纳
 */
export async function summarizeMailInbox(
  userId: string,
  sourceContext: MailSourceContext,
  sessionKey: string,
  logger: FastifyBaseLogger,
  limit = MAX_EMAILS_PER_BATCH,
  options?: SummarizeMailInboxOptions
): Promise<SummarizeResult> {
  const onProgress = options?.onProgress;
  const prisma = await getPrismaClient(logger);
  if (!prisma) throw new Error("Prisma 不可用，无法存储总结数据");

  const result: SummarizeResult = {
    processedCount: 0,
    newMailCount: 0,
    updatedMailCount: 0,
    newEventCount: 0,
    updatedEventCount: 0,
    newSenderCount: 0,
    updatedSenderCount: 0,
    errors: [],
    horizon: "30d",
  };

  // 1. 获取近30天邮件
  onProgress?.({
    phase: "fetch",
    message: "正在拉取近30天邮件...",
    processed: 0,
    total: 0,
  });

  const rawMails = await fetchMailList(limit, sourceContext);
  onProgress?.({
    phase: "fetch",
    message: `邮件拉取完成，共 ${rawMails.length} 封。`,
    processed: rawMails.length,
    total: rawMails.length,
  });
  if (rawMails.length === 0) return result;

  // 2. 过滤掉已在数据库中处理过的邮件
  const externalIds = rawMails.map(m => m.id);
  const existingSummaries = await (prisma as any).mailSummary?.findMany({
    where: { userId, externalMsgId: { in: externalIds } },
    select: { externalMsgId: true },
  }).catch(() => []);

  const existingIds = new Set((existingSummaries ?? []).map((s: { externalMsgId: string }) => s.externalMsgId));
  const newMails = rawMails.filter(m => !existingIds.has(m.id));
  result.processedCount = rawMails.length - newMails.length;
  const discoveredNewMailCount = newMails.length;
  result.newMailCount = 0;
  onProgress?.({
    phase: "fetch",
    message: `识别到 ${discoveredNewMailCount} 封未归档邮件，已归档 ${result.processedCount} 封。`,
    processed: result.processedCount,
    total: rawMails.length,
  });
  if (newMails.length === 0) return result;

  // 3. 加载已有事件和发件人
  const existingEvents = await (prisma as any).mailEvent?.findMany({
    where: { userId },
    select: { id: true, title: true, summaryText: true, keyInfo: true },
  }).catch(() => []);

  const existingSenders = await (prisma as any).senderProfile?.findMany({
    where: { userId },
    select: { id: true, email: true, displayName: true, summaryText: true, keyInfo: true },
  }).catch(() => []);

  // 4. 分批处理（每批最多 5 封，防止 LLM context 溢出）
  const BATCH_SIZE = 5;
  const batchTotal = Math.ceil(newMails.length / BATCH_SIZE);
  for (let i = 0; i < newMails.length; i += BATCH_SIZE) {
    const batch = newMails.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    onProgress?.({
      phase: "analyze",
      message: `正在分析第 ${batchIndex}/${batchTotal} 批邮件（${batch.length} 封）...`,
      processed: i,
      total: newMails.length,
      batchIndex,
      batchTotal,
      errors: result.errors.length,
    });
    try {
      const analyses = await analyzeMailsWithAgent(
        batch,
        existingEvents as Array<{ id: string; title: string; summaryText: string; keyInfo: string }>,
        existingSenders as Array<{ id: string; email: string; displayName: string; summaryText: string; keyInfo: string }>,
        logger,
        sessionKey
      );
      onProgress?.({
        phase: "persist",
        message: `正在写入第 ${batchIndex}/${batchTotal} 批分析结果...`,
        processed: i,
        total: newMails.length,
        batchIndex,
        batchTotal,
        errors: result.errors.length,
      });
      await persistAnalyses(userId, sourceContext.sourceId, batch, analyses, prisma as any, result);
      onProgress?.({
        phase: "persist",
        message: `第 ${batchIndex}/${batchTotal} 批完成，累计新增归档 ${result.newMailCount} 封。`,
        processed: Math.min(i + batch.length, newMails.length),
        total: newMails.length,
        batchIndex,
        batchTotal,
        errors: result.errors.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`批次 ${Math.floor(i / BATCH_SIZE) + 1}: ${msg}`);
      logger.warn({ batch: Math.floor(i / BATCH_SIZE) + 1, error: msg }, "Mail batch analysis failed");
      onProgress?.({
        phase: "analyze",
        message: `第 ${batchIndex}/${batchTotal} 批失败：${msg}`,
        processed: Math.min(i + batch.length, newMails.length),
        total: newMails.length,
        batchIndex,
        batchTotal,
        errors: result.errors.length,
      });
    }
  }

  onProgress?.({
    phase: "done",
    message: `邮件归纳完成：新增 ${result.newMailCount} 封，失败 ${result.errors.length} 封。`,
    processed: newMails.length,
    total: newMails.length,
    errors: result.errors.length,
  });

  return result;
}

/**
 * 处理单封新邮件（增量更新）
 */
export async function summarizeSingleMail(
  userId: string,
  sourceId: string,
  messageId: string,
  sessionKey: string,
  logger: FastifyBaseLogger,
  sourceContext?: MailSourceContext
): Promise<void> {
  const prisma = await getPrismaClient(logger);
  if (!prisma) throw new Error("Prisma 不可用");

  const bodyContent = await fetchMailBody(messageId, sourceContext);
  const allMessages = await fetchMailList(1, sourceContext);
  const mailItem: OutlookMailItem = allMessages.find(m => m.id === messageId) ?? {
    mailId: `MSG_${stableHash(messageId)}`,
    id: messageId,
    subject: "(未知主题)",
    fromAddress: "",
    fromName: "未知",
    bodyPreview: bodyContent.slice(0, 200),
    bodyContent,
    receivedDateTime: new Date().toISOString(),
    importance: "normal",
    isRead: true,
    hasAttachments: false,
    webLink: "",
  };

  const existingEvents = await (prisma as any).mailEvent?.findMany({
    where: { userId },
    select: { id: true, title: true, summaryText: true, keyInfo: true },
  }).catch(() => []);

  const existingSenders = await (prisma as any).senderProfile?.findMany({
    where: { userId },
    select: { id: true, email: true, displayName: true, summaryText: true, keyInfo: true },
  }).catch(() => []);

  const analyses = await analyzeMailsWithAgent(
    [mailItem],
    existingEvents as Array<{ id: string; title: string; summaryText: string; keyInfo: string }>,
    existingSenders as Array<{ id: string; email: string; displayName: string; summaryText: string; keyInfo: string }>,
    logger,
    sessionKey
  );

  const dummyResult: SummarizeResult = {
    processedCount: 0, newMailCount: 0, updatedMailCount: 0,
    newEventCount: 0, updatedEventCount: 0, newSenderCount: 0, updatedSenderCount: 0,
    errors: [], horizon: "30d",
  };

  await persistAnalyses(userId, sourceId, [mailItem], analyses, prisma as any, dummyResult);
}

// ---------------------------------------------------------------------------
// 持久化分析结果
// ---------------------------------------------------------------------------

async function persistAnalyses(
  userId: string,
  sourceId: string,
  mails: OutlookMailItem[],
  analyses: MailAnalysis[],
  prisma: any,
  result: SummarizeResult
): Promise<void> {
  for (const mail of mails) {
    const analysis = analyses.find(a => a.mailId === mail.mailId);
    if (!analysis) continue;

    const mailId = mail.mailId;

    try {
      // --- 邮件总结 ---
      await prisma.mailSummary.upsert({
        where: { userId_externalMsgId: { userId, externalMsgId: mail.id } },
        update: {
          summaryText: analysis.summaryText,
          importanceScore: analysis.importanceScore,
          urgencyScore: analysis.urgencyScore,
          eventId: analysis.eventId,
          senderId: analysis.senderId,
          processedAt: new Date(),
        },
        create: {
          id: mailId,
          userId,
          sourceId,
          externalMsgId: mail.id,
          subject: mail.subject,
          summaryText: analysis.summaryText,
          importanceScore: analysis.importanceScore,
          urgencyScore: analysis.urgencyScore,
          eventId: analysis.eventId,
          senderId: analysis.senderId,
          processedAt: new Date(),
          horizon: "30d",
        },
      });
      result.newMailCount += 1;

      // --- 邮件评分 ---
      await prisma.mailScoreIndex.upsert({
        where: { mailId },
        update: {
          importanceScore: analysis.importanceScore,
          urgencyScore: analysis.urgencyScore,
          quadrant: analysis.quadrant,
          reasoning: analysis.scoreReasoning,
          updatedAt: new Date(),
        },
        create: {
          mailId,
          importanceScore: analysis.importanceScore,
          urgencyScore: analysis.urgencyScore,
          quadrant: analysis.quadrant,
          reasoning: analysis.scoreReasoning,
        },
      });

      // --- 题目索引 ---
      await prisma.subjectIndex.upsert({
        where: { mailId },
        update: { subject: mail.subject },
        create: { mailId, subject: mail.subject },
      });

      // --- 发件人画像 ---
      await upsertSender(prisma, userId, sourceId, mail, analysis, result);

      // --- 事件聚类 ---
      if (analysis.eventId && analysis.eventTitle) {
        await upsertEvent(prisma, userId, sourceId, mail, analysis, result);
      } else if (analysis.eventId && analysis.eventSummaryUpdate) {
        await prisma.mailEvent.updateMany({
          where: { id: analysis.eventId, userId },
          data: {
            summaryText: analysis.eventSummaryUpdate,
            relatedMailCount: { increment: 1 },
            lastMailAt: new Date(mail.receivedDateTime),
            updatedAt: new Date(),
          },
        });
        result.updatedEventCount += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`邮件 ${mail.id}: ${msg}`);
    }
  }
}

async function upsertSender(
  prisma: any,
  userId: string,
  sourceId: string,
  mail: OutlookMailItem,
  analysis: MailAnalysis,
  result: SummarizeResult
): Promise<void> {
  const senderId = makeSenderId(userId, mail.fromAddress);

  if (analysis.senderDecision === "new") {
    await prisma.senderProfile.upsert({
      where: { userId_email: { userId, email: mail.fromAddress.toLowerCase() } },
      update: {
        summaryText: analysis.senderSummary,
        keyInfo: JSON.stringify(analysis.senderKeyInfo ?? {}),
        totalMailCount: { increment: 1 },
        lastMailAt: new Date(mail.receivedDateTime),
        updatedAt: new Date(),
      },
      create: {
        id: senderId,
        userId,
        sourceId,
        email: mail.fromAddress.toLowerCase(),
        displayName: mail.fromName,
        summaryText: analysis.senderSummary,
        keyInfo: JSON.stringify(analysis.senderKeyInfo ?? {}),
        totalMailCount: 1,
        lastMailAt: new Date(mail.receivedDateTime),
      },
    });
    result.newSenderCount += 1;
  } else {
    await prisma.senderProfile.updateMany({
      where: { userId_email: { userId, email: mail.fromAddress.toLowerCase() } },
      data: {
        summaryText: analysis.senderSummaryUpdate ?? analysis.senderSummary,
        totalMailCount: { increment: 1 },
        lastMailAt: new Date(mail.receivedDateTime),
        updatedAt: new Date(),
      },
    });
    result.updatedSenderCount += 1;
  }
}

async function upsertEvent(
  prisma: any,
  userId: string,
  sourceId: string,
  mail: OutlookMailItem,
  analysis: MailAnalysis,
  result: SummarizeResult
): Promise<void> {
  if (!analysis.eventId) return;

  const isNew = analysis.eventDecision === "new";

  await prisma.mailEvent.upsert({
    where: { userId_id: { userId, id: analysis.eventId } },
    update: {
      summaryText: analysis.eventSummaryUpdate ?? analysis.eventSummary ?? "",
      keyInfo: JSON.stringify(analysis.eventKeyInfo ?? {}),
      relatedMailCount: { increment: 1 },
      lastMailAt: new Date(mail.receivedDateTime),
      updatedAt: new Date(),
    },
    create: {
      id: analysis.eventId,
      userId,
      sourceId,
      title: analysis.eventTitle ?? mail.subject,
      summaryText: analysis.eventSummary ?? analysis.summaryText,
      keyInfo: JSON.stringify(analysis.eventKeyInfo ?? {}),
      relatedMailCount: 1,
      lastMailAt: new Date(mail.receivedDateTime),
      firstMailAt: new Date(mail.receivedDateTime),
    },
  });

  if (isNew) result.newEventCount += 1;
  else result.updatedEventCount += 1;
}

// ---------------------------------------------------------------------------
// 数据查询 API（供前端读取）
// ---------------------------------------------------------------------------

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
}

export async function queryMailSummaries(
  userId: string,
  limit = 50,
  quadrant?: string
): Promise<MailSummaryDoc[]> {
  const prisma = await getPrismaClient(null as unknown as FastifyBaseLogger);
  if (!prisma) return [];

  const where: Record<string, unknown> = { userId };
  if (quadrant) {
    where.scoreRecord = { quadrant };
  }

  const records = await (prisma as any).mailSummary.findMany({
    where,
    include: {
      scoreRecord: true,
      sender: true,
      event: { select: { id: true, title: true } },
    },
    orderBy: { processedAt: "desc" },
    take: limit,
  });

  return records.map((r: any) => ({
    mailId: r.id,
    externalMsgId: r.externalMsgId,
    subject: r.subject,
    summaryText: r.summaryText,
    importanceScore: r.importanceScore,
    urgencyScore: r.urgencyScore,
    quadrant: r.scoreRecord?.quadrant ?? "unknown",
    senderId: r.sender?.id ?? "",
    senderEmail: r.sender?.email ?? "",
    senderName: r.sender?.displayName ?? "",
    eventId: r.event?.id ?? null,
    eventTitle: r.event?.title ?? null,
    processedAt: r.processedAt,
    webLink: r.webLink,
  }));
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
  limit = 20
): Promise<EventDoc[]> {
  const prisma = await getPrismaClient(null as unknown as FastifyBaseLogger);
  if (!prisma) return [];

  const records = await (prisma as any).mailEvent.findMany({
    where: { userId },
    orderBy: { lastMailAt: "desc" },
    take: limit,
  });

  return records.map((r: any) => ({
    eventId: r.id,
    title: r.title,
    summaryText: r.summaryText,
    keyInfo: safeParseJson(r.keyInfo, {}),
    relatedMailCount: r.relatedMailCount,
    lastMailAt: r.lastMailAt,
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
  limit = 50
): Promise<SenderDoc[]> {
  const prisma = await getPrismaClient(null as unknown as FastifyBaseLogger);
  if (!prisma) return [];

  const records = await (prisma as any).senderProfile.findMany({
    where: { userId },
    orderBy: { lastMailAt: "desc" },
    take: limit,
  });

  return records.map((r: any) => ({
    senderId: r.id,
    email: r.email,
    displayName: r.displayName,
    summaryText: r.summaryText,
    keyInfo: safeParseJson(r.keyInfo, {}),
    totalMailCount: r.totalMailCount,
    lastMailAt: r.lastMailAt,
  }));
}

function safeParseJson(str: string, fallback: unknown): unknown {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}
