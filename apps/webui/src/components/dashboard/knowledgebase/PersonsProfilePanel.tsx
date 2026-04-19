import { useMemo, useState } from "react";
import type { PersonProfile, MailKnowledgeRecord } from "@mail-agent/shared-types";
import { useApp } from "../../../contexts/AppContext";
import { CalmPill, CalmSectionLabel, CalmSurface } from "../../ui/Calm";

interface PersonsProfilePanelProps {
  persons: PersonProfile[];
  mails: MailKnowledgeRecord[];
}

export function PersonsProfilePanel({ persons, mails }: PersonsProfilePanelProps) {
  const { locale } = useApp();
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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
    pickPrompt: locale === "zh" ? "选择一个人物查看详情" : locale === "ja" ? "人物を選ぶと詳細が表示されます" : "Select a person to inspect details",
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

  const selectedPerson =
    filteredPersons.find((person) => person.personId === selectedPersonId) ??
    filteredPersons[0] ??
    null;

  const relatedMails = useMemo(
    () =>
      selectedPerson
        ? mails.filter((mail) => mail.personId === selectedPerson.personId)
        : [],
    [mails, selectedPerson]
  );

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
    if (importance >= 8) return "urgent";
    if (importance >= 5) return "warning";
    return "muted";
  };

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
          {filteredPersons.map((person) => {
            const isSelected = selectedPerson?.personId === person.personId;
            const mailCount = mails.filter((mail) => mail.personId === person.personId).length;
            return (
              <button
                key={person.personId}
                type="button"
                onClick={() => setSelectedPersonId(person.personId)}
                className={`w-full rounded-[1.1rem] border px-4 py-4 text-left transition ${
                  isSelected
                    ? "border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] shadow-[var(--shadow-soft)]"
                    : "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-elevated)]"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(17,40,79,0.92),rgba(86,154,255,0.78))] text-lg font-semibold text-white shadow-[var(--shadow-soft)]">
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-[color:var(--ink)]">{person.name}</h4>
                      <CalmPill tone={getImportanceTone(person.importance)}>{labels.importance} {person.importance}</CalmPill>
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--ink-muted)]">{person.role || labels.unknownRole}</p>
                    <p className="mt-1 truncate text-xs text-[color:var(--ink-subtle)]">{person.email}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--ink-subtle)]">
                      <span>{mailCount} {labels.mailsUnit}</span>
                      <span>{person.recentInteractions} {labels.interactions}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CalmSurface>

      <CalmSurface className="min-h-[36rem] p-6">
        {selectedPerson ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(17,40,79,0.92),rgba(86,154,255,0.78))] text-2xl font-semibold text-white shadow-[var(--shadow-soft)]">
                {selectedPerson.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <CalmSectionLabel>{labels.detail}</CalmSectionLabel>
                <h3 className="mt-1 text-xl font-semibold text-[color:var(--ink)]">{selectedPerson.name}</h3>
                <p className="text-sm text-[color:var(--ink-muted)]">{selectedPerson.role || labels.unknownRole}</p>
                <p className="text-sm text-[color:var(--ink-subtle)]">{selectedPerson.email}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [labels.importance, selectedPerson.importance],
                [labels.mailCount, relatedMails.length],
                [labels.interactions, selectedPerson.recentInteractions],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4 text-center"
                >
                  <p className="text-2xl font-bold text-[color:var(--ink)]">{value}</p>
                  <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{label}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[color:var(--ink)]">{labels.profile}</p>
              <div className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4 text-sm leading-7 text-[color:var(--ink-muted)]">
                {selectedPerson.profile}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-[color:var(--ink)]">
                {labels.relatedMails} ({relatedMails.length})
              </p>
              <div className="space-y-2">
                {relatedMails.slice(0, 5).map((mail) => (
                  <div
                    key={mail.mailId}
                    className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{mail.subject}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-6 text-[color:var(--ink-subtle)]">{mail.summary}</p>
                      </div>
                      <span className="text-xs text-[color:var(--ink-subtle)]">{formatDate(mail.receivedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-[color:var(--ink-subtle)]">
              {labels.updatedAt}: {formatDate(selectedPerson.lastUpdated)}
            </p>
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
