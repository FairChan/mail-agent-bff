"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";

interface CalendarEvent {
  id: string;
  subject: string;
  dueAt: string;
  type: "deadline" | "meeting" | "reminder";
  status?: "pending" | "done" | "overdue";
}

interface CalendarPageProps {
  insights: {
    upcoming?: Array<{ messageId: string; subject: string; dueAt: string }>;
  } | null;
  loading?: boolean;
  connectedMailbox?: string;
}

const DAYS: string[] = [];
const MONTHS: string[] = [];

export function CalendarPage({ insights, loading, connectedMailbox }: CalendarPageProps) {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const DAYS_KEYS = ["calendar.sunday", "calendar.monday", "calendar.tuesday", "calendar.wednesday", "calendar.thursday", "calendar.friday", "calendar.saturday"] as const;
  const MONTHS_KEYS = ["calendar.january", "calendar.february", "calendar.march", "calendar.april", "calendar.may", "calendar.june", "calendar.july", "calendar.august", "calendar.september", "calendar.october", "calendar.november", "calendar.december"] as const;
  const days = DAYS_KEYS.map((k) => t(k));
  const months = MONTHS_KEYS.map((k) => t(k));

  const today = useMemo(() => new Date(), []);
  today.setHours(0, 0, 0, 0);

  const events: CalendarEvent[] = useMemo(() => {
    return (insights?.upcoming ?? []).map((item) => {
      const due = new Date(item.dueAt);
      due.setHours(0, 0, 0, 0);
      const diff = due.getTime() - today.getTime();
      let status: CalendarEvent["status"] = "pending";
      if (diff < 0) status = "overdue";
      return { id: item.messageId, subject: item.subject, dueAt: item.dueAt, type: "deadline", status };
    });
  }, [insights, today]);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  function prevMonth() {
    setSelectedDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setSelectedDate(new Date(year, month + 1, 1));
  }
  function goToday() {
    setSelectedDate(new Date());
  }

  function getEventsForDay(day: number): CalendarEvent[] {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    return events.filter((e) => {
      const due = new Date(e.dueAt);
      due.setHours(0, 0, 0, 0);
      return due.getTime() === date.getTime();
    });
  }

  function getEventsForSelected(): CalendarEvent[] {
    return events.filter((e) => {
      const due = new Date(e.dueAt);
      due.setHours(0, 0, 0, 0);
      const sel = new Date(selectedDate);
      sel.setHours(0, 0, 0, 0);
      return due.getTime() === sel.getTime();
    });
  }

  const upcomingEvents = events
    .filter((e) => {
      const due = new Date(e.dueAt);
      due.setHours(0, 0, 0, 0);
      return due.getTime() >= today.getTime();
    })
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 8);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-72 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t("calendar.title")}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{connectedMailbox}</p>
        </div>
        <button
          onClick={goToday}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          {t("calendar.today")}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calendar */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          {/* Month nav */}
          <div className="mb-4 flex items-center justify-between">
            <button onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("calendar.yearMonth", { year, month: months[month] })}</span>
            <button onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="mb-2 grid grid-cols-7 gap-1">
            {days.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wider text-zinc-400">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              const isToday = day !== null && new Date(year, month, day).getTime() === today.getTime();
              const isSelected = day !== null && new Date(year, month, day).getTime() === new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
              const dayEvents = day !== null ? getEventsForDay(day) : [];
              const hasOverdue = dayEvents.some((e) => e.status === "overdue");
              const hasPending = dayEvents.some((e) => e.status === "pending");
              return (
                <button
                  key={idx}
                  onClick={() => day !== null && setSelectedDate(new Date(year, month, day))}
                  disabled={day === null}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-all",
                    day === null ? "cursor-default" : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
                    isToday && "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-950",
                    isSelected && "bg-blue-600 text-white hover:bg-blue-700",
                  )}
                >
                  {day}
                  {day !== null && (hasOverdue || hasPending) && (
                    <div className="absolute bottom-1 flex gap-0.5">
                      {hasOverdue && <div className="h-1 w-1 rounded-full bg-red-500" />}
                      {hasPending && <div className="h-1 w-1 rounded-full bg-blue-500" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: selected day + upcoming */}
        <div className="space-y-4">
          {/* Selected day events */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t("calendar.dateFormat", { month: selectedDate.getMonth() + 1, day: selectedDate.getDate(), weekday: days[selectedDate.getDay()] })}
            </h3>
            <div className="space-y-2">
              {getEventsForSelected().length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-400">{t("calendar.noSchedule")}</p>
              ) : (
                getEventsForSelected().map((ev) => (
                  <div key={ev.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                    <div className={cn(
                      "shrink-0 rounded-full p-1",
                      ev.status === "overdue" ? "bg-red-100 text-red-500 dark:bg-red-950 dark:text-red-400" :
                      ev.status === "done" ? "bg-emerald-100 text-emerald-500 dark:bg-emerald-950 dark:text-emerald-400" :
                      "bg-blue-100 text-blue-500 dark:bg-blue-950 dark:text-blue-400"
                    )}>
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /></svg>
                    </div>
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">{ev.subject}</span>
                    <span className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      ev.status === "overdue" ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400" :
                      ev.status === "done" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" :
                      "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                    )}>
                      {ev.status === "overdue" ? t("common.overdue") : ev.status === "done" ? t("common.done") : t("common.pending")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("calendar.upcoming")}</h3>
            <div className="space-y-2">
              {upcomingEvents.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-400">{t("calendar.noUpcoming")}</p>
              ) : (
                upcomingEvents.map((ev) => {
                  const due = new Date(ev.dueAt);
                  const day = due.getDate();
                  const daysLeft = daysUntil(ev.dueAt);
                  return (
                    <div key={ev.id} className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-50 dark:bg-zinc-900">
                        <span className="text-[10px] font-medium text-zinc-400">{months[due.getMonth()].slice(1)}</span>
                        <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{day}</span>
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">{ev.subject}</span>
                      <span className="shrink-0 text-[10px] text-zinc-400">
                        {daysLeft === 0 ? t("common.today") : t("dashboard.daysLeft", { count: daysLeft })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
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
