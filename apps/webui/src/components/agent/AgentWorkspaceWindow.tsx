import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useMail } from "../../contexts/MailContext";
import MailKBSummaryModal from "../dashboard/MailKBSummaryModal";
import { buildDashboardUrl, getRequestedAgentSourceId, updateAgentWindowSource } from "../../utils/agentWindow";
import { useAgentConversation } from "./useAgentConversation";

type AgentWorkspaceWindowProps = {
  apiBase: string;
  embedded?: boolean;
};

type AgentSkillMetadata = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
};

const WELCOME_MESSAGE =
  "Tell me what you need from your mailbox. I can search messages, explain deadlines, summarize inbox changes, and pull details from a specific email.";

const SUGGESTIONS = [
  "Summarize the most important unread mail from today.",
  "Build a full summary of my recent mailbox history.",
  "What deadlines do I have in the next 7 days?",
  "Find the latest message from my advisor and tell me what I need to do.",
  "List meetings or exams mentioned in recent mail.",
];

function formatActivityTime(value: string): string {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export function AgentWorkspaceWindow({ apiBase, embedded = false }: AgentWorkspaceWindowProps) {
  const { user } = useAuth();
  const {
    activeSourceId,
    sources,
    isLoadingSources,
    fetchSources,
    selectSource,
    verifySource,
  } = useMail();
  const [input, setInput] = useState("");
  const [skills, setSkills] = useState<AgentSkillMetadata[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [showKnowledgeBaseModal, setShowKnowledgeBaseModal] = useState(false);
  const requestedSourceId = getRequestedAgentSourceId();
  const activeSource = useMemo(
    () => sources.find((source) => source.id === activeSourceId) ?? null,
    [activeSourceId, sources]
  );
  const canChat = Boolean(activeSourceId && activeSource?.ready);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const {
    activities,
    busy,
    cancel,
    error,
    knowledgeBaseJobId,
    messages,
    resetConversation,
    sendMessage,
  } = useAgentConversation({
    apiBase,
    activeSourceId,
    welcomeMessage: WELCOME_MESSAGE,
  });

  useEffect(() => {
    if (!requestedSourceId || sources.length === 0 || activeSourceId === requestedSourceId) {
      return;
    }

    const matched = sources.some((source) => source.id === requestedSourceId);
    if (matched) {
      void selectSource(requestedSourceId);
    }
  }, [activeSourceId, requestedSourceId, selectSource, sources]);

  useEffect(() => {
    setInput("");
  }, [activeSourceId]);

  useEffect(() => {
    if (!activeSourceId) {
      setSkills([]);
      setSkillsError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `${apiBase}/agent/skills?sourceId=${encodeURIComponent(activeSourceId)}`,
          {
            credentials: "include",
          }
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          skills?: AgentSkillMetadata[];
        };
        if (cancelled) {
          return;
        }
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || "Failed to load agent capabilities.");
        }
        setSkills(Array.isArray(payload.skills) ? payload.skills.filter((skill) => skill.enabled) : []);
        setSkillsError(null);
      } catch (err) {
        if (!cancelled) {
          setSkills([]);
          setSkillsError(err instanceof Error ? err.message : "Failed to load agent capabilities.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSourceId, apiBase]);

  useEffect(() => {
    if (!transcriptRef.current) {
      return;
    }

    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [busy, messages]);

  useEffect(() => {
    if (knowledgeBaseJobId) {
      setShowKnowledgeBaseModal(true);
    }
  }, [knowledgeBaseJobId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = input.trim();
    if (!nextMessage) {
      return;
    }
    setInput("");
    await sendMessage(nextMessage);
  };

  const handleSuggestion = async (suggestion: string) => {
    if (busy || !canChat) {
      return;
    }
    setInput("");
    await sendMessage(suggestion);
  };

  const handleSourceChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSourceId = event.target.value;
    if (!nextSourceId) {
      return;
    }
    await selectSource(nextSourceId);
    updateAgentWindowSource(nextSourceId);
    setVerifyMessage(null);
  };

  const handleNewThread = () => {
    setInput("");
    resetConversation();
  };

  const handleVerifySource = async () => {
    if (!activeSourceId) {
      return;
    }

    setIsVerifying(true);
    setVerifyMessage(null);
    try {
      const ready = await verifySource(activeSourceId);
      await fetchSources();
      setVerifyMessage(
        ready
          ? "Mailbox verification succeeded. You can start chatting now."
          : "Mailbox verification did not complete yet. Check the source in Settings if this persists."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className={`flex flex-col overflow-hidden bg-zinc-950 text-zinc-100 ${embedded ? "min-h-[calc(100vh-8rem)] rounded-xl border border-zinc-800" : "h-screen"}`}>
      <header className="border-b border-zinc-800 bg-zinc-950/95 px-5 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Agent Window
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">Mail Copilot</h1>
            <p className="mt-1 truncate text-sm text-zinc-400">
              {user?.displayName || user?.email || "Signed-in user"} · {activeSource?.name || activeSource?.emailHint || "No mailbox selected"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!embedded ? (
              <a
                href={buildDashboardUrl()}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                Back to dashboard
              </a>
            ) : null}
            <button
              type="button"
              onClick={handleNewThread}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
            >
              New thread
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="hidden w-80 shrink-0 border-r border-zinc-800 bg-zinc-950/60 lg:flex lg:flex-col">
          <div className="border-b border-zinc-800 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Mailbox</p>
            <div className="mt-3 space-y-3">
              <select
                value={activeSourceId ?? ""}
                onChange={handleSourceChange}
                disabled={isLoadingSources || sources.length === 0}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-zinc-500"
              >
                {sources.length === 0 ? (
                  <option value="">No mailbox source</option>
                ) : (
                  sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name || source.emailHint || source.id}
                    </option>
                  ))
                )}
              </select>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-300">
                <p className="font-medium text-zinc-100">
                  {activeSource?.ready ? "Mailbox ready" : "Mailbox needs verification"}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {activeSource?.ready
                    ? "The agent can search and read messages from this source."
                    : "Run verification before asking mailbox questions if the source was just connected."}
                </p>
                {!activeSource?.ready && activeSourceId && (
                  <button
                    type="button"
                    onClick={handleVerifySource}
                    disabled={isVerifying}
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-white px-3 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-500"
                  >
                    {isVerifying ? "Verifying" : "Verify mailbox"}
                  </button>
                )}
                {verifyMessage && (
                  <p className="mt-2 text-xs text-zinc-400">{verifyMessage}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Capabilities</p>
            <div className="mt-3 space-y-2">
              {skillsError && (
                <p className="rounded-lg border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
                  {skillsError}
                </p>
              )}
              {skills.slice(0, 12).map((skill) => (
                <div key={skill.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-3">
                  <p className="text-sm font-medium text-zinc-100">{skill.name}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">{skill.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-800 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Live activity</p>
            <div className="mt-3 space-y-2">
              {activities.length === 0 ? (
                <p className="text-xs text-zinc-500">Tool activity from the agent will appear here.</p>
              ) : (
                activities.slice(0, 6).map((activity) => (
                  <div key={activity.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-100">{activity.tool}</p>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                        {activity.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{formatActivityTime(activity.at)}</p>
                  </div>
                ))
              )}
            </div>

            {knowledgeBaseJobId && (
              <div className="mt-4 rounded-lg border border-emerald-800/70 bg-emerald-950/40 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  History Backfill
                </p>
                <p className="mt-2 text-sm text-emerald-100">
                  The agent started the historical mailbox summarization pipeline.
                </p>
                <p className="mt-1 break-all text-xs text-emerald-300/80">{knowledgeBaseJobId}</p>
                <button
                  type="button"
                  onClick={() => setShowKnowledgeBaseModal(true)}
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-emerald-700 px-3 text-sm font-medium text-emerald-100 transition hover:border-emerald-500 hover:bg-emerald-900/50"
                >
                  Open live progress
                </button>
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-zinc-950">
          <div className="border-b border-zinc-800 px-5 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-4xl">
              <div className="mb-3 grid gap-3 lg:hidden">
                <select
                  value={activeSourceId ?? ""}
                  onChange={handleSourceChange}
                  disabled={isLoadingSources || sources.length === 0}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-zinc-500"
                >
                  {sources.length === 0 ? (
                    <option value="">No mailbox source</option>
                  ) : (
                    sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name || source.emailHint || source.id}
                      </option>
                    ))
                  )}
                </select>
                {!activeSource?.ready && activeSourceId && (
                  <button
                    type="button"
                    onClick={handleVerifySource}
                    disabled={isVerifying}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isVerifying ? "Verifying mailbox" : "Verify mailbox"}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    void handleSuggestion(suggestion);
                  }}
                  disabled={busy || !canChat}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-left text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
              </div>
            </div>
          </div>

          <div ref={transcriptRef} className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[min(90%,52rem)] rounded-lg px-4 py-3 text-sm leading-7 ${
                    message.role === "user"
                      ? "ml-auto bg-white text-zinc-950"
                      : "border border-zinc-800 bg-zinc-900 text-zinc-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content || (busy ? "Thinking..." : "")}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-800 bg-zinc-950/95 px-5 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-4xl">
              {!canChat && (
                <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {activeSourceId
                    ? "This mailbox is not ready yet. Verify the source before sending questions."
                    : "Connect and select a mailbox source first."}
                </div>
              )}

              {error && (
                <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <label htmlFor="agent-window-message" className="sr-only">
                  Message
                </label>
                <textarea
                  id="agent-window-message"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={busy || !canChat}
                  className="min-h-32 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-zinc-500"
                  placeholder={
                    canChat
                      ? "Ask anything about your mail: deadlines, meetings, sender history, action items, old-mail backfills, or message details."
                      : "Select a ready mailbox source to begin."
                  }
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    The agent uses your current mailbox source, can trigger a historical backfill, and keeps thread context inside this window.
                  </p>

                  <div className="flex items-center gap-2">
                    {busy && (
                      <button
                        type="button"
                        onClick={cancel}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={busy || !input.trim() || !canChat}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-500"
                    >
                      {busy ? "Thinking" : "Send to agent"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>

      {showKnowledgeBaseModal && knowledgeBaseJobId ? (
        <MailKBSummaryModal
          jobId={knowledgeBaseJobId}
          onClose={() => setShowKnowledgeBaseModal(false)}
        />
      ) : null}
    </div>
  );
}
