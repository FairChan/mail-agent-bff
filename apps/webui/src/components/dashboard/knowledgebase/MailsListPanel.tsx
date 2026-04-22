import { useMemo, useState } from "react";
import type { MailKnowledgeRecord, EventCluster, PersonProfile } from "@mail-agent/shared-types";
import { cn } from "../../../lib/utils";
import { useDrawerStore } from "../../drawer";
import { CalmButton, CalmPill } from "../../ui/Calm";
import { formatMailScore, getQuadrantMeta, resolveMailScoreScale } from "./quadrants";

interface MailsListPanelProps {
  mails: MailKnowledgeRecord[];
  persons: PersonProfile[];
  events: EventCluster[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
  loading?: boolean;
  onPageChange?: (page: number) => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getVisiblePages(currentPage: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, currentPage]);
  if (currentPage > 1) {
    pages.add(currentPage - 1);
  }
  if (currentPage < totalPages) {
    pages.add(currentPage + 1);
  }
  return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
}

export function MailsListPanel({
  mails,
  persons,
  events,
  pagination,
  loading = false,
  onPageChange,
}: MailsListPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const openDrawer = useDrawerStore((state) => state.openDrawer);

  const personById = useMemo(() => new Map(persons.map((person) => [person.personId, person])), [persons]);
  const eventById = useMemo(() => new Map(events.map((event) => [event.eventId, event])), [events]);
  const total = pagination?.total ?? mails.length;
  const pageSize = Math.max(1, pagination?.limit ?? Math.max(mails.length, 1));
  const offset = pagination?.offset ?? 0;
  const totalPages = Math.max(1, Math.ceil(Math.max(total, mails.length) / pageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(offset / pageSize) + 1), totalPages);
  const displayedStart = total > 0 ? Math.min((currentPage - 1) * pageSize + 1, total) : 0;
  const displayedEnd = total > 0 ? Math.min((currentPage - 1) * pageSize + mails.length, total) : 0;

  const filteredMails = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return mails;
    }
    return mails.filter((mail) =>
      mail.subject.toLowerCase().includes(query) ||
      mail.summary.toLowerCase().includes(query) ||
      mail.mailId.toLowerCase().includes(query) ||
      (personById.get(mail.personId)?.name ?? mail.personId).toLowerCase().includes(query)
    );
  }, [mails, personById, searchQuery]);

  const openMailDrawer = (mail: MailKnowledgeRecord) => {
    openDrawer("mailKnowledgeDetail", {
      mail,
      personName: personById.get(mail.personId)?.name ?? mail.personId,
      personEmail: personById.get(mail.personId)?.email ?? null,
      eventName: mail.eventId ? eventById.get(mail.eventId)?.name ?? mail.eventId : null,
    });
  };

  const jumpToPage = (page: number) => {
    if (!onPageChange || page === currentPage || page < 1 || page > totalPages) {
      return;
    }
    onPageChange(page);
  };

  if (total === 0 && mails.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[1.4rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)]">
        <p className="text-[color:var(--ink-subtle)]">暂无邮件数据，请先执行邮件总结任务</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-5">
      <header className="rounded-[1.65rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">
              Mail Stack
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[color:var(--ink)]">
              分页邮件堆叠
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--ink-muted)]">
              每一页展示一组邮件，点击后会作为右侧页面叠在当前工作台之上；后续联系人、事件、设置页也可以复用同一个抽屉栈。
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-[color:var(--border-info)] bg-[color:var(--surface-info)] px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--pill-info-ink)]">
              Page
            </p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
              {currentPage} / {totalPages}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="搜索当前页邮件、摘要、联系人..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="calm-input min-w-[16rem] flex-1 px-4 py-2.5 text-sm"
          />
          <CalmPill tone="muted">{displayedStart}-{displayedEnd} / {total} 封</CalmPill>
          {loading ? <CalmPill tone="info">加载中</CalmPill> : null}
        </div>
      </header>

      <div className="grid gap-3">
        {filteredMails.map((mail, index) => {
          const meta = getQuadrantMeta(mail.quadrant);
          const personName = personById.get(mail.personId)?.name ?? mail.personId;
          const eventName = mail.eventId ? eventById.get(mail.eventId)?.name ?? mail.eventId : null;

          return (
            <button
              key={mail.mailId}
              type="button"
              onClick={() => openMailDrawer(mail)}
              className={cn(
                "mail-stack-card group w-full rounded-[1.35rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] p-4 text-left transition duration-150 hover:-translate-y-0.5 hover:border-[color:var(--border-info)] hover:bg-[color:var(--surface-soft)]",
                index === 0 && "border-[color:var(--border-info)]"
              )}
              aria-label={`打开邮件详情：${mail.subject || mail.mailId}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badgeClass}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs font-medium text-[color:var(--ink-subtle)]">{mail.mailId}</span>
                    {eventName ? <CalmPill tone="info">{eventName}</CalmPill> : null}
                  </div>
                  <h3 className="mt-2 truncate text-base font-semibold text-[color:var(--ink)]">
                    {mail.subject || "无主题邮件"}
                  </h3>
                  <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
                    {personName} · {formatDate(mail.receivedAt)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--ink-muted)]">
                    {mail.summary}
                  </p>
                </div>

                <div className="grid min-w-[9rem] gap-2 text-right text-xs text-[color:var(--ink-subtle)]">
                  <span>
                    重要性{" "}
                    <strong className="text-[color:var(--ink)]">
                      {formatMailScore(mail.importanceScore, resolveMailScoreScale(mail))}
                    </strong>
                  </span>
                  <span>
                    紧急性{" "}
                    <strong className="text-[color:var(--ink)]">
                      {formatMailScore(mail.urgencyScore, resolveMailScoreScale(mail))}
                    </strong>
                  </span>
                  <span className="text-[color:var(--pill-info-ink)] transition group-hover:translate-x-0.5">
                    打开叠页 →
                  </span>
                </div>
              </div>
            </button>
          );
        })}

        {filteredMails.length === 0 ? (
          <div className="rounded-[1.25rem] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-8 text-center text-sm text-[color:var(--ink-subtle)]">
            当前页没有匹配的邮件。清空搜索或切换页面继续查看。
          </div>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3"
          aria-label="邮件分页"
        >
          <div className="text-xs text-[color:var(--ink-subtle)]">
            第 {currentPage} / {totalPages} 页，每页 {pageSize} 封
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <CalmButton
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={currentPage === 1}
              onClick={() => jumpToPage(currentPage - 1)}
            >
              上一页
            </CalmButton>
            {getVisiblePages(currentPage, totalPages).map((page, index, pages) => (
              <span key={page} className="inline-flex items-center gap-1.5">
                {index > 0 && page - pages[index - 1] > 1 ? (
                  <span className="px-1 text-xs text-[color:var(--ink-subtle)]">...</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => jumpToPage(page)}
                  className={cn(
                    "h-8 min-w-8 rounded-full px-2 text-xs font-semibold transition",
                    page === currentPage
                      ? "bg-[color:var(--button-primary)] text-[color:var(--button-primary-ink)]"
                      : "text-[color:var(--ink-muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--ink)]"
                  )}
                  aria-current={page === currentPage ? "page" : undefined}
                >
                  {page}
                </button>
              </span>
            ))}
            <CalmButton
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={currentPage === totalPages}
              onClick={() => jumpToPage(currentPage + 1)}
            >
              下一页
            </CalmButton>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
