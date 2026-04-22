import { useEffect, useMemo, useState } from "react";
import { sanitizeExternalLink } from "../../utils/sanitize";
import { useApp } from "../../contexts/AppContext";
import { useMail } from "../../contexts/MailContext";
import type { MailKnowledgeRecord } from "@mail-agent/shared-types";
import { CalmButton, CalmPill, CalmSectionLabel } from "../ui/Calm";
import { formatMailScore, getQuadrantMeta, resolveMailScoreScale } from "../dashboard/knowledgebase/quadrants";
import type { MailKnowledgeDetailDrawerProps } from "./drawerStore";
import { QuadrantOverrideControl } from "../personalization/QuadrantOverrideControl";
import { useDetailFeedbackSession } from "../../hooks/useDetailFeedbackSession";

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">{value}</p>
    </div>
  );
}

function getWebLink(mail: MailKnowledgeRecord) {
  return sanitizeExternalLink(mail.webLink);
}

export function MailKnowledgeDetailDrawer({ mail, personName, personEmail, eventName }: MailKnowledgeDetailDrawerProps) {
  const { locale } = useApp();
  const { savePersonalizationOverride } = useMail();
  const webLink = getWebLink(mail);
  const dateLocale = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US";
  const localeKey = locale === "zh" ? "zh" : locale === "ja" ? "ja" : "en";
  const [effectiveQuadrant, setEffectiveQuadrant] = useState(
    mail.personalization?.effectiveQuadrant ?? mail.quadrant
  );
  const [manualQuadrant, setManualQuadrant] = useState<MailKnowledgeRecord["quadrant"] | null>(
    mail.personalization?.manualQuadrant ?? null
  );
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const personalizationContext = useMemo(
    () => ({
      rawMessageId: mail.rawId,
      mailId: mail.mailId,
      subject: mail.subject,
      personId: mail.personId,
      personName,
      personEmail: personEmail ?? undefined,
      eventId: mail.eventId ?? undefined,
      eventName: eventName ?? undefined,
      currentQuadrant: effectiveQuadrant,
      tags: mail.knowledgeCard?.tags,
    }),
    [
      effectiveQuadrant,
      eventName,
      mail.eventId,
      mail.knowledgeCard?.tags,
      mail.mailId,
      mail.personId,
      mail.rawId,
      mail.subject,
      personEmail,
      personName,
    ]
  );
  const { recordAction } = useDetailFeedbackSession({
    enabled: true,
    targetType: "mail",
    targetId: mail.rawId || mail.mailId,
    quadrant: effectiveQuadrant,
    context: personalizationContext,
  });
  const meta = getQuadrantMeta(effectiveQuadrant);

  useEffect(() => {
    setEffectiveQuadrant(mail.personalization?.effectiveQuadrant ?? mail.quadrant);
    setManualQuadrant(mail.personalization?.manualQuadrant ?? null);
  }, [mail.mailId, mail.personalization?.effectiveQuadrant, mail.personalization?.manualQuadrant, mail.quadrant]);

  const handleOverrideChange = async (quadrant: MailKnowledgeRecord["quadrant"] | null) => {
    setIsSavingOverride(true);
    try {
      await savePersonalizationOverride({
        targetType: "mail",
        targetId: mail.rawId || mail.mailId,
        quadrant,
        context: personalizationContext,
      });
      setManualQuadrant(quadrant);
      setEffectiveQuadrant(quadrant ?? mail.quadrant);
    } finally {
      setIsSavingOverride(false);
    }
  };

  const labels = {
    mailType: locale === "zh" ? "知识邮件" : locale === "ja" ? "ナレッジメール" : "Knowledge Mail",
    importance: locale === "zh" ? "重要性" : locale === "ja" ? "重要度" : "Importance",
    urgency: locale === "zh" ? "紧急性" : locale === "ja" ? "緊急度" : "Urgency",
    processedAt: locale === "zh" ? "处理时间" : locale === "ja" ? "処理日時" : "Processed",
    event: locale === "zh" ? "关联事件" : locale === "ja" ? "関連イベント" : "Related event",
    noEvent: locale === "zh" ? "未关联事件" : locale === "ja" ? "関連イベントなし" : "No related event",
    summary: locale === "zh" ? "摘要" : locale === "ja" ? "要約" : "Summary",
    noSummary: locale === "zh" ? "暂无摘要。" : locale === "ja" ? "要約はまだありません。" : "No summary yet.",
    knowledgeCard: locale === "zh" ? "知识卡片" : locale === "ja" ? "ナレッジカード" : "Knowledge Card",
    savedNoTags: locale === "zh" ? "已保存，无标签。" : locale === "ja" ? "保存済み、タグなし。" : "Saved with no tags.",
    openInOutlook: locale === "zh" ? "在 Outlook 中查看原邮件" : locale === "ja" ? "Outlook で元メールを見る" : "Open original mail in Outlook",
    emptySubject: locale === "zh" ? "无主题邮件" : locale === "ja" ? "件名なし" : "Untitled mail",
  };

  return (
    <article className="flex h-full flex-col">
      <header className="relative overflow-hidden border-b border-[color:var(--border-soft)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(238,246,255,0.92))] px-6 pb-6 pt-7 dark:bg-[linear-gradient(135deg,rgba(18,24,34,0.98),rgba(20,42,68,0.76))] sm:px-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 pr-12">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CalmPill tone="info">{labels.mailType}</CalmPill>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${meta.badgeClass}`}>
                {meta.label}
              </span>
              <span className="text-xs font-medium text-[color:var(--ink-subtle)]">{mail.mailId}</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">
              {mail.subject || labels.emptySubject}
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[color:var(--ink-muted)]">
              <span>{personName}</span>
              <span aria-hidden="true">/</span>
              <span>{formatDate(mail.receivedAt, dateLocale)}</span>
            </div>
            {mail.personalization?.explanation ? (
              <p className="mt-3 text-xs leading-6 text-[color:var(--ink-subtle)]">
                {mail.personalization.explanation}
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
        <section className="grid gap-3 sm:grid-cols-2">
          <MetricBlock
            label={labels.importance}
            value={formatMailScore(mail.importanceScore, resolveMailScoreScale(mail))}
          />
          <MetricBlock
            label={labels.urgency}
            value={formatMailScore(mail.urgencyScore, resolveMailScoreScale(mail))}
          />
          <MetricBlock label={labels.processedAt} value={formatDate(mail.processedAt, dateLocale)} />
          <MetricBlock label={labels.event} value={eventName ?? labels.noEvent} />
        </section>

        <section className="mt-6 rounded-[1.35rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-5 shadow-[var(--shadow-soft)]">
          <CalmSectionLabel>{labels.summary}</CalmSectionLabel>
          <p className="mt-3 text-[15px] leading-7 text-[color:var(--ink-muted)]">{mail.summary || labels.noSummary}</p>
        </section>

        {mail.knowledgeCard ? (
          <section className="mt-4 rounded-[1.2rem] border border-[color:var(--border-success)] bg-[color:var(--surface-success)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--pill-success-ink)]">
              {labels.knowledgeCard}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {mail.knowledgeCard.tags.length > 0 ? (
                mail.knowledgeCard.tags.map((tag) => (
                  <CalmPill key={tag} tone="success">{tag}</CalmPill>
                ))
              ) : (
                <span className="text-sm text-[color:var(--ink-muted)]">{labels.savedNoTags}</span>
              )}
            </div>
          </section>
        ) : null}

        {webLink ? (
          <div className="sticky bottom-0 mt-6 border-t border-[color:var(--border-soft)] bg-[color:var(--surface-base)]/88 py-4 backdrop-blur">
            <CalmButton
              type="button"
              variant="primary"
              className="w-full justify-center"
              onClick={async () => {
                await recordAction("external_mail_open");
                window.open(webLink, "_blank", "noopener,noreferrer");
              }}
            >
              {labels.openInOutlook}
            </CalmButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}
