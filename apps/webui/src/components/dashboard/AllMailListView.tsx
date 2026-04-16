/**
 * 全部邮件列表视图
 * 展示所有邮件，支持搜索和筛选
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import { MailDetailPage } from "./MailDetailPage";
import { LoadingSpinner } from "../shared/LoadingSpinner";

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
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {labels.allMail}
        </h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {filteredItems.length} / {allItems.length} {locale === "zh" ? "封邮件" : locale === "ja" ? "件のメール" : "emails"}
        </span>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder={labels.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-800">
          {(["all", "unread", "read"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {f === "all" ? labels.filterAll : f === "unread" ? labels.filterUnread : labels.filterRead}
            </button>
          ))}
        </div>
      </div>

      {/* 邮件列表 */}
      {isLoadingMail && allItems.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-3 py-8 text-center text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
          {labels.noMail}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredItems.map((item) => (
            <li
              key={item.id}
              className={`rounded-xl border transition cursor-pointer hover:shadow-md ${
                item.isRead
                  ? "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"
                  : "border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
              }`}
            >
              <div
                className="flex items-start justify-between gap-3 px-4 py-3"
                onClick={() => setSelectedMail(item)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!item.isRead && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                    <p
                      className={`truncate text-sm ${
                        item.isRead ? "font-normal text-zinc-600 dark:text-zinc-400" : "font-semibold text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {item.subject || "(No Subject)"}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
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
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                      <span className="mr-1 inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                        AI
                      </span>
                      {item.aiSummary}
                    </p>
                  ) : (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
                      {item.bodyPreview?.slice(0, 100)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMail(item);
                  }}
                  className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400"
                >
                  {labels.viewDetail}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
