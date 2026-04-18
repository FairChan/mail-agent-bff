import React, { useEffect, useRef, useState } from "react";
import { openAgentWindow } from "../../utils/agentWindow";
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
        <section className="glass-panel flex h-[520px] w-[380px] max-w-full flex-col overflow-hidden rounded-3xl">
          <header className="flex items-center justify-between border-b border-zinc-200/70 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-zinc-950">Mail Agent</p>
              <p className="text-xs text-zinc-500">
                {activeSourceId ? `Source: ${activeSourceId}` : "Select a mailbox source before chatting"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full px-3 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => openAgentWindow(activeSourceId)}
              >
                Pop Out
              </button>
              <button
                type="button"
                className="rounded-full px-3 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>
          </header>

          <div ref={transcriptRef} className="flex-1 space-y-3 overflow-y-auto bg-white/60 p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-8 bg-zinc-950 text-white"
                    : "mr-8 border border-zinc-200 bg-white text-zinc-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content || (busy ? "Thinking..." : "")}</p>
              </div>
            ))}
          </div>

          {error && (
            <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          {!error && activities[0] && (
            <div className="border-t border-zinc-200/70 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-500">
              Tool {activities[0].status}: {activities[0].tool}
            </div>
          )}

          <form onSubmit={submit} className="border-t border-zinc-200/70 bg-white p-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy || !activeSourceId}
              className="min-h-20 w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-zinc-900 focus:bg-white"
              placeholder={activeSourceId ? "Ask about your mail..." : "Select a mailbox source first"}
            />
            <div className="mt-2 flex items-center justify-between">
              {busy ? (
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  Cancel
                </button>
              ) : (
                <span className="text-xs text-zinc-400">Streaming via SSE. Open the window for a full agent workspace.</span>
              )}
              <button
                type="submit"
                disabled={busy || !input.trim() || !activeSourceId}
                className="rounded-full bg-zinc-950 px-5 py-2 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {busy ? "Sending" : "Send"}
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => openAgentWindow(activeSourceId)}
          className="rounded-full border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-[0_18px_40px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:border-zinc-900"
        >
          Agent Window
        </button>
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-zinc-800"
        >
          {isOpen ? "Hide Agent" : "Open Agent"}
        </button>
      </div>
    </div>
  );
}
