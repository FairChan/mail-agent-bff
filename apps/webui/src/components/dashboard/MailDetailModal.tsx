/**
 * 邮件详情弹窗
 * 使用 MailContext 和 AppContext
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import DOMPurify from "dompurify";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import { sanitizeExternalLink } from "../../utils/sanitize";
import type { TriageMailItem } from "@mail-agent/shared-types";

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
  const { selectedMail, isLoadingDetail, fetchMailDetail, clearSelectedMail, mailBodyCache } = useMail();
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
    aiSummary: locale === "zh" ? "AI 摘要" : locale === "ja" ? "AI要約" : "AI Summary",
    originalContent: locale === "zh" ? "原始内容" : locale === "ja" ? "元の内容" : "Original Content",
    openInOutlook: locale === "zh" ? "在 Outlook 中打开" : locale === "ja" ? "Outlookで開く" : "Open in Outlook",
    summaryGenerating: locale === "zh" ? "摘要生成中..." : locale === "ja" ? "要約生成中..." : "Generating...",
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-800">
        {/* Header */}
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {selectedMail.subject || "(No Subject)"}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {selectedMail.fromName || selectedMail.fromAddress}
                </span>
                {selectedMail.fromName && (
                  <span>&lt;{selectedMail.fromAddress}&gt;</span>
                )}
                <span>·</span>
                <span>{formatDate(selectedMail.receivedDateTime)}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    selectedMail.importance === "high"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : selectedMail.importance === "low"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                  }`}
                >
                  {selectedMail.importance === "high"
                    ? locale === "zh" ? "高" : locale === "ja" ? "高" : "High"
                    : selectedMail.importance === "low"
                      ? locale === "zh" ? "低" : locale === "ja" ? "低" : "Low"
                      : locale === "zh" ? "普通" : locale === "ja" ? "普通" : "Normal"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="shrink-0 rounded-lg border border-zinc-200 p-2 text-zinc-400 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-600 dark:border-zinc-700 dark:hover:bg-zinc-700"
              aria-label={labels.close}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* AI Summary */}
        <div className="border-b border-zinc-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 px-5 py-4 dark:border-zinc-700 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              {labels.aiSummary}
            </span>
          </div>
          {selectedMail.aiSummary ? (
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {selectedMail.aiSummary}
            </p>
          ) : (
            <p className="text-sm italic text-zinc-400 dark:text-zinc-500">
              {labels.summaryGenerating}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(90vh - 280px)" }}>
          <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {labels.originalContent}
          </h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : (
            <div
              className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
              dangerouslySetInnerHTML={{ __html: formatBodyContent(bodyContent || "") }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 bg-zinc-50/50 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {labels.close}
            </button>
            {selectedMail.webLink && (
              <button
                type="button"
                onClick={handleOpenInOutlook}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {labels.openInOutlook}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
