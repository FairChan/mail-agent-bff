import { useState } from "react";
import type { MailKnowledgeRecord, EventCluster, PersonProfile } from "@mail-agent/shared-types";
import { formatMailScore, getQuadrantMeta, resolveMailScoreScale } from "./quadrants";

interface MailsListPanelProps {
  mails: MailKnowledgeRecord[];
  persons: PersonProfile[];
  events: EventCluster[];
}

export function MailsListPanel({ mails, persons, events }: MailsListPanelProps) {
  const [selectedMail, setSelectedMail] = useState<MailKnowledgeRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMails = mails.filter((mail) =>
    mail.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    mail.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPersonName = (personId: string) => {
    const person = persons.find((p) => p.personId === personId);
    return person?.name || personId;
  };

  const getEventName = (eventId: string | null) => {
    if (!eventId) return null;
    const event = events.find((e) => e.eventId === eventId);
    return event?.name;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (mails.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300">
        <p className="text-zinc-500">暂无邮件数据，请先执行邮件总结任务</p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6">
      {/* Mail List */}
      <div className="flex w-1/2 flex-col">
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="搜索邮件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
        </div>

        {/* List */}
        <div className="flex-1 space-y-2 overflow-auto">
          {filteredMails.map((mail) => {
            const meta = getQuadrantMeta(mail.quadrant);
            const isSelected = selectedMail?.mailId === mail.mailId;
            return (
              <button
                key={mail.mailId}
                type="button"
                onClick={() => setSelectedMail(mail)}
                className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? "border-zinc-400 bg-zinc-50"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${meta.badgeClass}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-zinc-400">{mail.mailId}</span>
                    </div>
                    <h4 className="mt-1 truncate font-medium text-zinc-900">{mail.subject}</h4>
                    <p className="mt-1 text-sm text-zinc-500">{getPersonName(mail.personId)}</p>
                    <p className="mt-1 text-xs text-zinc-400">{formatDate(mail.receivedAt)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mail Detail */}
      <div className="w-1/2 rounded-xl border border-zinc-200 bg-white p-6">
        {selectedMail ? (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-1 text-xs font-medium ${getQuadrantMeta(selectedMail.quadrant).badgeClass}`}>
                  {getQuadrantMeta(selectedMail.quadrant).label}
                </span>
                <span className="text-sm text-zinc-500">{selectedMail.mailId}</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold text-zinc-900">{selectedMail.subject}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-zinc-500">发件人</p>
                <p className="font-medium text-zinc-900">{getPersonName(selectedMail.personId)}</p>
              </div>
              <div>
                <p className="text-zinc-500">接收时间</p>
                <p className="font-medium text-zinc-900">{formatDate(selectedMail.receivedAt)}</p>
              </div>
              <div>
                <p className="text-zinc-500">重要性</p>
                <p className="font-medium text-zinc-900">
                  {formatMailScore(
                    selectedMail.importanceScore,
                    resolveMailScoreScale(selectedMail)
                  )}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">紧急性</p>
                <p className="font-medium text-zinc-900">
                  {formatMailScore(
                    selectedMail.urgencyScore,
                    resolveMailScoreScale(selectedMail)
                  )}
                </p>
              </div>
              {selectedMail.eventId && (
                <div className="col-span-2">
                  <p className="text-zinc-500">关联事件</p>
                  <p className="font-medium text-zinc-900">{getEventName(selectedMail.eventId) || selectedMail.eventId}</p>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-zinc-900">摘要</p>
              <div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700">
                {selectedMail.summary}
              </div>
            </div>

            {selectedMail.webLink && (
              <a
                href={selectedMail.webLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                在Outlook中查看
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500">
            选择一封邮件查看详情
          </div>
        )}
      </div>
    </div>
  );
}
