"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import { cn } from "../../lib/utils";
import { MessageBubble } from "./MessageBubble";
import { EmailCard } from "./EmailCard";
import { useSpeechRecognition } from "./useSpeechRecognition";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  emailRefs?: EmailReference[];
  timestamp: Date;
}

interface EmailReference {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  snippet: string;
  highlightRanges?: Array<{ start: number; end: number }>;
  webLink: string;
}

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "您好！我是 MERY 语义检索助手。您可以问我关于邮件的问题，比如：\n\n• \"上周有哪些工作相关邮件？\"\n• \"张三发来的会议纪要重点是什么？\"\n• \"下个月要交的作业有哪些？\"",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isListening, transcript, startListening, stopListening, isSupported } = useSpeechRecognition();

  // 语音输入同步到输入框
  useEffect(() => {
    if (isListening) {
      setInput(transcript);
    }
  }, [transcript, isListening]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 模拟 AI 响应（实际应调用后端 API）
  const simulateAIResponse = async (query: string): Promise<{ content: string; emailRefs: EmailReference[] }> => {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 示例回复 - 实际应调用后端 API
    const responses: Record<string, { content: string; emailRefs: EmailReference[] }> = {
      default: {
        content: `根据您的查询"${query}"，我找到了以下相关邮件：`,
        emailRefs: [
          {
            id: "1",
            subject: "关于下周项目截止日期的提醒",
            fromName: "李四",
            fromAddress: "lisi@company.com",
            snippet: "大家好，提醒一下我们的项目将在下周三（4月23日）之前提交。请确保所有材料都已准备就绪...",
            highlightRanges: [{ start: 10, end: 25 }],
            webLink: "https://mail.google.com/mail/u/0/#inbox/1",
          },
          {
            id: "2",
            subject: "Re: 阅读材料分享",
            fromName: "王导师",
            fromAddress: "wang.mentor@university.edu",
            snippet: "同学你好，上��你问的阅读材料我已经发到你的邮箱了。重点看第三章和第五章...",
            highlightRanges: [{ start: 25, end: 40 }],
            webLink: "https://mail.google.com/mail/u/0/#inbox/2",
          },
        ],
      },
    };

    // 根据关键词匹配示例回复
    if (query.includes("作业") || query.includes("截止")) {
      return {
        content: `根据您的查询，我找到了以下待完成的作业：`,
        emailRefs: [
          {
            id: "3",
            subject: "数学作业 - 第5章练习题",
            fromName: "张老师",
            fromAddress: "zhang.teacher@school.edu",
            snippet: "同学们，本周的数学作业是第5章的练习题，请在下周五前提交到学习平台...",
            highlightRanges: [{ start: 15, end: 30 }],
            webLink: "https://mail.google.com/mail/u/0/#inbox/3",
          },
        ],
      };
    }

    return responses.default;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await simulateAIResponse(userMessage.content);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.content,
        emailRefs: response.emailRefs,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("AI response error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "抱歉，我遇到了一些问题，请稍后再试。",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="relative z-10 flex h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-200/60 bg-white/95 shadow-2xl backdrop-blur-sm dark:border-zinc-700/60 dark:bg-zinc-900/95">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-zinc-200/60 px-6 py-4 dark:border-zinc-700/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                MERY 语义检索
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                自然语言搜索您的邮件
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 text-white"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </div>
                <div className="flex items-center gap-1 rounded-2xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 dark:border-zinc-700/60 dark:bg-zinc-800">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">思考中...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 输入区域 */}
        <form onSubmit={handleSubmit} className="border-t border-zinc-200/60 px-6 py-4 dark:border-zinc-700/60">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="用自然语言描述您想查找的内容..."
                className="w-full rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 pr-12 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700/60 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {isSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 transition-colors",
                    isListening
                      ? "bg-red-500 text-white animate-pulse"
                      : "text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                  )}
                  title={isListening ? "停止录音" : "语音输入"}
                >
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
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-blue-700 hover:scale-105 hover:shadow-lg disabled:pointer-events-none disabled:opacity-50"
            >
              {isLoading ? "搜索中..." : "搜索"}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            按 <kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800">Enter</kbd> 发送，<kbd className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800">Esc</kbd> 关闭
          </p>
        </form>
      </div>
    </div>
  );
}
