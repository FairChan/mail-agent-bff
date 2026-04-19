import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

const resources = {
  "zh-CN": { translation: zhCN },
  "en-US": { translation: enUS },
};

function getInitialLanguage(): string {
  if (typeof window === "undefined") return "zh-CN";
  const stored = localStorage.getItem("mery-language");
  if (stored && Object.prototype.hasOwnProperty.call(resources, stored)) {
    return stored;
  }
  const browserLang = navigator.language;
  if (browserLang.startsWith("en")) return "en-US";
  return "zh-CN";
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: "zh-CN",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export function changeLanguage(lang: string) {
  localStorage.setItem("mery-language", lang);
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

export const supportedLanguages = [
  { code: "zh-CN", label: "简体中文" },
  { code: "en-US", label: "English" },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]["code"];

export default i18n;
