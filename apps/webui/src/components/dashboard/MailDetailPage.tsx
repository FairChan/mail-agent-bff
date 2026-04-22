/**
 * 邮件详情页（独立页面模式）
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { sanitizeExternalLink, sanitizeMailBodyHtml } from "../../utils/sanitize";
import type { MailQuadrant, TriageMailItem } from "@mail-agent/shared-types";
import { useMail } from "../../contexts/MailContext";
import { CalmButton, CalmPill, CalmSectionLabel, CalmSurface } from "../ui/Calm";
import { QuadrantOverrideControl } from "../personalization/QuadrantOverrideControl";
import { useDetailFeedbackSession } from "../../hooks/useDetailFeedbackSession";

interface MailDetailPageProps {
  item: TriageMailItem;
  activeSourceId: string;
  authLocale: string;
  onBack: () => void;
  uiCopy: {
    from: string;
    subject: string;
    receivedAt: string;
    aiSummary: string;
    openInOutlook: string;
  };
}

export function MailDetailPage({ item, activeSourceId, authLocale, onBack, uiCopy }: MailDetailPageProps) {
  const { fetchMailDetail, mailBodyCache, savePersonalizationOverride } = useMail();
  const locale = authLocale === "ja" ? "ja" : authLocale === "en" ? "en" : "zh";

  const [bodyContent, setBodyContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [effectiveQuadrant, setEffectiveQuadrant] = useState<MailQuadrant>(
    item.personalization?.effectiveQuadrant ?? item.quadrant
  );
  const [manualQuadrant, setManualQuadrant] = useState<MailQuadrant | null>(
    item.personalization?.manualQuadrant ?? null
  );
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const personalizationContext = useMemo(
    () => ({
      rawMessageId: item.id,
      mailId: item.id,
      fromAddress: item.fromAddress,
      fromName: item.fromName,
      subject: item.subject,
      currentQuadrant: effectiveQuadrant,
    }),
    [effectiveQuadrant, item.fromAddress, item.fromName, item.id, item.subject]
  );
  const { recordAction } = useDetailFeedbackSession({
    enabled: true,
    targetType: "mail",
    targetId: item.id,
    quadrant: effectiveQuadrant,
    context: personalizationContext,
  });

  useEffect(() => {
    if (item) {
      // 优先使用缓存
      const cached = mailBodyCache.get(`${activeSourceId}::${item.id}`);
      if (cached) {
        setBodyContent(cached);
        setLoading(false);
        return;
      }

      // 缓存没有，异步获取
      setLoading(true);
      setError(null);
      fetchMailDetail(item.id)
        .then((result) => {
          if (result?.bodyContent) setBodyContent(result.bodyContent);
          else if (result?.bodyPreview) setBodyContent(result.bodyPreview);
          else setBodyContent(item.bodyPreview || "");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load");
          setBodyContent(item.bodyPreview || "");
        })
        .finally(() => setLoading(false));
    }
  }, [activeSourceId, fetchMailDetail, item, mailBodyCache]);

  useEffect(() => {
    setEffectiveQuadrant(item.personalization?.effectiveQuadrant ?? item.quadrant);
    setManualQuadrant(item.personalization?.manualQuadrant ?? null);
  }, [item.id, item.personalization?.effectiveQuadrant, item.personalization?.manualQuadrant, item.quadrant]);

  const handleOpenInOutlook = useCallback(async () => {
    if (item?.webLink) {
      const safeLink = sanitizeExternalLink(item.webLink);
      if (safeLink) {
        await recordAction("external_mail_open");
        window.open(safeLink, "_blank", "noopener,noreferrer");
      }
    }
  }, [item?.webLink, recordAction]);

  const handleOverrideChange = useCallback(async (quadrant: MailQuadrant | null) => {
    setIsSavingOverride(true);
    try {
      await savePersonalizationOverride({
        targetType: "mail",
        targetId: item.id,
        quadrant,
        context: personalizationContext,
      });
      setManualQuadrant(quadrant);
      setEffectiveQuadrant(quadrant ?? item.quadrant);
    } finally {
      setIsSavingOverride(false);
    }
  }, [item.id, item.quadrant, personalizationContext, savePersonalizationOverride]);

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleString(locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const labels = {
    archiveLabel: locale === "zh" ? "邮件归档" : locale === "ja" ? "メールアーカイブ" : "Mail Archive",
    overviewLabel: locale === "zh" ? "邮件概览" : locale === "ja" ? "メール概要" : "Message Overview",
    originalLabel: locale === "zh" ? "原始邮件" : locale === "ja" ? "元メール" : "Original Message",
    back: locale === "zh" ? "返回列表" : locale === "ja" ? "一覧へ戻る" : "Back to list",
    originalContent: locale === "zh" ? "原始内容" : locale === "ja" ? "元の内容" : "Original Content",
    summaryGenerating: locale === "zh" ? "摘要生成中..." : locale === "ja" ? "要約生成中..." : "Generating...",
    high: locale === "zh" ? "高" : locale === "ja" ? "高" : "High",
    normal: locale === "zh" ? "普通" : locale === "ja" ? "普通" : "Normal",
    low: locale === "zh" ? "低" : locale === "ja" ? "低" : "Low",
  };

  const importanceColors: Record<string, string> = {
    high: "urgent",
    normal: "muted",
    low: "info",
  };

  const importanceLabel = (importance: string | undefined) => {
    switch (importance) {
      case "high": return labels.high;
      case "low": return labels.low;
      default: return labels.normal;
    }
  };

  return (
    <div className="min-h-full bg-transparent">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[color:var(--border-soft)] bg-[rgba(250,248,244,0.92)] px-4 py-3 backdrop-blur-sm dark:bg-[rgba(11,15,21,0.92)]">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <CalmButton
            type="button"
            onClick={onBack}
            variant="secondary"
            className="px-3 py-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {labels.back}
          </CalmButton>

          <div className="min-w-0 flex-1">
            <CalmSectionLabel>{labels.archiveLabel}</CalmSectionLabel>
            <h1 className="truncate text-base font-semibold text-[color:var(--ink)]">
              {item.subject || "(No Subject)"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <QuadrantOverrideControl
              locale={locale}
              value={effectiveQuadrant}
              manualValue={manualQuadrant}
              saving={isSavingOverride}
              onChange={handleOverrideChange}
            />
            {item.webLink && (
              <CalmButton
                type="button"
                onClick={() => {
                  void handleOpenInOutlook();
                }}
                variant="primary"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {uiCopy.openInOutlook}
              </CalmButton>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {/* Mail Info */}
        <CalmSurface className="px-6 py-5" beam>
          <CalmSectionLabel>{labels.overviewLabel}</CalmSectionLabel>
          <h2 className="mt-2 text-xl font-semibold text-[color:var(--ink)]">
            {item.subject || "(No Subject)"}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[color:var(--ink-muted)]">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[color:var(--ink)]">{uiCopy.from}:</span>
              <span>
                {item.fromName || item.fromAddress}
                {item.fromName && (
                  <span className="text-[color:var(--ink-subtle)]"> &lt;{item.fromAddress}&gt;</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-[color:var(--ink)]">{uiCopy.receivedAt}:</span>
              <span>{formatDate(item.receivedDateTime)}</span>
            </div>
            <CalmPill tone={importanceColors[item.importance || "normal"] as "urgent" | "muted" | "info"}>
              {importanceLabel(item.importance)}
            </CalmPill>
          </div>
          {item.personalization?.explanation ? (
            <p className="mt-3 text-sm leading-6 text-[color:var(--ink-subtle)]">
              {item.personalization.explanation}
            </p>
          ) : null}
        </CalmSurface>

        {/* AI Summary */}
        <CalmSurface tone="info" className="px-6 py-5">
          <div className="mb-3 flex items-center gap-2">
            <CalmPill tone="info">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              {uiCopy.aiSummary}
            </CalmPill>
          </div>
          {item.aiSummary ? (
            <p className="text-base leading-relaxed text-[color:var(--ink)]">
              {item.aiSummary}
            </p>
          ) : (
            <p className="text-base italic text-[color:var(--ink-subtle)]">{labels.summaryGenerating}</p>
          )}
        </CalmSurface>

        {/* Original Content */}
        <CalmSurface className="px-6 py-5">
          <CalmSectionLabel>{labels.originalLabel}</CalmSectionLabel>
          <h3 className="mb-4 mt-2 text-base font-semibold text-[color:var(--ink)]">
            {labels.originalContent}
          </h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-4 w-full rounded-full bg-[color:var(--surface-muted)]" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : (
            <div
              className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--ink-muted)] prose-a:text-[color:var(--button-primary)]"
              dangerouslySetInnerHTML={{ __html: sanitizeMailBodyHtml(bodyContent) }}
            />
          )}
        </CalmSurface>
      </div>
    </div>
  );
}
