export const SUPPORTED_LOCALES = ["zh-CN", "en-US", "ja-JP"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export const DEFAULT_LOCALE: SupportedLocale = "zh-CN";

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  "zh-CN": "简体中文",
  "en-US": "English",
  "ja-JP": "日本語",
};

export function resolveLocale(candidate: string | null | undefined): SupportedLocale {
  if (!candidate) return DEFAULT_LOCALE;
  const normalized = candidate.toLowerCase();
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("en")) return "en-US";
  if (normalized.startsWith("ja")) return "ja-JP";
  return DEFAULT_LOCALE;
}