import { useMemo, useState } from "react";
import type { EventCluster, MailKnowledgeRecord } from "@mail-agent/shared-types";
import { useApp } from "../../../contexts/AppContext";
import { CalmPill, CalmSectionLabel, CalmSurface } from "../../ui/Calm";

interface EventsClusterPanelProps {
  events: EventCluster[];
  mails: MailKnowledgeRecord[];
}

export function EventsClusterPanel({ events, mails }: EventsClusterPanelProps) {
  const { locale } = useApp();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const dateLocale = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US";
  const labels = {
    explorer: locale === "zh" ? "事件总览" : locale === "ja" ? "イベント一覧" : "Event Explorer",
    detail: locale === "zh" ? "事件详情" : locale === "ja" ? "イベント詳細" : "Event Detail",
    empty: locale === "zh" ? "暂无事件数据" : locale === "ja" ? "イベントはまだありません" : "No event data yet",
    search: locale === "zh" ? "搜索事件..." : locale === "ja" ? "イベントを検索..." : "Search events...",
    relatedMails: locale === "zh" ? "关联邮件" : locale === "ja" ? "関連メール" : "Related mails",
    summary: locale === "zh" ? "事件总结" : locale === "ja" ? "イベント要約" : "Summary",
    keyInfo: locale === "zh" ? "关键信息" : locale === "ja" ? "重要情報" : "Key info",
    tags: locale === "zh" ? "标签" : locale === "ja" ? "タグ" : "Tags",
    updatedAt: locale === "zh" ? "最后更新" : locale === "ja" ? "最終更新" : "Updated",
    pickPrompt: locale === "zh" ? "选择一个事件查看详情" : locale === "ja" ? "イベントを選ぶと詳細が表示されます" : "Select an event to inspect details",
    mailsUnit: locale === "zh" ? "封邮件" : locale === "ja" ? "通のメール" : "mails",
  };

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const query = searchQuery.toLowerCase();
        return (
          event.name.toLowerCase().includes(query) ||
          event.summary.toLowerCase().includes(query)
        );
      }),
    [events, searchQuery]
  );

  const selectedEvent =
    filteredEvents.find((event) => event.eventId === selectedEventId) ??
    filteredEvents[0] ??
    null;

  const relatedMails = useMemo(() => {
    if (!selectedEvent) {
      return [];
    }
    return selectedEvent.relatedMailIds
      .map((id) => mails.find((mail) => mail.mailId === id))
      .filter((mail): mail is MailKnowledgeRecord => mail !== undefined);
  }, [mails, selectedEvent]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(dateLocale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "-";
    }
  };

  if (events.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[1.35rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-6 text-center shadow-[var(--shadow-inset)]">
        <div>
          <CalmSectionLabel>{labels.explorer}</CalmSectionLabel>
          <p className="mt-2 text-sm text-[color:var(--ink-subtle)]">{labels.empty}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <CalmSurface className="flex min-h-[36rem] flex-col p-5" beam>
        <CalmSectionLabel>{labels.explorer}</CalmSectionLabel>
        <input
          type="text"
          placeholder={labels.search}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="calm-input mt-4 w-full px-4 py-2.5 text-sm"
        />

        <div className="mt-4 flex-1 space-y-2 overflow-auto">
          {filteredEvents.map((event) => {
            const isSelected = selectedEvent?.eventId === event.eventId;
            return (
              <button
                key={event.eventId}
                type="button"
                onClick={() => setSelectedEventId(event.eventId)}
                className={`w-full rounded-[1.1rem] border px-4 py-4 text-left transition ${
                  isSelected
                    ? "border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] shadow-[var(--shadow-soft)]"
                    : "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-elevated)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CalmPill tone="info">{event.relatedMailIds.length} {labels.mailsUnit}</CalmPill>
                      <span className="text-[11px] font-mono text-[color:var(--ink-subtle)]">{event.eventId}</span>
                    </div>
                    <h4 className="mt-2 truncate text-sm font-semibold text-[color:var(--ink)]">{event.name}</h4>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-[color:var(--ink-muted)]">{event.summary}</p>
                    {event.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {event.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full bg-[color:var(--surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink-muted)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-[color:var(--ink-subtle)]">{formatDate(event.lastUpdated)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </CalmSurface>

      <CalmSurface className="min-h-[36rem] p-6">
        {selectedEvent ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <CalmSectionLabel>{labels.detail}</CalmSectionLabel>
              <span className="text-xs font-mono text-[color:var(--ink-subtle)]">{selectedEvent.eventId}</span>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-[color:var(--ink)]">{selectedEvent.name}</h3>
              <p className="mt-2 text-sm text-[color:var(--ink-subtle)]">
                {labels.updatedAt}: {formatDate(selectedEvent.lastUpdated)}
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[color:var(--ink)]">{labels.summary}</p>
              <div className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4 text-sm leading-7 text-[color:var(--ink-muted)]">
                {selectedEvent.summary}
              </div>
            </div>

            {selectedEvent.keyInfo.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium text-[color:var(--ink)]">{labels.keyInfo}</p>
                <ul className="space-y-2">
                  {selectedEvent.keyInfo.map((info, idx) => (
                    <li
                      key={`${selectedEvent.eventId}-${idx}`}
                      className="rounded-[1rem] border border-[color:var(--border-info)] bg-[color:var(--surface-info)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]"
                    >
                      {info}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selectedEvent.tags.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium text-[color:var(--ink)]">{labels.tags}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedEvent.tags.map((tag) => (
                    <CalmPill key={tag} tone="muted">
                      {tag}
                    </CalmPill>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-3 text-sm font-medium text-[color:var(--ink)]">
                {labels.relatedMails} ({selectedEvent.relatedMailIds.length})
              </p>
              <div className="space-y-2">
                {relatedMails.map((mail) => (
                  <div
                    key={mail.mailId}
                    className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{mail.subject}</p>
                        <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{mail.mailId}</p>
                      </div>
                      <span className="text-xs text-[color:var(--ink-subtle)]">{formatDate(mail.receivedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--ink-subtle)]">
            {labels.pickPrompt}
          </div>
        )}
      </CalmSurface>
    </div>
  );
}
