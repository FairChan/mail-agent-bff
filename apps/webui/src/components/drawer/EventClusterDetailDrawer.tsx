import { useEffect, useMemo, useState } from "react";
import type { MailKnowledgeRecord, MailQuadrant } from "@mail-agent/shared-types";
import { useApp } from "../../contexts/AppContext";
import { useMail } from "../../contexts/MailContext";
import { useDrawerStore } from "./drawerStore";
import type { EventClusterDetailDrawerProps } from "./drawerStore";
import { CalmPill, CalmSectionLabel } from "../ui/Calm";
import { QuadrantOverrideControl } from "../personalization/QuadrantOverrideControl";
import { deriveQuadrantFromMails } from "../personalization/quadrants";
import { useDetailFeedbackSession } from "../../hooks/useDetailFeedbackSession";

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function RelatedMailButton({
  mail,
  eventName,
  labels,
  locale,
  onOpen,
}: {
  mail: MailKnowledgeRecord;
  eventName: string;
  labels: {
    openMail: string;
  };
  locale: string;
  onOpen: (mail: MailKnowledgeRecord) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(mail)}
      className="group w-full rounded-[1.05rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--border-info)] hover:bg-[color:var(--surface-elevated)]"
      aria-label={`打开关联邮件：${mail.subject || mail.mailId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{mail.subject || mail.mailId}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--ink-subtle)]">{mail.summary}</p>
          <p className="mt-2 text-[11px] font-medium text-[color:var(--pill-info-ink)]">
            {eventName} · {labels.openMail} →
          </p>
        </div>
        <span className="shrink-0 text-xs text-[color:var(--ink-subtle)]">{formatDate(mail.receivedAt, locale)}</span>
      </div>
    </button>
  );
}

export function EventClusterDetailDrawer({
  event,
  relatedMails,
  personNameById,
}: EventClusterDetailDrawerProps) {
  const { locale } = useApp();
  const { savePersonalizationOverride } = useMail();
  const openDrawer = useDrawerStore((state) => state.openDrawer);
  const dateLocale = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US";
  const localeKey = locale === "zh" ? "zh" : locale === "ja" ? "ja" : "en";
  const derivedQuadrant = useMemo(
    () =>
      deriveQuadrantFromMails(
        relatedMails.map((mail) => ({
          quadrant: mail.personalization?.effectiveQuadrant ?? mail.quadrant,
        }))
      ),
    [relatedMails]
  );
  const [effectiveQuadrant, setEffectiveQuadrant] = useState<MailQuadrant>(
    event.personalization?.effectiveQuadrant ?? derivedQuadrant
  );
  const [manualQuadrant, setManualQuadrant] = useState<MailQuadrant | null>(
    event.personalization?.manualQuadrant ?? null
  );
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const personalizationContext = useMemo(
    () => ({
      eventId: event.eventId,
      eventName: event.name,
      currentQuadrant: effectiveQuadrant,
      tags: event.tags,
    }),
    [effectiveQuadrant, event.eventId, event.name, event.tags]
  );
  const { recordAction } = useDetailFeedbackSession({
    enabled: true,
    targetType: "event",
    targetId: event.eventId,
    quadrant: effectiveQuadrant,
    context: personalizationContext,
  });

  useEffect(() => {
    setEffectiveQuadrant(event.personalization?.effectiveQuadrant ?? derivedQuadrant);
    setManualQuadrant(event.personalization?.manualQuadrant ?? null);
  }, [
    derivedQuadrant,
    event.eventId,
    event.personalization?.effectiveQuadrant,
    event.personalization?.manualQuadrant,
  ]);

  const handleOverrideChange = async (quadrant: MailQuadrant | null) => {
    setIsSavingOverride(true);
    try {
      await savePersonalizationOverride({
        targetType: "event",
        targetId: event.eventId,
        quadrant,
        context: personalizationContext,
      });
      setManualQuadrant(quadrant);
      setEffectiveQuadrant(quadrant ?? derivedQuadrant);
    } finally {
      setIsSavingOverride(false);
    }
  };

  const labels = {
    cluster: locale === "zh" ? "事件聚类" : locale === "ja" ? "イベントクラスタ" : "Event Cluster",
    updated: locale === "zh" ? "最后更新" : locale === "ja" ? "最終更新" : "Updated",
    related: locale === "zh" ? "关联邮件" : locale === "ja" ? "関連メール" : "Related",
    loaded: locale === "zh" ? "已载入" : locale === "ja" ? "読み込み済み" : "Loaded",
    tags: locale === "zh" ? "标签" : locale === "ja" ? "タグ" : "Tags",
    summary: locale === "zh" ? "摘要" : locale === "ja" ? "要約" : "Summary",
    emptySummary: locale === "zh" ? "暂无事件总结。" : locale === "ja" ? "イベント要約はまだありません。" : "No event summary yet.",
    keyInfo: locale === "zh" ? "关键信息" : locale === "ja" ? "重要情報" : "Key Information",
    relatedMails: locale === "zh" ? "关联邮件" : locale === "ja" ? "関連メール" : "Related Mails",
    relatedLoaded:
      locale === "zh"
        ? "知识库上下文已载入"
        : locale === "ja"
          ? "知識ベース文脈で読み込み済み"
          : "Loaded in the knowledge-base context",
    relatedTail:
      locale === "zh"
        ? "封关联邮件，可继续打开为上层叠页。"
        : locale === "ja"
          ? "件の関連メールを上の重なったページとして開けます。"
          : "related mails are available to open as stacked pages.",
    emptyRelated:
      locale === "zh"
        ? "当前上下文尚未载入这个事件的邮件正文；切换邮件页后仍可复用同一抽屉查看。"
        : locale === "ja"
          ? "現在の文脈ではこのイベントのメール本文がまだ読み込まれていません。メールページを切り替えても同じドロワー構造を再利用できます。"
          : "This event's mail bodies are not loaded in the current context yet; the same drawer flow will still work after changing mail pages.",
    openMail: locale === "zh" ? "打开邮件叠页" : locale === "ja" ? "メールページを開く" : "Open mail page",
  };

  const openMailDrawer = async (mail: MailKnowledgeRecord) => {
    await recordAction("related_mail_open", {
      context: {
        ...personalizationContext,
        rawMessageId: mail.rawId,
        mailId: mail.mailId,
        personId: mail.personId,
        personName: personNameById[mail.personId] ?? mail.personId,
        subject: mail.subject,
      },
    });
    openDrawer("mailKnowledgeDetail", {
      mail,
      personName: personNameById[mail.personId] ?? mail.personId,
      personEmail: null,
      eventName: event.name,
    });
  };

  return (
    <article className="flex h-full flex-col">
      <header className="relative overflow-hidden border-b border-[color:var(--border-soft)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(234,247,255,0.9))] px-6 pb-6 pt-7 dark:bg-[linear-gradient(135deg,rgba(18,24,34,0.98),rgba(15,45,64,0.78))] sm:px-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-60 w-60 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 pr-12">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CalmPill tone="info">{labels.cluster}</CalmPill>
              <span className="text-xs font-medium text-[color:var(--ink-subtle)]">{event.eventId}</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">
              {event.name}
            </h2>
            <p className="mt-3 text-sm text-[color:var(--ink-muted)]">{labels.updated} {formatDate(event.lastUpdated, dateLocale)}</p>
            {event.personalization?.explanation ? (
              <p className="mt-3 text-xs leading-6 text-[color:var(--ink-subtle)]">
                {event.personalization.explanation}
              </p>
            ) : null}
          </div>
          <QuadrantOverrideControl
            locale={localeKey}
            value={effectiveQuadrant}
            manualValue={manualQuadrant}
            saving={isSavingOverride}
            onChange={handleOverrideChange}
          />
        </div>
      </header>

      <div className="calm-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1.1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">{labels.related}</p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--ink)]">{event.relatedMailIds.length}</p>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">{labels.loaded}</p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--ink)]">{relatedMails.length}</p>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">{labels.tags}</p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--ink)]">{event.tags.length}</p>
          </div>
        </section>

        <section className="mt-6 rounded-[1.35rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-5 shadow-[var(--shadow-soft)]">
          <CalmSectionLabel>{labels.summary}</CalmSectionLabel>
          <p className="mt-3 text-[15px] leading-7 text-[color:var(--ink-muted)]">{event.summary || labels.emptySummary}</p>
        </section>

        {event.keyInfo.length > 0 ? (
          <section className="mt-5">
            <CalmSectionLabel>{labels.keyInfo}</CalmSectionLabel>
            <div className="mt-3 space-y-2">
              {event.keyInfo.map((info, index) => (
                <div
                  key={`${event.eventId}-info-${index}`}
                  className="rounded-[1.05rem] border border-[color:var(--border-info)] bg-[color:var(--surface-info)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]"
                >
                  {info}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {event.tags.length > 0 ? (
          <section className="mt-5">
            <CalmSectionLabel>{labels.tags}</CalmSectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {event.tags.map((tag) => (
                <CalmPill key={tag} tone="muted">
                  {tag}
                </CalmPill>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CalmSectionLabel>{labels.relatedMails}</CalmSectionLabel>
              <p className="mt-2 text-sm text-[color:var(--ink-subtle)]">
                {labels.relatedLoaded} {relatedMails.length} / {event.relatedMailIds.length} {labels.relatedTail}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {relatedMails.length > 0 ? (
              relatedMails.map((mail) => (
                <RelatedMailButton
                  key={mail.mailId}
                  mail={mail}
                  eventName={event.name}
                  labels={labels}
                  locale={dateLocale}
                  onOpen={(targetMail) => {
                    void openMailDrawer(targetMail);
                  }}
                />
              ))
            ) : (
              <div className="rounded-[1rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-6 text-sm text-[color:var(--ink-subtle)]">
                {labels.emptyRelated}
              </div>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
