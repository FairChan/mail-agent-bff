import React, { memo } from "react";
import type { MailInsightItem } from "../../types";
import { buildCalendarKey } from "../../utils/normalize";
import { formatDue } from "../../utils/format";

interface InsightItemProps {
  item: MailInsightItem;
  calendarBusyByKey: Record<string, boolean>;
  calendarEventsByKey: Record<string, { eventId: string; eventWebLink?: string }>;
  t?: (key: string) => string;
  onSyncCalendar: (item: MailInsightItem) => void;
  onUndoCalendar: (item: MailInsightItem, eventId: string) => void;
  formatDueOverride: ((iso: string) => string) | undefined;
}

const InsightItemComponent = ({
  item,
  calendarBusyByKey,
  calendarEventsByKey,
  t = (k: string) => k,
  onSyncCalendar,
  onUndoCalendar,
  formatDueOverride,
}: InsightItemProps) => {
  const key = buildCalendarKey(item);
  const busy = Boolean(calendarBusyByKey[key]);
  const synced = calendarEventsByKey[key] ?? null;
  const displayDate = formatDueOverride ? formatDueOverride(item.dueAt) : formatDue(item.dueAt);

  return (
    <li className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">{item.subject}</p>
          <p className="mt-1 text-xs text-zinc-500">{item.dueDateLabel || displayDate}</p>
          {item.aiSummary ? <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.aiSummary}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-700">
            {item.type}
          </span>

          {!synced ? (
            <button
              type="button"
              onClick={() => onSyncCalendar(item)}
              className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
              disabled={busy}
            >
              {busy ? t("common.processing") : t("common.addToCalendar")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onUndoCalendar(item, synced.eventId)}
                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
                disabled={busy}
              >
                {busy ? t("common.processing") : t("common.undo")}
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function propsAreEqual(prevProps: InsightItemProps, nextProps: InsightItemProps): boolean {
  const prevKey = buildCalendarKey(prevProps.item);
  const nextKey = buildCalendarKey(nextProps.item);

  return (
    prevProps.item.messageId === nextProps.item.messageId &&
    prevProps.item.subject === nextProps.item.subject &&
    prevProps.item.dueAt === nextProps.item.dueAt &&
    prevProps.item.dueDateLabel === nextProps.item.dueDateLabel &&
    prevProps.item.aiSummary === nextProps.item.aiSummary &&
    prevProps.item.type === nextProps.item.type &&
    prevProps.calendarBusyByKey[prevKey] === nextProps.calendarBusyByKey[nextKey] &&
    prevProps.calendarEventsByKey[prevKey] === nextProps.calendarEventsByKey[nextKey] &&
    prevProps.onSyncCalendar === nextProps.onSyncCalendar &&
    prevProps.onUndoCalendar === nextProps.onUndoCalendar &&
    prevProps.formatDueOverride === nextProps.formatDueOverride
  );
}

export const InsightItem = memo(InsightItemComponent, propsAreEqual);
