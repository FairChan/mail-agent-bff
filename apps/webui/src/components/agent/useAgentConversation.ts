import { useCallback, useEffect, useRef, useState } from "react";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type AgentActivity = {
  id: string;
  tool: string;
  status: "started" | "completed";
  at: string;
};

type KnowledgeBaseJobPayload =
  | {
      jobId?: string;
      latestJob?: {
        jobId?: string;
        status?: string;
      } | null;
    }
  | null
  | undefined;

function pushActivity(
  current: AgentActivity[],
  tool: string,
  status: AgentActivity["status"]
): AgentActivity[] {
  return [
    {
      id: makeMessageId(),
      tool,
      status,
      at: new Date().toISOString(),
    },
    ...current,
  ].slice(0, 20);
}

type AgentEvent =
  | { type: "message_delta"; delta: string }
  | { type: "tool_start"; tool: string; input?: unknown }
  | { type: "tool_result"; tool: string; result?: unknown }
  | { type: "final"; result: { answer: string; threadId?: string } }
  | { type: "error"; error: string; code?: string };

type UseAgentConversationOptions = {
  apiBase: string;
  activeSourceId?: string | null;
  welcomeMessage: string;
  requestTimeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 45000;

function makeMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createWelcomeMessage(content: string): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content,
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

function hydrateAssistantFinal(
  messages: ChatMessage[],
  assistantId: string,
  finalAnswer: string | undefined
): ChatMessage[] {
  const normalizedAnswer = finalAnswer?.trim();
  if (!normalizedAnswer) {
    return messages;
  }

  return messages.map((message) => {
    if (message.id !== assistantId || message.content.trim()) {
      return message;
    }
    return {
      ...message,
      content: normalizedAnswer,
    };
  });
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

function extractKnowledgeBaseJobId(tool: string, result: unknown): string | null {
  if (
    tool !== "summarizeMailboxHistory" &&
    tool !== "knowledgeBaseStatus"
  ) {
    return null;
  }

  if (!result || typeof result !== "object") {
    return null;
  }

  const payload = result as KnowledgeBaseJobPayload;
  const directJobId = typeof payload?.jobId === "string" ? payload.jobId.trim() : "";
  if (directJobId) {
    return directJobId;
  }

  const nestedJobId =
    typeof payload?.latestJob?.jobId === "string" ? payload.latestJob.jobId.trim() : "";
  if (nestedJobId) {
    return nestedJobId;
  }

  return null;
}

export function useAgentConversation({
  apiBase,
  activeSourceId,
  welcomeMessage,
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
}: UseAgentConversationOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage(welcomeMessage)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [knowledgeBaseJobId, setKnowledgeBaseJobId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);

  const resetConversation = useCallback(() => {
    activeRunIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setThreadId(undefined);
    setBusy(false);
    setError(null);
    setActivities([]);
    setKnowledgeBaseJobId(null);
    setMessages([createWelcomeMessage(welcomeMessage)]);
  }, [welcomeMessage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    resetConversation();
  }, [activeSourceId, resetConversation]);

  const cancel = useCallback(() => {
    activeRunIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setError("Request canceled.");
  }, []);

  const sendMessage = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();
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
      const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);

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
              continue;
            }

            if (agentEvent.type === "tool_start") {
              setActivities((current) => pushActivity(current, agentEvent.tool, "started"));
              continue;
            }

            if (agentEvent.type === "tool_result") {
              setActivities((current) => pushActivity(current, agentEvent.tool, "completed"));
              const nextKnowledgeBaseJobId = extractKnowledgeBaseJobId(
                agentEvent.tool,
                agentEvent.result
              );
              if (nextKnowledgeBaseJobId) {
                setKnowledgeBaseJobId(nextKnowledgeBaseJobId);
              }
              continue;
            }

            if (agentEvent.type === "final") {
              setThreadId(agentEvent.result.threadId);
              setMessages((current) =>
                hydrateAssistantFinal(current, assistantId, agentEvent.result.answer)
              );
              continue;
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
    },
    [activeSourceId, apiBase, busy, requestTimeoutMs, threadId]
  );

  return {
    activities,
    busy,
    error,
    knowledgeBaseJobId,
    messages,
    threadId,
    cancel,
    resetConversation,
    sendMessage,
  };
}
