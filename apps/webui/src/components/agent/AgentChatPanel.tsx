import React, { useEffect, useRef, useState } from "react";
import { openAgentWindow } from "../../utils/agentWindow";
import { CalmButton, CalmSurface } from "../ui/Calm";
import { useAgentConversation } from "./useAgentConversation";

type AgentChatPanelProps = {
  apiBase: string;
  activeSourceId?: string | null;
};

const WELCOME_MESSAGE =
  "Ask about recent mail, tomorrow's DDLs, a specific message, or sync a confirmed item to calendar.";

export function AgentChatPanel({ apiBase, activeSourceId }: AgentChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const {
    activities,
    busy,
    cancel,
    error,
    messages,
    sendMessage,
  } = useAgentConversation({
    apiBase,
    activeSourceId,
    welcomeMessage: WELCOME_MESSAGE,
  });

  useEffect(() => {
    setInput("");
  }, [activeSourceId]);

  useEffect(() => {
    if (!transcriptRef.current) {
      return;
    }
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [busy, messages]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = input.trim();
    if (!nextMessage) {
      return;
    }
    setInput("");
    await sendMessage(nextMessage);
  };

  return (
    <div className="fixed bottom-5 right-5 z-30 flex max-w-[calc(100vw-2.5rem)] flex-col items-end gap-3">
      {isOpen && (
        <CalmSurface className="flex h-[520px] w-[380px] max-w-full flex-col overflow-hidden p-0" beam>
          <header className="flex items-center justify-between border-b border-[color:var(--border-soft)] px-4 py-3">
            <div>
              <p className="text-sm font-bold text-[color:var(--ink)]">Mail Agent</p>
              <p className="text-xs text-[color:var(--ink-subtle)]">
                {activeSourceId ? `Source: ${activeSourceId}` : "Select a mailbox source before chatting"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CalmButton type="button" variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => openAgentWindow(activeSourceId)}>
                Pop Out
              </CalmButton>
              <CalmButton type="button" variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setIsOpen(false)}>
                Close
              </CalmButton>
            </div>
          </header>

          <div ref={transcriptRef} className="calm-scrollbar flex-1 space-y-3 overflow-y-auto bg-[color:var(--surface-soft)]/50 p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-8 bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)]"
                    : "mr-8 border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] text-[color:var(--ink)]"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content || (busy ? "Thinking..." : "")}</p>
              </div>
            ))}
          </div>

          {error && (
            <div className="border-t border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-4 py-2 text-xs font-medium text-[color:var(--pill-urgent-ink)]">
              {error}
            </div>
          )}

          {!error && activities[0] && (
            <div className="border-t border-[color:var(--border-soft)] bg-[color:var(--surface-muted)] px-4 py-2 text-xs font-medium text-[color:var(--ink-subtle)]">
              Tool {activities[0].status}: {activities[0].tool}
            </div>
          )}

          <form onSubmit={submit} className="border-t border-[color:var(--border-soft)] bg-[color:var(--surface-base)] p-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy || !activeSourceId}
              className="calm-input min-h-20 w-full resize-none px-3 py-2 text-sm"
              placeholder={activeSourceId ? "Ask about your mail..." : "Select a mailbox source first"}
            />
            <div className="mt-2 flex items-center justify-between">
              {busy ? (
                <CalmButton type="button" onClick={cancel} variant="secondary">
                  Cancel
                </CalmButton>
              ) : (
                <span className="text-xs text-[color:var(--ink-subtle)]">Streaming via SSE. Open the window for a full agent workspace.</span>
              )}
              <CalmButton type="submit" disabled={busy || !input.trim() || !activeSourceId} variant="primary">
                {busy ? "Sending" : "Send"}
              </CalmButton>
            </div>
          </form>
        </CalmSurface>
      )}

      <div className="flex items-center gap-2">
        <CalmButton type="button" onClick={() => openAgentWindow(activeSourceId)} variant="secondary" className="shadow-[var(--shadow-soft)]">
          Agent Window
        </CalmButton>
        <CalmButton type="button" onClick={() => setIsOpen((value) => !value)} variant="primary" className="shadow-[var(--shadow-soft)]">
          {isOpen ? "Hide Agent" : "Open Agent"}
        </CalmButton>
      </div>
    </div>
  );
}
