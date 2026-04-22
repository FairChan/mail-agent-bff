import type { MailQuadrant, TriageMailItem } from "@mail-agent/shared-types";

export function quadrantLabel(
  locale: "zh" | "en" | "ja",
  quadrant: MailQuadrant
): string {
  const labels = {
    zh: {
      unprocessed: "未处理",
      urgent_important: "紧急重要",
      not_urgent_important: "不紧急重要",
      urgent_not_important: "紧急不重要",
      not_urgent_not_important: "不紧急不重要",
    },
    en: {
      unprocessed: "Unprocessed",
      urgent_important: "Urgent + Important",
      not_urgent_important: "Important",
      urgent_not_important: "Urgent",
      not_urgent_not_important: "Low Priority",
    },
    ja: {
      unprocessed: "未処理",
      urgent_important: "緊急・重要",
      not_urgent_important: "重要",
      urgent_not_important: "緊急",
      not_urgent_not_important: "低優先度",
    },
  } as const;

  return labels[locale][quadrant];
}

export function quadrantShortLabel(
  locale: "zh" | "en" | "ja",
  quadrant: MailQuadrant
): string {
  const labels = {
    zh: {
      unprocessed: "自动",
      urgent_important: "紧重",
      not_urgent_important: "重",
      urgent_not_important: "紧",
      not_urgent_not_important: "低",
    },
    en: {
      unprocessed: "Auto",
      urgent_important: "U+I",
      not_urgent_important: "Imp",
      urgent_not_important: "Urg",
      not_urgent_not_important: "Low",
    },
    ja: {
      unprocessed: "自動",
      urgent_important: "緊重",
      not_urgent_important: "重要",
      urgent_not_important: "緊急",
      not_urgent_not_important: "低",
    },
  } as const;

  return labels[locale][quadrant];
}

export function quadrantTone(quadrant: MailQuadrant): string {
  switch (quadrant) {
    case "urgent_important":
      return "border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] text-[color:var(--pill-urgent-ink)]";
    case "not_urgent_important":
      return "border-[color:var(--border-success)] bg-[color:var(--surface-success)] text-[color:var(--pill-success-ink)]";
    case "urgent_not_important":
      return "border-[color:var(--border-warning)] bg-[color:var(--surface-warning)] text-[color:var(--pill-warning-ink)]";
    case "not_urgent_not_important":
      return "border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] text-[color:var(--ink-muted)]";
    default:
      return "border-[color:var(--border-info)] bg-[color:var(--surface-info)] text-[color:var(--pill-info-ink)]";
  }
}

export function quadrantOptions(locale: "zh" | "en" | "ja") {
  return ([
    "urgent_important",
    "not_urgent_important",
    "urgent_not_important",
    "not_urgent_not_important",
  ] as MailQuadrant[]).map((quadrant) => ({
    quadrant,
    label: quadrantLabel(locale, quadrant),
    shortLabel: quadrantShortLabel(locale, quadrant),
    tone: quadrantTone(quadrant),
  }));
}

export function deriveQuadrantFromMails(mails: Array<Pick<TriageMailItem, "quadrant">>): MailQuadrant {
  if (mails.length === 0) {
    return "unprocessed";
  }

  const counts = new Map<MailQuadrant, number>();
  for (const mail of mails) {
    counts.set(mail.quadrant, (counts.get(mail.quadrant) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "unprocessed";
}
