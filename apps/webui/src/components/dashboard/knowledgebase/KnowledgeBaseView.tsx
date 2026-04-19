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
import { CalmButton, CalmPill } from "../../ui/Calm";

type TabKey = "overview" | "mails" | "events" | "persons" | "documents";

interface KnowledgeBaseViewProps {
  initialTab?: TabKey;
  visibleTabs?: readonly TabKey[];
  titleOverride?: string;
}

const defaultTabs: readonly TabKey[] = ["overview", "mails", "events", "persons", "documents"];

export function KnowledgeBaseView({
  initialTab = "overview",
  visibleTabs = defaultTabs,
  titleOverride,
}: KnowledgeBaseViewProps) {
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

  const resolveTab = useCallback(
    (candidate: TabKey) => (visibleTabs.includes(candidate) ? candidate : visibleTabs[0] ?? "overview"),
    [visibleTabs]
  );
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveTab(initialTab));
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
    setActiveTab(resolveTab(initialTab));
  }, [initialTab, resolveTab]);

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
    title:
      titleOverride ??
      (locale === "zh"
        ? "邮件知识库"
        : locale === "ja"
          ? "メール知識庫"
          : "Mail Knowledge Base"),
    overview: locale === "zh" ? "概览" : locale === "ja" ? "概要" : "Overview",
    mails: locale === "zh" ? "邮件" : locale === "ja" ? "メール" : "Mails",
    events: locale === "zh" ? "事件" : locale === "ja" ? "イベント" : "Events",
    persons: locale === "zh" ? "联系人" : locale === "ja" ? "連絡先" : "Persons",
    documents: locale === "zh" ? "文档" : locale === "ja" ? "ドキュメント" : "Documents",
    loading: locale === "zh" ? "加载中..." : locale === "ja" ? "読み込み中..." : "Loading...",
    refresh: locale === "zh" ? "刷新" : locale === "ja" ? "更新" : "Refresh",
    triggerSummarize: locale === "zh" ? "归纳旧邮件" : locale === "ja" ? "過去メールを要約" : "Summarize Historical Mail",
  };

  const allTabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "overview", label: labels.overview },
    { key: "mails", label: labels.mails, count: kbStats?.totalMails },
    { key: "events", label: labels.events, count: kbStats?.totalEvents },
    { key: "persons", label: labels.persons, count: kbStats?.totalPersons },
    { key: "documents", label: labels.documents },
  ];
  const tabs = allTabs.filter((tab) => visibleTabs.includes(tab.key));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[color:var(--border-soft)] px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">Knowledge Base</p>
            <h1 className="mt-1 text-xl font-semibold text-[color:var(--ink)]">
              {labels.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <CalmButton
              onClick={() => {
                void loadAll();
                setArtifactsRefreshToken((value) => value + 1);
              }}
              disabled={loading}
              variant="secondary"
            >
              {loading ? <LoadingSpinner size="sm" /> : null}
              {labels.refresh}
            </CalmButton>
            <CalmButton onClick={() => void handleSummarize()} disabled={isSummarizing} variant="primary">
              {isSummarizing ? <LoadingSpinner size="sm" /> : null}
              {labels.triggerSummarize}
            </CalmButton>
          </div>
        </div>

        {tabs.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.key
                    ? "border-[color:var(--border-info)] bg-[color:var(--surface-info)] text-[color:var(--pill-info-ink)]"
                    : "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] text-[color:var(--ink-muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)]"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <CalmPill tone={activeTab === tab.key ? "info" : "muted"}>{tab.count}</CalmPill>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="calm-scrollbar flex-1 overflow-auto p-6">
        {loading && !kbStats ? (
          <div className="flex h-full items-center justify-center gap-3">
            <LoadingSpinner size="lg" />
            <span className="text-[color:var(--ink-subtle)]">{labels.loading}</span>
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
