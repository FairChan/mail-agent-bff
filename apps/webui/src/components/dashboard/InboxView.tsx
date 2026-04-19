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
import { BentoGrid, BentoPanel, MetricTile, StatusPill } from "../ui/Bento";
import { CalmButton, CalmPill } from "../ui/Calm";

interface InboxViewProps {
  onViewMailDetail: (item: TriageMailItem) => void;
}

function getCalendarDraftKey(draft: Pick<MailCalendarDraft, "messageId" | "type" | "dueAt">): string {
  return `${draft.messageId}:${draft.type}:${draft.dueAt}`;
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
    const autoSyncedIds = new Set(
      (processingResult?.calendarSync?.items ?? [])
        .filter((item) => item.ok)
        .map((item) => getCalendarDraftKey(item))
    );
	    setSyncedDraftIds(autoSyncedIds);
	    if (processingResult?.calendarSync && autoSyncedIds.size > 0) {
	      const result = processingResult.calendarSync;
	      const suffix = result.deduplicatedCount > 0
	        ? locale === "zh"
	          ? `，其中 ${result.deduplicatedCount} 项已存在`
	          : `, ${result.deduplicatedCount} already existed`
	        : "";
	      setDraftSyncMessage(locale === "zh"
	        ? `自动写入日历 ${autoSyncedIds.size} 项${suffix}。`
	        : `Automatically added ${autoSyncedIds.size} items to calendar${suffix}.`);
	    } else {
	      setDraftSyncMessage(null);
	    }
	    setDraftSyncError(null);
	    setIsBatchSyncingDrafts(false);
	  }, [activeSourceId, locale, processingResult]);

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
    const draftKey = getCalendarDraftKey(draft);
    setDraftSyncError(null);
    setDraftSyncMessage(null);
    setSyncingDraftIds((prev) => new Set(prev).add(draftKey));
    try {
      await syncToCalendar(draft.messageId, draft.subject, draft.type, draft.dueAt);
      setSyncedDraftIds((prev) => new Set(prev).add(draftKey));
      setDraftSyncMessage(locale === "zh" ? `已写入日历：${draft.subject}` : `Added to calendar: ${draft.subject}`);
    } catch (err) {
      setDraftSyncError(err instanceof Error ? err.message : "同步到日历失败");
    } finally {
      setSyncingDraftIds((prev) => {
        const next = new Set(prev);
        next.delete(draftKey);
        return next;
      });
    }
  }, [locale, syncToCalendar]);

  const handleSyncAllDrafts = useCallback(async () => {
    if (!processingResult?.calendarDrafts.length) {
      return;
    }

    const pendingDrafts = processingResult.calendarDrafts.filter((draft) => !syncedDraftIds.has(getCalendarDraftKey(draft)));
    if (pendingDrafts.length === 0) {
      setDraftSyncMessage(locale === "zh" ? "这些事项已经写入日历。" : "These items are already in your calendar.");
      return;
    }

    setIsBatchSyncingDrafts(true);
    setDraftSyncError(null);
    setDraftSyncMessage(null);
    setSyncingDraftIds((prev) => {
      const next = new Set(prev);
      pendingDrafts.forEach((draft) => next.add(getCalendarDraftKey(draft)));
      return next;
    });

    try {
      const result = await syncCalendarDrafts(pendingDrafts);
      setSyncedDraftIds((prev) => {
        const next = new Set(prev);
        const syncedKeys = result.syncedKeys.length > 0
          ? result.syncedKeys
          : pendingDrafts
              .filter((draft) => result.syncedIds.includes(draft.messageId))
              .map(getCalendarDraftKey);
        syncedKeys.forEach((key) => next.add(key));
        return next;
      });

      if (result.failedCount > 0) {
        setDraftSyncError(locale === "zh"
          ? `已写入 ${result.syncedKeys.length || result.syncedIds.length} 项，另有 ${result.failedCount} 项失败。`
          : `Added ${result.syncedKeys.length || result.syncedIds.length} items, ${result.failedCount} failed.`);
      } else {
        const suffix = result.deduplicatedCount > 0
          ? locale === "zh"
            ? `，其中 ${result.deduplicatedCount} 项已存在`
            : `, ${result.deduplicatedCount} already existed`
          : "";
        setDraftSyncMessage(locale === "zh"
          ? `已写入日历 ${result.syncedKeys.length || result.syncedIds.length} 项${suffix}。`
          : `Added ${result.syncedKeys.length || result.syncedIds.length} items to calendar${suffix}.`);
      }
    } catch (err) {
      setDraftSyncError(err instanceof Error ? err.message : "批量同步失败");
    } finally {
      setIsBatchSyncingDrafts(false);
      setSyncingDraftIds((prev) => {
        const next = new Set(prev);
        pendingDrafts.forEach((draft) => next.delete(getCalendarDraftKey(draft)));
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
  const activeSource = sources.find((source) => source.id === activeSourceId);
  const totalMailCount = triage?.total ?? Object.values(counts).reduce((sum, count) => sum + count, 0);
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
      <li
        key={`${item.messageId}-${item.dueAt}`}
        className="rounded-[1.1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-3 py-2 shadow-[var(--shadow-inset)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[color:var(--ink)]">{item.subject}</p>
            <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{item.dueDateLabel}</p>
            {item.aiSummary && (
              <p className="mt-1 line-clamp-2 text-xs text-[color:var(--ink-muted)]">{item.aiSummary}</p>
            )}
          </div>
          <CalmPill tone={item.type === "ddl" ? "warning" : item.type === "meeting" ? "info" : item.type === "exam" ? "urgent" : "muted"}>
            {item.type}
          </CalmPill>
        </div>
      </li>
    ),
    []
  );

  if (!activeSourceId || sources.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
        <div className="rounded-[1.4rem] border border-[color:var(--border-warning)] bg-[color:var(--surface-warning)] p-6 text-center shadow-[var(--shadow-soft)]">
          <h2 className="mb-2 text-lg font-semibold text-[color:var(--ink)]">未绑定邮件源</h2>
          <p className="text-sm text-[color:var(--ink-muted)]">
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
        <p className="text-sm text-[color:var(--ink-subtle)]">加载邮件数据...</p>
      </div>
    );
  }

  return (
    <BentoGrid>
      <BentoPanel as="section" tone="success" className="lg:col-span-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={activeSource?.ready ? "success" : "warning"} pulse={isProcessingMail}>
                {activeSource?.ready
                  ? locale === "zh" ? "邮箱在线" : "Mailbox ready"
                  : locale === "zh" ? "等待验证" : "Needs verification"}
              </StatusPill>
              <StatusPill tone="info">{activeSource?.name || activeSource?.emailHint || "Outlook"}</StatusPill>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {locale === "zh" ? "新邮件处理工作台" : "New Mail Processing"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-900/80 dark:text-emerald-100/80">
              {locale === "zh"
                ? "把最新邮件纳入知识库，识别紧急事项、每日摘要和可写入日历的事件。"
                : "Bring fresh mail into the knowledge base, urgent queue, daily digest, and calendar-ready events."}
            </p>
          </div>
          <CalmButton
            type="button"
            onClick={() => void handleProcessNow()}
            disabled={isProcessingMail}
            variant="primary"
            className="min-h-10"
          >
            {isProcessingMail ? <LoadingSpinner size="sm" /> : null}
            {isProcessingMail
              ? locale === "zh" ? "处理中..." : "Processing..."
              : locale === "zh" ? "立即处理新邮件" : "Process now"}
          </CalmButton>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label={locale === "zh" ? "知识库新增" : "New KB mails"}
            value={processingResult?.knowledgeBase.newMailCount ?? 0}
            detail={locale === "zh" ? "本次写入" : "This run"}
            tone="success"
          />
          <MetricTile
            label={locale === "zh" ? "新紧急邮件" : "New urgent"}
            value={processingResult?.urgent.newItems.length ?? urgentItems.length}
            detail={locale === "zh" ? "需要注意" : "Needs attention"}
            tone="urgent"
          />
          <MetricTile
            label={locale === "zh" ? "日历候选" : "Calendar drafts"}
            value={processingResult?.calendarDrafts.length ?? upcomingItems.length}
            detail={locale === "zh" ? "可确认写入" : "Ready to confirm"}
            tone="info"
          />
          <MetricTile
            label={locale === "zh" ? "邮件总数" : "Total mails"}
            value={totalMailCount}
            detail={formatGeneratedAt(triage?.generatedAt) || (locale === "zh" ? "等待同步" : "Pending sync")}
          />
        </div>

        {processingResult?.knowledgeBase.status === "failed" ? (
          <p className="mt-4 rounded-[1rem] border border-[color:var(--border-warning)] bg-[color:var(--surface-warning)] px-3 py-2 text-xs text-[color:var(--ink)]">
            {locale === "zh"
              ? `知识库更新未完成：${processingResult.knowledgeBase.errors[0] ?? "未知错误"}`
              : `Knowledge-base update did not finish: ${processingResult.knowledgeBase.errors[0] ?? "Unknown error"}`}
          </p>
        ) : null}

        {processingResult?.status === "partial" && processingResult.knowledgeBase.status !== "failed" && processingResult.warnings.length > 0 ? (
          <p className="mt-4 rounded-[1rem] border border-[color:var(--border-warning)] bg-[color:var(--surface-warning)] px-3 py-2 text-xs text-[color:var(--ink)]">
            {locale === "zh"
              ? `部分处理完成：${processingResult.warnings[0]}`
              : `Partially completed: ${processingResult.warnings[0]}`}
          </p>
        ) : null}

        {processingResult?.urgent.newItems.length ? (
          <div className="mt-4 grid gap-2">
            {processingResult.urgent.newItems.slice(0, 3).map((item) => (
              <a
                key={item.messageId}
                href={item.webLink}
                target="_blank"
                rel="noreferrer"
                className="block rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-3 py-2 text-sm text-[color:var(--ink)] transition hover:bg-[color:var(--surface-soft)]"
              >
                <span className="font-medium">{item.subject}</span>
                <span className="ml-2 text-xs text-[color:var(--ink-subtle)]">{item.fromName || item.fromAddress}</span>
              </a>
            ))}
          </div>
        ) : null}
      </BentoPanel>

      <BentoPanel tone="info" className="lg:col-span-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700/80 dark:text-sky-300/80">Eisenhower</p>
            <h3 className="mt-1 text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {viewLabels.inbox.label}
            </h3>
          </div>
          <CalmButton
            onClick={handleRefresh}
            disabled={isLoadingMail}
            variant="secondary"
            className="h-10 w-10 p-0 text-[color:var(--ink-muted)]"
            aria-label={locale === "zh" ? "刷新" : "Refresh"}
          >
            <svg className={`h-4 w-4 ${isLoadingMail ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </CalmButton>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(Object.keys(quadrantMeta) as MailQuadrant[]).map((key) => (
            <div
              key={key}
              className={`rounded-[1rem] border px-3 py-2 ${
                key === "urgent_important"
                  ? "border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)]"
                  : key === "unprocessed"
                    ? "border-[color:var(--border-info)] bg-[color:var(--surface-info)]"
                    : "border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)]"
              }`}
            >
              <p className={`truncate text-[11px] ${quadrantMeta[key].tone}`}>{quadrantLabels[key]}</p>
              <p className={`mt-1 text-xl font-semibold ${quadrantMeta[key].tone}`}>{counts[key]}</p>
            </div>
          ))}
        </div>
      </BentoPanel>

      {processingResult?.calendarDrafts.length ? (
        <BentoPanel as="section" tone="success" className="lg:col-span-12">
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
              <CalmButton
                type="button"
                onClick={() => setCurrentView("calendar")}
                variant="secondary"
                className="px-3 py-1.5 text-xs"
              >
                {locale === "zh" ? "查看日历" : "Open Calendar"}
              </CalmButton>
              <CalmButton
                type="button"
                onClick={() => void handleSyncAllDrafts()}
                disabled={isBatchSyncingDrafts}
                variant="primary"
                className="px-3 py-1.5 text-xs"
              >
                {isBatchSyncingDrafts ? <LoadingSpinner size="sm" /> : null}
                {locale === "zh" ? "全部写入日历" : "Sync All"}
              </CalmButton>
            </div>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {processingResult.calendarDrafts.slice(0, 6).map((draft) => (
              <div
                key={getCalendarDraftKey(draft)}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-3 py-2 shadow-[var(--shadow-inset)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[color:var(--ink)]">{draft.subject}</p>
                  <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{draft.dueDateLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CalmPill tone={draft.type === "ddl" ? "warning" : draft.type === "meeting" ? "info" : draft.type === "exam" ? "urgent" : "muted"}>
                    {calendarTypeLabels[draft.type]}
                  </CalmPill>
                  <button
                    type="button"
                    onClick={() => void handleSyncDraft(draft)}
                    disabled={syncingDraftIds.has(getCalendarDraftKey(draft)) || syncedDraftIds.has(getCalendarDraftKey(draft))}
                    className="rounded-[999px] border border-[color:var(--border-success)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--pill-success-ink)] transition hover:bg-[color:var(--surface-success)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {syncingDraftIds.has(getCalendarDraftKey(draft))
                      ? locale === "zh" ? "写入中..." : "Syncing..."
                      : syncedDraftIds.has(getCalendarDraftKey(draft))
                        ? locale === "zh" ? "已写入" : "Synced"
                        : locale === "zh" ? "写入日历" : "Sync"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {processingResult.calendarDrafts.length > 6 ? (
            <p className="mt-2 text-xs text-[color:var(--ink-subtle)]">
              {locale === "zh"
                ? `还剩 ${processingResult.calendarDrafts.length - 6} 项可在日历页继续确认。`
                : `${processingResult.calendarDrafts.length - 6} more items are available in Calendar view.`}
            </p>
          ) : null}

          {draftSyncMessage ? (
            <p className="mt-3 rounded-[1rem] border border-[color:var(--border-success)] bg-[color:var(--surface-success)] px-3 py-2 text-xs text-[color:var(--ink)]">
              {draftSyncMessage}
            </p>
          ) : null}

          {draftSyncError ? (
            <p className="mt-3 rounded-[1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-3 py-2 text-xs text-[color:var(--ink)]">
              {draftSyncError}
            </p>
          ) : null}
        </BentoPanel>
      ) : null}

      <BentoPanel tone={urgentItems.length > 0 ? "urgent" : "default"} className="lg:col-span-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {locale === "zh" ? "优先处理" : "Priority Queue"}
          </h3>
          <StatusPill tone={urgentItems.length > 0 ? "urgent" : "muted"}>
            <BellIcon />
            {urgentItems.length}
          </StatusPill>
        </div>
        <ul className="space-y-2">
          {displayItems.slice(0, 6).map(renderMailCard)}
          {displayItems.length === 0 && (
            <li className="rounded-[1rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-3 py-5 text-center text-xs text-[color:var(--ink-subtle)]">
              {locale === "zh" ? "暂无需要优先处理或等待 Agent 处理的邮件" : "No priority or pending items"}
            </li>
          )}
        </ul>
      </BentoPanel>

      <BentoPanel tone="default" className="lg:col-span-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {locale === "zh" ? "近期日程 / DDL" : "Upcoming Schedule / DDL"}
          </h3>
          <StatusPill tone="info">{upcomingItems.length}</StatusPill>
        </div>
        <ul className="space-y-2">
          {upcomingItems.slice(0, 6).map(renderUpcomingItem)}
          {upcomingItems.length === 0 && (
            <li className="rounded-[1rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-3 py-5 text-center text-xs text-[color:var(--ink-subtle)]">
              {locale === "zh" ? "未来 7 天未识别到明确时间事项" : "No dated events detected in the next 7 days"}
            </li>
          )}
        </ul>
      </BentoPanel>
    </BentoGrid>
  );
}
