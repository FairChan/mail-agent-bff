import type { FormEvent } from "react";
import { SendIcon } from "../shared/Icons";
import { renderSimpleMarkdown } from "../../utils";

interface MailQueryPanelProps {
  agentInput: string;
  agentBusy: boolean;
  agentAnswer: string | null;
  agentError: string | null;
  activeSourceId: string;
  timeZone: string;
  authLocale: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function MailQueryPanel({
  agentInput,
  agentBusy,
  agentAnswer,
  agentError,
  activeSourceId,
  timeZone,
  authLocale,
  onInputChange,
  onSubmit,
}: MailQueryPanelProps) {
  return (
    <aside
      className="glass-panel hidden rounded-2xl p-4 lg:block"
      role="complementary"
      aria-label="邮件问答"
    >
      <div className="mb-4">
        <p className="text-sm font-semibold text-zinc-900">邮件问答</p>
        <p className="mt-1 text-xs text-zinc-500">例如：明天有哪些 DDL？未来 7 天有哪些会议？</p>
      </div>

      <form className="space-y-2" onSubmit={onSubmit} aria-busy={agentBusy}>
        <label htmlFor="agent-question-input" className="sr-only">邮件问答问题</label>
        <textarea
          id="agent-question-input"
          value={agentInput}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="输入问题..."
          aria-label="邮件问答问题"
          className="h-24 w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
          maxLength={300}
        />
        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-zinc-900 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
          disabled={agentBusy}
        >
          <SendIcon />
          {agentBusy ? "分析中..." : "发送问题"}
        </button>
      </form>

      {agentAnswer ? (
        <div
          className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-zinc-50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px]"
          dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(agentAnswer) }}
        />
      ) : null}
      {agentError ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{agentError}</div>
      ) : null}

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
        <p>
          {authLocale === "zh" ? "当前源：" : "Source: "}
          <span className="font-mono text-zinc-900">{activeSourceId}</span>
        </p>
        <p className="mt-1">{authLocale === "zh" ? "时区：" : "Time zone: "}{timeZone}</p>
      </div>
    </aside>
  );
}
