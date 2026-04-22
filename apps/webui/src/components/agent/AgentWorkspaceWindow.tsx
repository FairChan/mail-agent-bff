import type { MailSourceProfile } from "@mail-agent/shared-types";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { renderSimpleMarkdown } from "../../utils";
import { useAuth } from "../../contexts/AuthContext";
import { useMail } from "../../contexts/MailContext";
import MailKBSummaryModal from "../dashboard/MailKBSummaryModal";
import { BrandLogo } from "../shared/BrandLogo";
import { CalmButton, CalmPill } from "../ui/Calm";
import { buildDashboardUrl, getRequestedAgentSourceId, updateAgentWindowSource } from "../../utils/agentWindow";
import { useAgentConversation, type ChatMessage } from "./useAgentConversation";

type AgentWorkspaceWindowProps = {
  apiBase: string;
  embedded?: boolean;
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

const TOOL_LABELS: Record<string, string> = {
  summarizeMailboxHistory: "Mailbox history sync",
  knowledgeBaseStatus: "Knowledge base sync",
  queryMailbox: "Mailbox search",
  searchMailbox: "Mailbox search",
  searchMail: "Mailbox search",
  getMailDetail: "Message detail",
  readMail: "Message detail",
};

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

function formatToolLabel(tool: string): string {
  const direct = TOOL_LABELS[tool];
  if (direct) {
    return direct;
  }

  return tool
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSourceLabel(source: MailSourceProfile | null | undefined): string {
  return source?.name || source?.emailHint || "No mailbox selected";
}

function getUserLabel(displayName?: string | null, email?: string | null): string {
  return displayName || email || "Signed-in user";
}

function getUserInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "U";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getMessageMarkup(content: string, busy: boolean): string {
  const trimmed = content.trim();
  if (trimmed) {
    return renderSimpleMarkdown(trimmed);
  }
  return `<p>${busy ? "Working on it..." : ""}</p>`;
}

function AgentConversationMessage({
  busy,
  message,
  userLabel,
}: {
  busy: boolean;
  message: ChatMessage;
  userLabel: string;
}) {
  if (message.role === "user") {
    return (
      <article className="flex justify-end">
        <div className="max-w-[min(88%,42rem)]">
          <p className="mb-2 pr-1 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">
            {userLabel}
          </p>
          <div className="rounded-[1.7rem] bg-[color:var(--button-primary)] px-5 py-4 text-sm leading-7 text-[color:var(--button-primary-ink)] shadow-[0_14px_34px_rgba(18,40,79,0.16)]">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="flex items-start gap-3 sm:gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] shadow-[var(--shadow-soft)]">
        <span aria-hidden="true">
          <BrandLogo className="leading-none" imageClassName="h-6 w-6" />
        </span>
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[color:var(--ink)]">Mail Copilot</p>
          {!message.content.trim() && busy ? <CalmPill tone="info">Responding</CalmPill> : null}
        </div>

        <div
          className="agent-markdown text-[15px] leading-7 text-[color:var(--ink)]"
          dangerouslySetInnerHTML={{ __html: getMessageMarkup(message.content, busy) }}
        />
      </div>
    </article>
  );
}

function AgentEmptyState({
  activeSource,
  busy,
  canChat,
  onSuggestion,
}: {
  activeSource: MailSourceProfile | null;
  busy: boolean;
  canChat: boolean;
  onSuggestion: (suggestion: string) => void;
}) {
  return (
    <section className="flex min-h-full flex-col items-center justify-center py-8 sm:py-12">
      <div className="w-full max-w-3xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.6rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] shadow-[var(--shadow-soft)]">
          <span aria-hidden="true">
            <BrandLogo className="leading-none" imageClassName="h-9 w-9" />
          </span>
        </div>

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--ink-subtle)]">
          Agent Window
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[color:var(--ink)] sm:text-[2.2rem]">
          How can I help with your mailbox?
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-[color:var(--ink-muted)]">
          {canChat
            ? `Answers are scoped to ${getSourceLabel(activeSource)}. Ask for deadlines, sender history, summaries, old-mail backfills, or message details.`
            : "Pick a ready mailbox source first. Once that is connected, you can ask normal questions instead of navigating raw mail threads by hand."}
        </p>

        <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              disabled={busy || !canChat}
              className="rounded-[1.35rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-4 py-4 text-sm leading-6 text-[color:var(--ink)] shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-base)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
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
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [showKnowledgeBaseModal, setShowKnowledgeBaseModal] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const transcriptStickToBottomRef = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const requestedSourceId = getRequestedAgentSourceId();
  const activeSource = useMemo(
    () => sources.find((source) => source.id === activeSourceId) ?? null,
    [activeSourceId, sources]
  );
  const canChat = Boolean(activeSourceId && activeSource?.ready);
  const viewerLabel = getUserLabel(user?.displayName, user?.email);
  const {
    activities,
    busy,
    cancel,
    error,
    knowledgeBaseJobId,
    messages,
    resetConversation,
    sendMessage,
    threadId,
  } = useAgentConversation({
    apiBase,
    activeSourceId,
    welcomeMessage: WELCOME_MESSAGE,
  });

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.id !== "welcome"),
    [messages]
  );
  const latestActivity = activities[0] ?? null;
  const showEmptyState = visibleMessages.length === 0;
  const isCanceledMessage = error?.startsWith("Request canceled") ?? false;
  const composerHint = threadId
    ? `Thread stays scoped to ${getSourceLabel(activeSource)} until you start a new chat.`
    : `Enter sends. Shift + Enter adds a new line. Answers stay scoped to ${getSourceLabel(activeSource)}.`;

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
    if (!transcriptRef.current || !transcriptStickToBottomRef.current) {
      return;
    }

    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [busy, visibleMessages]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) {
      return;
    }

    composer.style.height = "0px";
    const nextHeight = Math.min(Math.max(composer.scrollHeight, 124), 220);
    composer.style.height = `${nextHeight}px`;
  }, [input]);

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
    transcriptStickToBottomRef.current = true;
    setInput("");
    await sendMessage(nextMessage);
  };

  const handleSuggestion = async (suggestion: string) => {
    if (busy || !canChat) {
      return;
    }
    transcriptStickToBottomRef.current = true;
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
    transcriptStickToBottomRef.current = true;
    setInput("");
    resetConversation();
  };

  const handleTranscriptScroll = () => {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }

    const distanceFromBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
    transcriptStickToBottomRef.current = distanceFromBottom < 96;
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

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
    if (event.key !== "Enter" || event.shiftKey || nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden text-[color:var(--ink)]",
        embedded
          ? "h-full rounded-[1.6rem] bg-[color:var(--surface-elevated)]"
          : "h-screen bg-[color:var(--surface-base)]"
      )}
    >
      <header className="border-b border-[color:var(--border-soft)] bg-[color:var(--surface-base)]/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.2rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] shadow-[var(--shadow-soft)]">
                  <span aria-hidden="true">
                    <BrandLogo className="leading-none" imageClassName="h-7 w-7" />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink-subtle)]">
                    Agent Window
                  </p>
                  <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
                    Mail Copilot
                  </h1>
                </div>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--ink-muted)]">
                A focused chat workspace for decisions, deadlines, sender history, and old-mail synthesis.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <CalmPill tone={threadId ? "default" : "muted"}>
                {threadId ? "Thread active" : "Fresh chat"}
              </CalmPill>
              {!embedded ? (
                <a
                  href={buildDashboardUrl()}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--border-soft)] px-4 text-sm font-medium text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
                >
                  Back to dashboard
                </a>
              ) : null}
              <CalmButton type="button" onClick={handleNewThread} variant="secondary" className="h-10 px-4">
                New chat
              </CalmButton>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[16rem] flex-1 items-center gap-3 rounded-[1.15rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-3 py-2.5 shadow-[var(--shadow-soft)]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-soft)] text-xs font-semibold text-[color:var(--ink)]">
                {getUserInitials(viewerLabel)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">
                  Active mailbox
                </p>
                <select
                  value={activeSourceId ?? ""}
                  onChange={handleSourceChange}
                  disabled={isLoadingSources || sources.length === 0}
                  className="mt-1 w-full appearance-none rounded-md border-0 bg-transparent p-0 text-sm font-medium text-[color:var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--focus-offset)] disabled:cursor-not-allowed"
                >
                  {sources.length === 0 ? (
                    <option value="">No mailbox source</option>
                  ) : (
                    sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {getSourceLabel(source)}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <CalmPill tone={activeSource?.ready ? "success" : activeSourceId ? "warning" : "muted"}>
              {activeSource?.ready ? "Mailbox ready" : activeSourceId ? "Needs verification" : "No mailbox"}
            </CalmPill>

            <CalmPill tone="default">{viewerLabel}</CalmPill>

            {!activeSource?.ready && activeSourceId ? (
              <CalmButton type="button" onClick={handleVerifySource} disabled={isVerifying} variant="secondary" className="h-10 px-4">
                {isVerifying ? "Verifying mailbox" : "Verify mailbox"}
              </CalmButton>
            ) : null}
          </div>

          {verifyMessage ? (
            <div className="rounded-[1.05rem] border border-[color:var(--border-info)] bg-[color:var(--surface-info)] px-4 py-3 text-sm text-[color:var(--ink)]">
              {verifyMessage}
            </div>
          ) : null}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--surface-base)]">
        <div ref={transcriptRef} onScroll={handleTranscriptScroll} className="calm-scrollbar min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col py-6 sm:py-8">
            {showEmptyState ? (
              <AgentEmptyState
                activeSource={activeSource}
                busy={busy}
                canChat={canChat}
                onSuggestion={(suggestion) => {
                  void handleSuggestion(suggestion);
                }}
              />
            ) : (
              <div className="space-y-8 pb-8">
                {visibleMessages.map((message) => (
                  <AgentConversationMessage
                    key={message.id}
                    busy={busy}
                    message={message}
                    userLabel={viewerLabel}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[color:var(--border-soft)] bg-[color:var(--surface-base)]/94 px-4 py-4 backdrop-blur sm:px-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
            {knowledgeBaseJobId ? (
              <button
                type="button"
                onClick={() => setShowKnowledgeBaseModal(true)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[1.1rem] border border-[color:var(--border-success)] bg-[color:var(--surface-success)] px-4 py-3 text-left text-sm text-[color:var(--ink)] transition hover:opacity-90"
              >
                <span>Mailbox history summarization is running in the background.</span>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--pill-success-ink)]">
                  Open live progress
                </span>
              </button>
            ) : null}

            {!error && latestActivity ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.1rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--ink)]">
                <span>
                  {latestActivity.status === "started" ? "Working with" : "Last tool"}: {formatToolLabel(latestActivity.tool)}
                </span>
                <span className="text-xs text-[color:var(--ink-subtle)]">
                  {formatActivityTime(latestActivity.at)}
                </span>
              </div>
            ) : null}

            {!canChat ? (
              <div className="rounded-[1.1rem] border border-[color:var(--border-warning)] bg-[color:var(--surface-warning)] px-4 py-3 text-sm text-[color:var(--ink)]">
                {activeSourceId
                  ? "This mailbox is not ready yet. Verify the source before sending questions."
                  : "Connect and select a mailbox source before starting a chat."}
              </div>
            ) : null}

            {error ? (
              <div
                className={cn(
                  "rounded-[1.1rem] border px-4 py-3 text-sm",
                  isCanceledMessage
                    ? "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] text-[color:var(--ink)]"
                    : "border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] text-[color:var(--ink)]"
                )}
              >
                {error}
              </div>
            ) : null}

            <form
              onSubmit={handleSubmit}
              aria-busy={busy}
              className="rounded-[1.5rem] border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] p-3 shadow-[var(--shadow-card)] transition focus-within:border-[color:var(--focus-ring)] focus-within:shadow-[0_0_0_2px_rgba(141,178,255,0.18),var(--shadow-card)]"
            >
              <label htmlFor="agent-window-message" className="sr-only">
                Message
              </label>
              <textarea
                ref={composerRef}
                id="agent-window-message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={busy || !canChat}
                className="min-h-[7.75rem] w-full resize-none rounded-[1rem] border-0 bg-transparent px-1 py-1 text-[15px] leading-7 text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-subtle)] focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-elevated)] disabled:cursor-not-allowed"
                placeholder={
                  canChat
                    ? "Ask about deadlines, meetings, sender history, action items, or older mail."
                    : "Select a ready mailbox source to begin."
                }
              />

              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-[color:var(--border-soft)] px-1 pt-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CalmPill tone={canChat ? "success" : "warning"}>
                      {canChat ? getSourceLabel(activeSource) : "Mailbox required"}
                    </CalmPill>
                    {busy ? <CalmPill tone="info">Thinking</CalmPill> : null}
                  </div>
                  <p className="text-xs leading-5 text-[color:var(--ink-subtle)]">{composerHint}</p>
                </div>

                <div className="flex items-center gap-2">
                  {busy ? (
                    <CalmButton type="button" onClick={cancel} variant="secondary">
                      Stop
                    </CalmButton>
                  ) : null}
                  <CalmButton type="submit" disabled={busy || !input.trim() || !canChat} variant="primary">
                    {busy ? "Thinking" : "Send"}
                  </CalmButton>
                </div>
              </div>
            </form>
          </div>
        </div>
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
