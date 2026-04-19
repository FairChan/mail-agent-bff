/**
 * 邮件详情弹窗
 * 使用 MailContext 和 AppContext
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import DOMPurify from "dompurify";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import { sanitizeExternalLink } from "../../utils/sanitize";
import { CalmButton, CalmPill, CalmSectionLabel, CalmSurface } from "../ui/Calm";

function formatBodyContent(content: string): string {
  if (!content) return "";
  let formatted = content;
  formatted = formatted.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  if (formatted.includes("<")) {
    const stripped = formatted
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (stripped.length > 50) {
      formatted = stripped;
    } else {
      formatted = DOMPurify.sanitize(formatted, {
        ALLOWED_TAGS: ["p", "br", "strong", "em", "b", "i", "u", "a", "ul", "ol", "li", "div", "span", "pre", "code"],
        ALLOWED_ATTR: ["href", "target", "rel"],
      });
    }
  }
  return formatted;
}

export function MailDetailModal() {
  const { selectedMail, fetchMailDetail, clearSelectedMail, mailBodyCache } = useMail();
  const { locale } = useApp();

  const modalRef = useRef<HTMLDivElement>(null);
  const prevActiveElement = useRef<HTMLElement | null>(null);

  const [bodyContent, setBodyContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedMail) {
      prevActiveElement.current = document.activeElement as HTMLElement;
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
    return () => {
      prevActiveElement.current?.focus();
    };
  }, [selectedMail]);

  useEffect(() => {
    if (selectedMail) {
      // 优先使用缓存
      const cached = mailBodyCache.get(selectedMail.id);
      if (cached) {
        setBodyContent(cached);
        setLoading(false);
        return;
      }

      // 缓存没有，异步获取
      setLoading(true);
      setError(null);
      fetchMailDetail(selectedMail.id)
        .then((result) => {
          if (result?.bodyContent) setBodyContent(result.bodyContent);
          else if (result?.bodyPreview) setBodyContent(result.bodyPreview);
          else setBodyContent(selectedMail.bodyPreview || "");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load");
          setBodyContent(selectedMail.bodyPreview || "");
        })
        .finally(() => setLoading(false));
    }
  }, [selectedMail?.id, mailBodyCache]);

  const handleClose = useCallback(() => {
    clearSelectedMail();
  }, [clearSelectedMail]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    },
    [handleClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleOpenInOutlook = () => {
    if (selectedMail?.webLink) {
      const safeLink = sanitizeExternalLink(selectedMail.webLink);
      if (safeLink) window.open(safeLink, "_blank", "noopener,noreferrer");
    }
  };

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

  if (!selectedMail) return null;

  const labels = {
    close: locale === "zh" ? "关闭" : locale === "ja" ? "閉じる" : "Close",
    detailLabel: locale === "zh" ? "邮件详情" : locale === "ja" ? "メール詳細" : "Mail Detail",
    aiSummary: locale === "zh" ? "AI 摘要" : locale === "ja" ? "AI要約" : "AI Summary",
    originalContent: locale === "zh" ? "原始内容" : locale === "ja" ? "元の内容" : "Original Content",
    openInOutlook: locale === "zh" ? "在 Outlook 中打开" : locale === "ja" ? "Outlookで開く" : "Open in Outlook",
    summaryGenerating: locale === "zh" ? "摘要生成中..." : locale === "ja" ? "要約生成中..." : "Generating...",
  };

  const importanceTone =
    selectedMail.importance === "high"
      ? "urgent"
      : selectedMail.importance === "low"
        ? "info"
        : "muted";

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(12,18,27,0.48)] p-4 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <CalmSurface className="max-h-[90vh] w-full max-w-3xl overflow-hidden" beam>
        {/* Header */}
        <div className="border-b border-[color:var(--border-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CalmSectionLabel>{labels.detailLabel}</CalmSectionLabel>
              <h2 className="mt-2 truncate text-lg font-semibold text-[color:var(--ink)]">
                {selectedMail.subject || "(No Subject)"}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--ink-subtle)]">
                <span className="font-medium text-[color:var(--ink)]">
                  {selectedMail.fromName || selectedMail.fromAddress}
                </span>
                {selectedMail.fromName && (
                  <span>&lt;{selectedMail.fromAddress}&gt;</span>
                )}
                <span>·</span>
                <span>{formatDate(selectedMail.receivedDateTime)}</span>
                <CalmPill tone={importanceTone}>
                  {selectedMail.importance === "high"
                    ? locale === "zh" ? "高" : locale === "ja" ? "高" : "High"
                    : selectedMail.importance === "low"
                      ? locale === "zh" ? "低" : locale === "ja" ? "低" : "Low"
                      : locale === "zh" ? "普通" : locale === "ja" ? "普通" : "Normal"}
                </CalmPill>
              </div>
            </div>
            <CalmButton
              type="button"
              onClick={handleClose}
              variant="ghost"
              className="h-10 w-10 shrink-0 rounded-full p-0 text-[color:var(--ink-subtle)]"
              aria-label={labels.close}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </CalmButton>
          </div>
        </div>

        {/* AI Summary */}
        <div className="border-b border-[color:var(--border-soft)] bg-[color:var(--surface-info)] px-5 py-4">
          <div className="mb-1.5 flex items-center gap-2">
            <CalmPill tone="info">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              {labels.aiSummary}
            </CalmPill>
          </div>
          {selectedMail.aiSummary ? (
            <p className="text-sm leading-relaxed text-[color:var(--ink)]">
              {selectedMail.aiSummary}
            </p>
          ) : (
            <p className="text-sm italic text-[color:var(--ink-subtle)]">
              {labels.summaryGenerating}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(90vh - 280px)" }}>
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--ink)]">
            {labels.originalContent}
          </h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded-full bg-[color:var(--surface-muted)]" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : (
            <div
              className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--ink-muted)] prose-a:text-[color:var(--button-primary)]"
              dangerouslySetInnerHTML={{ __html: formatBodyContent(bodyContent || "") }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <CalmButton
              type="button"
              onClick={handleClose}
              variant="secondary"
            >
              {labels.close}
            </CalmButton>
            {selectedMail.webLink && (
              <CalmButton
                type="button"
                onClick={handleOpenInOutlook}
                variant="primary"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {labels.openInOutlook}
              </CalmButton>
            )}
          </div>
        </div>
      </CalmSurface>
    </div>
  );
}
