import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import MailKBSummaryModal from "./MailKBSummaryModal";
import { LoadingSpinner } from "../shared/LoadingSpinner";

type KnowledgeBaseArtifact = {
  key: string;
  label: string;
  path: string;
};

type TutorialViewProps = {
  apiBase: string;
  onComplete: () => void;
  completed: boolean;
};

const DAY_OPTIONS = [7, 14, 30, 60];

export function TutorialView({ apiBase, onComplete, completed }: TutorialViewProps) {
  const { locale, setCurrentView } = useApp();
  const {
    activeSourceId,
    sources,
    kbStats,
    fetchKbStats,
    triggerSummarize,
  } = useMail();
  const [selectedDays, setSelectedDays] = useState(30);
  const [jobId, setJobId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<KnowledgeBaseArtifact[]>([]);
  const [baselineReady, setBaselineReady] = useState(false);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const artifactRequestIdRef = useRef(0);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === activeSourceId) ?? null,
    [activeSourceId, sources]
  );

  const loadArtifacts = useCallback(async () => {
    const requestId = artifactRequestIdRef.current + 1;
    artifactRequestIdRef.current = requestId;
    if (!activeSourceId) {
      setArtifacts([]);
      setBaselineReady(false);
      setArtifactsError(null);
      setIsLoadingArtifacts(false);
      return;
    }

    setIsLoadingArtifacts(true);
    setArtifactsError(null);
    try {
      const params = new URLSearchParams({ sourceId: activeSourceId });
      const response = await fetch(`${apiBase}/mail-kb/artifacts?${params.toString()}`, {
        credentials: "include",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        artifacts?: KnowledgeBaseArtifact[];
        baselineStatus?: { backfillCompleted?: boolean } | null;
        result?: {
          artifacts?: KnowledgeBaseArtifact[];
          baselineStatus?: { backfillCompleted?: boolean } | null;
        };
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || "无法读取知识库文档状态");
      }
      if (requestId !== artifactRequestIdRef.current) {
        return;
      }
      setArtifacts(payload.artifacts ?? payload.result?.artifacts ?? []);
      setBaselineReady(
        Boolean(payload.baselineStatus?.backfillCompleted ?? payload.result?.baselineStatus?.backfillCompleted)
      );
    } catch (error) {
      if (requestId !== artifactRequestIdRef.current) {
        return;
      }
      setArtifacts([]);
      setBaselineReady(false);
      setArtifactsError(error instanceof Error ? error.message : "无法读取知识库文档状态");
    } finally {
      if (requestId === artifactRequestIdRef.current) {
        setIsLoadingArtifacts(false);
      }
    }
  }, [activeSourceId, apiBase]);

  useEffect(() => {
    artifactRequestIdRef.current += 1;
    setArtifacts([]);
    setBaselineReady(false);
    setArtifactsError(null);
    setIsLoadingArtifacts(false);
  }, [activeSourceId]);

  useEffect(() => {
    void fetchKbStats();
    void loadArtifacts();
  }, [fetchKbStats, loadArtifacts]);

  const handleStartSummary = async () => {
    setIsStarting(true);
    try {
      const nextJobId = await triggerSummarize({ windowDays: selectedDays });
      if (nextJobId) {
        setJobId(nextJobId);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const copy = {
    headline: locale === "zh" ? "第一次使用，先把邮箱助理点亮" : "Start by lighting up your mail copilot",
    description:
      locale === "zh"
        ? "先绑定邮箱，再选择要归纳的时间范围。系统会把旧邮件做成可复用的本地知识库，后续 Agent 问答会直接读取这些结果。"
        : "Connect a mailbox, choose a history window, and let the app build a reusable local knowledge base for future agent answers.",
    sourceTitle: locale === "zh" ? "1. 绑定邮箱" : "1. Connect a mailbox",
    sourceBody:
      locale === "zh"
        ? activeSource
          ? `当前已连接：${activeSource.name || activeSource.emailHint || activeSource.id}`
          : "先在设置中完成 Outlook 绑定，系统才能读取你的历史邮件。"
        : activeSource
          ? `Connected: ${activeSource.name || activeSource.emailHint || activeSource.id}`
          : "Finish Outlook setup in Settings before running the historical summary flow.",
    summaryTitle: locale === "zh" ? "2. 选择要归纳的历史范围" : "2. Choose a history range",
    summaryBody:
      locale === "zh"
        ? "建议先从 30 天开始。完成后会自动生成邮件 ID、题目索引、评分索引、摘要正文、事件聚类和发件人画像文档。"
        : "Start with 30 days. The pipeline will export mail IDs, subject index, score index, summaries, event clusters, and sender profiles.",
    featuresTitle: locale === "zh" ? "3. 完成后会自动点亮的能力" : "3. What this unlocks next",
    docsTitle: locale === "zh" ? "4. 本地文档与 Agent 可访问结果" : "4. Local documents and agent-readable outputs",
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Tutorial</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{copy.headline}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">{copy.description}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setCurrentView("settings")}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {locale === "zh" ? "前往绑定邮箱" : "Open Settings"}
          </button>
          <button
            type="button"
            onClick={onComplete}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-200 dark:hover:border-zinc-300"
          >
            {completed ? (locale === "zh" ? "再次进入收件箱" : "Back to inbox") : (locale === "zh" ? "暂时跳过教程" : "Skip for now")}
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{copy.sourceTitle}</p>
          <p className="mt-3 text-sm leading-7 text-zinc-700 dark:text-zinc-200">{copy.sourceBody}</p>
          {activeSource ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              {activeSource.ready
                ? locale === "zh"
                  ? "邮箱已经可读，可以直接开始历史归纳。"
                  : "Mailbox is ready to read."
                : locale === "zh"
                  ? "邮箱已连接，后台仍可能在继续验证。现在也可以先开始归纳。"
                  : "Mailbox is connected and can already start the summary flow."}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{copy.summaryTitle}</p>
          <p className="mt-3 text-sm leading-7 text-zinc-700 dark:text-zinc-200">{copy.summaryBody}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {DAY_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setSelectedDays(days)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  selectedDays === days
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 text-zinc-700 hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-200 dark:hover:border-zinc-300"
                }`}
              >
                {locale === "zh" ? `近 ${days} 天` : `${days} days`}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                void handleStartSummary();
              }}
              disabled={!activeSourceId || isStarting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStarting ? <LoadingSpinner size="sm" /> : null}
              {locale === "zh" ? "开始归纳旧邮件" : "Start history summary"}
            </button>
            <button
              type="button"
              onClick={() => setCurrentView("knowledgebase")}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-200 dark:hover:border-zinc-300"
            >
              {locale === "zh" ? "查看归纳结果" : "Open summary results"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{copy.featuresTitle}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            locale === "zh" ? "自动分类到：未处理、紧急重要、不紧急重要、紧急不重要、不紧急不重要" : "Auto-bucket into pending plus Eisenhower quadrants",
            locale === "zh" ? "识别日期、会议、考试、DDL，并整理成日历候选项" : "Extract dates, meetings, exams, and deadlines into calendar drafts",
            locale === "zh" ? "重要邮件沉淀为知识卡片和可追溯摘要" : "Turn important mail into reusable knowledge cards and summaries",
            locale === "zh" ? "后续 Agent 问答优先直接读取本地总结结果" : "Let the agent answer from locally exported summary artifacts first",
          ].map((item) => (
            <div key={item} className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm leading-6 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{copy.docsTitle}</p>
            <p className="mt-3 text-sm leading-7 text-zinc-700 dark:text-zinc-200">
              {locale === "zh"
                ? "这些文档会落在本地，后续 Agent 会直接读取它们来回答旧邮件问题。"
                : "These documents are saved locally and will be used by the agent for future historical mail answers."}
            </p>
          </div>
          {kbStats ? (
            <div className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              {locale === "zh" ? `当前已归档 ${kbStats.totalMails} 封邮件 / ${kbStats.totalEvents} 个事件 / ${kbStats.totalPersons} 位人物` : `${kbStats.totalMails} mails / ${kbStats.totalEvents} events / ${kbStats.totalPersons} people`}
            </div>
          ) : null}
        </div>
        {isLoadingArtifacts ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <LoadingSpinner size="sm" />
            {locale === "zh" ? "正在读取本地文档状态..." : "Loading local artifact status..."}
          </div>
        ) : artifactsError ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            {artifactsError}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {artifacts.map((artifact) => (
              <div key={artifact.key} className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{artifact.label}</p>
                <p className="mt-2 break-all text-xs text-zinc-500 dark:text-zinc-400">{artifact.path}</p>
              </div>
            ))}
          </div>
        )}
        {baselineReady ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            {locale === "zh"
              ? "旧邮件归档已经完成，这批本地文档现在可以直接被 Agent 访问。"
              : "Historical backfill is complete and the agent can read these local artifacts now."}
          </div>
        ) : null}
      </section>

      {jobId ? (
        <MailKBSummaryModal
          jobId={jobId}
          onClose={() => {
            setJobId(null);
            void fetchKbStats();
            void loadArtifacts();
          }}
        />
      ) : null}
    </div>
  );
}

export default TutorialView;
