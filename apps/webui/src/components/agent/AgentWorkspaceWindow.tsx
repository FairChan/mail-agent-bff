import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useMail } from "../../contexts/MailContext";
import MailKBSummaryModal from "../dashboard/MailKBSummaryModal";
import { CalmAnimatedList, CalmButton, CalmPill, CalmSurface } from "../ui/Calm";
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
    <div className={`flex flex-col overflow-hidden text-[color:var(--ink)] ${embedded ? "min-h-[calc(100vh-8rem)] rounded-[1.6rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-base)]" : "h-screen bg-transparent"}`}>
      <header className="border-b border-[color:var(--border-soft)] bg-[color:var(--surface-base)] px-5 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">
              Agent Window
            </p>
            <h1 className="mt-1 text-xl font-semibold text-[color:var(--ink)]">Mail Copilot</h1>
            <p className="mt-1 truncate text-sm text-[color:var(--ink-muted)]">
              {user?.displayName || user?.email || "Signed-in user"} · {activeSource?.name || activeSource?.emailHint || "No mailbox selected"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!embedded ? (
              <a
                href={buildDashboardUrl()}
                className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--border-soft)] px-4 text-sm font-medium text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
              >
                Back to dashboard
              </a>
            ) : null}
            <CalmButton type="button" onClick={handleNewThread} variant="secondary">
              New thread
            </CalmButton>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="hidden w-80 shrink-0 border-r border-[color:var(--border-soft)] bg-[color:var(--surface-muted)]/60 lg:flex lg:flex-col">
          <div className="border-b border-[color:var(--border-soft)] px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">Mailbox</p>
            <div className="mt-3 space-y-3">
              <select
                value={activeSourceId ?? ""}
                onChange={handleSourceChange}
                disabled={isLoadingSources || sources.length === 0}
                className="calm-input w-full px-3 py-2 text-sm"
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

              <CalmSurface className="p-3 text-sm" tone={activeSource?.ready ? "info" : "warning"}>
                <p className="font-medium text-[color:var(--ink)]">
                  {activeSource?.ready ? "Mailbox ready" : "Mailbox needs verification"}
                </p>
                <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
                  {activeSource?.ready
                    ? "The agent can search and read messages from this source."
                    : "Run verification before asking mailbox questions if the source was just connected."}
                </p>
                {!activeSource?.ready && activeSourceId && (
                  <CalmButton type="button" onClick={handleVerifySource} disabled={isVerifying} className="mt-3">
                    {isVerifying ? "Verifying" : "Verify mailbox"}
                  </CalmButton>
                )}
                {verifyMessage && (
                  <p className="mt-2 text-xs text-[color:var(--ink-subtle)]">{verifyMessage}</p>
                )}
              </CalmSurface>
            </div>
          </div>

          <div className="calm-scrollbar flex-1 overflow-y-auto px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">Capabilities</p>
            <CalmAnimatedList className="mt-3">
              {skillsError && (
                <p className="rounded-[1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-3 py-2 text-xs text-[color:var(--pill-urgent-ink)]">
                  {skillsError}
                </p>
              )}
              {skills.slice(0, 12).map((skill) => (
                <CalmSurface key={skill.id} className="px-3 py-3" tone="muted">
                  <p className="text-sm font-medium text-[color:var(--ink)]">{skill.name}</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--ink-subtle)]">{skill.description}</p>
                </CalmSurface>
              ))}
            </CalmAnimatedList>
          </div>

          <div className="border-t border-[color:var(--border-soft)] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">Live activity</p>
            <CalmAnimatedList className="mt-3">
              {activities.length === 0 ? (
                <p className="text-xs text-[color:var(--ink-subtle)]">Tool activity from the agent will appear here.</p>
              ) : (
                activities.slice(0, 6).map((activity) => (
                  <CalmSurface key={activity.id} className="px-3 py-2" tone="muted">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-[color:var(--ink)]">{activity.tool}</p>
                      <CalmPill tone={activity.status === "completed" ? "success" : "info"}>
                        {activity.status}
                      </CalmPill>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">{formatActivityTime(activity.at)}</p>
                  </CalmSurface>
                ))
              )}
            </CalmAnimatedList>

            {knowledgeBaseJobId && (
              <CalmSurface className="mt-4 px-3 py-3" tone="success">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--pill-success-ink)]">
                  History Backfill
                </p>
                <p className="mt-2 text-sm text-[color:var(--ink)]">
                  The agent started the historical mailbox summarization pipeline.
                </p>
                <p className="mt-1 break-all text-xs text-[color:var(--ink-subtle)]">{knowledgeBaseJobId}</p>
                <CalmButton type="button" onClick={() => setShowKnowledgeBaseModal(true)} variant="secondary" className="mt-3">
                  Open live progress
                </CalmButton>
              </CalmSurface>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-transparent">
          <div className="border-b border-[color:var(--border-soft)] px-5 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-4xl">
              <div className="mb-3 grid gap-3 lg:hidden">
                <select
                  value={activeSourceId ?? ""}
                  onChange={handleSourceChange}
                  disabled={isLoadingSources || sources.length === 0}
                  className="calm-input w-full px-3 py-2 text-sm"
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
                  <CalmButton type="button" onClick={handleVerifySource} disabled={isVerifying} variant="secondary">
                    {isVerifying ? "Verifying mailbox" : "Verify mailbox"}
                  </CalmButton>
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
                  className="rounded-full border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-3 py-2 text-left text-sm text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
              </div>
            </div>
          </div>

          <div ref={transcriptRef} className="calm-scrollbar flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[min(90%,52rem)] rounded-[1.2rem] px-4 py-3 text-sm leading-7 shadow-[var(--shadow-soft)] ${
                    message.role === "user"
                      ? "ml-auto bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)]"
                      : "border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] text-[color:var(--ink)]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content || (busy ? "Thinking..." : "")}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[color:var(--border-soft)] bg-[color:var(--surface-base)] px-5 py-4 sm:px-6">
            <div className="mx-auto w-full max-w-4xl">
              {!canChat && (
                <div className="mb-3 rounded-[1.1rem] border border-[color:var(--border-warning)] bg-[color:var(--surface-warning)] px-4 py-3 text-sm text-[color:var(--pill-warning-ink)]">
                  {activeSourceId
                    ? "This mailbox is not ready yet. Verify the source before sending questions."
                    : "Connect and select a mailbox source first."}
                </div>
              )}

              {error && (
                <div className="mb-3 rounded-[1.1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-4 py-3 text-sm text-[color:var(--pill-urgent-ink)]">
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
                  className="calm-input min-h-32 w-full resize-none px-4 py-3 text-sm"
                  placeholder={
                    canChat
                      ? "Ask anything about your mail: deadlines, meetings, sender history, action items, old-mail backfills, or message details."
                      : "Select a ready mailbox source to begin."
                  }
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[color:var(--ink-subtle)]">
                    The agent uses your current mailbox source, can trigger a historical backfill, and keeps thread context inside this window.
                  </p>

                  <div className="flex items-center gap-2">
                    {busy && (
                      <CalmButton type="button" onClick={cancel} variant="secondary">
                        Cancel
                      </CalmButton>
                    )}
                    <CalmButton type="submit" disabled={busy || !input.trim() || !canChat} variant="primary">
                      {busy ? "Thinking" : "Send to agent"}
                    </CalmButton>
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
