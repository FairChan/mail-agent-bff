/**
 * 日历视图
 * 展示即将到来的 DDL、会议、考试等
 */

import React, { useEffect, useState, useCallback } from "react";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import type { MailInsightItem } from "@mail-agent/shared-types";
import { LoadingSpinner } from "../shared/LoadingSpinner";

export function CalendarView() {
  const { insights, isLoadingMail, fetchInsights, syncToCalendar } = useMail();
  const { locale } = useApp();

  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set());
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    fetchInsights(50, 14); // 未来 14 天
  }, [fetchInsights]);

  const handleSync = useCallback(
    async (item: MailInsightItem) => {
      setSyncingIds((prev) => new Set(prev).add(item.messageId));
      setSyncError(null);

      try {
        await syncToCalendar(item.messageId, item.subject, item.type, item.dueAt);
        setSyncedIds((prev) => new Set(prev).add(item.messageId));
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : "同步失败");
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.messageId);
          return next;
        });
      }
    },
    [syncToCalendar]
  );

  const upcomingItems = insights?.upcoming ?? [];
  const tomorrowDdl = insights?.tomorrowDdl ?? [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const typeLabels = {
    ddl: locale === "zh" ? "截止日期" : locale === "ja" ? "締切" : "Deadline",
    meeting: locale === "zh" ? "会议" : locale === "ja" ? "会議" : "Meeting",
    exam: locale === "zh" ? "考试" : locale === "ja" ? "試験" : "Exam",
    event: locale === "zh" ? "事项" : locale === "ja" ? "イベント" : "Event",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {locale === "zh" ? "日历" : locale === "ja" ? "カレンダー" : "Calendar"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {locale === "zh" ? "将邮件中的 DDL、会议、考试等同步到 Outlook 日历" : locale === "ja" ? "メールから抽出した締切、会议、試験などをOutlookカレンダーに同期" : "Sync DDL, meetings, exams from emails to Outlook calendar"}
        </p>
      </div>

      {/* 明天 DDL */}
      {tomorrowDdl.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
            <span className="flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {locale === "zh" ? "明天的截止日期" : locale === "ja" ? "明日の締切" : "Tomorrow's Deadlines"}
          </h3>
          <div className="space-y-2">
            {tomorrowDdl.map((item) => (
              <div
                key={item.messageId}
                className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-red-900 dark:text-red-100">{item.subject}</p>
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formatDate(item.dueAt)}</p>
                    {item.evidence && (
                      <p className="mt-1 text-xs text-red-500 dark:text-red-300">{item.evidence}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/50 dark:text-red-300">
                    {typeLabels[item.type]}
                  </span>
                </div>
                <button
                  onClick={() => handleSync(item)}
                  disabled={syncingIds.has(item.messageId) || syncedIds.has(item.messageId)}
                  className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {syncingIds.has(item.messageId) ? (
                    <LoadingSpinner size="sm" />
                  ) : syncedIds.has(item.messageId) ? (
                    locale === "zh" ? "已同步" : locale === "ja" ? "同期済み" : "Synced"
                  ) : (
                    locale === "zh" ? "同步到日历" : locale === "ja" ? "カレンダーに同期" : "Sync to Calendar"
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 全部即将到来的事项 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {locale === "zh" ? "近期事项" : locale === "ja" ? "今後のイベント" : "Upcoming Events"}
        </h3>

        {isLoadingMail ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="lg" />
          </div>
        ) : upcomingItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
            {locale === "zh" ? "未来 14 天没有识别到需要同步的事项" : locale === "ja" ? "今後14日に同期すべきイベントはありません" : "No syncable events in the next 14 days"}
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingItems.map((item) => (
              <div
                key={`${item.messageId}-${item.dueAt}`}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{item.subject}</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatDate(item.dueAt)}</p>
                    {item.evidence && (
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{item.evidence}</p>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    item.type === "ddl"
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      : item.type === "exam"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                        : item.type === "meeting"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                  }`}>
                    {typeLabels[item.type]}
                  </span>
                </div>
                <button
                  onClick={() => handleSync(item)}
                  disabled={syncingIds.has(item.messageId) || syncedIds.has(item.messageId)}
                  className="mt-3 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-400"
                >
                  {syncingIds.has(item.messageId) ? (
                    <LoadingSpinner size="sm" />
                  ) : syncedIds.has(item.messageId) ? (
                    locale === "zh" ? "已同步" : locale === "ja" ? "同期済み" : "Synced"
                  ) : (
                    locale === "zh" ? "同步" : locale === "ja" ? "同期" : "Sync"
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 错误提示 */}
      {syncError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {syncError}
        </div>
      )}
    </div>
  );
}
