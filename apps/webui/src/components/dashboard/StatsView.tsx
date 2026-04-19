/**
 * 统计视图
 * 展示邮件分类统计、指标等信息
 */

import React, { useEffect, useMemo } from "react";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import { quadrantMeta, viewLabelsByLocale, type MailQuadrant } from "@mail-agent/shared-types";
import { CalmSectionLabel, CalmSurface } from "../ui/Calm";

export function StatsView() {
  const { triage, insights } = useMail();
  const { locale } = useApp();

  const quadrantLabels = viewLabelsByLocale[locale];

  const counts = useMemo(() => triage?.counts ?? {
    unprocessed: 0,
    urgent_important: 0,
    not_urgent_important: 0,
    urgent_not_important: 0,
    not_urgent_not_important: 0,
  }, [triage?.counts]);

  const total = useMemo(
    () => Math.max(1, Object.values(counts).reduce((sum, v) => sum + v, 0)),
    [counts]
  );

  const statsRows = useMemo(
    () =>
      (Object.keys(quadrantMeta) as MailQuadrant[]).map((key) => ({
        key,
        value: counts[key] ?? 0,
        ratio: ((counts[key] ?? 0) / total) * 100,
        meta: quadrantMeta[key],
        label: quadrantLabels[key],
      })),
    [counts, total, quadrantLabels]
  );

  // 从 triage 数据中提取 top senders（简化版本）
  const topSenders = useMemo(() => {
    const senderMap = new Map<string, number>();
    triage?.allItems?.forEach((item) => {
      const name = item.fromName || item.fromAddress || "Unknown";
      senderMap.set(name, (senderMap.get(name) ?? 0) + 1);
    });
    return Array.from(senderMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [triage?.allItems]);

  const unreadCount = insights?.digest?.unread ?? 0;
  const upcomingCount = insights?.upcoming?.length ?? 0;
  const tomorrowDdlCount = insights?.tomorrowDdl?.length ?? 0;

  const labels = {
    classification: locale === "zh" ? "邮件分类统计" : locale === "ja" ? "メールの分類統計" : "Classification Stats",
    classificationDesc: locale === "zh" ? "按未处理队列与艾森豪威尔矩阵统计邮件分布" : locale === "ja" ? "未処理キューとアイゼンハワーマトリクスでメール分布を集計" : "Mail distribution across the pending queue and Eisenhower matrix",
    topSenders: locale === "zh" ? "高频发件人" : locale === "ja" ? "上位送信者" : "Top Senders",
    metrics: locale === "zh" ? "关键指标" : locale === "ja" ? "主要指標" : "Key Metrics",
    totalMail: locale === "zh" ? "总邮件数" : locale === "ja" ? "総メール数" : "Total Emails",
    unreadMail: locale === "zh" ? "未读邮件" : locale === "ja" ? "未読メール" : "Unread",
    upcomingItems: locale === "zh" ? "近期事项" : locale === "ja" ? "今後のイベント" : "Upcoming",
    tomorrowDdl: locale === "zh" ? "明天 DDL" : locale === "ja" ? "明日の締切" : "Tomorrow's DDL",
    noStats: locale === "zh" ? "暂无统计数据" : locale === "ja" ? "統計データなし" : "No stats available",
  };

  return (
    <div className="space-y-6">
      {/* 四象限分类统计 */}
      <CalmSurface className="p-5" beam>
        <CalmSectionLabel>{locale === "zh" ? "分布概览" : locale === "ja" ? "分布概要" : "Distribution"}</CalmSectionLabel>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-[color:var(--ink)]">
          {labels.classification}
        </h2>
        <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
          {labels.classificationDesc}
        </p>

        <div className="mt-4 space-y-3">
          {statsRows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={row.meta.tone}>{row.label}</span>
                <span className="font-mono text-[color:var(--ink-subtle)]">
                  {row.value} ({row.ratio.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${row.key === "urgent_important"
                      ? "bg-red-500"
                      : row.key === "unprocessed"
                        ? "bg-violet-500"
                      : row.key === "not_urgent_important"
                        ? "bg-blue-500"
                        : row.key === "urgent_not_important"
                          ? "bg-orange-500"
                          : "bg-zinc-400"
                    }`}
                  style={{ width: `${Math.max(2, Math.min(100, row.ratio))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CalmSurface>

      {/* 关键指标 */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* 高频发件人 */}
        <CalmSurface className="p-4">
          <CalmSectionLabel>{locale === "zh" ? "联系人热度" : locale === "ja" ? "送信者ヒート" : "Sender Heat"}</CalmSectionLabel>
          <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
            {labels.topSenders}
          </p>
          <ul className="mt-3 space-y-2">
            {topSenders.length === 0 ? (
              <li className="text-xs text-[color:var(--ink-subtle)]">
                {labels.noStats}
              </li>
            ) : (
              topSenders.map((sender) => (
                <li
                  key={sender.name}
                  className="flex items-center justify-between rounded-[0.95rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--ink-muted)]"
                >
                  <span className="truncate">{sender.name}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs text-[color:var(--ink-subtle)]">
                    {sender.count}
                  </span>
                </li>
              ))
            )}
          </ul>
        </CalmSurface>

        {/* 指标 */}
        <CalmSurface className="p-4">
          <CalmSectionLabel>{locale === "zh" ? "运行指标" : locale === "ja" ? "運用指標" : "Metrics"}</CalmSectionLabel>
          <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">
            {labels.metrics}
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              [labels.totalMail, triage?.total ?? 0],
              [labels.unreadMail, unreadCount],
              [labels.upcomingItems, upcomingCount],
              [labels.tomorrowDdl, tomorrowDdlCount],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between rounded-[0.95rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-3 py-2"
              >
                <dt className="text-[color:var(--ink-subtle)]">{label}</dt>
                <dd className="font-mono font-medium text-[color:var(--ink)]">{value}</dd>
              </div>
            ))}
          </dl>
        </CalmSurface>
      </section>

      {/* 明日 DDL 倒计时 */}
      {tomorrowDdlCount > 0 && (
        <CalmSurface tone="urgent" className="p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--pill-urgent-ink)]">
            <span className="flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {locale === "zh" ? "紧急提醒" : locale === "ja" ? "緊急通知" : "Urgent Reminder"}
          </h3>
          <p className="mt-2 text-sm text-[color:var(--ink)]">
            {locale === "zh"
              ? `明天有 ${tomorrowDdlCount} 个截止日期需要处理，请尽快处理！`
              : locale === "ja"
                ? `明日は ${tomorrowDdlCount} 件の締切があります。早急に処理してください！`
                : `You have ${tomorrowDdlCount} deadlines tomorrow. Please handle them ASAP!`}
          </p>
        </CalmSurface>
      )}
    </div>
  );
}
