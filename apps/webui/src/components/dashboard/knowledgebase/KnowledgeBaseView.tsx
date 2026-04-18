/**
 * 知识库视图
 * 使用 MailContext 和 AppContext
 */

import { useState, useEffect, useCallback } from "react";
import { useMail } from "../../../contexts/MailContext";
import { useApp } from "../../../contexts/AppContext";
import { EisenhowerMatrixPanel } from "./EisenhowerMatrixPanel";
import { KnowledgeBaseStatsCard } from "./KnowledgeBaseStatsCard";
import { MailsListPanel } from "./MailsListPanel";
import { EventsClusterPanel } from "./EventsClusterPanel";
import { PersonsProfilePanel } from "./PersonsProfilePanel";
import { ArtifactsLibraryPanel } from "./ArtifactsLibraryPanel";
import { LoadingSpinner } from "../../shared/LoadingSpinner";
import MailKBSummaryModal from "../MailKBSummaryModal";

type TabKey = "overview" | "mails" | "events" | "persons" | "documents";

interface KnowledgeBaseViewProps {
  initialTab?: TabKey;
}

export function KnowledgeBaseView({ initialTab = "overview" }: KnowledgeBaseViewProps) {
  const {
    kbStats,
    kbMails,
    kbEvents,
    kbPersons,
    activeSourceId,
    fetchKbStats,
    fetchKbMails,
    fetchKbEvents,
    fetchKbPersons,
    triggerSummarize,
  } = useMail();
  const { locale } = useApp();

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [artifactsRefreshToken, setArtifactsRefreshToken] = useState(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchKbStats(), fetchKbMails(), fetchKbEvents(), fetchKbPersons()]);
    } finally {
      setLoading(false);
    }
  }, [fetchKbStats, fetchKbMails, fetchKbEvents, fetchKbPersons]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleSummarize = async () => {
    setIsSummarizing(true);
    try {
      const jobId = await triggerSummarize();
      if (jobId) {
        setCurrentJobId(jobId);
        setShowModal(true);
      }
    } catch {
      // error handled in context
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setCurrentJobId(null);
    void loadAll();
    setArtifactsRefreshToken((value) => value + 1);
  };

  const labels = {
    title: locale === "zh" ? "邮件知识库" : locale === "ja" ? "メール知識庫" : "Mail Knowledge Base",
    overview: locale === "zh" ? "概览" : locale === "ja" ? "概要" : "Overview",
    mails: locale === "zh" ? "邮件" : locale === "ja" ? "メール" : "Mails",
    events: locale === "zh" ? "事件" : locale === "ja" ? "イベント" : "Events",
    persons: locale === "zh" ? "联系人" : locale === "ja" ? "連絡先" : "Persons",
    documents: locale === "zh" ? "文档" : locale === "ja" ? "ドキュメント" : "Documents",
    loading: locale === "zh" ? "加载中..." : locale === "ja" ? "読み込み中..." : "Loading...",
    refresh: locale === "zh" ? "刷新" : locale === "ja" ? "更新" : "Refresh",
    triggerSummarize: locale === "zh" ? "归纳旧邮件" : locale === "ja" ? "過去メールを要約" : "Summarize Historical Mail",
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: labels.overview },
    { key: "mails", label: labels.mails, count: kbStats?.totalMails },
    { key: "events", label: labels.events, count: kbStats?.totalEvents },
    { key: "persons", label: labels.persons, count: kbStats?.totalPersons },
    { key: "documents", label: labels.documents },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {labels.title}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void loadAll();
                setArtifactsRefreshToken((value) => value + 1);
              }}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            >
              {loading ? <LoadingSpinner size="sm" /> : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {labels.refresh}
            </button>
            <button
              onClick={() => void handleSummarize()}
              disabled={isSummarizing}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSummarizing ? <LoadingSpinner size="sm" /> : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              )}
              {labels.triggerSummarize}
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="mt-4 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === tab.key ? "bg-white/20" : "bg-zinc-200 dark:bg-zinc-600"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading && !kbStats ? (
          <div className="flex h-full items-center justify-center gap-3">
            <LoadingSpinner size="lg" />
            <span className="text-zinc-500">{labels.loading}</span>
          </div>
        ) : (
          <>
            {activeTab === "overview" && kbStats && (
              <div className="space-y-6">
                <KnowledgeBaseStatsCard stats={kbStats} />
                <EisenhowerMatrixPanel
                  mails={kbMails}
                  persons={kbPersons}
                  events={kbEvents}
                />
              </div>
            )}
            {activeTab === "mails" && (
              <MailsListPanel mails={kbMails} persons={kbPersons} events={kbEvents} />
            )}
            {activeTab === "events" && (
              <EventsClusterPanel events={kbEvents} mails={kbMails} />
            )}
            {activeTab === "persons" && (
              <PersonsProfilePanel persons={kbPersons} mails={kbMails} />
            )}
            {activeTab === "documents" && (
              <ArtifactsLibraryPanel
                sourceId={activeSourceId}
                refreshToken={artifactsRefreshToken}
              />
            )}
          </>
        )}
      </div>

      {/* Summary Modal */}
      {showModal && currentJobId && (
        <MailKBSummaryModal jobId={currentJobId} onClose={handleModalClose} />
      )}
    </div>
  );
}
