/**
 * Mail Knowledge Base Progress Modal
 * 邮件知识库处理进度可视化对话框
 */

import { useEffect, useRef, useState } from "react";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  phase?: string;
  processed?: number;
  total?: number;
}

interface Progress {
  phase: string;
  message: string;
  processed: number;
  total: number;
}

interface JobStatus {
  jobId: string;
  sourceId?: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: Progress;
  error?: string;
  completedAt?: string;
  logs?: LogEntry[];
}

interface MailKBSummaryModalProps {
  jobId: string;
  onClose: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  idle: "等待开始",
  fetch: "拉取邮件",
  analyze: "AI 分析",
  persist: "写入知识库",
  export: "导出文档",
  done: "完成",
  error: "失败",
};

const PHASE_BADGE_CLASSES: Record<string, string> = {
  idle: "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100",
  fetch: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  analyze: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-200",
  persist: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  export: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  error: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
};

function createEmptyJob(jobId: string): JobStatus {
  return {
    jobId,
    status: "pending",
    progress: {
      phase: "idle",
      message: "任务已创建，等待执行。",
      processed: 0,
      total: 0,
    },
  };
}

function normalizeProgress(raw: unknown, fallback: Progress): Progress {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const value = raw as Partial<Progress>;
  return {
    phase: typeof value.phase === "string" ? value.phase : fallback.phase,
    message: typeof value.message === "string" ? value.message : fallback.message,
    processed: Number.isFinite(value.processed) ? Number(value.processed) : fallback.processed,
    total: Number.isFinite(value.total) ? Number(value.total) : fallback.total,
  };
}

function normalizeJob(raw: unknown, jobId: string): JobStatus {
  const fallback = createEmptyJob(jobId);
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const value = raw as Partial<JobStatus> & { finishedAt?: string };
  const progress = normalizeProgress(value.progress, fallback.progress);
  const status =
    value.status === "running" ||
    value.status === "completed" ||
    value.status === "failed" ||
    value.status === "pending"
      ? value.status
      : fallback.status;

  return {
    jobId: typeof value.jobId === "string" ? value.jobId : jobId,
    sourceId: typeof value.sourceId === "string" ? value.sourceId : undefined,
    status,
    progress,
    error: typeof value.error === "string" ? value.error : undefined,
    completedAt:
      typeof value.completedAt === "string"
        ? value.completedAt
        : typeof value.finishedAt === "string"
          ? value.finishedAt
          : undefined,
    logs: Array.isArray(value.logs) ? value.logs : [],
  };
}

function parseJsonData<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mergeLogEntries(primary: LogEntry[], secondary: LogEntry[]): LogEntry[] {
  const seen = new Set<string>();
  const merged: LogEntry[] = [];

  for (const entry of [...primary, ...secondary]) {
    const key = `${entry.timestamp}|${entry.level}|${entry.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(entry);
  }

  return merged.slice(-800);
}

function statusRank(status: JobStatus["status"]): number {
  if (status === "completed" || status === "failed") {
    return 3;
  }
  if (status === "running") {
    return 2;
  }
  return 1;
}

function mergeJobState(current: JobStatus, incoming: JobStatus): JobStatus {
  const preferIncoming =
    statusRank(incoming.status) > statusRank(current.status) ||
    (statusRank(incoming.status) === statusRank(current.status) &&
      incoming.progress.processed >= current.progress.processed);

  return {
    ...current,
    ...(preferIncoming
      ? {
          status: incoming.status,
          progress: incoming.progress,
        }
      : {}),
    sourceId: incoming.sourceId ?? current.sourceId,
    error: incoming.error ?? current.error,
    completedAt: incoming.completedAt ?? current.completedAt,
    logs: mergeLogEntries(current.logs ?? [], incoming.logs ?? []),
  };
}

export default function MailKBSummaryModal({ jobId, onClose }: MailKBSummaryModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [job, setJob] = useState<JobStatus>(createEmptyJob(jobId));
  const [stats, setStats] = useState<{
    quadrantDistribution?: Record<string, number>;
  }>({});
  const logsEndRef = useRef<HTMLDivElement>(null);
  const sourceIdRef = useRef<string | null>(null);

  useEffect(() => {
    setJob(createEmptyJob(jobId));
    setLogs([]);
    setStats({});
    sourceIdRef.current = null;
  }, [jobId]);

  const fetchStats = async (sourceId?: string | null) => {
    try {
      const sourceIdQuery = sourceId ?? sourceIdRef.current;
      const endpoint = sourceIdQuery
        ? `/api/mail-kb/stats?sourceId=${encodeURIComponent(sourceIdQuery)}`
        : "/api/mail-kb/stats";
      const res = await fetch(endpoint, { credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        stats?: { quadrantDistribution?: Record<string, number> };
        result?: { stats?: { quadrantDistribution?: Record<string, number> } } | { quadrantDistribution?: Record<string, number> };
      };
      if (!data.ok) {
        return;
      }
      const nextStats =
        data.stats ??
        ("stats" in (data.result ?? {})
          ? (data.result as { stats?: { quadrantDistribution?: Record<string, number> } }).stats
          : (data.result as { quadrantDistribution?: Record<string, number> } | undefined));
      if (nextStats) {
        setStats(nextStats);
      }
    } catch (err) {
      console.error("Failed to fetch KB stats:", err);
    }
  };

  const fetchJobStatus = async () => {
    try {
      const res = await fetch(`/api/mail/knowledge-base/jobs/${jobId}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        job?: unknown;
        result?: { job?: unknown };
      };
      if (!data.ok) {
        return;
      }
      const nextJob = normalizeJob(data.job ?? data.result?.job, jobId);
      if (nextJob.sourceId) {
        sourceIdRef.current = nextJob.sourceId;
      }
      setJob((prev) => mergeJobState(prev, nextJob));
      setLogs((prev) => mergeLogEntries(nextJob.logs ?? [], prev));
      if (nextJob.status === "completed") {
        void fetchStats(nextJob.sourceId);
      }
    } catch (err) {
      console.error("Failed to fetch job status:", err);
    }
  };

  useEffect(() => {
    void fetchJobStatus();
  }, [jobId]);

  useEffect(() => {
    const eventSource = new EventSource(`/api/mail/knowledge-base/jobs/${jobId}/stream`, {
      withCredentials: true,
    });

    eventSource.addEventListener("progress", (event) => {
      const data = parseJsonData<Partial<Progress>>((event as MessageEvent<string>).data);
      if (!data) {
        return;
      }
      setJob((prev) => ({
        ...prev,
        progress: normalizeProgress(data, prev.progress),
      }));
    });

    eventSource.addEventListener("status", (event) => {
      const data = parseJsonData<{
        status?: JobStatus["status"];
        error?: string;
        progress?: Partial<Progress>;
        completedAt?: string;
      }>((event as MessageEvent<string>).data);
      if (!data) {
        return;
      }
      setJob((prev) => ({
        ...prev,
        status: data.status ?? prev.status,
        error: data.error ?? prev.error,
        completedAt: data.completedAt ?? prev.completedAt,
        progress: data.progress ? normalizeProgress(data.progress, prev.progress) : prev.progress,
      }));
      if (data.status === "completed") {
        void fetchStats();
      }
    });

    eventSource.addEventListener("logs", (event) => {
      const data = parseJsonData<{ logs?: LogEntry[] }>((event as MessageEvent<string>).data);
      if (!data?.logs?.length) {
        return;
      }
      setLogs((prev) => [...prev, ...data.logs].slice(-800));
    });

    eventSource.addEventListener("final", (event) => {
      const data = parseJsonData<{ job?: unknown }>((event as MessageEvent<string>).data);
      const nextJob = normalizeJob(data?.job, jobId);
      if (nextJob.sourceId) {
        sourceIdRef.current = nextJob.sourceId;
      }
      setJob((prev) => mergeJobState(prev, nextJob));
      setLogs((prev) => mergeLogEntries(prev, nextJob.logs ?? []));
      void fetchStats(nextJob.sourceId);
      eventSource.close();
    });

    eventSource.addEventListener("error", (event) => {
      const messageEvent = event as MessageEvent<string>;
      const data = typeof messageEvent.data === "string" ? parseJsonData<{ error?: string }>(messageEvent.data) : null;
      if (data?.error) {
        setJob((prev) => ({
          ...prev,
          status: "failed",
          error: data.error ?? prev.error,
        }));
      }
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
      }
    });

    return () => {
      eventSource.close();
    };
  }, [jobId]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const progressPercent =
    job.progress.total > 0
      ? Math.round((job.progress.processed / job.progress.total) * 100)
      : job.status === "completed"
        ? 100
        : 0;

  const phase = job.progress.phase || "idle";
  const phaseLabel = PHASE_LABELS[phase] ?? "处理中";
  const phaseBadgeClasses = PHASE_BADGE_CLASSES[phase] ?? PHASE_BADGE_CLASSES.idle;

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return timestamp;
    }
  };

  const getLogClass = (level: LogEntry["level"]) => {
    if (level === "error") {
      return "text-rose-300";
    }
    if (level === "warn") {
      return "text-amber-300";
    }
    return "text-emerald-300";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-white shadow-2xl dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              邮件知识库处理
            </h2>
            <p className="mt-1 break-all text-sm text-zinc-500 dark:text-zinc-400">
              Job ID: {jobId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            关闭
          </button>
        </div>

        <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${phaseBadgeClasses}`}>
              {phaseLabel}
            </span>
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              {job.progress.message || "正在准备任务..."}
            </span>
          </div>

          <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-emerald-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-2 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              {job.progress.processed} / {job.progress.total || "?"}
            </span>
            <span>{progressPercent}%</span>
          </div>
        </div>

        {job.status === "completed" && stats.quadrantDistribution ? (
          <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 bg-emerald-50 px-6 py-4 dark:border-zinc-800 dark:bg-emerald-950/20 sm:grid-cols-5">
            <div className="rounded-lg bg-violet-100 px-3 py-2 text-center dark:bg-violet-900/30">
              <div className="text-lg font-bold text-violet-600 dark:text-violet-200">
                {stats.quadrantDistribution.unprocessed || 0}
              </div>
              <div className="text-xs text-violet-500 dark:text-violet-300">未处理</div>
            </div>
            <div className="rounded-lg bg-red-100 px-3 py-2 text-center dark:bg-red-900/30">
              <div className="text-lg font-bold text-red-600 dark:text-red-200">
                {stats.quadrantDistribution.urgent_important || 0}
              </div>
              <div className="text-xs text-red-500 dark:text-red-300">紧急重要</div>
            </div>
            <div className="rounded-lg bg-blue-100 px-3 py-2 text-center dark:bg-blue-900/30">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-200">
                {stats.quadrantDistribution.not_urgent_important || 0}
              </div>
              <div className="text-xs text-blue-500 dark:text-blue-300">重要不紧急</div>
            </div>
            <div className="rounded-lg bg-amber-100 px-3 py-2 text-center dark:bg-amber-900/30">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-200">
                {stats.quadrantDistribution.urgent_not_important || 0}
              </div>
              <div className="text-xs text-amber-500 dark:text-amber-300">紧急不重要</div>
            </div>
            <div className="rounded-lg bg-zinc-100 px-3 py-2 text-center dark:bg-zinc-800">
              <div className="text-lg font-bold text-zinc-600 dark:text-zinc-200">
                {stats.quadrantDistribution.not_urgent_not_important || 0}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-300">不紧急不重要</div>
            </div>
          </div>
        ) : null}

        {job.status === "failed" && job.error ? (
          <div className="border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            处理失败：{job.error}
          </div>
        ) : null}

        <div className="flex-1 overflow-hidden px-6 py-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">处理日志</h3>
            {job.completedAt ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                完成时间：{formatTime(job.completedAt)}
              </p>
            ) : null}
          </div>

          <div className="h-72 overflow-y-auto rounded-lg bg-zinc-950 p-3 font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-zinc-500">等待日志输出...</p>
            ) : (
              logs.map((log, index) => (
                <div key={`${log.timestamp}-${index}`} className={`flex gap-2 py-1 ${getLogClass(log.level)}`}>
                  <span className="shrink-0 text-zinc-500">[{formatTime(log.timestamp)}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          {job.status === "completed" ? (
            <a
              href="/knowledge-base"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              查看归纳结果
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {job.status === "completed" ? "关闭" : "后台处理"}
          </button>
        </div>
      </div>
    </div>
  );
}
