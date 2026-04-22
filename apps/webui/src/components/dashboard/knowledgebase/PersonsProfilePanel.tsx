import { useMemo, useState } from "react";
import type { EventCluster, PersonProfile, MailKnowledgeRecord } from "@mail-agent/shared-types";
import { useApp } from "../../../contexts/AppContext";
import { useDrawerStore } from "../../drawer";
import { CalmPill, CalmSectionLabel, CalmSurface } from "../../ui/Calm";

interface PersonsProfilePanelProps {
  persons: PersonProfile[];
  mails: MailKnowledgeRecord[];
  events: EventCluster[];
}

export function PersonsProfilePanel({ persons, mails, events }: PersonsProfilePanelProps) {
  const { locale } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const openDrawer = useDrawerStore((state) => state.openDrawer);

  const dateLocale = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US";
  const labels = {
    explorer: locale === "zh" ? "人物画像" : locale === "ja" ? "人物プロファイル" : "People Profiles",
    detail: locale === "zh" ? "人物详情" : locale === "ja" ? "人物詳細" : "Profile Detail",
    empty: locale === "zh" ? "暂无人物数据" : locale === "ja" ? "人物データはまだありません" : "No people data yet",
    search: locale === "zh" ? "搜索人物..." : locale === "ja" ? "人物を検索..." : "Search people...",
    unknownRole: locale === "zh" ? "未知角色" : locale === "ja" ? "役割未設定" : "Unknown role",
    profile: locale === "zh" ? "人物画像" : locale === "ja" ? "人物メモ" : "Profile",
    relatedMails: locale === "zh" ? "相关邮件" : locale === "ja" ? "関連メール" : "Related mails",
    importance: locale === "zh" ? "重要性" : locale === "ja" ? "重要度" : "Importance",
    mailCount: locale === "zh" ? "邮件数" : locale === "ja" ? "メール数" : "Mail count",
    interactions: locale === "zh" ? "交互次数" : locale === "ja" ? "やり取り" : "Interactions",
    updatedAt: locale === "zh" ? "最后更新" : locale === "ja" ? "最終更新" : "Updated",
    openDrawer: locale === "zh" ? "打开人物叠页" : locale === "ja" ? "人物ページを開く" : "Open profile page",
    noMatches: locale === "zh" ? "没有匹配的人物" : locale === "ja" ? "一致する人物はありません" : "No matching people",
    intro:
      locale === "zh"
        ? "人物卡片作为知识库索引停留在主页面，完整画像与往来邮件通过右侧叠页展开。"
        : locale === "ja"
          ? "人物カードを索引として残し、詳細は右側の重なったページで開きます。"
          : "Use people cards as the index and open full relationship context in stacked right-side pages.",
    mailsUnit: locale === "zh" ? "封邮件" : locale === "ja" ? "通のメール" : "mails",
  };

  const filteredPersons = useMemo(
    () =>
      persons.filter((person) => {
        const query = searchQuery.toLowerCase();
        return (
          person.name.toLowerCase().includes(query) ||
          person.email.toLowerCase().includes(query) ||
          (person.role ?? "").toLowerCase().includes(query)
        );
      }),
    [persons, searchQuery]
  );

  const mailCountByPersonId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mail of mails) {
      counts.set(mail.personId, (counts.get(mail.personId) ?? 0) + 1);
    }
    return counts;
  }, [mails]);
  const eventNameById = useMemo(
    () => Object.fromEntries(events.map((event) => [event.eventId, event.name])),
    [events]
  );

  const getRelatedMails = (person: PersonProfile) =>
    mails.filter((mail) => mail.personId === person.personId);

  const openPersonDrawer = (person: PersonProfile) => {
    openDrawer("personProfileDetail", {
      person,
      relatedMails: getRelatedMails(person),
      eventNameById,
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

  const getImportanceTone = (importance: number) => {
    const normalized = importance > 1 ? importance / 10 : importance;
    if (normalized >= 0.8) return "urgent";
    if (normalized >= 0.5) return "warning";
    return "muted";
  };

  const formatImportance = (importance: number) =>
    importance > 1 ? `${importance}/10` : `${Math.round(importance * 100)}%`;

  if (persons.length === 0) {
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
              People
            </p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--ink)]">{filteredPersons.length}</p>
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
        {filteredPersons.map((person, index) => {
          const mailCount = mailCountByPersonId.get(person.personId) ?? 0;
          return (
            <button
              key={person.personId}
              type="button"
              onClick={() => openPersonDrawer(person)}
              className={`mail-stack-card group rounded-[1.35rem] border bg-[color:var(--surface-elevated)] p-5 text-left transition duration-150 hover:-translate-y-0.5 hover:border-[color:var(--border-info)] hover:bg-[color:var(--surface-soft)] ${
                index === 0 ? "border-[color:var(--border-info)]" : "border-[color:var(--border-soft)]"
              }`}
              aria-label={`打开人物详情：${person.name || person.personId}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(17,40,79,0.92),rgba(86,154,255,0.78))] text-xl font-semibold text-white shadow-[var(--shadow-soft)]">
                  {person.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-[color:var(--ink)]">{person.name}</h3>
                    <CalmPill tone={getImportanceTone(person.importance)}>
                      {labels.importance} {formatImportance(person.importance)}
                    </CalmPill>
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--ink-muted)]">{person.role || labels.unknownRole}</p>
                  <p className="mt-1 truncate text-xs text-[color:var(--ink-subtle)]">{person.email}</p>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-[color:var(--ink-muted)]">{person.profile}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--ink-subtle)]">
                    <span>{mailCount} {labels.mailsUnit}</span>
                    <span>{person.recentInteractions} {labels.interactions}</span>
                    <span>{labels.updatedAt}: {formatDate(person.lastUpdated)}</span>
                  </div>
                  <p className="mt-4 text-xs font-semibold text-[color:var(--pill-info-ink)] transition group-hover:translate-x-0.5">
                    {labels.openDrawer} →
                  </p>
                </div>
              </div>
            </button>
          );
        })}

        {filteredPersons.length === 0 ? (
          <div className="rounded-[1.25rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--ink-subtle)] lg:col-span-2">
            {labels.noMatches}
          </div>
        ) : null}
      </div>
    </div>
  );
}
