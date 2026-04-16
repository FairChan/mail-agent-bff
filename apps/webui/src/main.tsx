/**
 * 应用入口
 * 初始化 React 根节点和 i18n
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import zhCN from "./i18n/locales/zh-CN.json";
import enUS from "./i18n/locales/en-US.json";
import jaJP from "./i18n/locales/ja-JP.json";
import { App } from "./App";
import "./styles.css";

// 初始化 i18next
i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
    "ja-JP": { translation: jaJP },
  },
  lng: localStorage.getItem("mail-agent-locale") === "zh" ? "zh-CN"
    : localStorage.getItem("mail-agent-locale") === "en" ? "en-US"
    : localStorage.getItem("mail-agent-locale") === "ja" ? "ja-JP"
    : "zh-CN",
  fallbackLng: "zh-CN",
  interpolation: {
    escapeValue: false,
  },
});

// 渲染应用
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </StrictMode>
  );
}
