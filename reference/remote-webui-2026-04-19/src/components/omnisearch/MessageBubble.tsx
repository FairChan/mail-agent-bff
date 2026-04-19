"use client";

import { cn } from "../../lib/utils";
import { EmailCard } from "./EmailCard";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  emailRefs?: Array<{
    id: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    snippet: string;
    highlightRanges?: Array<{ start: number; end: number }>;
    webLink: string;
  }>;
  timestamp: Date;
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  // 处理高亮文本
  const renderContent = (text: string, highlightRanges?: Array<{ start: number; end: number }>) => {
    if (!highlightRanges || highlightRanges.length === 0) {
      return <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>;
    }

    // 对文本进行分段高亮
    const segments: Array<{ text: string; highlight: boolean }> = [];
    let lastEnd = 0;

    highlightRanges.forEach((range) => {
      if (range.start > lastEnd) {
        segments.push({ text: text.slice(lastEnd, range.start), highlight: false });
      }
      segments.push({ text: text.slice(range.start, range.end), highlight: true });
      lastEnd = Math.max(lastEnd, range.end);
    });

    if (lastEnd < text.length) {
      segments.push({ text: text.slice(lastEnd), highlight: false });
    }

    return (
      <p className="text-sm leading-relaxed">
        {segments.map((segment, index) =>
          segment.highlight ? (
            <mark
              key={index}
              className="rounded bg-yellow-200/60 px-0.5 text-inherit dark:bg-yellow-800/60"
            >
              {segment.text}
            </mark>
          ) : (
            <span key={index}>{segment.text}</span>
          )
        )}
      </p>
    );
  };

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "")}>
      {/* 头像 */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
          isUser
            ? "bg-blue-600 text-white"
            : "bg-blue-500 text-white"
        )}
      >
        {isUser ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </div>

      {/* 消息内容 */}
      <div className={cn("flex max-w-[80%] flex-col gap-2", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-blue-600 text-white"
              : "border border-zinc-200/60 bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-800"
          )}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            renderContent(message.content, message.emailRefs?.[0]?.highlightRanges)
          )}
        </div>

        {/* 邮件引用卡片 */}
        {!isUser && message.emailRefs && message.emailRefs.length > 0 && (
          <div className="w-full space-y-2">
            {message.emailRefs.map((emailRef) => (
              <EmailCard key={emailRef.id} email={emailRef} />
            ))}
          </div>
        )}

        {/* 时间戳 */}
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {message.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
