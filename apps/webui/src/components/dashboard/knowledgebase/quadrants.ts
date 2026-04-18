import type { MailQuadrant, MailScoreScale } from "@mail-agent/shared-types";

type DisplayMailScoreScale = MailScoreScale | "unknown";

type MailScoreBearing = {
  importanceScore: number;
  urgencyScore: number;
  scoreScale?: MailScoreScale | string;
};

const fallbackQuadrant: MailQuadrant = "unprocessed";

export const quadrantOrder: MailQuadrant[] = [
  "unprocessed",
  "urgent_important",
  "not_urgent_important",
  "urgent_not_important",
  "not_urgent_not_important",
];

export const quadrantMeta: Record<
  MailQuadrant,
  {
    label: string;
    shortLabel: string;
    hint: string;
    emptyText: string;
    textClass: string;
    panelClass: string;
    badgeClass: string;
    accentClass: string;
  }
> = {
  unprocessed: {
    label: "未处理",
    shortLabel: "等待 Agent",
    hint: "这些邮件还没有经过 Agent 归纳与评分，会在完成处理后进入正式象限。",
    emptyText: "目前没有等待处理的邮件。",
    textClass: "text-violet-700 dark:text-violet-200",
    panelClass: "border-violet-200 bg-violet-50 dark:border-violet-900/70 dark:bg-violet-950/30",
    badgeClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200",
    accentClass: "bg-violet-500",
  },
  urgent_important: {
    label: "紧急且重要",
    shortLabel: "立即处理",
    hint: "需要现在就做，通常涉及明确截止日期或关键事务。",
    emptyText: "这一象限目前没有待处理邮件。",
    textClass: "text-rose-700 dark:text-rose-200",
    panelClass: "border-rose-200 bg-rose-50 dark:border-rose-900/70 dark:bg-rose-950/30",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200",
    accentClass: "bg-rose-500",
  },
  not_urgent_important: {
    label: "重要不紧急",
    shortLabel: "安排计划",
    hint: "需要认真推进，但可以排进计划，不必立刻打断手头工作。",
    emptyText: "这一象限目前没有需要规划的邮件。",
    textClass: "text-emerald-700 dark:text-emerald-200",
    panelClass: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/70 dark:bg-emerald-950/30",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200",
    accentClass: "bg-emerald-500",
  },
  urgent_not_important: {
    label: "紧急不重要",
    shortLabel: "快速清理",
    hint: "有时间压力，但对核心目标贡献有限，适合尽快清理或委派。",
    emptyText: "这一象限目前没有需要快速清理的邮件。",
    textClass: "text-amber-700 dark:text-amber-200",
    panelClass: "border-amber-200 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/30",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
    accentClass: "bg-amber-500",
  },
  not_urgent_not_important: {
    label: "不紧急不重要",
    shortLabel: "低优先级",
    hint: "对当前关键目标影响较小，可以延后阅读或低频处理。",
    emptyText: "这一象限目前没有低优先级邮件。",
    textClass: "text-zinc-700 dark:text-zinc-200",
    panelClass: "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60",
    badgeClass: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100",
    accentClass: "bg-zinc-500",
  },
};

export function isMailQuadrant(value: unknown): value is MailQuadrant {
  return typeof value === "string" && value in quadrantMeta;
}

export function normalizeMailQuadrant(value: unknown): MailQuadrant {
  return isMailQuadrant(value) ? value : fallbackQuadrant;
}

export function getQuadrantMeta(value: unknown) {
  return quadrantMeta[normalizeMailQuadrant(value)];
}

export function comparableMailScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  const normalized = score > 1 ? score / 10 : score;
  return Math.max(0, Math.min(1, normalized));
}

export function resolveMailScoreScale(mail: MailScoreBearing): DisplayMailScoreScale {
  if (mail.scoreScale === "ratio" || mail.scoreScale === "ten") {
    return mail.scoreScale;
  }

  const scores = [mail.importanceScore, mail.urgencyScore];
  if (scores.some((score) => Number.isFinite(score) && score > 1)) {
    return "ten";
  }
  return "unknown";
}

export function formatMailScore(score: number, scale: DisplayMailScoreScale = "ratio"): string {
  if (!Number.isFinite(score)) {
    return "-";
  }

  if (scale === "unknown") {
    return `${Number(score.toFixed(2)).toString()} raw`;
  }

  if (scale === "ten") {
    const value = Math.max(0, Math.min(10, score));
    return `${Number(value.toFixed(1)).toString()}/10`;
  }

  return `${Math.round(comparableMailScore(score) * 100)}%`;
}
