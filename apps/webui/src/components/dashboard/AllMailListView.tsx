/**
 * 全部邮件列表视图
 * 展示所有邮件，支持搜索和筛选
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import { MailDetailPage } from "./MailDetailPage";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { CalmButton } from "../ui/Calm";

export function AllMailListView() {
  const { triage, isLoadingMail, activeSourceId, fetchTriage, selectedMail, setSelectedMail, prefetchMailBodies } = useMail();
  const { locale } = useApp();
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (activeSourceId) {
      fetchTriage(100); // 获取更多邮件
    }
  }, [activeSourceId, fetchTriage]);

  // 预加载前 10 封邮件的内容
  useEffect(() => {
    if (triage?.allItems?.length) {
      const messageIds = triage.allItems.slice(0, 10).map((item) => item.id);
      prefetchMailBodies(messageIds);
    }
  }, [triage, prefetchMailBodies]);

  const allItems = triage?.allItems ?? [];

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "unread" && !item.isRead) ||
        (filter === "read" && item.isRead);

      const matchesSearch =
        !searchQuery ||
        item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.fromName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.fromAddress.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }, [allItems, filter, searchQuery]);

  const handleBack = useCallback(() => {
    setSelectedMail(null);
  }, [setSelectedMail]);

  const labels = {
    allMail: locale === "zh" ? "邮件历史" : locale === "ja" ? "メール履歴" : "Mail History",
    archiveLabel: locale === "zh" ? "邮件归档" : locale === "ja" ? "メールアーカイブ" : "Mail Archive",
    searchPlaceholder: locale === "zh" ? "搜索邮件主题、发件人..." : locale === "ja" ? "メールを検索..." : "Search by subject, sender...",
    filterAll: locale === "zh" ? "全部" : locale === "ja" ? "すべて" : "All",
    filterUnread: locale === "zh" ? "未读" : locale === "ja" ? "未読" : "Unread",
    filterRead: locale === "zh" ? "已读" : locale === "ja" ? "既読" : "Read",
    viewDetail: locale === "zh" ? "查看" : locale === "ja" ? "表示" : "View",
    noMail: locale === "zh" ? "暂无可展示邮件" : locale === "ja" ? "表示できるメールはありません" : "No messages to display",
  };

  if (selectedMail) {
    return (
      <MailDetailPage
        item={selectedMail}
        activeSourceId={activeSourceId ?? ""}
        authLocale={locale}
        onBack={handleBack}
        uiCopy={{
          from: locale === "zh" ? "发件人" : locale === "ja" ? "送信者" : "From",
          subject: locale === "zh" ? "主题" : locale === "ja" ? "件名" : "Subject",
          receivedAt: locale === "zh" ? "收件时间" : locale === "ja" ? "受信時刻" : "Received",
          aiSummary: locale === "zh" ? "AI摘要" : locale === "ja" ? "AI要約" : "AI Summary",
          openInOutlook: locale === "zh" ? "在Outlook中打开" : locale === "ja" ? "Outlookで開く" : "Open in Outlook",
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">{labels.archiveLabel}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--ink)]">
            {labels.allMail}
          </h2>
        </div>
        <span className="text-xs text-[color:var(--ink-subtle)]">
          {filteredItems.length} / {allItems.length} {locale === "zh" ? "封邮件" : locale === "ja" ? "件のメール" : "emails"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder={labels.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="calm-input min-w-[200px] flex-1 px-4 py-2 text-sm"
        />
        <div className="flex gap-1 rounded-[1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] p-1">
          {(["all", "unread", "read"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-[999px] px-3 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)]"
                  : "text-[color:var(--ink-muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)]"
              }`}
            >
              {f === "all" ? labels.filterAll : f === "unread" ? labels.filterUnread : labels.filterRead}
            </button>
          ))}
        </div>
      </div>

      {isLoadingMail && allItems.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-[1.25rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-3 py-8 text-center text-sm text-[color:var(--ink-subtle)]">
          {labels.noMail}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredItems.map((item) => (
            <li
              key={item.id}
              className={`cursor-pointer rounded-[1.25rem] border transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] ${
                item.isRead
                  ? "border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)]"
                  : "border-[color:var(--border-info)] bg-[color:var(--surface-info)]"
              }`}
            >
              <div
                className="flex items-start justify-between gap-3 px-4 py-3"
                onClick={() => setSelectedMail(item)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!item.isRead && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--button-primary)]" />
                    )}
                    <p
                      className={`truncate text-sm ${
                        item.isRead ? "font-medium text-[color:var(--ink-muted)]" : "font-semibold text-[color:var(--ink)]"
                      }`}
                    >
                      {item.subject || "(No Subject)"}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[color:var(--ink-subtle)]">
                    {item.fromName || item.fromAddress}
                    <span className="mx-1.5">·</span>
                    {item.receivedDateTime
                      ? new Date(item.receivedDateTime).toLocaleDateString(
                          locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US",
                          { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                        )
                      : ""}
                  </p>
                  {item.aiSummary ? (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[color:var(--ink-muted)]">
                      <span className="mr-1 inline-flex items-center rounded-full bg-[color:var(--pill-info)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--pill-info-ink)]">
                        AI
                      </span>
                      {item.aiSummary}
                    </p>
                  ) : (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[color:var(--ink-subtle)]">
                      {item.bodyPreview?.slice(0, 100)}
                    </p>
                  )}
                </div>
                <CalmButton
                  type="button"
                  variant="secondary"
                  className="shrink-0 px-3 py-1.5 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMail(item);
                  }}
                >
                  {labels.viewDetail}
                </CalmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
