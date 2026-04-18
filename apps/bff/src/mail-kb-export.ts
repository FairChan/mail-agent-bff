import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type { MailKnowledgeRecord, MailScoreScale } from "@mail-agent/shared-types";
import { getMailKnowledgeBaseStore, type MailKnowledgeBaselineStatus } from "./mail-kb-store.js";

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
  backfillCompleted?: boolean;
  note?: string;
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

function sanitizeMarkdownText(value: string): string {
  return value
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1")
    .trim();
}

function toMarkdownTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [header, divider, body].join("\n");
}

function resolveScoreScale(mail: Pick<MailKnowledgeRecord, "importanceScore" | "urgencyScore" | "scoreScale">): MailScoreScale {
  if (mail.scoreScale === "ratio" || mail.scoreScale === "ten") {
    return mail.scoreScale;
  }
  return mail.importanceScore > 1 || mail.urgencyScore > 1 ? "ten" : "ratio";
}

function scoreScaleLabel(scale: MailScoreScale): string {
  return scale === "ten" ? "1-10 分制" : "0-1 比例";
}

function formatScoreForExport(score: number, scale: MailScoreScale): string {
  if (!Number.isFinite(score)) {
    return "-";
  }
  if (scale === "ten") {
    return `${Number(Math.max(0, Math.min(10, score)).toFixed(2)).toString()}/10`;
  }
  return `${Number(Math.max(0, Math.min(1, score)).toFixed(3)).toString()}/1`;
}

export async function exportMailKnowledgeBaseDocuments(
  options: ExportMailKnowledgeBaseOptions
): Promise<MailKnowledgeBaseExportReport> {
  const {
    userId,
    sourceId,
    logger,
    logProgress,
    backfillCompleted = false,
    note,
  } = options;
  const store = await getMailKnowledgeBaseStore(userId, sourceId);
  const paths = store.getPaths();
  const mailRows = store.getAllMails();
  const eventRows = store.getAllEvents();
  const personRows = store.getAllPersons();
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

  const baselineStatus: MailKnowledgeBaselineStatus = {
    backfillCompleted,
    exportedAt: nowIso,
    userId,
    sourceId,
    mailCount: mailRows.length,
    eventCount: eventRows.length,
    personCount: personRows.length,
    note:
      note ??
      (backfillCompleted
        ? "旧有邮件信息已完成归档，可直接用于问答检索。"
        : "当前仅完成文档导出，历史邮件归纳任务尚未确认全部完成。"),
  };

  writeText(
    paths.mailIdsDocPath,
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
    paths.mailSubjectDocPath,
    [
      "# 邮件题目索引（题目 + 标识码）",
      "",
      `生成时间：${nowIso}`,
      "",
      toMarkdownTable(
        ["标识码", "题目", "接收时间"],
        mailRows.map((mail) => [mail.mailId, sanitizeMarkdownText(mail.subject), mail.receivedAt])
      ),
      "",
    ].join("\n")
  );

  writeText(
    paths.mailScoreDocPath,
    [
      "# 邮件评分索引（重要性 + 紧急性）",
      "",
      `生成时间：${nowIso}`,
      "",
      toMarkdownTable(
        ["标识码", "重要性", "紧急性", "分数制", "象限"],
        mailRows.map((mail) => {
          const scale = resolveScoreScale(mail);
          return [
            mail.mailId,
            formatScoreForExport(mail.importanceScore, scale),
            formatScoreForExport(mail.urgencyScore, scale),
            scoreScaleLabel(scale),
            mail.quadrant,
          ];
        })
      ),
      "",
    ].join("\n")
  );

  writeText(
    paths.mailSummaryDocPath,
    [
      "# 邮件总结正文库",
      "",
      `生成时间：${nowIso}`,
      `邮件总数：${mailRows.length}`,
      "",
      ...mailRows.flatMap((mail) => [
        `## ${mail.mailId} | ${sanitizeMarkdownText(mail.subject)}`,
        `- 原始ID：${mail.rawId}`,
        `- 发件人ID：${mail.personId}`,
        `- 事件ID：${mail.eventId ?? "无"}`,
        `- 分数制：${scoreScaleLabel(resolveScoreScale(mail))}`,
        `- 重要性：${formatScoreForExport(mail.importanceScore, resolveScoreScale(mail))}`,
        `- 紧急性：${formatScoreForExport(mail.urgencyScore, resolveScoreScale(mail))}`,
        `- 象限：${mail.quadrant}`,
        `- 接收时间：${mail.receivedAt}`,
        "",
        sanitizeMarkdownText(mail.summary),
        "",
      ]),
    ].join("\n")
  );

  writeText(
    paths.eventDocPath,
    [
      "# 事件聚类索引（事件ID + 归纳总结）",
      "",
      `生成时间：${nowIso}`,
      `事件总数：${eventRows.length}`,
      "",
      ...eventRows.flatMap((event) => [
        `## ${event.eventId} | ${sanitizeMarkdownText(event.name)}`,
        `- 关联邮件数：${event.relatedMailIds.length}`,
        `- 最后更新：${event.lastUpdated}`,
        `- 标签：${event.tags.map((tag) => sanitizeMarkdownText(tag)).join(", ") || "无"}`,
        "",
        "### 事件归纳",
        sanitizeMarkdownText(event.summary),
        "",
        "### 关键信息",
        ...(event.keyInfo.length > 0
          ? event.keyInfo.map((line) => `- ${sanitizeMarkdownText(line)}`)
          : ["- 无"]),
        "",
        "### 关联邮件ID",
        ...(event.relatedMailIds.length > 0
          ? event.relatedMailIds.map((mailId) => `- ${mailId}`)
          : ["- 无"]),
        "",
      ]),
    ].join("\n")
  );

  writeText(
    paths.senderDocPath,
    [
      "# 发件人画像索引（人物ID + 归纳总结）",
      "",
      `生成时间：${nowIso}`,
      `发件人总数：${personRows.length}`,
      "",
      ...personRows.flatMap((person) => [
        `## ${person.personId} | ${sanitizeMarkdownText(person.name)}`,
        `- 邮箱：${sanitizeMarkdownText(person.email)}`,
        `- 角色：${sanitizeMarkdownText(person.role)}`,
        `- 重要度：${person.importance}`,
        `- 交互次数：${person.recentInteractions}`,
        `- 最后更新：${person.lastUpdated}`,
        "",
        "### 人物画像",
        sanitizeMarkdownText(person.profile),
        "",
      ]),
    ].join("\n")
  );

  writeJson(paths.baselineStatusPath, baselineStatus);

  const report: MailKnowledgeBaseExportReport = {
    exportedAt: nowIso,
    userId,
    sourceId,
    mailCount: mailRows.length,
    eventCount: eventRows.length,
    personCount: personRows.length,
    files: [
      paths.mailIdsDocPath,
      paths.mailSubjectDocPath,
      paths.mailScoreDocPath,
      paths.mailSummaryDocPath,
      paths.eventDocPath,
      paths.senderDocPath,
      paths.baselineStatusPath,
      paths.mailIndexPath,
      paths.eventIndexPath,
      paths.personIndexPath,
    ],
  };

  writeJson(paths.exportReportPath, report);
  log("info", `知识库文档导出完成：邮件 ${report.mailCount}，事件 ${report.eventCount}，人物 ${report.personCount}。`);
  return report;
}
