import React, { memo } from "react";
import type { MailInsightItem } from "../../types";
import { buildCalendarKey } from "../../utils/normalize";
import { formatDue } from "../../utils/format";
import { CalmButton, CalmPill } from "../ui/Calm";

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
    <li className="rounded-[1.1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-3 py-3 shadow-[var(--shadow-inset)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{item.subject}</p>
          <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{item.dueDateLabel || displayDate}</p>
          {item.aiSummary ? <p className="mt-1 line-clamp-2 text-xs text-[color:var(--ink-muted)]">{item.aiSummary}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CalmPill tone={item.type === "ddl" ? "warning" : item.type === "meeting" ? "info" : item.type === "exam" ? "urgent" : "muted"}>
            {item.type}
          </CalmPill>

          {!synced ? (
            <CalmButton
              type="button"
              onClick={() => onSyncCalendar(item)}
              variant="secondary"
              className="px-2.5 py-1 text-[11px]"
              disabled={busy}
            >
              {busy ? t("common.processing") : t("common.addToCalendar")}
            </CalmButton>
          ) : (
            <CalmButton
              type="button"
              onClick={() => onUndoCalendar(item, synced.eventId)}
              variant="secondary"
              className="px-2.5 py-1 text-[11px]"
              disabled={busy}
            >
              {busy ? t("common.processing") : t("common.undo")}
            </CalmButton>
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
