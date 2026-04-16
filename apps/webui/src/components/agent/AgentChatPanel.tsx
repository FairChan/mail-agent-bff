import React, { useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type AgentChatPanelProps = {
  apiBase: string;
  activeSourceId?: string | null;
};

type AgentEvent =
  | { type: "message_delta"; delta: string }
  | { type: "tool_start"; tool: string; input?: unknown }
  | { type: "tool_result"; tool: string; result?: unknown }
  | { type: "final"; result: { answer: string; threadId?: string } }
  | { type: "error"; error: string; code?: string };

const REQUEST_TIMEOUT_MS = 45000;
const WELCOME_MESSAGE = "Ask about recent mail, tomorrow's DDLs, a specific message, or sync a confirmed item to calendar.";

function makeMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createWelcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: WELCOME_MESSAGE,
  };
}

function appendAssistantDelta(messages: ChatMessage[], assistantId: string, delta: string): ChatMessage[] {
  return messages.map((message) =>
    message.id === assistantId
      ? {
          ...message,
          content: `${message.content}${delta}`,
        }
      : message
  );
}

function parseSseEvents(buffer: string): { events: AgentEvent[]; rest: string } {
  const chunks = buffer.split(/\n\n/);
  const rest = chunks.pop() ?? "";
  const events: AgentEvent[] = [];

  for (const chunk of chunks) {
    const dataLine = chunk
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("data:"));
    if (!dataLine) {
      continue;
    }

    try {
      events.push(JSON.parse(dataLine.slice(5).trim()) as AgentEvent);
    } catch {
      events.push({
        type: "error",
        error: "Agent stream returned invalid data.",
        code: "INVALID_SSE_DATA",
      });
    }
  }

  return { events, rest };
}

export function AgentChatPanel({ apiBase, activeSourceId }: AgentChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    activeRunIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setThreadId(undefined);
    setBusy(false);
    setError(null);
    setMessages([createWelcomeMessage()]);
  }, [activeSourceId]);

  const cancel = () => {
    activeRunIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setError("Request canceled.");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy || !activeSourceId) {
      return;
    }

    const controller = new AbortController();
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const isActiveRun = () => activeRunIdRef.current === runId;
    abortRef.current = controller;
    const userMessage: ChatMessage = {
      id: makeMessageId(),
      role: "user",
      content: message,
    };
    const assistantId = makeMessageId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setInput("");
    setBusy(true);
    setError(null);
    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      const response = await fetch(`${apiBase}/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          message,
          threadId,
          sourceId: activeSourceId,
        }),
      });

      if (!response.ok || !response.body) {
        const fallback = await response.text();
        throw new Error(fallback || `Agent request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (!isActiveRun()) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseEvents(buffer);
        buffer = parsed.rest;

        for (const agentEvent of parsed.events) {
          if (!isActiveRun()) {
            break;
          }
          if (agentEvent.type === "message_delta") {
            setMessages((current) => appendAssistantDelta(current, assistantId, agentEvent.delta));
          }
          if (agentEvent.type === "tool_start") {
            setMessages((current) =>
              appendAssistantDelta(current, assistantId, `\n\n[tool] ${agentEvent.tool}...`)
            );
          }
          if (agentEvent.type === "final") {
            setThreadId(agentEvent.result.threadId);
          }
          if (agentEvent.type === "error") {
            throw new Error(agentEvent.error);
          }
        }
      }
    } catch (err) {
      if (!isActiveRun()) {
        return;
      }
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const messageText = aborted
        ? "Request canceled or timed out. Please try again."
        : err instanceof Error
          ? err.message
          : String(err);
      setError(messageText);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId && !item.content.trim()
            ? { ...item, content: `Error: ${messageText}` }
            : item
        )
      );
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (isActiveRun()) {
        setBusy(false);
      }
    }
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
            <button
              type="button"
              className="rounded-full px-3 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              onClick={() => setIsOpen(false)}
            >
              Close
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-white/60 p-4">
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
                <span className="text-xs text-zinc-400">Streaming via SSE. Failures always reset the busy state.</span>
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

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="rounded-full bg-zinc-950 px-5 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-zinc-800"
      >
        {isOpen ? "Hide Agent" : "Open Agent"}
      </button>
    </div>
  );
}
