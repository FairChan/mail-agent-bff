import { useMemo, useState } from "react";
import type {
  EventCluster,
  MailKnowledgeRecord,
  MailQuadrant,
  PersonProfile,
} from "@mail-agent/shared-types";
import {
  comparableMailScore,
  formatMailScore,
  normalizeMailQuadrant,
  quadrantMeta,
  quadrantOrder,
  resolveMailScoreScale,
} from "./quadrants";
import { CalmSectionLabel, CalmSurface } from "../../ui/Calm";
import { useApp } from "../../../contexts/AppContext";

interface EisenhowerMatrixPanelProps {
  mails: MailKnowledgeRecord[];
  persons: PersonProfile[];
  events: EventCluster[];
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}

function sortMails(left: MailKnowledgeRecord, right: MailKnowledgeRecord): number {
  const leftImportance = comparableMailScore(left.importanceScore);
  const rightImportance = comparableMailScore(right.importanceScore);
  if (rightImportance !== leftImportance) {
    return rightImportance - leftImportance;
  }
  const leftUrgency = comparableMailScore(left.urgencyScore);
  const rightUrgency = comparableMailScore(right.urgencyScore);
  if (rightUrgency !== leftUrgency) {
    return rightUrgency - leftUrgency;
  }
  return new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime();
}

export function EisenhowerMatrixPanel({
  mails,
  persons,
  events,
}: EisenhowerMatrixPanelProps) {
  const { locale } = useApp();
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);

  const personById = useMemo(
    () => new Map(persons.map((person) => [person.personId, person])),
    [persons]
  );
  const eventById = useMemo(
    () => new Map(events.map((event) => [event.eventId, event])),
    [events]
  );
  const groupedMails = useMemo(() => {
    const buckets: Record<MailQuadrant, MailKnowledgeRecord[]> = {
      unprocessed: [],
      urgent_important: [],
      not_urgent_important: [],
      urgent_not_important: [],
      not_urgent_not_important: [],
    };

    for (const mail of [...mails].sort(sortMails)) {
      buckets[normalizeMailQuadrant(mail.quadrant)].push(mail);
    }

    return buckets;
  }, [mails]);

  const defaultMail = quadrantOrder
    .flatMap((quadrant) => groupedMails[quadrant])
    .find(Boolean) ?? null;
  const selectedMail =
    mails.find((mail) => mail.mailId === selectedMailId) ?? defaultMail;
  const selectedQuadrant = normalizeMailQuadrant(selectedMail?.quadrant);
  const selectedScoreScale = selectedMail ? resolveMailScoreScale(selectedMail) : "ratio";
  const labels = {
    gridLabel: locale === "zh" ? "知识矩阵" : locale === "ja" ? "ナレッジグリッド" : "Knowledge Grid",
    matrixLabel: locale === "zh" ? "艾森豪威尔矩阵" : locale === "ja" ? "アイゼンハワー行列" : "Eisenhower Matrix",
    selectedMailLabel: locale === "zh" ? "当前邮件" : locale === "ja" ? "選択中のメール" : "Selected Mail",
  };

  if (mails.length === 0) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-8 text-center shadow-[var(--shadow-inset)]">
        <CalmSectionLabel>{labels.gridLabel}</CalmSectionLabel>
        <h3 className="mt-2 text-lg font-semibold text-[color:var(--ink)]">
          艾森豪威尔矩阵与未处理队列
        </h3>
        <p className="mt-2 text-sm text-[color:var(--ink-subtle)]">
          先完成旧邮件归纳后，这里会按照重要度与紧急度自动铺开所有邮件；尚未经过 Agent 处理的邮件会单独留在未处理队列。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CalmSurface className="p-6" beam>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CalmSectionLabel>{labels.matrixLabel}</CalmSectionLabel>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--ink)]">
              按重要度、紧急度与处理状态排布邮件
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--ink-subtle)]">
              已处理邮件会进入正式象限；还没经过 Agent 归纳的邮件会停留在未处理队列。点开任意邮件，可以直接查看摘要、事件归属和分数。
            </p>
          </div>
          <div className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--ink-muted)]">
            已纳入矩阵 <span className="font-semibold text-[color:var(--ink)]">{mails.length}</span> 封邮件
          </div>
        </div>
      </CalmSurface>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {quadrantOrder.map((quadrant) => {
          const meta = quadrantMeta[quadrant];
          const quadrantMails = groupedMails[quadrant];

          return (
            <section
              key={quadrant}
              className={`rounded-[1.35rem] border p-5 shadow-[var(--shadow-inset)] backdrop-blur-sm ${meta.panelClass}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] ${meta.badgeClass}`}>
                    {meta.shortLabel}
                  </span>
                  <h4 className={`mt-3 text-lg font-semibold ${meta.textClass}`}>
                    {meta.label}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--ink-muted)]">
                    {meta.hint}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">数量</p>
                  <p className={`mt-1 text-3xl font-bold ${meta.textClass}`}>
                    {quadrantMails.length}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {quadrantMails.length === 0 ? (
                  <div className="rounded-[1rem] border border-dashed border-[color:var(--border-soft)] bg-white/55 px-4 py-5 text-sm text-[color:var(--ink-subtle)] dark:bg-white/6">
                    {meta.emptyText}
                  </div>
                ) : (
                  quadrantMails.slice(0, 5).map((mail) => {
                    const person = personById.get(mail.personId);
                    const isSelected = selectedMail?.mailId === mail.mailId;
                    return (
                      <button
                        key={mail.mailId}
                        type="button"
                        onClick={() => setSelectedMailId(mail.mailId)}
                        className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                          isSelected
                            ? "border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] shadow-[var(--shadow-soft)]"
                            : "border-white/70 bg-white/65 hover:border-[color:var(--border-strong)] hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-[color:var(--border-soft)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[color:var(--ink)]">
                              {mail.subject}
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
                              {person?.name ?? mail.personId} · {formatDate(mail.receivedAt)}
                            </p>
                          </div>
                          <span className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${meta.accentClass}`} />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      <CalmSurface className="p-6">
        {selectedMail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] ${quadrantMeta[selectedQuadrant].badgeClass}`}>
                {quadrantMeta[selectedQuadrant].label}
              </span>
              <span className="text-xs text-[color:var(--ink-subtle)]">
                {selectedMail.mailId}
              </span>
            </div>

            <div>
              <CalmSectionLabel>{labels.selectedMailLabel}</CalmSectionLabel>
              <h4 className="mt-2 text-xl font-semibold text-[color:var(--ink)]">
                {selectedMail.subject}
              </h4>
              <p className="mt-2 text-sm text-[color:var(--ink-subtle)]">
                {personById.get(selectedMail.personId)?.name ?? selectedMail.personId} ·{" "}
                {formatDate(selectedMail.receivedAt)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">重要性</p>
                <p className="mt-2 text-lg font-semibold text-[color:var(--ink)]">
                  {formatMailScore(selectedMail.importanceScore, selectedScoreScale)}
                </p>
              </div>
              <div className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">紧急性</p>
                <p className="mt-2 text-lg font-semibold text-[color:var(--ink)]">
                  {formatMailScore(selectedMail.urgencyScore, selectedScoreScale)}
                </p>
              </div>
              <div className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">事件</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                  {selectedMail.eventId
                    ? eventById.get(selectedMail.eventId)?.name ?? selectedMail.eventId
                    : "未归入事件"}
                </p>
              </div>
              <div className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">发件人画像</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
                  {personById.get(selectedMail.personId)?.role || "未标注"}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[color:var(--ink)]">
                邮件摘要
              </p>
              <div className="rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-4 text-sm leading-7 text-[color:var(--ink-muted)]">
                {selectedMail.summary}
              </div>
            </div>

            {selectedMail.webLink ? (
              <a
                href={selectedMail.webLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-[var(--radius-pill)] bg-[color:var(--button-primary)] px-4 text-sm font-semibold text-[color:var(--button-primary-ink)] transition hover:bg-[color:var(--button-primary-hover)]"
              >
                在 Outlook 中查看原邮件
              </a>
            ) : null}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-[color:var(--ink-subtle)]">
            选择矩阵中的一封邮件查看详情。
          </div>
        )}
      </CalmSurface>
    </div>
  );
}
