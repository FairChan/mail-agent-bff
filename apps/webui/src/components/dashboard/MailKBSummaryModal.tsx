/**
 * Mail Knowledge Base Progress Modal
 * 邮件知识库处理进度可视化对话框
 */

import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { CalmButton, CalmPill, CalmSectionLabel, CalmSurface } from "../ui/Calm";

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
  onClose: (options?: { refresh?: boolean }) => void;
}

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

function getPhaseTone(phase: string): "muted" | "info" | "warning" | "success" | "urgent" {
  if (phase === "fetch" || phase === "analyze" || phase === "export") {
    return "info";
  }
  if (phase === "persist") {
    return "warning";
  }
  if (phase === "done") {
    return "success";
  }
  if (phase === "error") {
    return "urgent";
  }
  return "muted";
}

export default function MailKBSummaryModal({ jobId, onClose }: MailKBSummaryModalProps) {
  const { locale, setCurrentView } = useApp();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [job, setJob] = useState<JobStatus>(createEmptyJob(jobId));
  const [stats, setStats] = useState<{
    quadrantDistribution?: Record<string, number>;
  }>({});
  const logsEndRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sourceIdRef = useRef<string | null>(null);
  const titleId = useId();
  const dateLocale = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US";

  const labels = {
    eyebrow: locale === "zh" ? "Knowledge Base Job" : locale === "ja" ? "知識ベースジョブ" : "Knowledge Base Job",
    title: locale === "zh" ? "邮件知识库处理" : locale === "ja" ? "メール知識ベース処理" : "Mail knowledge base processing",
    close: locale === "zh" ? "关闭" : locale === "ja" ? "閉じる" : "Close",
    continueBackground: locale === "zh" ? "后台处理" : locale === "ja" ? "バックグラウンドで継続" : "Continue in background",
    openResults: locale === "zh" ? "查看归纳结果" : locale === "ja" ? "要約結果を見る" : "Open results",
    progress: locale === "zh" ? "处理进度" : locale === "ja" ? "進捗" : "Progress",
    completedAt: locale === "zh" ? "完成时间" : locale === "ja" ? "完了時刻" : "Completed at",
    logs: locale === "zh" ? "处理日志" : locale === "ja" ? "処理ログ" : "Processing logs",
    waitingLogs: locale === "zh" ? "等待日志输出..." : locale === "ja" ? "ログを待機中..." : "Waiting for log output...",
    failedPrefix: locale === "zh" ? "处理失败" : locale === "ja" ? "処理失敗" : "Processing failed",
    pendingMessage: locale === "zh" ? "正在准备任务..." : locale === "ja" ? "ジョブを準備中..." : "Preparing the job...",
    quadrantsLabel: locale === "zh" ? "归纳结果分布" : locale === "ja" ? "要約結果の分布" : "Distribution snapshot",
    jobId: "Job ID",
  };

  const phaseLabels = {
    idle: locale === "zh" ? "等待开始" : locale === "ja" ? "開始待ち" : "Waiting",
    fetch: locale === "zh" ? "拉取邮件" : locale === "ja" ? "メール取得" : "Fetching mail",
    analyze: locale === "zh" ? "AI 分析" : locale === "ja" ? "AI 解析" : "AI analysis",
    persist: locale === "zh" ? "写入知识库" : locale === "ja" ? "知識ベースへ保存" : "Persisting",
    export: locale === "zh" ? "导出文档" : locale === "ja" ? "文書を書き出し" : "Exporting",
    done: locale === "zh" ? "完成" : locale === "ja" ? "完了" : "Done",
    error: locale === "zh" ? "失败" : locale === "ja" ? "失敗" : "Failed",
  };

  const quadrantCards = [
    {
      key: "unprocessed",
      label: locale === "zh" ? "未处理" : locale === "ja" ? "未処理" : "Pending",
      box: "bg-[color:var(--surface-muted)] border-[color:var(--border-soft)]",
      ink: "text-[color:var(--ink)]",
    },
    {
      key: "urgent_important",
      label: locale === "zh" ? "紧急重要" : locale === "ja" ? "緊急かつ重要" : "Urgent & Important",
      box: "bg-[color:var(--surface-urgent)] border-[color:var(--border-urgent)]",
      ink: "text-[color:var(--pill-urgent-ink)]",
    },
    {
      key: "not_urgent_important",
      label: locale === "zh" ? "重要不紧急" : locale === "ja" ? "重要だが緊急ではない" : "Important, not urgent",
      box: "bg-[color:var(--surface-info)] border-[color:var(--border-info)]",
      ink: "text-[color:var(--pill-info-ink)]",
    },
    {
      key: "urgent_not_important",
      label: locale === "zh" ? "紧急不重要" : locale === "ja" ? "緊急だが重要ではない" : "Urgent, not important",
      box: "bg-[color:var(--surface-warning)] border-[color:var(--border-warning)]",
      ink: "text-[color:var(--pill-warning-ink)]",
    },
    {
      key: "not_urgent_not_important",
      label: locale === "zh" ? "不紧急不重要" : locale === "ja" ? "緊急でも重要でもない" : "Low priority",
      box: "bg-[color:var(--surface-soft)] border-[color:var(--border-soft)]",
      ink: "text-[color:var(--ink-muted)]",
    },
  ];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

    const initialFocusTarget = getFocusableElements()[0] ?? dialog;
    initialFocusTarget.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

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
        result?:
          | { stats?: { quadrantDistribution?: Record<string, number> } }
          | { quadrantDistribution?: Record<string, number> };
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
      const data =
        typeof messageEvent.data === "string"
          ? parseJsonData<{ error?: string }>(messageEvent.data)
          : null;
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
  const phaseLabel = phaseLabels[phase as keyof typeof phaseLabels] ?? (locale === "zh" ? "处理中" : locale === "ja" ? "処理中" : "Running");
  const phaseTone = getPhaseTone(phase);

  const formatDateTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString(dateLocale, {
        year: "numeric",
        month: "short",
        day: "numeric",
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
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,18,27,0.48)] p-4 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <CalmSurface className="max-h-[88vh] w-full max-w-4xl overflow-hidden p-0" beam>
        <div className="border-b border-[color:var(--border-soft)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CalmSectionLabel>{labels.eyebrow}</CalmSectionLabel>
              <h2 id={titleId} className="mt-2 text-xl font-semibold text-[color:var(--ink)]">{labels.title}</h2>
              <p className="mt-2 break-all font-mono text-[11px] leading-5 text-[color:var(--ink-subtle)]">
                {labels.jobId}: {jobId}
              </p>
            </div>
            <CalmButton type="button" onClick={() => onClose()} variant="ghost">
              {labels.close}
            </CalmButton>
          </div>
        </div>

        <div className="border-b border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <CalmPill tone={phaseTone} pulse={job.status === "running"}>
              {phaseLabel}
            </CalmPill>
            <span className="text-sm text-[color:var(--ink-muted)]">
              {job.progress.message || labels.pendingMessage}
            </span>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--ink-subtle)]">
              <span>{labels.progress}</span>
              <span className="font-mono">
                {job.progress.processed} / {job.progress.total || "?"} · {progressPercent}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
              <div
                className="h-full bg-[linear-gradient(90deg,rgba(86,154,255,0.95),rgba(92,200,165,0.88),rgba(243,171,73,0.88))] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {job.status === "completed" && stats.quadrantDistribution ? (
          <div className="border-b border-[color:var(--border-soft)] px-6 py-5">
            <CalmSectionLabel>{labels.quadrantsLabel}</CalmSectionLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {quadrantCards.map((card) => (
                <div
                  key={card.key}
                  className={`rounded-[1rem] border px-3 py-3 text-center ${card.box}`}
                >
                  <div className={`text-lg font-semibold ${card.ink}`}>
                    {stats.quadrantDistribution?.[card.key] || 0}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--ink-subtle)]">{card.label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {job.status === "failed" && job.error ? (
          <div className="border-b border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-6 py-4 text-sm text-[color:var(--pill-urgent-ink)]">
            {labels.failedPrefix}: {job.error}
          </div>
        ) : null}

        <div className="px-6 py-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <CalmSectionLabel>{labels.logs}</CalmSectionLabel>
            {job.completedAt ? (
              <p className="text-xs text-[color:var(--ink-subtle)]">
                {labels.completedAt}: {formatDateTime(job.completedAt)}
              </p>
            ) : null}
          </div>

          <div className="h-80 overflow-y-auto rounded-[1.15rem] border border-[rgba(118,136,170,0.18)] bg-[radial-gradient(circle_at_top,rgba(22,30,46,0.98),rgba(10,14,22,0.98))] p-4 font-mono text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {logs.length === 0 ? (
              <p className="text-slate-400">{labels.waitingLogs}</p>
            ) : (
              logs.map((log, index) => (
                <div key={`${log.timestamp}-${index}`} className={`flex gap-2 py-1 ${getLogClass(log.level)}`}>
                  <span className="shrink-0 text-slate-500">[{formatDateTime(log.timestamp)}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-6 py-4">
          {job.status === "completed" ? (
            <CalmButton
              type="button"
              onClick={() => {
                setCurrentView("knowledgebase");
                onClose({ refresh: false });
              }}
              variant="primary"
            >
              {labels.openResults}
            </CalmButton>
          ) : null}
          <CalmButton type="button" onClick={() => onClose()} variant="secondary">
            {job.status === "completed" ? labels.close : labels.continueBackground}
          </CalmButton>
        </div>
      </CalmSurface>
    </div>
  );
}
