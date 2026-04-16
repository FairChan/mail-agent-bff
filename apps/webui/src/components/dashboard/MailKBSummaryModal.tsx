/**
 * Mail Knowledge Base Progress Modal
 * 邮件知识库处理进度可视化对话框
 * 
 * 显示内容：
 * - 当前处理阶段 (fetch / analyze / persist / export / done)
 * - 实时日志滚动
 * - 进度条
 * - 象限分布统计
 */

import { useState, useEffect, useRef } from "react";

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
  status: "pending" | "running" | "completed" | "failed";
  progress: Progress;
  error?: string;
  completedAt?: string;
}

interface MailKBSummaryModalProps {
  jobId: string;
  onClose: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  idle: "等待开始",
  fetch: "拉取邮件",
  analyze: "AI 分析",
  persist: "持久化",
  export: "导出文档",
  done: "完成",
};

const PHASE_COLORS: Record<string, string> = {
  idle: "gray",
  fetch: "blue",
  analyze: "purple",
  persist: "orange",
  export: "cyan",
  done: "green",
};

export default function MailKBSummaryModal({ jobId, onClose }: MailKBSummaryModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [stats, setStats] = useState<{
    quadrantDistribution?: Record<string, number>;
  }>({});
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/mail/knowledge-base/jobs/${jobId}/stream`);

    eventSource.addEventListener("connected", (e) => {
      console.log("SSE connected:", JSON.parse(e.data));
    });

    eventSource.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data);
      setJob((prev) => prev ? { ...prev, progress: data } : null);
    });

    eventSource.addEventListener("status", (e) => {
      const data = JSON.parse(e.data);
      setJob((prev) => prev ? { ...prev, status: data.status, error: data.error } : null);
      if (data.status === "completed") {
        fetchStats();
      }
    });

    eventSource.addEventListener("logs", (e) => {
      const data = JSON.parse(e.data);
      setLogs((prev) => [...prev, ...data.logs]);
    });

    eventSource.addEventListener("error", () => {
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, [jobId]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/mail-kb/stats");
      const data = await res.json();
      if (data.ok) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  const fetchJobStatus = async () => {
    try {
      const res = await fetch(`/api/mail/knowledge-base/jobs/${jobId}`);
      const data = await res.json();
      if (data.ok) {
        setJob(data.job);
        setLogs(data.job.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch job status:", err);
    }
  };

  useEffect(() => {
    fetchJobStatus();
  }, [jobId]);

  const getLogIcon = (level: string) => {
    switch (level) {
      case "error": return "❌";
      case "warn": return "⚠️";
      default: return "ℹ️";
    }
  };

  const getPhaseColor = (phase: string) => {
    return PHASE_COLORS[phase] || "gray";
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const progressPercent = job?.progress.total
    ? Math.round((job.progress.processed / job.progress.total) * 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              📧 邮件知识库处理
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Job ID: {jobId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Progress Section */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900">
          {/* Phase Indicator */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium bg-${getPhaseColor(job?.progress.phase || "idle")}-100 text-${getPhaseColor(job?.progress.phase || "idle")}-700`}>
              {PHASE_LABELS[job?.progress.phase || "idle"]}
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              {job?.progress.message}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{job?.progress.processed || 0} / {job?.progress.total || "?"}</span>
            <span>{progressPercent}%</span>
          </div>
        </div>

        {/* Stats (completed state) */}
        {job?.status === "completed" && stats.quadrantDistribution && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-green-50 dark:bg-green-900/20">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <div className="text-lg font-bold text-red-600">{stats.quadrantDistribution.urgent_important || 0}</div>
                <div className="text-xs text-red-500">紧急重要</div>
              </div>
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <div className="text-lg font-bold text-blue-600">{stats.quadrantDistribution.not_urgent_important || 0}</div>
                <div className="text-xs text-blue-500">重要不紧急</div>
              </div>
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <div className="text-lg font-bold text-yellow-600">{stats.quadrantDistribution.urgent_not_important || 0}</div>
                <div className="text-xs text-yellow-500">紧急不重要</div>
              </div>
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <div className="text-lg font-bold text-gray-600">{stats.quadrantDistribution.not_urgent_not_important || 0}</div>
                <div className="text-xs text-gray-500">不紧急不重要</div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {job?.status === "failed" && (
          <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200">
            <p className="text-red-600 dark:text-red-400">
              ❌ 处理失败: {job.error}
            </p>
          </div>
        )}

        {/* Logs Section */}
        <div className="flex-1 overflow-hidden px-6 py-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            处理日志
          </h3>
          <div className="h-64 overflow-y-auto bg-gray-900 rounded-lg p-3 font-mono text-sm">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className={`flex gap-2 py-1 ${
                  log.level === "error" ? "text-red-400" :
                  log.level === "warn" ? "text-yellow-400" : "text-green-400"
                }`}
              >
                <span className="text-gray-500 shrink-0">
                  [{formatTime(log.timestamp)}]
                </span>
                <span>{getLogIcon(log.level)}</span>
                <span>{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          {job?.status === "completed" && (
            <a
              href="/knowledge-base"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              查看知识库 →
            </a>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            {job?.status === "completed" ? "关闭" : "后台处理"}
          </button>
        </div>
      </div>
    </div>
  );
}
