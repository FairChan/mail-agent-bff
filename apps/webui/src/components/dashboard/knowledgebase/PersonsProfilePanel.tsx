import { useState } from "react";
import type { PersonProfile, MailKnowledgeRecord } from "@mail-agent/shared-types";

interface PersonsProfilePanelProps {
  persons: PersonProfile[];
  mails: MailKnowledgeRecord[];
}

export function PersonsProfilePanel({ persons, mails }: PersonsProfilePanelProps) {
  const [selectedPerson, setSelectedPerson] = useState<PersonProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPersons = persons.filter((person) =>
    person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    person.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    person.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRelatedMails = (personId: string) => {
    return mails.filter((m) => m.personId === personId);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (persons.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300">
        <p className="text-zinc-500">暂无人物数据</p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6">
      {/* Person List */}
      <div className="flex w-1/2 flex-col">
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="搜索人物..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
        </div>

        {/* List */}
        <div className="flex-1 space-y-2 overflow-auto">
          {filteredPersons.map((person) => {
            const isSelected = selectedPerson?.personId === person.personId;
            const mailCount = getRelatedMails(person.personId).length;
            return (
              <div
                key={person.personId}
                onClick={() => setSelectedPerson(person)}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? "border-zinc-400 bg-zinc-50"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 text-lg font-semibold text-white">
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-zinc-900">{person.name}</h4>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${
                        person.importance >= 8 ? "bg-red-100 text-red-700" :
                        person.importance >= 5 ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        重要度 {person.importance}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-500">{person.role || "未知角色"}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">{person.email}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                      <span>{mailCount} 封邮件</span>
                      <span>{person.recentInteractions} 次交互</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Person Detail */}
      <div className="w-1/2 space-y-4 overflow-auto rounded-xl border border-zinc-200 bg-white p-6">
        {selectedPerson ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 text-2xl font-semibold text-white">
                {selectedPerson.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-zinc-900">{selectedPerson.name}</h3>
                <p className="text-sm text-zinc-500">{selectedPerson.role || "未知角色"}</p>
                <p className="text-sm text-zinc-400">{selectedPerson.email}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 rounded-lg bg-zinc-50 p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-zinc-900">{selectedPerson.importance}</p>
                <p className="text-xs text-zinc-500">重要性</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-zinc-900">{getRelatedMails(selectedPerson.personId).length}</p>
                <p className="text-xs text-zinc-500">邮件数</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-zinc-900">{selectedPerson.recentInteractions}</p>
                <p className="text-xs text-zinc-500">交互次数</p>
              </div>
            </div>

            {/* Profile */}
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-900">人物画像</p>
              <div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700">
                {selectedPerson.profile}
              </div>
            </div>

            {/* Related Mails */}
            <div>
              <p className="mb-3 text-sm font-medium text-zinc-900">
                相关邮件 ({getRelatedMails(selectedPerson.personId).length})
              </p>
              <div className="space-y-2">
                {getRelatedMails(selectedPerson.personId).slice(0, 5).map((mail) => (
                  <div key={mail.mailId} className="rounded-lg border border-zinc-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900">{mail.subject}</p>
                        <p className="mt-1 text-xs text-zinc-500">{mail.summary.slice(0, 100)}...</p>
                      </div>
                      <span className="text-xs text-zinc-400">{formatDate(mail.receivedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-zinc-400">
              最后更新: {formatDate(selectedPerson.lastUpdated)}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500">
            选择一个人物查看详情
          </div>
        )}
      </div>
    </div>
  );
}