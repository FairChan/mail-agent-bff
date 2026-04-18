/**
 * Knowledge Base Service
 * 负责旧邮件归纳任务的启动、进度跟踪、日志可视化和文档导出。
 */

import type { FastifyBaseLogger } from "fastify";
import type { MailSourceContext } from "./mail.js";
import {
  summarizeMailInbox,
  type SummarizeMailInboxOptions,
  type SummarizeProgressUpdate,
  type SummarizeResult,
} from "./summary.js";
import {
  exportMailKnowledgeBaseDocuments,
  type MailKnowledgeBaseExportReport,
} from "./mail-kb-export.js";

export type KnowledgeBaseJobStatus = "pending" | "running" | "completed" | "failed";
export type KnowledgeBaseLogLevel = "info" | "warn" | "error";

export interface KnowledgeBaseJobLog {
  timestamp: string;
  level: KnowledgeBaseLogLevel;
  message: string;
  phase?: SummarizeProgressUpdate["phase"] | "export";
  processed?: number;
  total?: number;
}

export interface KnowledgeBaseJob {
  jobId: string;
  userId: string;
  sourceId: string;
  status: KnowledgeBaseJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  progress: {
    phase: SummarizeProgressUpdate["phase"] | "export" | "idle";
    message: string;
    processed: number;
    total: number;
  };
  logs: KnowledgeBaseJobLog[];
  result?: SummarizeResult;
  exportReport?: MailKnowledgeBaseExportReport;
}

export interface TriggerMailSummaryInput {
  userId: string;
  sourceId: string;
  sourceContext: MailSourceContext;
  sessionKey: string;
  logger: FastifyBaseLogger;
  limit?: number;
  windowDays?: number;
}

const knowledgeBaseJobs = new Map<string, KnowledgeBaseJob>();
const MAX_JOB_LOGS = 800;
const MAX_JOBS = 200;
const JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24小时自动清理
const DEFAULT_BACKFILL_LIMIT = 250;

function generateJobId(): string {
  const now = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `KB-${now}-${random}`;
}

function getJobOrThrow(jobId: string): KnowledgeBaseJob {
  const job = knowledgeBaseJobs.get(jobId);
  if (!job) {
    throw new Error(`Knowledge base job not found: ${jobId}`);
  }
  return job;
}

function cleanupStaleJobs(): void {
  const now = Date.now();
  for (const [jobId, job] of knowledgeBaseJobs.entries()) {
    if (job.status === "completed" || job.status === "failed") {
      const elapsed = now - new Date(job.completedAt ?? job.createdAt).getTime();
      if (elapsed > JOB_TTL_MS) {
        knowledgeBaseJobs.delete(jobId);
      }
    }
  }
}

function pushJobLog(
  job: KnowledgeBaseJob,
  level: KnowledgeBaseLogLevel,
  message: string,
  progress?: {
    phase?: SummarizeProgressUpdate["phase"] | "export";
    processed?: number;
    total?: number;
  }
): void {
  job.logs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    phase: progress?.phase,
    processed: progress?.processed,
    total: progress?.total,
  });
  if (job.logs.length > MAX_JOB_LOGS) {
    job.logs.splice(0, job.logs.length - MAX_JOB_LOGS);
  }
}

function enforceJobLimit(): void {
  cleanupStaleJobs();
  if (knowledgeBaseJobs.size <= MAX_JOBS) {
    return;
  }
  const allJobs = Array.from(knowledgeBaseJobs.values()).sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
  const removable = allJobs.filter((job) => job.status === "completed" || job.status === "failed");
  const removeCount = Math.min(removable.length, knowledgeBaseJobs.size - MAX_JOBS);
  for (let index = 0; index < removeCount; index += 1) {
    knowledgeBaseJobs.delete(removable[index].jobId);
  }
}

async function runKnowledgeBaseJob(jobId: string, input: TriggerMailSummaryInput): Promise<void> {
  const { userId, sourceId, sourceContext, sessionKey, logger, limit, windowDays } = input;
  const job = getJobOrThrow(jobId);
  const resolvedWindowDays = Number.isFinite(windowDays) ? Math.max(1, Math.min(90, Math.floor(Number(windowDays)))) : 30;

  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.progress = {
    phase: "fetch",
    message: `任务启动，准备拉取近 ${resolvedWindowDays} 天邮件...`,
    processed: 0,
    total: 0,
  };
  pushJobLog(job, "info", "任务开始执行。", {
    phase: "fetch",
    processed: 0,
    total: 0,
  });

  const onProgress: NonNullable<SummarizeMailInboxOptions["onProgress"]> = (update) => {
    const liveJob = getJobOrThrow(jobId);
    liveJob.progress = {
      phase: update.phase,
      message: update.message,
      processed: update.processed,
      total: update.total,
    };
    pushJobLog(liveJob, update.errors && update.errors > 0 ? "warn" : "info", update.message, {
      phase: update.phase,
      processed: update.processed,
      total: update.total,
    });
  };

  try {
    const result = await summarizeMailInbox(
      userId,
      sourceContext,
      sessionKey,
      logger,
      limit,
      { onProgress, windowDays: resolvedWindowDays }
    );

    const liveJob = getJobOrThrow(jobId);
    liveJob.result = result;
    pushJobLog(liveJob, "info", "邮件归纳完成，开始导出知识库文档...", {
      phase: "export",
      processed: result.newMailCount,
      total: result.newMailCount,
    });
    liveJob.progress = {
      phase: "export",
      message: "正在导出知识库文档...",
      processed: result.newMailCount,
      total: result.newMailCount,
    };

    const exportReport = await exportMailKnowledgeBaseDocuments({
      userId,
      sourceId,
      logger,
      backfillCompleted: true,
      note: "旧有邮件信息已完成归档，可直接用于问答检索。",
      logProgress: (level, message) => {
        const currentJob = getJobOrThrow(jobId);
        pushJobLog(currentJob, level, message, { phase: "export" });
      },
    });

    const doneJob = getJobOrThrow(jobId);
    doneJob.exportReport = exportReport;
    doneJob.status = "completed";
    doneJob.completedAt = new Date().toISOString();
    doneJob.progress = {
      phase: "done",
      message: "旧邮件归纳和知识库落盘全部完成。",
      processed: exportReport.mailCount,
      total: exportReport.mailCount,
    };

    pushJobLog(doneJob, "info", "任务完成：旧邮件信息已全部归档，可直接用于问答检索。", {
      phase: "done",
      processed: exportReport.mailCount,
      total: exportReport.mailCount,
    });
  } catch (error) {
    const failedJob = getJobOrThrow(jobId);
    const message = error instanceof Error ? error.message : "Unknown error";
    failedJob.status = "failed";
    failedJob.error = message;
    failedJob.completedAt = new Date().toISOString();
    failedJob.progress = {
      phase: "done",
      message: "任务失败，请检查日志。",
      processed: failedJob.progress.processed,
      total: failedJob.progress.total,
    };
    pushJobLog(failedJob, "error", `任务失败：${message}`, { phase: "done" });
  } finally {
    enforceJobLimit();
  }
}

export async function triggerMailSummary(
  input: TriggerMailSummaryInput
): Promise<{ jobId: string }> {
  const runningJob = Array.from(knowledgeBaseJobs.values())
    .filter(
      (job) =>
        job.userId === input.userId &&
        job.sourceId === input.sourceId &&
        (job.status === "pending" || job.status === "running")
    )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
  if (runningJob) {
    return { jobId: runningJob.jobId };
  }

  const jobId = generateJobId();
  const now = new Date().toISOString();
  const job: KnowledgeBaseJob = {
    jobId,
    userId: input.userId,
    sourceId: input.sourceId,
    status: "pending",
    createdAt: now,
    progress: {
      phase: "idle",
      message: "任务已创建，等待执行。",
      processed: 0,
      total: 0,
    },
    logs: [
      {
        timestamp: now,
        level: "info",
        message: "任务已创建。",
        phase: "fetch",
        processed: 0,
        total: 0,
      },
    ],
  };

  knowledgeBaseJobs.set(jobId, job);
  queueMicrotask(() => {
    void runKnowledgeBaseJob(jobId, {
      ...input,
      limit: input.limit ?? DEFAULT_BACKFILL_LIMIT,
    });
  });
  enforceJobLimit();
  return { jobId };
}

export function getKnowledgeBaseJob(jobId: string, userId: string): KnowledgeBaseJob | undefined {
  const job = knowledgeBaseJobs.get(jobId);
  if (!job) return undefined;
  if (job.userId !== userId) return undefined;
  return job;
}

export function listKnowledgeBaseJobs(userId: string): KnowledgeBaseJob[] {
  return Array.from(knowledgeBaseJobs.values())
    .filter((job) => job.userId === userId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getLatestKnowledgeBaseJob(
  userId: string,
  sourceId: string
): KnowledgeBaseJob | undefined {
  return Array.from(knowledgeBaseJobs.values())
    .filter((job) => job.userId === userId && job.sourceId === sourceId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
}
