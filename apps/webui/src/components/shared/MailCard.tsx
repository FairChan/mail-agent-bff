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
    <li className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-900">{item.subject}</p>
          <p className="truncate text-xs text-zinc-500">{item.fromName || item.fromAddress}</p>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.aiSummary || item.bodyPreview || noSummary}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-zinc-300 px-2 py-1 text-[11px] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
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
