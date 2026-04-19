"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import type { AccountProvider } from "./ResizableSidebar";

interface AddAccountModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (provider: AccountProvider, email: string) => void;
  onOAuth: (provider: AccountProvider) => void;
  busy?: boolean;
}

const PROVIDER_OPTIONS: Array<{ id: AccountProvider; label: string; color: string; descKey: string; icon: React.ReactNode }> = [
  {
    id: "outlook",
    label: "Microsoft Outlook",
    color: "bg-blue-600",
    descKey: "account.providerOutlookDesc",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
        <path d="M21.7 8.4c-.1-.1-.1-.2-.2-.3H12.8c-.1.1-.1.2-.2.3-.2.1-.4.2-.7.2-.2 0-.4-.1-.7-.2-.1-.1-.2-.2-.4-.3C10.4 7.9 9.9 7.7 9.4 7.5c-.3-.1-.6-.2-1-.2-.3 0-.7.1-1 .2-.5.2-1 .4-1.4.7H2.5c-.1.1-.1.2-.2.3-.2.1-.4.2-.7.2s-.5-.1-.7-.2c-.1-.1-.2-.2-.4-.3C.4 8.2 0 8.1 0 7.9V5.5C0 4.1 1.1 3 2.5 3H12V3L21.7 8.4zM2.5 4C1.7 4 1 4.7 1 5.5v2.4c0 .8.7 1.5 1.5 1.5H5V4H2.5zm18 0H6v5.4h.8c.4 0 .8.4.8.8v.2c0 .8-.7 1.5-1.5 1.5H6V21h12V13h1.5c.8 0 1.5-.7 1.5-1.5v-.2c0-.4-.4-.8-.8-.8h-.7V4zM12 3.8L3.5 7.3c-.4.1-.7.3-.7.6v8.3c0 .4.4.7.7.7h16.5c.4 0 .7-.3.7-.7V7.9c0-.3-.3-.5-.7-.6L12 3.8z"/>
      </svg>
    ),
  },
  {
    id: "gmail",
    label: "Gmail / Google",
    color: "bg-red-500",
    descKey: "account.providerGmailDesc",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
        <path d="M20.18 7.68c-.01-.18-.03-.36-.07-.54-.06-.24-.15-.47-.27-.68-.12-.21-.26-.4-.43-.57-.17-.17-.36-.31-.57-.43-.21-.12-.44-.21-.68-.27-.24-.06-.48-.1-.73-.1s-.49.02-.73.07c-.24.05-.47.12-.68.21-.21.09-.4.21-.57.35l-5.6-5.6c.84-.72 1.84-1.28 2.97-1.68C14.17 1.01 16.25 1 19 1c3.05 0 6.17 1.23 8.38 3.38C29.54 6.54 30 8.76 30 11c0 2.23-.73 4.31-2.03 6.02l1.4 1.4C31.02 16.54 32 13.87 32 11c0-2.58-.76-5.11-2.17-7.32zM12 13.5l-5.5-5.5 1.41-1.41L12 10.67l4.09-4.08 1.41 1.41L12 13.5zM3 11c0-4.42 3.17-8.12 7.41-8.92L9 1C4.42 1.79 1 5.79 1 11s3.42 9.21 8 10.08v-1.37C4.78 18.87 3 15.14 3 11z"/>
      </svg>
    ),
  },
  {
    id: "icloud",
    label: "iCloud Mail",
    color: "bg-slate-500",
    descKey: "account.providerICloudDesc",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
    ),
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    color: "bg-purple-600",
    descKey: "account.providerYahooDesc",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
        <path d="M9.5 3C5.4 3 2 6.4 2 10.5c0 2.5 1.3 4.7 3.2 6.2L3.5 22l6.2-1.7c1.5.5 3.2.8 4.8.8 4.1 0 7.5-3.4 7.5-7.5S13.6 3 9.5 3zm0 11c-1.9 0-3.5-1.6-3.5-3.5S7.6 7 9.5 7s3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/>
      </svg>
    ),
  },
];

export function AddAccountModal({ open, onClose, onAdd, onOAuth, busy }: AddAccountModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<"choose" | "manual">("choose");
  const [selectedProvider, setSelectedProvider] = useState<AccountProvider | null>(null);
  const [email, setEmail] = useState("");

  if (!open) return null;

  function handleChoose(p: AccountProvider) {
    if (p === "custom") {
      setSelectedProvider(p);
      setStep("manual");
    } else {
      setSelectedProvider(p);
      onOAuth(p);
    }
  }

  function handleManualAdd() {
    if (!selectedProvider || !email.trim()) return;
    onAdd(selectedProvider, email.trim());
  }

  function handleClose() {
    setStep("choose");
    setSelectedProvider(null);
    setEmail("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {step === "choose" ? t("account.addMailAccount") : t("account.manualAddAccount")}
          </h2>
          <button
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {step === "choose" && (
          <div className="space-y-2">
            <p className="mb-3 text-xs text-zinc-500">{t("account.selectProvider")}</p>
            {PROVIDER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleChoose(opt.id)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-left transition-all hover:border-blue-300 hover:bg-blue-50/30 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", opt.color)}>
                  {opt.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{opt.label}</p>
                  <p className="text-xs text-zinc-400">{t(opt.descKey)}</p>
                </div>
                <svg className="ml-auto h-4 w-4 shrink-0 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            ))}
          </div>
        )}

        {step === "manual" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{t("account.email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("account.emailPlaceholder")}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("choose")}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                {t("common.back")}
              </button>
              <button
                onClick={handleManualAdd}
                disabled={!email.trim() || busy}
                className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 py-2.5 text-sm font-medium text-white transition-all hover:shadow-lg hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("common.add")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
