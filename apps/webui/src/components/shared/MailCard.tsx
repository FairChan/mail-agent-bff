import React, { memo } from "react";
import type { TriageMailItem } from "../../types";

interface MailCardProps {
  item: TriageMailItem;
  noSummary: string;
  viewDetail: string;
  onViewDetail: (item: TriageMailItem) => void;
}

const MailCardComponent = ({ item, noSummary, viewDetail, onViewDetail }: MailCardProps) => {
  return (
    <li className="rounded-2xl border border-white/65 bg-white/78 px-3 py-3 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-zinc-950/58">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.subject}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{item.fromName || item.fromAddress}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{item.aiSummary || item.bodyPreview || noSummary}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl border border-zinc-300 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:border-zinc-300"
          onClick={() => onViewDetail(item)}
        >
          {viewDetail}
        </button>
      </div>
    </li>
  );
};

function propsAreEqual(prevProps: MailCardProps, nextProps: MailCardProps): boolean {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.isRead === nextProps.item.isRead &&
    prevProps.item.subject === nextProps.item.subject &&
    prevProps.item.fromName === nextProps.item.fromName &&
    prevProps.item.fromAddress === nextProps.item.fromAddress &&
    prevProps.item.aiSummary === nextProps.item.aiSummary &&
    prevProps.item.bodyPreview === nextProps.item.bodyPreview &&
    prevProps.noSummary === nextProps.noSummary &&
    prevProps.viewDetail === nextProps.viewDetail &&
    prevProps.onViewDetail === nextProps.onViewDetail
  );
}

export const MailCard = memo(MailCardComponent, propsAreEqual);
