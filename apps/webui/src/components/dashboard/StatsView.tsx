/**
 * 统计视图
 * 展示邮件分类统计、指标等信息
 */

import React, { useEffect, useMemo } from "react";
import { useMail } from "../../contexts/MailContext";
import { useApp } from "../../contexts/AppContext";
import { quadrantMeta, viewLabelsByLocale, type MailQuadrant } from "@mail-agent/shared-types";

export function StatsView() {
  const { triage, insights } = useMail();
  const { locale } = useApp();

  const quadrantLabels = viewLabelsByLocale[locale];

  const counts = useMemo(() => triage?.counts ?? {
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
    classificationDesc: locale === "zh" ? "按四象限矩阵统计邮件分布" : locale === "ja" ? "4象限マトリックスでメールの分布を統計" : "Mail distribution by Eisenhower matrix",
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
      <section>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {labels.classification}
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {labels.classificationDesc}
        </p>

        <div className="mt-4 space-y-3">
          {statsRows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={row.meta.tone}>{row.label}</span>
                <span className="font-mono text-zinc-600 dark:text-zinc-400">
                  {row.value} ({row.ratio.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${row.key === "urgent_important"
                      ? "bg-red-500"
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
      </section>

      {/* 关键指标 */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* 高频发件人 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {labels.topSenders}
          </p>
          <ul className="mt-3 space-y-2">
            {topSenders.length === 0 ? (
              <li className="text-xs text-zinc-500 dark:text-zinc-400">
                {labels.noStats}
              </li>
            ) : (
              topSenders.map((sender) => (
                <li
                  key={sender.name}
                  className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <span className="truncate">{sender.name}</span>
                  <span className="ml-2 shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {sender.count}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* 指标 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {labels.metrics}
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              [labels.totalMail, triage?.total ?? 0],
              [labels.unreadMail, unreadCount],
              [labels.upcomingItems, upcomingCount],
              [labels.tomorrowDdl, tomorrowDdlCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between">
                <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                <dd className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 明日 DDL 倒计时 */}
      {tomorrowDdlCount > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
            <span className="flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {locale === "zh" ? "紧急提醒" : locale === "ja" ? "緊急通知" : "Urgent Reminder"}
          </h3>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {locale === "zh"
              ? `明天有 ${tomorrowDdlCount} 个截止日期需要处理，请尽快处理！`
              : locale === "ja"
                ? `明日は ${tomorrowDdlCount} 件の締切があります。早急に処理してください！`
                : `You have ${tomorrowDdlCount} deadlines tomorrow. Please handle them ASAP!`}
          </p>
        </section>
      )}
    </div>
  );
}
