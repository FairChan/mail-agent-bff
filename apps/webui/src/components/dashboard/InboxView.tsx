/**
 * 收件箱视图
 * 使用 MailContext 和 AppContext 获取数据
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import { quadrantMeta, quadrantLabelsByLocale, viewLabelsByLocale, type TriageMailItem, type MailInsightItem, type MailQuadrant, type MailCalendarDraft } from "@mail-agent/shared-types";
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
    processingResult,
    isProcessingMail,
    fetchTriage,
    fetchInsights,
    runMailProcessing,
    syncToCalendar,
    syncCalendarDrafts,
    prefetchMailBodies,
  } = useMail();

  const { locale, setCurrentView } = useApp();
  const [syncingDraftIds, setSyncingDraftIds] = useState<Set<string>>(new Set());
  const [syncedDraftIds, setSyncedDraftIds] = useState<Set<string>>(new Set());
  const [draftSyncMessage, setDraftSyncMessage] = useState<string | null>(null);
  const [draftSyncError, setDraftSyncError] = useState<string | null>(null);
  const [isBatchSyncingDrafts, setIsBatchSyncingDrafts] = useState(false);

  const viewLabels = viewLabelsByLocale[locale];
  const quadrantLabels = quadrantLabelsByLocale[locale];
  const t = (key: string) => key;
  const calendarTypeLabels = useMemo(() => ({
    ddl: locale === "zh" ? "截止日期" : "Deadline",
    meeting: locale === "zh" ? "会议" : "Meeting",
    exam: locale === "zh" ? "考试" : "Exam",
    event: locale === "zh" ? "事项" : "Event",
  }), [locale]);

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

  useEffect(() => {
    setSyncingDraftIds(new Set());
    setSyncedDraftIds(new Set());
    setDraftSyncMessage(null);
    setDraftSyncError(null);
    setIsBatchSyncingDrafts(false);
  }, [processingResult?.completedAt, activeSourceId]);

  const handleRefresh = useCallback(() => {
    if (activeSourceId) {
      fetchTriage(50);
      fetchInsights(50, 7);
    }
  }, [activeSourceId, fetchTriage, fetchInsights]);

  const handleProcessNow = useCallback(async () => {
    await runMailProcessing(30, 14);
  }, [runMailProcessing]);

  const handleSyncDraft = useCallback(async (draft: MailCalendarDraft) => {
    setDraftSyncError(null);
    setDraftSyncMessage(null);
    setSyncingDraftIds((prev) => new Set(prev).add(draft.messageId));
    try {
      await syncToCalendar(draft.messageId, draft.subject, draft.type, draft.dueAt);
      setSyncedDraftIds((prev) => new Set(prev).add(draft.messageId));
      setDraftSyncMessage(locale === "zh" ? `已写入日历：${draft.subject}` : `Added to calendar: ${draft.subject}`);
    } catch (err) {
      setDraftSyncError(err instanceof Error ? err.message : "同步到日历失败");
    } finally {
      setSyncingDraftIds((prev) => {
        const next = new Set(prev);
        next.delete(draft.messageId);
        return next;
      });
    }
  }, [locale, syncToCalendar]);

  const handleSyncAllDrafts = useCallback(async () => {
    if (!processingResult?.calendarDrafts.length) {
      return;
    }

    const pendingDrafts = processingResult.calendarDrafts.filter((draft) => !syncedDraftIds.has(draft.messageId));
    if (pendingDrafts.length === 0) {
      setDraftSyncMessage(locale === "zh" ? "这些事项已经写入日历。" : "These items are already in your calendar.");
      return;
    }

    setIsBatchSyncingDrafts(true);
    setDraftSyncError(null);
    setDraftSyncMessage(null);
    setSyncingDraftIds((prev) => {
      const next = new Set(prev);
      pendingDrafts.forEach((draft) => next.add(draft.messageId));
      return next;
    });

    try {
      const result = await syncCalendarDrafts(pendingDrafts);
      setSyncedDraftIds((prev) => {
        const next = new Set(prev);
        result.syncedIds.forEach((id) => next.add(id));
        return next;
      });

      if (result.failedCount > 0) {
        setDraftSyncError(locale === "zh"
          ? `已写入 ${result.syncedIds.length} 项，另有 ${result.failedCount} 项失败。`
          : `Added ${result.syncedIds.length} items, ${result.failedCount} failed.`);
      } else {
        const suffix = result.deduplicatedCount > 0
          ? locale === "zh"
            ? `，其中 ${result.deduplicatedCount} 项已存在`
            : `, ${result.deduplicatedCount} already existed`
          : "";
        setDraftSyncMessage(locale === "zh"
          ? `已写入日历 ${result.syncedIds.length} 项${suffix}。`
          : `Added ${result.syncedIds.length} items to calendar${suffix}.`);
      }
    } catch (err) {
      setDraftSyncError(err instanceof Error ? err.message : "批量同步失败");
    } finally {
      setIsBatchSyncingDrafts(false);
      setSyncingDraftIds((prev) => {
        const next = new Set(prev);
        pendingDrafts.forEach((draft) => next.delete(draft.messageId));
        return next;
      });
    }
  }, [locale, processingResult, syncedDraftIds, syncCalendarDrafts]);

  const counts = triage?.counts ?? {
    unprocessed: 0,
    urgent_important: 0,
    not_urgent_important: 0,
    urgent_not_important: 0,
    not_urgent_not_important: 0,
  };

  const unprocessedItems = triage?.quadrants.unprocessed ?? [];
  const urgentItems = triage?.quadrants.urgent_important ?? [];
  const importantItems = triage?.quadrants.not_urgent_important ?? [];
  const upcomingItems = insights?.upcoming ?? [];
  const displayItems = urgentItems.length > 0
    ? urgentItems
    : importantItems.length > 0
      ? importantItems
      : unprocessedItems;

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
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
              Mail Processing
            </p>
            <h2 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {locale === "zh" ? "新邮件处理工作台" : "New Mail Processing"}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-emerald-800 dark:text-emerald-200">
              {locale === "zh"
                ? "拉取最新邮件，更新知识库，识别紧急事项、每日摘要和可写入日历的事件。"
                : "Fetch fresh mail, update the knowledge base, detect urgent items, digest signals, and calendar-ready events."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleProcessNow()}
            disabled={isProcessingMail}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isProcessingMail ? <LoadingSpinner size="sm" /> : null}
            {isProcessingMail
              ? locale === "zh" ? "处理中..." : "Processing..."
              : locale === "zh" ? "立即处理新邮件" : "Process now"}
          </button>
        </div>

        {processingResult ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-white/80 p-3 dark:bg-zinc-900/60">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {locale === "zh" ? "知识库新增" : "New KB mails"}
              </p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {processingResult.knowledgeBase.newMailCount}
              </p>
            </div>
            <div className="rounded-lg bg-white/80 p-3 dark:bg-zinc-900/60">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {locale === "zh" ? "新紧急邮件" : "New urgent"}
              </p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {processingResult.urgent.newItems.length}
              </p>
            </div>
            <div className="rounded-lg bg-white/80 p-3 dark:bg-zinc-900/60">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {locale === "zh" ? "日历候选" : "Calendar drafts"}
              </p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {processingResult.calendarDrafts.length}
              </p>
            </div>
            <div className="rounded-lg bg-white/80 p-3 dark:bg-zinc-900/60">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {locale === "zh" ? "上次完成" : "Last run"}
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {new Date(processingResult.completedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
              </p>
            </div>
          </div>
        ) : null}

        {processingResult?.knowledgeBase.status === "failed" ? (
          <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {locale === "zh"
              ? `知识库更新未完成：${processingResult.knowledgeBase.errors[0] ?? "未知错误"}`
              : `Knowledge-base update did not finish: ${processingResult.knowledgeBase.errors[0] ?? "Unknown error"}`}
          </p>
        ) : null}

        {processingResult?.status === "partial" && processingResult.knowledgeBase.status !== "failed" && processingResult.warnings.length > 0 ? (
          <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {locale === "zh"
              ? `部分处理完成：${processingResult.warnings[0]}`
              : `Partially completed: ${processingResult.warnings[0]}`}
          </p>
        ) : null}

        {processingResult?.urgent.newItems.length ? (
          <div className="mt-3 space-y-2">
            {processingResult.urgent.newItems.slice(0, 3).map((item) => (
              <a
                key={item.messageId}
                href={item.webLink}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg bg-white/80 px-3 py-2 text-sm text-zinc-800 transition hover:bg-white dark:bg-zinc-900/60 dark:text-zinc-100"
              >
                <span className="font-medium">{item.subject}</span>
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{item.fromName || item.fromAddress}</span>
              </a>
            ))}
          </div>
        ) : null}

        {processingResult?.calendarDrafts.length ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-white/80 p-3 dark:border-emerald-900/50 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                  Calendar Confirmation
                </p>
                <h3 className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {locale === "zh" ? "日历确认" : "Calendar Confirmation"}
                </h3>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  {locale === "zh"
                    ? "确认这些新识别出的 DDL / 会议是否直接写入你的 Outlook 日历。"
                    : "Confirm which newly detected DDLs and meetings should be written to Outlook."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentView("calendar")}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300"
                >
                  {locale === "zh" ? "查看日历" : "Open Calendar"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSyncAllDrafts()}
                  disabled={isBatchSyncingDrafts}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBatchSyncingDrafts ? <LoadingSpinner size="sm" /> : null}
                  {locale === "zh" ? "全部写入日历" : "Sync All"}
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {processingResult.calendarDrafts.slice(0, 6).map((draft) => (
                <div
                  key={`${draft.messageId}-${draft.dueAt}`}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{draft.subject}</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{draft.dueDateLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                      {calendarTypeLabels[draft.type]}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleSyncDraft(draft)}
                      disabled={syncingDraftIds.has(draft.messageId) || syncedDraftIds.has(draft.messageId)}
                      className="rounded-lg border border-emerald-300 px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition hover:border-emerald-700 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-700 dark:text-emerald-300"
                    >
                      {syncingDraftIds.has(draft.messageId)
                        ? locale === "zh" ? "写入中..." : "Syncing..."
                        : syncedDraftIds.has(draft.messageId)
                          ? locale === "zh" ? "已写入" : "Synced"
                          : locale === "zh" ? "写入日历" : "Sync"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {processingResult.calendarDrafts.length > 6 ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                {locale === "zh"
                  ? `还剩 ${processingResult.calendarDrafts.length - 6} 项可在日历页继续确认。`
                  : `${processingResult.calendarDrafts.length - 6} more items are available in Calendar view.`}
              </p>
            ) : null}

            {draftSyncMessage ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                {draftSyncMessage}
              </p>
            ) : null}

            {draftSyncError ? (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-300">
                {draftSyncError}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 概览统计 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {viewLabels.inbox.label}
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

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(quadrantMeta) as MailQuadrant[]).map((key) => (
            <div
              key={key}
              className={`rounded-xl border px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50 ${
                key === "urgent_important"
                  ? "border-red-200 bg-red-50/50 dark:bg-red-900/10"
                  : key === "unprocessed"
                    ? "border-violet-200 bg-violet-50/70 dark:bg-violet-900/10"
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
                {locale === "zh" ? "暂无需要优先处理或等待 Agent 处理的邮件" : "No priority or pending items"}
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
