"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";

interface StatsCounts {
  urgent_important: number;
  not_urgent_important: number;
  urgent_not_important: number;
  not_urgent_not_important: number;
}

interface StatsPageProps {
  triage: { counts: StatsCounts; total?: number } | null;
  insights: { upcoming?: Array<{ messageId?: string; subject: string; dueAt: string }> } | null;
  loading?: boolean;
  connectedMailbox?: string;
}

export function StatsPage({ triage, insights, loading, connectedMailbox }: StatsPageProps) {
  const { t } = useTranslation();
  const counts: StatsCounts = triage?.counts ?? { urgent_important: 0, not_urgent_important: 0, urgent_not_important: 0, not_urgent_not_important: 0 };

  const quadrantData = [
    { label: t("quadrant.urgent_important"), key: "urgent_important", color: "red", desc: t("quadrant.urgent_importantDesc"), value: counts.urgent_important },
    { label: t("quadrant.not_urgent_important"), key: "not_urgent_important", color: "blue", desc: t("quadrant.not_urgent_importantDesc"), value: counts.not_urgent_important },
    { label: t("quadrant.urgent_not_important"), key: "urgent_not_important", color: "amber", desc: t("quadrant.urgent_not_importantDesc"), value: counts.urgent_not_important },
    { label: t("quadrant.not_urgent_not_important"), key: "not_urgent_not_important", color: "zinc", desc: t("quadrant.not_urgent_not_importantDesc"), value: counts.not_urgent_not_important },
  ];

  const total = counts.urgent_important + counts.not_urgent_important + counts.urgent_not_important + counts.not_urgent_not_important;
  const completionRate = total > 0 ? Math.round((counts.not_urgent_not_important / total) * 100) : 0;

  const quadrantColors: Record<string, string> = {
    red: "bg-red-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    zinc: "bg-zinc-400",
  };

  const quadrantBgColors: Record<string, string> = {
    red: "bg-red-50 dark:bg-red-950/30",
    blue: "bg-blue-50 dark:bg-blue-950/30",
    amber: "bg-amber-50 dark:bg-amber-950/30",
    zinc: "bg-zinc-100 dark:bg-zinc-900",
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t("stats.title")}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{connectedMailbox}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="text-xs text-zinc-500">{t("stats.total")}</span>
          <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{total}</span>
          <span className="text-xs text-zinc-400">{t("common.emails")}</span>
        </div>
      </div>

      {/* Quadrant Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {quadrantData.map((q) => (
          <div
            key={q.key}
            className={cn(
              "relative overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md",
              quadrantBgColors[q.color]
            )}
          >
            <div className={cn("absolute right-3 top-3 h-12 w-12 rounded-full opacity-20", quadrantColors[q.color])} />
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{q.label}</p>
            <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">{q.value}</p>
            <p className="mt-1 text-xs text-zinc-400">{q.desc}</p>
            {total > 0 && (
              <div className="mt-3 h-1 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={cn("h-1 rounded-full transition-all", quadrantColors[q.color])}
                  style={{ width: `${Math.round((q.value / total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Quadrant Distribution */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("stats.distribution")}</h3>
          <div className="flex items-center gap-6">
            {/* Donut */}
            <div className="relative shrink-0">
              <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
                <circle cx="60" cy="60" r="48" fill="none" strokeWidth="16" className="stroke-zinc-100 dark:stroke-zinc-800" />
                {(() => {
                  const segments = quadrantData.map((q) => ({ ...q, pct: total > 0 ? q.value / total : 0 }));
                  let offset = 0;
                  return segments.map((seg, i) => {
                    const dash = seg.pct * 2 * Math.PI * 48;
                    const dashArray = `${dash} ${2 * Math.PI * 48}`;
                    const circle = (
                      <circle
                        key={i}
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        strokeWidth="16"
                        strokeDasharray={dashArray}
                        strokeDashoffset={-offset * 2 * Math.PI * 48}
                        className={cn("transition-all", quadrantColors[seg.color])}
                      />
                    );
                    offset += seg.pct;
                    return circle;
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{completionRate}%</span>
                <span className="text-[9px] text-zinc-400">{t("stats.archiveRate")}</span>
              </div>
            </div>
            {/* Legend */}
            <div className="flex-1 space-y-3">
              {quadrantData.map((q) => (
                <div key={q.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-2.5 w-2.5 rounded-full", quadrantColors[q.color])} />
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{q.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{q.value}</span>
                    <span className="w-10 text-right text-[10px] text-zinc-400">
                      {total > 0 ? `${Math.round((q.value / total) * 100)}%` : "0%"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("stats.upcoming")}</h3>
          <div className="space-y-3">
            {(insights?.upcoming ?? []).length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-zinc-400">{t("stats.noUpcoming")}</p>
              </div>
            ) : (
              (insights?.upcoming ?? []).slice(0, 6).map((item, i) => {
                const days = daysUntil(item.dueAt);
                let color = "text-zinc-500";
                let tag = t("common.unknown");
                if (days !== null) {
                  if (days === 0) { color = "text-red-600 bg-red-50 dark:text-red-400"; tag = t("common.today"); }
                  else if (days <= 1) { color = "text-red-600 bg-red-50 dark:text-red-400"; tag = t("common.daysLeft", { count: days }); }
                  else if (days <= 3) { color = "text-amber-600 bg-amber-50 dark:text-amber-400"; tag = t("common.daysLeft", { count: days }); }
                  else { color = "text-blue-600 bg-blue-50 dark:text-blue-400"; tag = t("common.daysLeft", { count: days }); }
                }
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                    <span className="min-w-0 flex-1 truncate pr-3 text-xs text-zinc-700 dark:text-zinc-300">{item.subject}</span>
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", color)}>{tag}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick Insights */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">{t("stats.responseRate")}</h3>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{total > 0 ? Math.round(((counts.urgent_important + counts.urgent_not_important) / total) * 100) : 0}%</span>
            <span className="mb-0.5 text-xs text-zinc-400">{t("stats.needsAttention")}</span>
          </div>
          <p className="mt-2 text-[10px] text-zinc-400">{t("stats.urgentRatio")}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">{t("common.pending")}</h3>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-bold text-red-600 dark:text-red-400">{counts.urgent_important}</span>
            <span className="mb-0.5 text-xs text-zinc-400">{t("stats.urgentImportant")}</span>
          </div>
          <p className="mt-2 text-[10px] text-zinc-400">{t("stats.immediateAction")}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">{t("stats.archiveRate")}</h3>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completionRate}%</span>
            <span className="mb-0.5 text-xs text-zinc-400">{t("stats.processed")}</span>
          </div>
          <p className="mt-2 text-[10px] text-zinc-400">{t("stats.archiveRatioDesc")}</p>
        </div>
      </div>
    </div>
  );
}

function daysUntil(iso: string): number | null {
  const due = Date.parse(iso);
  if (Number.isNaN(due)) return null;
  const diff = due - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}
