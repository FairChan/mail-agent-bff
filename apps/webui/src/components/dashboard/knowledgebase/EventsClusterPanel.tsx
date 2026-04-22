import { useMemo, useState } from "react";
import type { EventCluster, MailKnowledgeRecord, PersonProfile } from "@mail-agent/shared-types";
import { useApp } from "../../../contexts/AppContext";
import { useDrawerStore } from "../../drawer";
import { CalmPill, CalmSectionLabel, CalmSurface } from "../../ui/Calm";

interface EventsClusterPanelProps {
  events: EventCluster[];
  mails: MailKnowledgeRecord[];
  persons: PersonProfile[];
}

export function EventsClusterPanel({ events, mails, persons }: EventsClusterPanelProps) {
  const { locale } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const openDrawer = useDrawerStore((state) => state.openDrawer);

  const dateLocale = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US";
  const labels = {
    explorer: locale === "zh" ? "事件总览" : locale === "ja" ? "イベント一覧" : "Event Explorer",
    detail: locale === "zh" ? "事件详情" : locale === "ja" ? "イベント詳細" : "Event Detail",
    empty: locale === "zh" ? "暂无事件数据" : locale === "ja" ? "イベントはまだありません" : "No event data yet",
    search: locale === "zh" ? "搜索事件..." : locale === "ja" ? "イベントを検索..." : "Search events...",
    relatedMails: locale === "zh" ? "关联邮件" : locale === "ja" ? "関連メール" : "Related mails",
    summary: locale === "zh" ? "事件总结" : locale === "ja" ? "イベント要約" : "Summary",
    keyInfo: locale === "zh" ? "关键信息" : locale === "ja" ? "重要情報" : "Key info",
    updatedAt: locale === "zh" ? "最后更新" : locale === "ja" ? "最終更新" : "Updated",
    openDrawer: locale === "zh" ? "打开事件叠页" : locale === "ja" ? "イベントページを開く" : "Open event page",
    visibleRelated: locale === "zh" ? "已载入" : locale === "ja" ? "読み込み済み" : "Loaded",
    noMatches: locale === "zh" ? "没有匹配的事件" : locale === "ja" ? "一致するイベントはありません" : "No matching events",
    intro:
      locale === "zh"
        ? "事件索引保留在主页面，详细脉络、关键信息和关联邮件会作为右侧页面叠加展开。"
        : locale === "ja"
          ? "イベントの索引はメイン画面に残し、詳細は右側の重なったページで開きます。"
          : "Keep the event index on the canvas and open deep context as stacked right-side pages.",
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

  const mailById = useMemo(() => new Map(mails.map((mail) => [mail.mailId, mail])), [mails]);
  const personNameById = useMemo(
    () => Object.fromEntries(persons.map((person) => [person.personId, person.name])),
    [persons]
  );

  const getRelatedMails = (event: EventCluster) =>
    event.relatedMailIds
      .map((id) => mailById.get(id))
      .filter((mail): mail is MailKnowledgeRecord => mail !== undefined);

  const openEventDrawer = (event: EventCluster) => {
    openDrawer("eventClusterDetail", {
      event,
      relatedMails: getRelatedMails(event),
      personNameById,
    });
  };

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
    <div className="flex min-h-full flex-col gap-5">
      <CalmSurface className="p-5" beam>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CalmSectionLabel>{labels.explorer}</CalmSectionLabel>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
              {labels.detail}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--ink-muted)]">{labels.intro}</p>
          </div>
          <div className="rounded-[1.15rem] border border-[color:var(--border-info)] bg-[color:var(--surface-info)] px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--pill-info-ink)]">
              Events
            </p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--ink)]">{filteredEvents.length}</p>
          </div>
        </div>

        <input
          type="text"
          placeholder={labels.search}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="calm-input mt-5 w-full px-4 py-2.5 text-sm"
        />
      </CalmSurface>

      <div className="grid gap-3 lg:grid-cols-2">
        {filteredEvents.map((event, index) => {
          const relatedMails = getRelatedMails(event);
          return (
            <button
              key={event.eventId}
              type="button"
              onClick={() => openEventDrawer(event)}
              className={`mail-stack-card group rounded-[1.35rem] border bg-[color:var(--surface-elevated)] p-5 text-left transition duration-150 hover:-translate-y-0.5 hover:border-[color:var(--border-info)] hover:bg-[color:var(--surface-soft)] ${
                index === 0 ? "border-[color:var(--border-info)]" : "border-[color:var(--border-soft)]"
              }`}
              aria-label={`打开事件详情：${event.name || event.eventId}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CalmPill tone="info">{event.relatedMailIds.length} {labels.mailsUnit}</CalmPill>
                    <CalmPill tone="muted">{labels.visibleRelated} {relatedMails.length}</CalmPill>
                    <span className="text-[11px] font-mono text-[color:var(--ink-subtle)]">{event.eventId}</span>
                  </div>
                  <h3 className="mt-3 truncate text-base font-semibold text-[color:var(--ink)]">{event.name}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--ink-muted)]">{event.summary}</p>
                  {event.keyInfo.length > 0 ? (
                    <p className="mt-3 line-clamp-1 text-xs font-medium text-[color:var(--pill-info-ink)]">
                      {labels.keyInfo}: {event.keyInfo[0]}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-[color:var(--ink-subtle)]">{labels.updatedAt}</p>
                  <p className="mt-1 text-xs font-medium text-[color:var(--ink-muted)]">{formatDate(event.lastUpdated)}</p>
                </div>
              </div>

              {event.tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
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

              <p className="mt-4 text-xs font-semibold text-[color:var(--pill-info-ink)] transition group-hover:translate-x-0.5">
                {labels.openDrawer} →
              </p>
            </button>
          );
        })}

        {filteredEvents.length === 0 ? (
          <div className="rounded-[1.25rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--ink-subtle)] lg:col-span-2">
            {labels.noMatches}
          </div>
        ) : null}
      </div>
    </div>
  );
}
