/**
 * 邮件详情页（独立页面模式）
 */

import React, { useState, useEffect, useCallback } from "react";
import DOMPurify from "dompurify";
import { sanitizeExternalLink } from "../../utils/sanitize";
import type { TriageMailItem } from "@mail-agent/shared-types";
import { useMail } from "../../contexts/MailContext";

function escapeHtml(content: string): string {
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBodyContent(content: string): string {
  if (!content) return "";

  const decoded = content
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  if (/<[a-z!/][^>]*>/i.test(decoded)) {
    return DOMPurify.sanitize(decoded, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "script"],
    });
  }

  return escapeHtml(decoded).replace(/\n/g, "<br />");
}

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

export function MailDetailPage({ item, onBack, uiCopy }: MailDetailPageProps) {
  const { fetchMailDetail, mailBodyCache } = useMail();
  const [locale] = useState("zh");

  const [bodyContent, setBodyContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      // 优先使用缓存
      const cached = mailBodyCache.get(item.id);
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
  }, [fetchMailDetail, item, mailBodyCache]);

  const handleOpenInOutlook = useCallback(() => {
    if (item?.webLink) {
      const safeLink = sanitizeExternalLink(item.webLink);
      if (safeLink) window.open(safeLink, "_blank", "noopener,noreferrer");
    }
  }, [item?.webLink]);

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
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
    back: locale === "zh" ? "返回列表" : "Back to list",
    originalContent: locale === "zh" ? "原始内容" : "Original Content",
    openInOutlook: locale === "zh" ? "在 Outlook 中打开" : "Open in Outlook",
    summaryGenerating: locale === "zh" ? "摘要生成中..." : "Generating...",
    received: locale === "zh" ? "收件时间" : "Received",
    from: locale === "zh" ? "发件人" : "From",
    high: locale === "zh" ? "高" : "High",
    normal: locale === "zh" ? "普通" : "Normal",
    low: locale === "zh" ? "低" : "Low",
  };

  const importanceColors: Record<string, string> = {
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    normal: "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400",
    low: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  };

  const importanceLabel = (importance: string | undefined) => {
    switch (importance) {
      case "high": return labels.high;
      case "low": return labels.low;
      default: return labels.normal;
    }
  };

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mx-auto max-w-4xl flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {labels.back}
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {item.subject || "(No Subject)"}
            </h1>
          </div>

          {item.webLink && (
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

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        {/* Mail Info */}
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {item.subject || "(No Subject)"}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{uiCopy.from}:</span>
              <span>
                {item.fromName || item.fromAddress}
                {item.fromName && (
                  <span className="text-zinc-500"> &lt;{item.fromAddress}&gt;</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{uiCopy.receivedAt}:</span>
              <span>{formatDate(item.receivedDateTime)}</span>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${importanceColors[item.importance || "normal"]}`}
            >
              {importanceLabel(item.importance)}
            </span>
          </div>
        </div>

        {/* AI Summary */}
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 shadow-sm dark:border-blue-800 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              {uiCopy.aiSummary}
            </span>
          </div>
          {item.aiSummary ? (
            <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
              {item.aiSummary}
            </p>
          ) : (
            <p className="text-base italic text-zinc-400">{labels.summaryGenerating}</p>
          )}
        </div>

        {/* Original Content */}
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h3 className="mb-4 text-base font-semibold text-zinc-700 dark:text-zinc-300">
            {labels.originalContent}
          </h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
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
      </div>
    </div>
  );
}
