/**
 * 知识库统计卡片
 * 使用 shared-types
 */

import type { KnowledgeBaseStats } from "@mail-agent/shared-types";
import { quadrantMeta, quadrantOrder } from "./quadrants";
import { CalmSectionLabel, CalmSurface } from "../../ui/Calm";
import { useApp } from "../../../contexts/AppContext";

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
  const { locale } = useApp();
  const labels = {
    mailVolume: locale === "zh" ? "邮件体量" : locale === "ja" ? "メール件数" : "Mail Volume",
    eventClusters: locale === "zh" ? "事件聚类" : locale === "ja" ? "イベントクラスタ" : "Event Clusters",
    peopleProfiles: locale === "zh" ? "人物画像" : locale === "ja" ? "人物プロファイル" : "People Profiles",
    processedAt: locale === "zh" ? "处理时间" : locale === "ja" ? "処理日時" : "Processed At",
    dateRange: locale === "zh" ? "时间范围" : locale === "ja" ? "期間" : "Date Range",
    distribution: locale === "zh" ? "分布" : locale === "ja" ? "分布" : "Distribution",
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CalmSurface className="p-6" beam>
          <CalmSectionLabel>{labels.mailVolume}</CalmSectionLabel>
          <p className="mt-2 text-3xl font-bold text-[color:var(--ink)]">{stats.totalMails}</p>
          <p className="mt-1 text-sm text-[color:var(--ink-subtle)]">总邮件数</p>
        </CalmSurface>
        <CalmSurface className="p-6">
          <CalmSectionLabel>{labels.eventClusters}</CalmSectionLabel>
          <p className="mt-2 text-3xl font-bold text-[color:var(--ink)]">{stats.totalEvents}</p>
          <p className="mt-1 text-sm text-[color:var(--ink-subtle)]">事件聚类</p>
        </CalmSurface>
        <CalmSurface className="p-6">
          <CalmSectionLabel>{labels.peopleProfiles}</CalmSectionLabel>
          <p className="mt-2 text-3xl font-bold text-[color:var(--ink)]">{stats.totalPersons}</p>
          <p className="mt-1 text-sm text-[color:var(--ink-subtle)]">人物画像</p>
        </CalmSurface>
        <CalmSurface className="p-6">
          <CalmSectionLabel>{labels.processedAt}</CalmSectionLabel>
          <p className="mt-2 text-lg font-semibold text-[color:var(--ink)]">{formatDate(stats.processedAt)}</p>
          <p className="mt-1 text-sm text-[color:var(--ink-subtle)]">处理时间</p>
        </CalmSurface>
      </div>

      {/* Date Range */}
      {stats.dateRange.start && (
        <CalmSurface className="p-4">
          <CalmSectionLabel>{labels.dateRange}</CalmSectionLabel>
          <p className="mt-2 text-sm text-[color:var(--ink-subtle)]">数据时间范围</p>
          <p className="mt-1 text-[color:var(--ink)]">{formatDate(stats.dateRange.start)} ~ {formatDate(stats.dateRange.end)}</p>
        </CalmSurface>
      )}

      {/* Quadrant Distribution */}
      <div>
        <CalmSectionLabel>{labels.distribution}</CalmSectionLabel>
        <h3 className="mb-4 mt-2 text-lg font-semibold text-[color:var(--ink)]">艾森豪威尔矩阵分布</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {quadrantOrder.map((key) => {
            const meta = quadrantMeta[key];
            const count = stats.quadrantDistribution[key] || 0;
            const percentage = stats.totalMails > 0 ? Math.round((count / stats.totalMails) * 100) : 0;
            return (
              <div key={key} className={`rounded-[1.25rem] border p-4 shadow-[var(--shadow-inset)] ${meta.panelClass}`}>
                <p className={`text-sm font-medium ${meta.textClass}`}>{meta.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-2xl font-bold ${meta.textClass}`}>{count}</span>
                  <span className="text-sm text-[color:var(--ink-subtle)]">({percentage}%)</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/55 dark:bg-white/8">
                  <div
                    className={`h-2 rounded-full ${meta.accentClass}`}
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
