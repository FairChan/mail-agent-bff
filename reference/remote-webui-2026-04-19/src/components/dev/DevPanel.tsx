"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";

export interface DevError {
  id: string;
  type: "error" | "warning" | "info" | "api";
  message: string;
  detail?: string;
  url?: string;
  method?: string;
  status?: number;
  timestamp: Date;
}

interface DevPanelProps {
  errors: DevError[];
  onClear?: () => void;
}

export function DevPanel({ errors, onClear }: DevPanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"errors" | "api" | "all">("all");

  const filtered = errors.filter((e) => {
    if (activeTab === "errors") return e.type === "error" || e.type === "warning";
    if (activeTab === "api") return e.type === "api";
    return true;
  });

  const errorCount = errors.filter((e) => e.type === "error").length;
  const apiCount = errors.filter((e) => e.type === "api").length;
  const warnCount = errors.filter((e) => e.type === "warning").length;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800 text-[9px] font-bold text-white">
            DEV
          </div>
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {t("dev.panelTitle")}
          </span>
          {errorCount > 0 && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white bg-red-500">
              {errorCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onClear}
            className="rounded px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
          >
            {t("dev.clear")}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
          >
            {expanded ? "▼" : "▶"}
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      {expanded && (
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {(["all", "api", "errors"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 px-3 py-1.5 text-[10px] font-medium transition-colors",
                activeTab === tab
                  ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              )}
            >
              {tab === "all" ? t("dev.all") : tab === "api" ? `${t("dev.api")} (${apiCount})` : `${t("dev.errors")} (${errorCount + warnCount})`}
            </button>
          ))}
        </div>
      )}

      {/* Error List */}
      {expanded && (
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-zinc-400">{t("dev.noRecords")}</div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {filtered.map((err) => (
                <ErrorItem key={err.id} error={err} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorItem({ error }: { error: DevError }) {
  const [open, setOpen] = useState(false);

  const typeColors = {
    error: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30",
    warning: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30",
    info: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30",
    api: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/30",
  };

  const typeLabels = { error: "ERR", warning: "WARN", info: "INFO", api: "API" };

  const timeStr = error.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="group">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
      >
        <span className={cn("mt-0.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-bold", typeColors[error.type])}>
          {typeLabels[error.type]}
        </span>
        <span className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
          {error.message}
        </span>
        <span className="shrink-0 text-[9px] text-zinc-400">{timeStr}</span>
      </button>

      {open && error.detail && (
        <div className="px-3 pb-2 pl-8">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-[10px] font-mono text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            {error.method && error.url && (
              <div className="mb-1">
                <span className="mr-2 text-zinc-400">{error.method}</span>
                <span className="break-all">{error.url}</span>
              </div>
            )}
            {error.status && (
              <div className="mb-1">
                <span className="text-zinc-400">status: </span>
                <span className={error.status >= 400 ? "text-red-500" : "text-emerald-500"}>{error.status}</span>
              </div>
            )}
            <div className="whitespace-pre-wrap break-all">{error.detail}</div>
          </div>
        </div>
      )}
    </div>
  );
}
