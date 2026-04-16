export function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDue(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }
  return parsed.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(text: string, locale: string, t?: (key: string) => string): string {
  const now = Date.now();
  const dateMatch = text.match(/\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}/);
  if (dateMatch) {
    const date = new Date(dateMatch[0].replace(/[-]/g, "/"));
    if (!Number.isNaN(date.getTime())) {
      const diff = now - date.getTime();
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (seconds < 60) {
        return t ? t("common.justNow") : (locale === "zh" ? "刚刚" : locale === "ja" ? "たった今" : "Just now");
      }
      if (minutes < 60) {
        return t ? t("common.minutesAgo").replace("{count}", String(minutes)) : `${minutes}${locale === "zh" ? "分钟前" : locale === "ja" ? "分前" : "m ago"}`;
      }
      if (hours < 24) {
        return t ? t("common.hoursAgo").replace("{count}", String(hours)) : `${hours}${locale === "zh" ? "小时前" : locale === "ja" ? "時間前" : "h ago"}`;
      }
      if (days < 7) {
        return t ? t("common.daysAgo").replace("{count}", String(days)) : `${days}${locale === "zh" ? "天前" : locale === "ja" ? "日前" : "d ago"}`;
      }
      const lang = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : "en-US";
      return date.toLocaleDateString(lang, { month: "short", day: "numeric" });
    }
  }

  const shortMatch = text.match(/\d{2}:\d{2}/);
  if (shortMatch) {
    return shortMatch[0];
  }

  return text.slice(0, 20);
}
