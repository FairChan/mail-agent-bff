"use client";

import { useState } from "react";
import { cn } from "../../lib/utils";

interface EmailReference {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  snippet: string;
  highlightRanges?: Array<{ start: number; end: number }>;
  webLink: string;
}

interface EmailCardProps {
  email: EmailReference;
}

export function EmailCard({ email }: EmailCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // 处理高亮文本
  const renderHighlightedSnippet = () => {
    if (!email.highlightRanges || email.highlightRanges.length === 0) {
      return email.snippet;
    }

    const segments: Array<{ text: string; highlight: boolean }> = [];
    let lastEnd = 0;

    email.highlightRanges.forEach((range) => {
      if (range.start > lastEnd) {
        segments.push({ text: email.snippet.slice(lastEnd, range.start), highlight: false });
      }
      segments.push({ text: email.snippet.slice(range.start, range.end), highlight: true });
      lastEnd = Math.max(lastEnd, range.end);
    });

    if (lastEnd < email.snippet.length) {
      segments.push({ text: email.snippet.slice(lastEnd), highlight: false });
    }

    return segments.map((segment, index) =>
      segment.highlight ? (
        <mark
          key={index}
          className="rounded bg-yellow-200/60 px-0.5 dark:bg-yellow-800/60"
        >
          {segment.text}
        </mark>
      ) : (
        <span key={index}>{segment.text}</span>
      )
    );
  };

  return (
    <a
      href={email.webLink}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block rounded-xl border border-zinc-200/60 bg-white p-4 transition-all",
        "hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/10",
        "dark:border-zinc-700/60 dark:bg-zinc-800 dark:hover:border-blue-500/50"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-3">
        {/* 发件人头像 */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-blue-500 text-sm font-medium text-white">
          {email.fromName.charAt(0).toUpperCase()}
        </div>

        {/* 邮件内容 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {email.subject}
              </h4>
              <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {email.fromName} &lt;{email.fromAddress}&gt;
              </p>
            </div>
            {isHovered && (
              <div className="shrink-0 rounded-lg bg-blue-500 px-2 py-1 text-xs text-white">
                查看
              </div>
            )}
          </div>

          {/* 邮件摘要（带高亮） */}
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {renderHighlightedSnippet()}
          </p>

          {/* 提示 */}
          <div className="mt-2 flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>点击查看原始邮件</span>
          </div>
        </div>
      </div>
    </a>
  );
}
