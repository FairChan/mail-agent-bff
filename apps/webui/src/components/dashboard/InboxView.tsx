/**
 * 收件箱视图
 * 使用 MailContext 和 AppContext 获取数据
 */

import React, { useCallback, useEffect } from "react";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import { quadrantMeta, viewLabelsByLocale, type TriageMailItem, type MailInsightItem, type MailQuadrant } from "@mail-agent/shared-types";
import { formatGeneratedAt } from "../../utils/format";
import { MailCard } from "../shared/MailCard";
import { BellIcon } from "../shared/Icons";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { ErrorDisplay } from "../ErrorBoundary";

interface InboxViewProps {
  onViewMailDetail: (item: TriageMailItem) => void;
}

export function InboxView({ onViewMailDetail }: InboxViewProps) {
  const {
    triage,
    insights,
    isLoadingMail,
    error,
    activeSourceId,
    sources,
    fetchTriage,
    fetchInsights,
    prefetchMailBodies,
  } = useMail();

  const { locale } = useApp();

  const quadrantLabels = viewLabelsByLocale[locale];
  const t = (key: string) => key;

  useEffect(() => {
    if (activeSourceId) {
      fetchTriage(50);
      fetchInsights(50, 7);
    }
  }, [activeSourceId, fetchTriage, fetchInsights]);

  // 预加载优先邮件的内容
  useEffect(() => {
    if (triage) {
      const urgentItems = triage.quadrants.urgent_important ?? [];
      const importantItems = triage.quadrants.not_urgent_important ?? [];
      const priorityIds = [...urgentItems, ...importantItems].slice(0, 5).map((item) => item.id);
      if (priorityIds.length > 0) {
        prefetchMailBodies(priorityIds);
      }
    }
  }, [triage, prefetchMailBodies]);

  const handleRefresh = useCallback(() => {
    if (activeSourceId) {
      fetchTriage(50);
      fetchInsights(50, 7);
    }
  }, [activeSourceId, fetchTriage, fetchInsights]);

  const counts = triage?.counts ?? {
    urgent_important: 0,
    not_urgent_important: 0,
    urgent_not_important: 0,
    not_urgent_not_important: 0,
  };

  const urgentItems = triage?.quadrants.urgent_important ?? [];
  const importantItems = triage?.quadrants.not_urgent_important ?? [];
  const upcomingItems = insights?.upcoming ?? [];
  const displayItems = urgentItems.length > 0 ? urgentItems : importantItems;

  const renderMailCard = useCallback(
    (item: TriageMailItem) => (
      <MailCard
        key={item.id}
        item={item}
        noSummary={t("noSummary")}
        viewDetail={t("viewDetail")}
        onViewDetail={onViewMailDetail}
      />
    ),
    [onViewMailDetail, t]
  );

  const renderUpcomingItem = useCallback(
    (item: MailInsightItem) => (
      <li key={`${item.messageId}-${item.dueAt}`} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.subject}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.dueDateLabel}</p>
            {item.aiSummary && (
              <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">{item.aiSummary}</p>
            )}
          </div>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
            {item.type}
          </span>
        </div>
      </li>
    ),
    []
  );

  if (!activeSourceId || sources.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
        <div className="rounded-lg bg-amber-50 p-6 text-center dark:bg-amber-900/20">
          <h2 className="mb-2 text-lg font-semibold text-amber-600 dark:text-amber-400">未绑定邮件源</h2>
          <p className="text-sm text-amber-500 dark:text-amber-300">
            请先在设置中连接 Outlook 邮箱
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={handleRefresh} />;
  }

  if (isLoadingMail && !triage) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">加载邮件数据...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 概览统计 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {quadrantLabels.inbox.label}
          </h2>
          <div className="flex items-center gap-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatGeneratedAt(triage?.generatedAt)}</p>
            <button
              onClick={handleRefresh}
              disabled={isLoadingMail}
              className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <svg className={`h-4 w-4 ${isLoadingMail ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(quadrantMeta) as MailQuadrant[]).map((key) => (
            <div
              key={key}
              className={`rounded-xl border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50 ${
                key === "urgent_important"
                  ? "border-red-200 bg-red-50/50 dark:bg-red-900/10"
                  : "border-zinc-200 bg-white dark:bg-zinc-800"
              }`}
            >
              <p className={`text-[11px] ${quadrantMeta[key].tone}`}>{quadrantLabels[key]}</p>
              <p className={`text-xl font-semibold ${quadrantMeta[key].tone}`}>{counts[key]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 优先邮件和近期日程 */}
      <section className="grid gap-4 xl:grid-cols-2">
        {/* 优先处理 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {locale === "zh" ? "优先处理" : "Priority Queue"}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700 ring-1 ring-red-200 dark:bg-red-900/20 dark:text-red-400 dark:ring-red-800">
              <BellIcon />
              {urgentItems.length}
            </span>
          </div>

          <ul className="space-y-2">
            {displayItems.slice(0, 6).map(renderMailCard)}
            {displayItems.length === 0 && (
              <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-5 text-center text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                {locale === "zh" ? "暂无需要优先处理的邮件" : "No priority items"}
              </li>
            )}
          </ul>
        </div>

        {/* 近期日程 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {locale === "zh" ? "近期日程 / DDL" : "Upcoming Schedule / DDL"}
            </h3>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {upcomingItems.length}
            </span>
          </div>

          <ul className="space-y-2">
            {upcomingItems.slice(0, 6).map(renderUpcomingItem)}
            {upcomingItems.length === 0 && (
              <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-5 text-center text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                {locale === "zh" ? "未来 7 天未识别到明确时间事项" : "No dated events detected in the next 7 days"}
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
