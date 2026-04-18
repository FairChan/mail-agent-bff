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

  if (mails.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-800">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          艾森豪威尔矩阵与未处理队列
        </h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          先完成旧邮件归纳后，这里会按照重要度与紧急度自动铺开所有邮件；尚未经过 Agent 处理的邮件会单独留在未处理队列。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Eisenhower Matrix
            </p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              按重要度、紧急度与处理状态排布邮件
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              已处理邮件会进入正式象限；还没经过 Agent 归纳的邮件会停留在未处理队列。点开任意邮件，可以直接查看摘要、事件归属和分数。
            </p>
          </div>
          <div className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            已纳入矩阵 <span className="font-semibold text-zinc-900 dark:text-zinc-100">{mails.length}</span> 封邮件
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {quadrantOrder.map((quadrant) => {
          const meta = quadrantMeta[quadrant];
          const quadrantMails = groupedMails[quadrant];

          return (
            <section
              key={quadrant}
              className={`rounded-xl border p-5 ${meta.panelClass}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${meta.badgeClass}`}>
                    {meta.shortLabel}
                  </span>
                  <h4 className={`mt-3 text-lg font-semibold ${meta.textClass}`}>
                    {meta.label}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {meta.hint}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">数量</p>
                  <p className={`mt-1 text-3xl font-bold ${meta.textClass}`}>
                    {quadrantMails.length}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {quadrantMails.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-white/60 px-4 py-5 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
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
                            ? "border-zinc-900 bg-white shadow-sm dark:border-zinc-100 dark:bg-zinc-950"
                            : "border-white/70 bg-white/70 hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:border-zinc-600"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {mail.subject}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
        {selectedMail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-1 text-xs font-medium ${quadrantMeta[selectedQuadrant].badgeClass}`}>
                {quadrantMeta[selectedQuadrant].label}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {selectedMail.mailId}
              </span>
            </div>

            <div>
              <h4 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                {selectedMail.subject}
              </h4>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {personById.get(selectedMail.personId)?.name ?? selectedMail.personId} ·{" "}
                {formatDate(selectedMail.receivedAt)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">重要性</p>
                <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatMailScore(selectedMail.importanceScore, selectedScoreScale)}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">紧急性</p>
                <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatMailScore(selectedMail.urgencyScore, selectedScoreScale)}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">事件</p>
                <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedMail.eventId
                    ? eventById.get(selectedMail.eventId)?.name ?? selectedMail.eventId
                    : "未归入事件"}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">发件人画像</p>
                <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {personById.get(selectedMail.personId)?.role || "未标注"}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                邮件摘要
              </p>
              <div className="rounded-lg bg-zinc-50 p-4 text-sm leading-7 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {selectedMail.summary}
              </div>
            </div>

            {selectedMail.webLink ? (
              <a
                href={selectedMail.webLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                在 Outlook 中查看原邮件
              </a>
            ) : null}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            选择矩阵中的一封邮件查看详情。
          </div>
        )}
      </div>
    </div>
  );
}
