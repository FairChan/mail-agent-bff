/**
 * 日历视图
 * 展示即将到来的 DDL、会议、考试等
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import type { MailInsightItem, MailInsightType } from "@mail-agent/shared-types";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { CalmPill } from "../ui/Calm";

type CalendarMonth = {
  year: number;
  month: number; // 1-12
};

type CalendarDayCell = CalendarMonth & {
  day: number;
  key: string;
  inCurrentMonth: boolean;
};

type EventGroupMap = Map<string, MailInsightItem[]>;

const DAY_CELL_MIN_HEIGHT = "min-h-[7.5rem]";

function getLocaleTag(locale: "zh" | "en" | "ja") {
  if (locale === "zh") {
    return "zh-CN";
  }
  if (locale === "ja") {
    return "ja-JP";
  }
  return "en-US";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getCalendarKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseCalendarKey(key: string) {
  const [year, month, day] = key.split("-").map((part) => Number(part));
  return { year, month, day };
}

function getTimeZoneDateParts(date: Date | string, timeZone: string) {
  const value = typeof date === "string" ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  return { year, month, day };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonth(value: CalendarMonth, offset: number): CalendarMonth {
  const totalMonths = value.year * 12 + (value.month - 1) + offset;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12 + 12) % 12;
  return { year, month: month + 1 };
}

function getMonthGrid(month: CalendarMonth) {
  const daysInMonth = getDaysInMonth(month.year, month.month);
  const firstWeekday = (new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay() + 6) % 7;
  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const previousMonthDays = getDaysInMonth(previousMonth.year, previousMonth.month);
  const cells: CalendarDayCell[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    const day = previousMonthDays - firstWeekday + index + 1;
    cells.push({
      ...previousMonth,
      day,
      key: getCalendarKey(previousMonth.year, previousMonth.month, day),
      inCurrentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      ...month,
      day,
      key: getCalendarKey(month.year, month.month, day),
      inCurrentMonth: true,
    });
  }

  const trailing = (7 - (cells.length % 7)) % 7;
  for (let index = 1; index <= trailing; index += 1) {
    cells.push({
      ...nextMonth,
      day: index,
      key: getCalendarKey(nextMonth.year, nextMonth.month, index),
      inCurrentMonth: false,
    });
  }

  return cells;
}

function createNominalUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function getInsightKey(item: MailInsightItem) {
  return `${item.messageId}:${item.dueAt}:${item.type}`;
}

export function CalendarView() {
  const { insights, isLoadingMail, fetchInsights, syncToCalendar } = useMail();
  const { locale } = useApp();

  const localeTag = useMemo(() => getLocaleTag(locale), [locale]);
  const timeZone = insights?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const [calendarNow, setCalendarNow] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>(() => {
    const today = getTimeZoneDateParts(new Date(), timeZone);
    return { year: today.year, month: today.month };
  });
  const [selectedDayKey, setSelectedDayKey] = useState(() => {
    const today = getTimeZoneDateParts(new Date(), timeZone);
    return getCalendarKey(today.year, today.month, today.day);
  });
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set());
  const [syncError, setSyncError] = useState<string | null>(null);
  const previousTodayRef = useRef<{ key: string; month: CalendarMonth } | null>(null);

  useEffect(() => {
    fetchInsights(100, 30);
  }, [fetchInsights]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCalendarNow(new Date());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const today = getTimeZoneDateParts(new Date(), timeZone);
    setVisibleMonth({ year: today.year, month: today.month });
    setSelectedDayKey(getCalendarKey(today.year, today.month, today.day));
  }, [timeZone]);

  const typeLabels = useMemo<Record<MailInsightType, string>>(
    () => ({
      ddl: locale === "zh" ? "截止日期" : locale === "ja" ? "締切" : "Deadline",
      meeting: locale === "zh" ? "会议" : locale === "ja" ? "会議" : "Meeting",
      exam: locale === "zh" ? "考试" : locale === "ja" ? "試験" : "Exam",
      event: locale === "zh" ? "事项" : locale === "ja" ? "イベント" : "Event",
    }),
    [locale]
  );

  const weekdayLabels = useMemo(() => {
    if (locale === "zh") {
      return ["一", "二", "三", "四", "五", "六", "日"];
    }
    if (locale === "ja") {
      return ["月", "火", "水", "木", "金", "土", "日"];
    }
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  }, [locale]);

  const allCalendarItems = useMemo(() => {
    const deduped = new Map<string, MailInsightItem>();

    for (const item of [...(insights?.tomorrowDdl ?? []), ...(insights?.upcoming ?? [])]) {
      deduped.set(getInsightKey(item), item);
    }

    return Array.from(deduped.values()).sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  }, [insights]);

  const itemsByDay = useMemo<EventGroupMap>(() => {
    const grouped: EventGroupMap = new Map();

    for (const item of allCalendarItems) {
      const parts = getTimeZoneDateParts(item.dueAt, timeZone);
      const key = getCalendarKey(parts.year, parts.month, parts.day);
      const existing = grouped.get(key) ?? [];
      existing.push(item);
      grouped.set(key, existing);
    }

    return grouped;
  }, [allCalendarItems, timeZone]);

  const today = useMemo(() => getTimeZoneDateParts(calendarNow, timeZone), [calendarNow, timeZone]);
  const todayKey = useMemo(() => getCalendarKey(today.year, today.month, today.day), [today]);
  const monthCells = useMemo(() => getMonthGrid(visibleMonth), [visibleMonth]);
  const selectedDayItems = itemsByDay.get(selectedDayKey) ?? [];
  const tomorrowDdl = insights?.tomorrowDdl ?? [];
  const upcomingItems = allCalendarItems;

  useEffect(() => {
    const prefix = `${visibleMonth.year}-${pad(visibleMonth.month)}-`;
    if (selectedDayKey.startsWith(prefix)) {
      return;
    }

    if (visibleMonth.year === today.year && visibleMonth.month === today.month) {
      setSelectedDayKey(todayKey);
      return;
    }

    setSelectedDayKey(getCalendarKey(visibleMonth.year, visibleMonth.month, 1));
  }, [selectedDayKey, today, todayKey, visibleMonth]);

  useEffect(() => {
    const previousToday = previousTodayRef.current;
    if (
      previousToday &&
      previousToday.key !== todayKey &&
      selectedDayKey === previousToday.key
    ) {
      if (
        visibleMonth.year === previousToday.month.year &&
        visibleMonth.month === previousToday.month.month
      ) {
        setVisibleMonth({ year: today.year, month: today.month });
      }
      setSelectedDayKey(todayKey);
    }

    previousTodayRef.current = {
      key: todayKey,
      month: { year: today.year, month: today.month },
    };
  }, [selectedDayKey, today, todayKey, visibleMonth]);

  const formatDueAt = useCallback(
    (dateStr: string) =>
      new Intl.DateTimeFormat(localeTag, {
        timeZone,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(dateStr)),
    [localeTag, timeZone]
  );

  const formatMonthLabel = useCallback(
    (month: CalendarMonth) =>
      new Intl.DateTimeFormat(localeTag, {
        timeZone: "UTC",
        year: "numeric",
        month: "long",
      }).format(createNominalUtcDate(month.year, month.month, 1)),
    [localeTag]
  );

  const formatSelectedDayLabel = useCallback(
    (key: string) => {
      const parts = parseCalendarKey(key);
      return new Intl.DateTimeFormat(localeTag, {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(createNominalUtcDate(parts.year, parts.month, parts.day));
    },
    [localeTag]
  );

  const formatCalendarDayAriaLabel = useCallback(
    (cell: CalendarDayCell, eventCount: number) => {
      const dateLabel = new Intl.DateTimeFormat(localeTag, {
        timeZone: "UTC",
        dateStyle: "full",
      }).format(createNominalUtcDate(cell.year, cell.month, cell.day));

      if (locale === "zh") {
        return eventCount > 0 ? `${dateLabel}，${eventCount} 项事项` : dateLabel;
      }
      if (locale === "ja") {
        return eventCount > 0 ? `${dateLabel}、予定 ${eventCount} 件` : dateLabel;
      }
      return eventCount > 0 ? `${dateLabel}, ${eventCount} items` : dateLabel;
    },
    [locale, localeTag]
  );

  const handleSync = useCallback(
    async (item: MailInsightItem) => {
      const syncKey = getInsightKey(item);
      setSyncingIds((previous) => new Set(previous).add(syncKey));
      setSyncError(null);

      try {
        await syncToCalendar(item.messageId, item.subject, item.type, item.dueAt);
        setSyncedIds((previous) => new Set(previous).add(syncKey));
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "同步失败");
      } finally {
        setSyncingIds((previous) => {
          const next = new Set(previous);
          next.delete(syncKey);
          return next;
        });
      }
    },
    [syncToCalendar]
  );

  const renderSyncButton = useCallback(
    (item: MailInsightItem, tone: "primary" | "secondary") => {
      const syncKey = getInsightKey(item);
      const isSyncing = syncingIds.has(syncKey);
      const isSynced = syncedIds.has(syncKey);
      const className =
        tone === "primary"
          ? "mt-3 rounded-full bg-[color:var(--button-primary)] px-3 py-1.5 text-xs font-medium text-[color:var(--button-primary-ink)] transition hover:bg-[color:var(--button-primary-hover)] disabled:opacity-50"
          : "mt-3 rounded-full border border-[color:var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)] disabled:opacity-50";

      return (
        <button onClick={() => void handleSync(item)} disabled={isSyncing || isSynced} className={className}>
          {isSyncing ? (
            <LoadingSpinner size="sm" />
          ) : isSynced ? (
            locale === "zh" ? "已同步" : locale === "ja" ? "同期済み" : "Synced"
          ) : locale === "zh" ? (
            tone === "primary" ? "同步到日历" : "同步"
          ) : locale === "ja" ? (
            tone === "primary" ? "カレンダーに同期" : "同期"
          ) : tone === "primary" ? (
            "Sync to Calendar"
          ) : (
            "Sync"
          )}
        </button>
      );
    },
    [handleSync, locale, syncedIds, syncingIds]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ink)]">
          {locale === "zh" ? "日历" : locale === "ja" ? "カレンダー" : "Calendar"}
        </h2>
        <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
          {locale === "zh"
            ? "将邮件中的 DDL、会议、考试等同步到 Outlook 日历"
            : locale === "ja"
              ? "メールから抽出した締切、会議、試験などをOutlookカレンダーに同期"
              : "Sync DDL, meetings, exams from emails to Outlook calendar"}
        </p>
      </div>

      <section className="rounded-[1.4rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ink)]">
              {locale === "zh" ? "月视图" : locale === "ja" ? "月表示" : "Month View"}
            </h3>
            <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
              {locale === "zh"
                ? "月视图会把当前窗口内识别出的事项直接铺在日期格子中。"
                : locale === "ja"
                  ? "月表示では、現在の期間で抽出した予定を日付セルへ直接並べます。"
                  : "The month view places detected mail events directly on their calendar days."}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}
              className="rounded-full border border-[color:var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
            >
              {locale === "zh" ? "上个月" : locale === "ja" ? "前月" : "Prev"}
            </button>
            <button
              onClick={() => {
                const nextToday = getTimeZoneDateParts(new Date(), timeZone);
                setVisibleMonth({ year: nextToday.year, month: nextToday.month });
                setSelectedDayKey(getCalendarKey(nextToday.year, nextToday.month, nextToday.day));
              }}
              className="rounded-full border border-[color:var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
            >
              {locale === "zh" ? "今天" : locale === "ja" ? "今日" : "Today"}
            </button>
            <button
              onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}
              className="rounded-full border border-[color:var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
            >
              {locale === "zh" ? "下个月" : locale === "ja" ? "次月" : "Next"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h4 className="text-base font-semibold text-[color:var(--ink)]">{formatMonthLabel(visibleMonth)}</h4>
          <span className="text-xs text-[color:var(--ink-subtle)]">{timeZone}</span>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-medium text-[color:var(--ink-subtle)]">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>

        {isLoadingMail ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-7 gap-2">
            {monthCells.map((cell) => {
              const cellItems = itemsByDay.get(cell.key) ?? [];
              const isSelected = cell.key === selectedDayKey;
              const isToday = cell.key === todayKey;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => {
                    setSelectedDayKey(cell.key);
                    if (!cell.inCurrentMonth) {
                      setVisibleMonth({ year: cell.year, month: cell.month });
                    }
                  }}
                  data-calendar-day-key={cell.key}
                  aria-label={formatCalendarDayAriaLabel(cell, cellItems.length)}
                  aria-pressed={isSelected}
                  className={[
                    DAY_CELL_MIN_HEIGHT,
                    "rounded-xl border px-2 py-2 text-left transition",
                    isSelected
                      ? "border-[color:var(--border-info)] bg-[color:var(--surface-info)]"
                      : "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] hover:bg-[color:var(--surface-elevated)]",
                    cell.inCurrentMonth ? "text-[color:var(--ink)]" : "text-[color:var(--ink-subtle)]",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={[
                        "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                        isToday ? "bg-emerald-500 text-white" : "",
                      ].join(" ")}
                    >
                      {cell.day}
                    </span>
                    {cellItems.length > 0 ? (
                      <span className="rounded-full bg-[color:var(--button-primary)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--button-primary-ink)]">
                        {cellItems.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 space-y-1">
                    {cellItems.slice(0, 3).map((item) => {
                      const key = getInsightKey(item);
                      const tone =
                        item.type === "ddl"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                          : item.type === "meeting"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : item.type === "exam"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                              : "bg-[color:var(--pill-default)] text-[color:var(--pill-default-ink)]";

                      return (
                        <span
                          key={key}
                          title={item.subject}
                          className={`block truncate rounded-md px-2 py-1 text-[11px] font-medium ${tone}`}
                          data-mail-calendar-chip="true"
                        >
                          {item.subject}
                        </span>
                      );
                    })}
                    {cellItems.length > 3 ? (
                      <span className="block text-[11px] text-[color:var(--ink-subtle)]">
                        {locale === "zh"
                          ? `还有 ${cellItems.length - 3} 项`
                          : locale === "ja"
                            ? `ほか ${cellItems.length - 3} 件`
                            : `${cellItems.length - 3} more`}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="rounded-[1.4rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--ink)]">
                {locale === "zh" ? "当日事项" : locale === "ja" ? "当日の予定" : "Selected Day"}
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatSelectedDayLabel(selectedDayKey)}</p>
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {locale === "zh" ? `${selectedDayItems.length} 项` : locale === "ja" ? `${selectedDayItems.length} 件` : `${selectedDayItems.length} items`}
            </span>
          </div>

          {selectedDayItems.length === 0 ? (
            <div className="mt-4 rounded-[1.2rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] py-8 text-center text-sm text-[color:var(--ink-subtle)]">
              {locale === "zh"
                ? "这一天暂时没有识别到邮件事项"
                : locale === "ja"
                  ? "この日に抽出されたメール予定はありません"
                  : "No mail events detected for this day"}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {selectedDayItems.map((item) => (
                <div
                  key={getInsightKey(item)}
                  className="rounded-[1.2rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4 shadow-[var(--shadow-inset)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[color:var(--ink)]">{item.subject}</p>
                      <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{formatDueAt(item.dueAt)}</p>
                      {item.evidence ? (
                        <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{item.evidence}</p>
                      ) : null}
                    </div>
                    <CalmPill
                      tone={
                        item.type === "ddl"
                          ? "warning"
                          : item.type === "meeting"
                            ? "info"
                            : item.type === "exam"
                              ? "urgent"
                              : "muted"
                      }
                    >
                      {typeLabels[item.type]}
                    </CalmPill>
                  </div>
                  {renderSyncButton(item, "secondary")}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {tomorrowDdl.length > 0 ? (
            <section className="rounded-[1.4rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] p-4 shadow-[var(--shadow-soft)]">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[color:var(--ink)]">
                <span className="flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
                {locale === "zh" ? "明天的截止日期" : locale === "ja" ? "明日の締切" : "Tomorrow's Deadlines"}
              </h3>
              <div className="space-y-2">
                {tomorrowDdl.map((item) => (
                  <div
                    key={getInsightKey(item)}
                    className="rounded-[1.2rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-elevated)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[color:var(--ink)]">{item.subject}</p>
                        <p className="mt-1 text-xs text-[color:var(--pill-urgent-ink)]">{formatDueAt(item.dueAt)}</p>
                        {item.evidence ? <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{item.evidence}</p> : null}
                      </div>
                      <CalmPill tone="urgent">
                        {typeLabels[item.type]}
                      </CalmPill>
                    </div>
                    {renderSyncButton(item, "primary")}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-[1.4rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-4 shadow-[var(--shadow-soft)]">
            <h3 className="mb-2 text-sm font-semibold text-[color:var(--ink)]">
              {locale === "zh" ? "近期事项" : locale === "ja" ? "今後のイベント" : "Upcoming Events"}
            </h3>

            {isLoadingMail ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="lg" />
              </div>
            ) : upcomingItems.length === 0 ? (
              <div className="rounded-[1.2rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] py-8 text-center text-sm text-[color:var(--ink-subtle)]">
                {locale === "zh"
                  ? "未来 30 天没有识别到需要同步的事项"
                  : locale === "ja"
                    ? "今後30日に同期すべきイベントはありません"
                    : "No syncable events in the next 30 days"}
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingItems.map((item) => (
                  <div
                    key={getInsightKey(item)}
                    className="rounded-[1.2rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4 shadow-[var(--shadow-inset)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[color:var(--ink)]">{item.subject}</p>
                        <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{formatDueAt(item.dueAt)}</p>
                        {item.evidence ? (
                          <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{item.evidence}</p>
                        ) : null}
                      </div>
                      <CalmPill
                        tone={
                          item.type === "ddl"
                            ? "warning"
                            : item.type === "exam"
                              ? "urgent"
                              : item.type === "meeting"
                                ? "info"
                                : "muted"
                        }
                      >
                        {typeLabels[item.type]}
                      </CalmPill>
                    </div>
                    {renderSyncButton(item, "secondary")}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      {syncError ? (
        <div className="rounded-[1.1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] p-3 text-sm text-[color:var(--ink)]">
          {syncError}
        </div>
      ) : null}
    </div>
  );
}
