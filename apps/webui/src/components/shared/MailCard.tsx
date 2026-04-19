import React, { memo } from "react";
import type { TriageMailItem } from "../../types";
import { CalmButton } from "../ui/Calm";

interface MailCardProps {
  item: TriageMailItem;
  noSummary: string;
  viewDetail: string;
  onViewDetail: (item: TriageMailItem) => void;
}

const MailCardComponent = ({ item, noSummary, viewDetail, onViewDetail }: MailCardProps) => {
  return (
    <li className="rounded-[1.25rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] px-3 py-3 shadow-[var(--shadow-inset)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{item.subject}</p>
          <p className="truncate text-xs text-[color:var(--ink-subtle)]">{item.fromName || item.fromAddress}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--ink-muted)]">{item.aiSummary || item.bodyPreview || noSummary}</p>
        </div>
        <CalmButton
          type="button"
          variant="secondary"
          className="shrink-0 px-2.5 py-1 text-[11px]"
          onClick={() => onViewDetail(item)}
        >
          {viewDetail}
        </CalmButton>
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
