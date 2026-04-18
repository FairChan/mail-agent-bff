import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingSpinner } from "../../shared/LoadingSpinner";

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
        throw new Error(payload.error || "无法读取知识库文档列表");
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
      setError(err instanceof Error ? err.message : "无法读取知识库文档列表");
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
        throw new Error(payload.error || "无法读取知识库文档内容");
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
      setError(err instanceof Error ? err.message : "无法读取知识库文档内容");
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

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Local Docs
            </p>
            <h3 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              本地总结文档
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              这些文件就是 Agent 后续回看旧邮件时会优先读取的材料。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleLocalRefresh();
            }}
            disabled={loadingList || !sourceId}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200"
          >
            {loadingList ? "刷新中..." : "刷新文档"}
          </button>
        </div>

        <div className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
          baselineReady
            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
            : "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        }`}>
          {baselineReady ? "旧邮件归档已完成" : "旧邮件归档尚未完成，文档可能还在持续更新"}
        </div>

        <div className="mt-4 space-y-2">
          {artifacts.map((artifact) => {
            const active = artifact.key === selectedKey;
            return (
              <button
                key={artifact.key}
                type="button"
                onClick={() => setSelectedKey(artifact.key)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                }`}
              >
                <p className="text-sm font-medium">{artifact.label}</p>
                <p className={`mt-2 break-all text-[11px] ${active ? "text-white/80 dark:text-zinc-700" : "text-zinc-500 dark:text-zinc-400"}`}>
                  {artifact.path}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-800">
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {!selectedArtifact ? (
          <div className="flex min-h-[24rem] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            {!sourceId
              ? "请先连接并选择一个邮箱，再查看本地总结文档。"
              : loadingList
                ? "正在读取文档列表..."
                : "暂无可查看的知识库文档"}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedArtifact.label}
                </h4>
                <p className="mt-2 break-all text-xs text-zinc-500 dark:text-zinc-400">
                  {selectedArtifact.path}
                </p>
              </div>
              {loadingContent ? (
                <div className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <LoadingSpinner size="sm" />
                  正在读取内容...
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-4 dark:border-zinc-700">
              <pre className="max-h-[40rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-100">
                {content?.content.trim()
                  ? content.content
                  : error
                    ? "文档读取失败，请重试。"
                    : "该文档尚未生成。完成旧邮件归纳后，这里会显示本地文件内容。"}
              </pre>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default ArtifactsLibraryPanel;
