import { useEffect, useMemo, useState } from "react";
import type { MailKnowledgeRecord, MailQuadrant } from "@mail-agent/shared-types";
import { useApp } from "../../contexts/AppContext";
import { useMail } from "../../contexts/MailContext";
import { CalmPill, CalmSectionLabel } from "../ui/Calm";
import { useDrawerStore } from "./drawerStore";
import type { PersonProfileDetailDrawerProps } from "./drawerStore";
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

function getImportanceTone(importance: number): "urgent" | "warning" | "muted" {
  const normalized = importance > 1 ? importance / 10 : importance;
  if (normalized >= 0.8) return "urgent";
  if (normalized >= 0.5) return "warning";
  return "muted";
}

function formatImportance(value: number) {
  return value > 1 ? `${value}/10` : `${Math.round(value * 100)}%`;
}

export function PersonProfileDetailDrawer({
  person,
  relatedMails,
  eventNameById,
}: PersonProfileDetailDrawerProps) {
  const { locale } = useApp();
  const { savePersonalizationOverride } = useMail();
  const openDrawer = useDrawerStore((state) => state.openDrawer);
  const dateLocale = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US";
  const localeKey = locale === "zh" ? "zh" : locale === "ja" ? "ja" : "en";
  const derivedQuadrant = useMemo(() => {
    const fromRelated = deriveQuadrantFromMails(
      relatedMails.map((mail) => ({
        quadrant: mail.personalization?.effectiveQuadrant ?? mail.quadrant,
      }))
    );
    if (fromRelated !== "unprocessed") {
      return fromRelated;
    }
    return person.importance >= 0.7 || person.importance >= 7
      ? "not_urgent_important"
      : "not_urgent_not_important";
  }, [person.importance, relatedMails]);
  const [effectiveQuadrant, setEffectiveQuadrant] = useState<MailQuadrant>(
    person.personalization?.effectiveQuadrant ?? derivedQuadrant
  );
  const [manualQuadrant, setManualQuadrant] = useState<MailQuadrant | null>(
    person.personalization?.manualQuadrant ?? null
  );
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const personalizationContext = useMemo(
    () => ({
      personId: person.personId,
      personName: person.name,
      personEmail: person.email,
      currentQuadrant: effectiveQuadrant,
    }),
    [effectiveQuadrant, person.email, person.name, person.personId]
  );
  const { recordAction } = useDetailFeedbackSession({
    enabled: true,
    targetType: "person",
    targetId: person.personId,
    quadrant: effectiveQuadrant,
    context: personalizationContext,
  });

  useEffect(() => {
    setEffectiveQuadrant(person.personalization?.effectiveQuadrant ?? derivedQuadrant);
    setManualQuadrant(person.personalization?.manualQuadrant ?? null);
  }, [
    derivedQuadrant,
    person.personId,
    person.personalization?.effectiveQuadrant,
    person.personalization?.manualQuadrant,
  ]);

  const handleOverrideChange = async (quadrant: MailQuadrant | null) => {
    setIsSavingOverride(true);
    try {
      await savePersonalizationOverride({
        targetType: "person",
        targetId: person.personId,
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
    importance: locale === "zh" ? "重要性" : locale === "ja" ? "重要度" : "Importance",
    unknownRole: locale === "zh" ? "未标注角色" : locale === "ja" ? "役割未設定" : "Role not set",
    mails: locale === "zh" ? "邮件" : locale === "ja" ? "メール" : "Mails",
    interactions: locale === "zh" ? "交互次数" : locale === "ja" ? "やり取り" : "Interactions",
    updated: locale === "zh" ? "最后更新" : locale === "ja" ? "最終更新" : "Updated",
    profile: locale === "zh" ? "人物画像" : locale === "ja" ? "人物プロファイル" : "Profile",
    emptyProfile: locale === "zh" ? "暂无人物画像。" : locale === "ja" ? "人物プロファイルはまだありません。" : "No profile summary yet.",
    relatedMails: locale === "zh" ? "往来邮件" : locale === "ja" ? "関連メール" : "Related Mails",
    relatedDescription:
      locale === "zh"
        ? "从知识库上下文中载入的往来邮件；点击任意一封会继续叠加邮件详情页。"
        : locale === "ja"
          ? "知識ベース文脈から読み込んだ往来メールです。任意のメールを開くと、さらに上のページとして重なります。"
          : "These mails come from the knowledge-base context; opening one adds another stacked mail page.",
    openMail: locale === "zh" ? "打开邮件叠页" : locale === "ja" ? "メールページを開く" : "Open mail page",
    emptyRelated:
      locale === "zh"
        ? "当前上下文没有载入该联系人的邮件。"
        : locale === "ja"
          ? "現在の文脈ではこの連絡先のメールが読み込まれていません。"
          : "No mails for this person are loaded in the current context.",
  };

  const openMailDrawer = async (mail: MailKnowledgeRecord) => {
    await recordAction("related_mail_open", {
      context: {
        ...personalizationContext,
        rawMessageId: mail.rawId,
        mailId: mail.mailId,
        eventId: mail.eventId ?? undefined,
        eventName: mail.eventId ? eventNameById[mail.eventId] ?? mail.eventId : undefined,
        subject: mail.subject,
      },
    });
    openDrawer("mailKnowledgeDetail", {
      mail,
      personName: person.name,
      personEmail: person.email,
      eventName: mail.eventId ? eventNameById[mail.eventId] ?? mail.eventId : null,
    });
  };

  return (
    <article className="flex h-full flex-col">
      <header className="relative overflow-hidden border-b border-[color:var(--border-soft)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(243,248,255,0.92))] px-6 pb-6 pt-7 dark:bg-[linear-gradient(135deg,rgba(18,24,34,0.98),rgba(29,43,68,0.78))] sm:px-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 pr-12">
          <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(17,40,79,0.95),rgba(86,154,255,0.78))] text-2xl font-semibold text-white shadow-[var(--shadow-soft)]">
            {person.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CalmPill tone={getImportanceTone(person.importance)}>{labels.importance} {formatImportance(person.importance)}</CalmPill>
              <span className="text-xs font-medium text-[color:var(--ink-subtle)]">{person.personId}</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">
              {person.name}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">{person.role || labels.unknownRole}</p>
            <p className="mt-1 break-all text-sm text-[color:var(--ink-subtle)]">{person.email}</p>
            {person.personalization?.explanation ? (
              <p className="mt-3 text-xs leading-6 text-[color:var(--ink-subtle)]">
                {person.personalization.explanation}
              </p>
            ) : null}
          </div>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">{labels.mails}</p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--ink)]">{relatedMails.length}</p>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">{labels.interactions}</p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--ink)]">{person.recentInteractions}</p>
          </div>
          <div className="rounded-[1.1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-subtle)]">{labels.updated}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ink)]">{formatDate(person.lastUpdated, dateLocale)}</p>
          </div>
        </section>

        <section className="mt-6 rounded-[1.35rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-5 shadow-[var(--shadow-soft)]">
          <CalmSectionLabel>{labels.profile}</CalmSectionLabel>
          <p className="mt-3 text-[15px] leading-7 text-[color:var(--ink-muted)]">{person.profile || labels.emptyProfile}</p>
        </section>

        <section className="mt-6">
          <CalmSectionLabel>{labels.relatedMails}</CalmSectionLabel>
          <p className="mt-2 text-sm text-[color:var(--ink-subtle)]">
            {labels.relatedDescription}
          </p>
          <div className="mt-3 space-y-2">
            {relatedMails.length > 0 ? (
              relatedMails.map((mail) => (
                <button
                  key={mail.mailId}
                  type="button"
                  onClick={() => {
                    void openMailDrawer(mail);
                  }}
                  className="group w-full rounded-[1.05rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--border-info)] hover:bg-[color:var(--surface-elevated)]"
                  aria-label={`打开往来邮件：${mail.subject || mail.mailId}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{mail.subject || mail.mailId}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--ink-subtle)]">{mail.summary}</p>
                      <p className="mt-2 text-[11px] font-medium text-[color:var(--pill-info-ink)]">{labels.openMail} →</p>
                    </div>
                    <span className="shrink-0 text-xs text-[color:var(--ink-subtle)]">{formatDate(mail.receivedAt, dateLocale)}</span>
                  </div>
                </button>
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
