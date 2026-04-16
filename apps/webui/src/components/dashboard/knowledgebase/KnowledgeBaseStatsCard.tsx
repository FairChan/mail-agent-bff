/**
 * 知识库统计卡片
 * 使用 shared-types
 */

import type { KnowledgeBaseStats, MailQuadrant } from "@mail-agent/shared-types";

const quadrantMeta: Record<MailQuadrant, { label: string; color: string; bg: string }> = {
  urgent_important: { label: "紧急且重要", color: "text-red-600", bg: "bg-red-50 border-red-200" },
  not_urgent_important: { label: "重要不紧急", color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  urgent_not_important: { label: "紧急不重要", color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  not_urgent_not_important: { label: "不紧急不重要", color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
};

interface KnowledgeBaseStatsCardProps {
  stats: KnowledgeBaseStats;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}

export function KnowledgeBaseStatsCard({ stats }: KnowledgeBaseStatsCardProps) {
  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-sm text-zinc-500">总邮件数</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalMails}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-sm text-zinc-500">事件聚类</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalEvents}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-sm text-zinc-500">人物画像</p>
          <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalPersons}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-sm text-zinc-500">处理时间</p>
          <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{formatDate(stats.processedAt)}</p>
        </div>
      </div>

      {/* Date Range */}
      {stats.dateRange.start && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-sm text-zinc-500">数据时间范围</p>
          <p className="mt-1 text-zinc-900 dark:text-zinc-100">{formatDate(stats.dateRange.start)} ~ {formatDate(stats.dateRange.end)}</p>
        </div>
      )}

      {/* Quadrant Distribution */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">艾森豪威尔矩阵分布</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(quadrantMeta) as MailQuadrant[]).map((key) => {
            const meta = quadrantMeta[key];
            const count = stats.quadrantDistribution[key] || 0;
            const percentage = stats.totalMails > 0 ? Math.round((count / stats.totalMails) * 100) : 0;
            return (
              <div key={key} className={`rounded-xl border p-4 ${meta.bg}`}>
                <p className={`text-sm font-medium ${meta.color}`}>{meta.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-2xl font-bold ${meta.color}`}>{count}</span>
                  <span className="text-sm text-zinc-500">({percentage}%)</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/50">
                  <div
                    className={`h-2 rounded-full ${meta.color.replace("text-", "bg-")}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
