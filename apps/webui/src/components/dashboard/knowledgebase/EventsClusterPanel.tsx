import { useState } from "react";
import type { EventCluster, MailKnowledgeRecord } from "@mail-agent/shared-types";

interface EventsClusterPanelProps {
  events: EventCluster[];
  mails: MailKnowledgeRecord[];
}

export function EventsClusterPanel({ events, mails }: EventsClusterPanelProps) {
  const [selectedEvent, setSelectedEvent] = useState<EventCluster | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEvents = events.filter((event) =>
    event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRelatedMails = (mailIds: string[]) => {
    return mailIds
      .map((id) => mails.find((m) => m.mailId === id))
      .filter((m): m is MailKnowledgeRecord => m !== undefined);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (events.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300">
        <p className="text-zinc-500">暂无事件数据</p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6">
      {/* Event List */}
      <div className="flex w-1/2 flex-col">
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="搜索事件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
        </div>

        {/* List */}
        <div className="flex-1 space-y-2 overflow-auto">
          {filteredEvents.map((event) => {
            const isSelected = selectedEvent?.eventId === event.eventId;
            return (
              <div
                key={event.eventId}
                onClick={() => setSelectedEvent(event)}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? "border-zinc-400 bg-zinc-50"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">{event.eventId}</span>
                      <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                        {event.relatedMailIds.length} 封邮件
                      </span>
                    </div>
                    <h4 className="mt-1 truncate font-medium text-zinc-900">{event.name}</h4>
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{event.summary}</p>
                    {event.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {event.tags.map((tag) => (
                          <span key={tag} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-zinc-400">
                      最后更新: {formatDate(event.lastUpdated)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Detail */}
      <div className="w-1/2 space-y-4 overflow-auto rounded-xl border border-zinc-200 bg-white p-6">
        {selectedEvent ? (
          <>
            <div>
              <span className="text-sm text-zinc-500">{selectedEvent.eventId}</span>
              <h3 className="mt-1 text-xl font-semibold text-zinc-900">{selectedEvent.name}</h3>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-zinc-900">事件总结</p>
              <div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700">
                {selectedEvent.summary}
              </div>
            </div>

            {selectedEvent.keyInfo.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-900">关键信息</p>
                <ul className="space-y-2">
                  {selectedEvent.keyInfo.map((info, idx) => (
                    <li key={idx} className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                      <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {info}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedEvent.tags.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-900">标签</p>
                <div className="flex flex-wrap gap-2">
                  {selectedEvent.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-3 text-sm font-medium text-zinc-900">
                关联邮件 ({selectedEvent.relatedMailIds.length})
              </p>
              <div className="space-y-2">
                {getRelatedMails(selectedEvent.relatedMailIds).map((mail) => (
                  <div key={mail.mailId} className="rounded-lg border border-zinc-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-900">{mail.subject}</span>
                      <span className="text-xs text-zinc-400">{mail.mailId}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{formatDate(mail.receivedAt)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-zinc-400">
              最后更新: {formatDate(selectedEvent.lastUpdated)}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500">
            选择一个事件查看详情
          </div>
        )}
      </div>
    </div>
  );
}