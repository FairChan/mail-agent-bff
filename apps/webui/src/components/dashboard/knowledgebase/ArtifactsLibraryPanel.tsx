import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../../contexts/AppContext";
import { useDrawerStore } from "../../drawer";
import { LoadingSpinner } from "../../shared/LoadingSpinner";
import { CalmButton, CalmPill, CalmSectionLabel, CalmSurface } from "../../ui/Calm";

type ArtifactKey =
  | "mailIds"
  | "subjects"
  | "scores"
  | "summaries"
  | "events"
  | "senders"
  | "baseline";

type KnowledgeBaseArtifact = {
  key: ArtifactKey;
  label: string;
  path: string;
};

type ArtifactContent = {
  key: ArtifactKey;
  label: string;
  path: string;
  kind: "markdown" | "json";
  content: string;
};

const API_BASE = (import.meta.env.VITE_BFF_BASE_URL ?? "/api").trim().replace(/\/+$/, "");

type ArtifactsLibraryPanelProps = {
  sourceId: string | null;
  refreshToken?: number;
};

export function ArtifactsLibraryPanel({
  sourceId,
  refreshToken = 0,
}: ArtifactsLibraryPanelProps) {
  const { locale } = useApp();
  const openDrawer = useDrawerStore((state) => state.openDrawer);
  const [artifacts, setArtifacts] = useState<KnowledgeBaseArtifact[]>([]);
  const [selectedKey, setSelectedKey] = useState<ArtifactKey | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [content, setContent] = useState<ArtifactContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRefreshToken, setLocalRefreshToken] = useState(0);
  const listRequestIdRef = useRef(0);
  const contentRequestIdRef = useRef(0);

  const labels = {
    eyebrow: locale === "zh" ? "Local Docs" : locale === "ja" ? "ローカル資料" : "Local Docs",
    title: locale === "zh" ? "本地总结文档" : locale === "ja" ? "ローカル要約ドキュメント" : "Local summary documents",
    description:
      locale === "zh"
        ? "这些文件会被 Agent 当作旧邮件问答的第一优先级材料。"
        : locale === "ja"
          ? "これらのファイルは、過去メールに関する質問で Agent が最優先で参照します。"
          : "These files are the first source the agent will read when answering historical mail questions.",
    refresh: locale === "zh" ? "刷新文档" : locale === "ja" ? "再読み込み" : "Refresh docs",
    refreshing: locale === "zh" ? "刷新中..." : locale === "ja" ? "更新中..." : "Refreshing...",
    ready: locale === "zh" ? "归档完成" : locale === "ja" ? "バックフィル完了" : "Backfill ready",
    syncing: locale === "zh" ? "持续更新中" : locale === "ja" ? "更新継続中" : "Still syncing",
    readyDescription:
      locale === "zh"
        ? "旧邮件归档已完成，这批文档现在可以稳定复用。"
        : locale === "ja"
          ? "過去メールのバックフィルが完了し、この資料群を安定して再利用できます。"
          : "Historical backfill is complete and these documents are now stable for reuse.",
    syncingDescription:
      locale === "zh"
        ? "旧邮件归档尚未完成，文档内容仍可能继续变化。"
        : locale === "ja"
          ? "過去メールのバックフィルがまだ終わっておらず、内容は引き続き変化する可能性があります。"
          : "Historical backfill is still running, so document contents may continue to change.",
    listLabel: locale === "zh" ? "文档清单" : locale === "ja" ? "ドキュメント一覧" : "Document library",
    previewLabel: locale === "zh" ? "内容预览" : locale === "ja" ? "内容プレビュー" : "Content preview",
    noSource:
      locale === "zh"
        ? "请先连接并选择一个邮箱，再查看本地总结文档。"
        : locale === "ja"
          ? "ローカル要約ドキュメントを見るには、先にメールボックスを接続して選択してください。"
          : "Connect and select a mailbox before browsing local summary documents.",
    loadingList:
      locale === "zh"
        ? "正在读取文档列表..."
        : locale === "ja"
          ? "ドキュメント一覧を読み込み中..."
          : "Loading document list...",
    noArtifacts:
      locale === "zh"
        ? "暂无可查看的知识库文档"
        : locale === "ja"
          ? "表示できる知識ベース文書はまだありません"
          : "No knowledge base documents are available yet.",
    loadingContent:
      locale === "zh"
        ? "正在读取内容..."
        : locale === "ja"
          ? "内容を読み込み中..."
          : "Loading content...",
    contentMissing:
      locale === "zh"
        ? "该文档尚未生成。完成旧邮件归纳后，这里会显示本地文件内容。"
        : locale === "ja"
          ? "この文書はまだ生成されていません。過去メールの要約が終わると、ここにローカルファイル内容が表示されます。"
          : "This document has not been generated yet. Its local file content will appear here after the historical summary completes.",
    contentFailed:
      locale === "zh"
        ? "文档读取失败，请重试。"
        : locale === "ja"
          ? "文書の読み込みに失敗しました。再試行してください。"
          : "Failed to read document. Please try again.",
    selectPrompt:
      locale === "zh"
        ? "选择左侧文档以查看内容。"
        : locale === "ja"
          ? "左側の文書を選択すると内容が表示されます。"
          : "Select a document on the left to inspect its contents.",
    format: locale === "zh" ? "格式" : locale === "ja" ? "形式" : "Format",
    openDrawer: locale === "zh" ? "打开文档叠页" : locale === "ja" ? "文書ページを開く" : "Open document page",
    openingDisabled:
      locale === "zh"
        ? "读取内容后可打开叠页"
        : locale === "ja"
          ? "内容を読み込むと開けます"
          : "Available after content loads",
  };

  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.key === selectedKey) ?? null,
    [artifacts, selectedKey]
  );

  const loadArtifacts = useCallback(async () => {
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    if (!sourceId) {
      setArtifacts([]);
      setSelectedKey(null);
      setBaselineReady(false);
      setContent(null);
      setError(null);
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sourceId });
      const response = await fetch(`${API_BASE}/mail-kb/artifacts?${params.toString()}`, {
        credentials: "include",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        result?: {
          artifacts?: KnowledgeBaseArtifact[];
          baselineStatus?: { backfillCompleted?: boolean } | null;
        };
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || "Unable to read knowledge base documents");
      }
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      const nextArtifacts = payload.result?.artifacts ?? [];
      setArtifacts(nextArtifacts);
      setBaselineReady(Boolean(payload.result?.baselineStatus?.backfillCompleted));
      setSelectedKey((current) =>
        current && nextArtifacts.some((artifact) => artifact.key === current)
          ? current
          : nextArtifacts[0]?.key ?? null
      );
    } catch (err) {
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      setArtifacts([]);
      setBaselineReady(false);
      setContent(null);
      setSelectedKey(null);
      setError(err instanceof Error ? err.message : "Unable to read knowledge base documents");
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoadingList(false);
      }
    }
  }, [sourceId]);

  const loadContent = useCallback(async (key: ArtifactKey) => {
    if (!sourceId) {
      setContent(null);
      setLoadingContent(false);
      return;
    }
    const requestId = contentRequestIdRef.current + 1;
    contentRequestIdRef.current = requestId;
    setLoadingContent(true);
    setContent(null);
    setError(null);
    try {
      const params = new URLSearchParams({ key, sourceId });
      const response = await fetch(`${API_BASE}/mail-kb/artifacts/content?${params.toString()}`, {
        credentials: "include",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        result?: ArtifactContent;
      };
      if (!response.ok || payload.ok === false || !payload.result) {
        throw new Error(payload.error || "Unable to read document content");
      }
      if (requestId !== contentRequestIdRef.current) {
        return;
      }
      setContent(payload.result);
    } catch (err) {
      if (requestId !== contentRequestIdRef.current) {
        return;
      }
      setContent(null);
      setError(err instanceof Error ? err.message : "Unable to read document content");
    } finally {
      if (requestId === contentRequestIdRef.current) {
        setLoadingContent(false);
      }
    }
  }, [sourceId]);

  useEffect(() => {
    listRequestIdRef.current += 1;
    contentRequestIdRef.current += 1;
    setArtifacts([]);
    setSelectedKey(null);
    setBaselineReady(false);
    setLoadingList(false);
    setLoadingContent(false);
    setContent(null);
    setError(null);
    setLocalRefreshToken(0);
  }, [sourceId]);

  useEffect(() => {
    void loadArtifacts();
  }, [loadArtifacts, refreshToken]);

  useEffect(() => {
    if (!selectedKey) {
      setContent(null);
      return;
    }
    void loadContent(selectedKey);
  }, [loadContent, selectedKey]);

  useEffect(() => {
    if (refreshToken <= 0 || !selectedKey) {
      return;
    }
    void loadContent(selectedKey);
  }, [loadContent, refreshToken, selectedKey]);

  useEffect(() => {
    if (localRefreshToken <= 0 || !selectedKey) {
      return;
    }
    void loadContent(selectedKey);
  }, [loadContent, localRefreshToken, selectedKey]);

  const handleLocalRefresh = useCallback(async () => {
    await loadArtifacts();
    setLocalRefreshToken((value) => value + 1);
  }, [loadArtifacts]);

  const handleOpenDrawer = useCallback(() => {
    if (!selectedArtifact || loadingContent) {
      return;
    }
    openDrawer("artifactContentDetail", {
      artifact: selectedArtifact,
      content,
      baselineReady,
      error,
    });
  }, [baselineReady, content, error, loadingContent, openDrawer, selectedArtifact]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <CalmSurface className="p-5" beam>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CalmSectionLabel>{labels.eyebrow}</CalmSectionLabel>
            <h3 className="mt-2 text-lg font-semibold text-[color:var(--ink)]">{labels.title}</h3>
            <p className="mt-2 text-sm leading-7 text-[color:var(--ink-muted)]">{labels.description}</p>
          </div>
          <CalmButton
            type="button"
            onClick={() => {
              void handleLocalRefresh();
            }}
            disabled={loadingList || !sourceId}
            variant="secondary"
            className="shrink-0"
          >
            {loadingList ? labels.refreshing : labels.refresh}
          </CalmButton>
        </div>

        <div
          className={`mt-4 rounded-[1rem] border px-4 py-3 ${
            baselineReady
              ? "border-[color:var(--border-success)] bg-[color:var(--surface-success)]"
              : "border-[color:var(--border-warning)] bg-[color:var(--surface-warning)]"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <CalmPill tone={baselineReady ? "success" : "warning"} pulse={!baselineReady}>
              {baselineReady ? labels.ready : labels.syncing}
            </CalmPill>
          </div>
          <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
            {baselineReady ? labels.readyDescription : labels.syncingDescription}
          </p>
        </div>

        <div className="mt-5">
          <CalmSectionLabel>{labels.listLabel}</CalmSectionLabel>
          <div className="mt-3 space-y-2">
            {artifacts.map((artifact) => {
              const active = artifact.key === selectedKey;
              return (
                <button
                  key={artifact.key}
                  type="button"
                  onClick={() => setSelectedKey(artifact.key)}
                  className={`w-full rounded-[1rem] border px-4 py-3 text-left transition ${
                    active
                      ? "border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] shadow-[var(--shadow-soft)]"
                      : "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-elevated)]"
                  }`}
                >
                  <p className="text-sm font-semibold text-[color:var(--ink)]">{artifact.label}</p>
                  <p className="mt-2 break-all font-mono text-[11px] leading-5 text-[color:var(--ink-subtle)]">
                    {artifact.path}
                  </p>
                </button>
              );
            })}

            {!artifacts.length && !loadingList ? (
              <div className="rounded-[1rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-6 text-sm text-[color:var(--ink-subtle)]">
                {sourceId ? labels.noArtifacts : labels.noSource}
              </div>
            ) : null}
          </div>
        </div>
      </CalmSurface>

      <CalmSurface className="min-h-[34rem] p-6">
        <div className="flex h-full flex-col">
          {error ? (
            <div className="mb-4 rounded-[1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-4 py-3 text-sm text-[color:var(--pill-urgent-ink)]">
              {error}
            </div>
          ) : null}

          {!selectedArtifact ? (
            <div className="flex flex-1 items-center justify-center rounded-[1rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-6 text-center text-sm text-[color:var(--ink-subtle)]">
              {!sourceId
                ? labels.noSource
                : loadingList
                  ? labels.loadingList
                  : labels.selectPrompt}
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CalmSectionLabel>{labels.previewLabel}</CalmSectionLabel>
                  <h4 className="mt-2 text-lg font-semibold text-[color:var(--ink)]">{selectedArtifact.label}</h4>
                  <p className="mt-2 break-all font-mono text-[11px] leading-5 text-[color:var(--ink-subtle)]">
                    {selectedArtifact.path}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {content?.kind ? (
                    <CalmPill tone="info">
                      {labels.format}: {content.kind.toUpperCase()}
                    </CalmPill>
                  ) : null}
                  {loadingContent ? (
                    <CalmPill tone="muted">
                      <LoadingSpinner size="sm" />
                      {labels.loadingContent}
                    </CalmPill>
                  ) : null}
                  <CalmButton
                    type="button"
                    variant="primary"
                    onClick={handleOpenDrawer}
                    disabled={loadingContent}
                    aria-label={loadingContent ? labels.openingDisabled : labels.openDrawer}
                  >
                    {labels.openDrawer}
                  </CalmButton>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-hidden rounded-[1.15rem] border border-[rgba(118,136,170,0.18)] bg-[radial-gradient(circle_at_top,rgba(22,30,46,0.98),rgba(10,14,22,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <pre className="max-h-[40rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-100">
                  {content?.content.trim()
                    ? content.content
                    : error
                      ? labels.contentFailed
                      : labels.contentMissing}
                </pre>
              </div>
            </div>
          )}
        </div>
      </CalmSurface>
    </div>
  );
}

export default ArtifactsLibraryPanel;
