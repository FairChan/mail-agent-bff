import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { MailQaReference, TriageMailItem } from "@mail-agent/shared-types";
import { useApp } from "../../contexts/AppContext";
import { useMail } from "../../contexts/MailContext";
import { cn } from "../../lib/utils";

type OmniSearchBarProps = {
  apiBase: string;
};

type OmniMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  references?: MailQaReference[];
  timestamp: Date;
};

type MailQueryEnvelope = {
  ok?: boolean;
  error?: string;
  result?: {
    answer?: string;
    references?: MailQaReference[];
    generatedAt?: string;
  };
};

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function referenceToMailItem(reference: MailQaReference): TriageMailItem {
  return {
    id: reference.messageId,
    subject: reference.subject || "(No Subject)",
    fromName: reference.fromName || reference.fromAddress || "Unknown sender",
    fromAddress: reference.fromAddress || "",
    bodyPreview: reference.evidence || reference.dueDateLabel || "",
    webLink: "",
    receivedDateTime: reference.receivedDateTime,
    quadrant: reference.quadrant,
  };
}

export function OmniSearchBar({ apiBase }: OmniSearchBarProps) {
  const { locale } = useApp();
  const { activeSourceId, sources, setSelectedMail } = useMail();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<OmniMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRequestRef = useRef(0);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === activeSourceId) ?? null,
    [activeSourceId, sources]
  );
  const canSearch = Boolean(activeSourceId && activeSource?.ready);
  const copy = useMemo(() => {
    if (locale === "en") {
      return {
        floatingLabel: "Open semantic mail search",
        title: "MERY Semantic Search",
        subtitle: "Ask natural-language questions across the current mailbox.",
        welcome:
          "Ask me about your mailbox. For example:\n\n- What deadlines do I have tomorrow?\n- Summarize important mail from this week.\n- Which messages mention meetings or exams?",
        placeholder: "Ask about deadlines, senders, meetings, or any mail topic...",
        send: "Search",
        loading: "Searching",
        thinking: "Searching your mailbox...",
        close: "Close semantic search",
        shortcut: "Press Enter to search, Esc to close, Cmd/Ctrl+K to reopen.",
        noSource: "Connect and verify a mailbox before searching.",
        sourceLabel: "Current source",
        openMail: "Open",
        noReferences: "No direct mail references were returned.",
        error: "Search failed. Please try again.",
        suggestions: [
          "What deadlines do I have in the next 7 days?",
          "Summarize today's important mail.",
          "Find messages about meetings or exams.",
        ],
      };
    }

    if (locale === "ja") {
      return {
        floatingLabel: "メール意味検索を開く",
        title: "MERY セマンティック検索",
        subtitle: "現在のメールボックスを自然言語で検索します。",
        welcome:
          "メールについて質問できます。例:\n\n- 明日の締切は？\n- 今週の重要メールを要約して\n- 会議や試験に関するメールを探して",
        placeholder: "締切、送信者、会議、メール内容について質問...",
        send: "検索",
        loading: "検索中",
        thinking: "メールを検索中...",
        close: "セマンティック検索を閉じる",
        shortcut: "Enter で検索、Esc で閉じる、Cmd/Ctrl+K で再表示。",
        noSource: "検索前にメールボックスを接続・確認してください。",
        sourceLabel: "現在のソース",
        openMail: "開く",
        noReferences: "直接参照できるメールは返されませんでした。",
        error: "検索に失敗しました。もう一度お試しください。",
        suggestions: [
          "今後7日間の締切は？",
          "今日の重要メールを要約して",
          "会議や試験に関するメールを探して",
        ],
      };
    }

    return {
      floatingLabel: "打开语义邮件搜索",
      title: "MERY 语义检索",
      subtitle: "用自然语言搜索当前邮箱里的邮件、DDL、会议和人物。",
      welcome:
        "你可以直接问我邮件相关问题，例如：\n\n- 明天有哪些 DDL？\n- 总结本周重要邮件\n- 找出和会议或考试有关的邮件",
      placeholder: "询问 DDL、发件人、会议、考试或任意邮件内容...",
      send: "搜索",
      loading: "搜索中",
      thinking: "正在检索你的邮箱...",
      close: "关闭语义搜索",
      shortcut: "Enter 搜索，Esc 关闭，Cmd/Ctrl+K 重新打开。",
      noSource: "请先连接并验证邮箱，再进行语义搜索。",
      sourceLabel: "当前邮箱源",
      openMail: "打开",
      noReferences: "这次回答没有返回可直接定位的邮件引用。",
      error: "搜索失败，请稍后重试。",
      suggestions: [
        "未来 7 天有哪些 DDL？",
        "总结今天的重要邮件",
        "查找提到会议或考试的邮件",
      ],
    };
  }, [locale]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: copy.welcome,
          timestamp: new Date(),
        },
      ]);
    }
  }, [copy.welcome, messages.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
      }
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1
      );
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    setError(null);
  }, [activeSourceId]);

  const runSearch = useCallback(
    async (query: string) => {
      if (!activeSourceId || !canSearch) {
        throw new Error(copy.noSource);
      }

      const response = await fetch(`${apiBase}/mail/query`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          sourceId: activeSourceId,
          limit: 60,
          horizonDays: 14,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as MailQueryEnvelope;
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || copy.error);
      }

      return {
        answer: payload.result?.answer?.trim() || copy.error,
        references: Array.isArray(payload.result?.references) ? payload.result.references : [],
      };
    },
    [activeSourceId, apiBase, canSearch, copy.error, copy.noSource]
  );

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>, preset?: string) => {
      event?.preventDefault();
      const query = (preset ?? input).trim();
      if (!query || isLoading) {
        return;
      }

      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;
      setInput("");
      setError(null);
      setIsLoading(true);
      setMessages((current) => [
        ...current,
        { id: makeId(), role: "user", content: query, timestamp: new Date() },
      ]);

      try {
        const result = await runSearch(query);
        if (activeRequestRef.current !== requestId) {
          return;
        }
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: "assistant",
            content: result.answer,
            references: result.references,
            timestamp: new Date(),
          },
        ]);
      } catch (err) {
        if (activeRequestRef.current !== requestId) {
          return;
        }
        const message = err instanceof Error ? err.message : copy.error;
        setError(message);
        setMessages((current) => [
          ...current,
          { id: makeId(), role: "assistant", content: message, timestamp: new Date() },
        ]);
      } finally {
        if (activeRequestRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [copy.error, input, isLoading, runSearch]
  );

  const handleOpenReference = useCallback(
    (reference: MailQaReference) => {
      setSelectedMail(referenceToMailItem(reference));
      setIsOpen(false);
    },
    [setSelectedMail]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-hidden={isOpen}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-blue-600 text-white shadow-lg shadow-blue-600/25 transition-all duration-300",
          "hover:scale-105 hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          isOpen && "scale-0 opacity-0"
        )}
        aria-label={copy.floatingLabel}
        tabIndex={isOpen ? -1 : 0}
      >
        <SearchIcon className="h-6 w-6" />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            aria-label={copy.close}
          />

          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="omnisearch-title"
            tabIndex={-1}
            className="relative z-10 flex h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/60 bg-white/94 shadow-[0_30px_90px_rgba(15,23,42,0.30)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/94"
          >
            <header className="flex items-start justify-between gap-4 border-b border-zinc-200/70 px-5 py-4 dark:border-zinc-800">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <SearchIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 id="omnisearch-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {copy.title}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{copy.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                aria-label={copy.close}
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </header>

            <div className="border-b border-zinc-200/70 px-5 py-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                  {copy.sourceLabel}: {activeSource?.name || activeSource?.emailHint || "—"}
                </span>
                {!canSearch ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {copy.noSource}
                  </span>
                ) : null}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    locale={locale}
                    openLabel={copy.openMail}
                    noReferencesLabel={copy.noReferences}
                    onOpenReference={handleOpenReference}
                  />
                ))}
                {isLoading ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                      <SearchIcon className="h-4 w-4" />
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                      {copy.thinking}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-zinc-200/70 px-5 py-4 dark:border-zinc-800">
              {error ? (
                <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                  {error}
                </p>
              ) : null}

              <div className="mb-3 flex flex-wrap gap-2">
                {copy.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void handleSubmit(undefined, suggestion)}
                    disabled={!canSearch || isLoading}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="omnisearch-input" className="sr-only">
                  {copy.placeholder}
                </label>
                <input
                  ref={inputRef}
                  id="omnisearch-input"
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={copy.placeholder}
                  disabled={!canSearch || isLoading}
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={!canSearch || !input.trim() || isLoading}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? copy.loading : copy.send}
                </button>
              </form>
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">{copy.shortcut}</p>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function MessageBubble({
  message,
  locale,
  openLabel,
  noReferencesLabel,
  onOpenReference,
}: {
  message: OmniMessage;
  locale: string;
  openLabel: string;
  noReferencesLabel: string;
  onOpenReference: (reference: MailQaReference) => void;
}) {
  const isUser = message.role === "user";
  const references = message.references ?? [];

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
          isUser ? "bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900" : "bg-blue-600"
        )}
      >
        {isUser ? <UserIcon className="h-4 w-4" /> : <SearchIcon className="h-4 w-4" />}
      </div>

      <div className={cn("flex max-w-[86%] flex-col gap-2", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-6",
            isUser
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {!isUser && references.length > 0 ? (
          <div className="grid w-full gap-2">
            {references.map((reference) => (
              <ReferenceCard
                key={`${reference.messageId}:${reference.subject}`}
                reference={reference}
                openLabel={openLabel}
                onOpen={() => onOpenReference(reference)}
              />
            ))}
          </div>
        ) : null}

        {!isUser && message.id !== "welcome" && references.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{noReferencesLabel}</p>
        ) : null}

        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {formatTime(message.timestamp, locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US")}
        </span>
      </div>
    </div>
  );
}

function ReferenceCard({
  reference,
  openLabel,
  onOpen,
}: {
  reference: MailQaReference;
  openLabel: string;
  onOpen: () => void;
}) {
  const sender = reference.fromName || reference.fromAddress || "Unknown sender";
  const meta = [reference.dueDateLabel, reference.type, reference.quadrant].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-lg hover:shadow-blue-600/10 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-700"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 text-sm font-semibold text-white">
          {sender.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {reference.subject || "(No Subject)"}
              </h3>
              <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{sender}</p>
            </div>
            <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 opacity-0 transition group-hover:opacity-100 dark:bg-blue-950/40 dark:text-blue-300">
              {openLabel}
            </span>
          </div>
          {reference.evidence ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{reference.evidence}</p>
          ) : null}
          {meta ? <p className="mt-2 text-xs text-blue-600 dark:text-blue-300">{meta}</p> : null}
        </div>
      </div>
    </button>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21a8 8 0 1 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}
