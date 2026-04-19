"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme-context";
import i18n, { changeLanguage, supportedLanguages } from "../../i18n";
import { cn } from "../../lib/utils";

interface SettingsPageProps {
  connectedMailbox?: string;
  connectedAccountId?: string | null;
  onLogout?: () => void;
}

export function SettingsPage({ connectedMailbox, connectedAccountId, onLogout }: SettingsPageProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [activeSection, setActiveSection] = useState("account");

  const sections = [
    { id: "account", label: t("settings.account"), icon: AccountIcon },
    { id: "notifications", label: t("settings.notifications"), icon: BellIcon },
    { id: "appearance", label: t("settings.appearance"), icon: PaletteIcon },
    { id: "data", label: t("settings.data"), icon: DatabaseIcon },
    { id: "about", label: t("settings.about"), icon: InfoIcon },
  ];

  const SectionIcon = sections.find((s) => s.id === activeSection)?.icon ?? AccountIcon;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t("settings.title")}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">{t("settings.subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <nav className="space-y-1">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-all",
                    activeSection === s.id
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                  )}
                >
                  <Icon />
                  {s.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="lg:col-span-4">
          {activeSection === "account" && (
            <div className="space-y-4">
              <SettingsCard title={t("settings.connectedAccount")}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{connectedMailbox ?? t("settings.notConnected")}</p>
                    <p className="text-xs text-zinc-400">
                      {connectedAccountId ? `ID: ${connectedAccountId}` : "Outlook OAuth"}
                    </p>
                  </div>
                  <div className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    {t("settings.verified")}
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title={t("settings.apiKey")}>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    •••••••••••••••••••••••••••••••••••
                  </code>
                  <span className="text-xs text-zinc-400">{t("settings.hidden")}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-400">
                  {t("settings.apiKeyHint")}
                </p>
              </SettingsCard>

              <SettingsCard title={t("settings.session")}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{t("settings.currentSession")}</p>
                    <p className="text-xs text-zinc-400">{t("settings.sessionExpiry")}</p>
                  </div>
                  <div className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                    {t("settings.active")}
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title={t("settings.dangerZone")}>
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  {t("settings.logout")}
                </button>
              </SettingsCard>
            </div>
          )}

          {activeSection === "notifications" && (
            <div className="space-y-4">
              <SettingsCard title={t("settings.notificationPrefs")}>
                <div className="space-y-4">
                  <ToggleRow
                    label={t("settings.pushNotifications")}
                    description={t("settings.pushDesc")}
                    checked={notifications}
                    onChange={setNotifications}
                  />
                  <ToggleRow
                    label={t("settings.emailDigest")}
                    description={t("settings.emailDigestDesc")}
                    checked={emailDigest}
                    onChange={setEmailDigest}
                  />
                </div>
              </SettingsCard>

              <SettingsCard title={t("settings.notificationChannels")}>
                <div className="space-y-3">
                  {[
                    { label: t("settings.browserNotification"), enabled: true },
                    { label: t("settings.emailNotification"), enabled: false },
                    { label: t("settings.outlookReminder"), enabled: true },
                  ].map((ch) => (
                    <div key={ch.label} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{ch.label}</p>
                      </div>
                      <div className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        ch.enabled
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                      )}>
                        {ch.enabled ? t("settings.enabled") : t("settings.disabled")}
                      </div>
                    </div>
                  ))}
                </div>
              </SettingsCard>
            </div>
          )}

          {activeSection === "appearance" && (
            <div className="space-y-4">
              <SettingsCard title={t("settings.theme")}>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "light", label: t("settings.light"), preview: "bg-white border-zinc-200" },
                    { id: "dark", label: t("settings.dark"), preview: "bg-zinc-900 border-zinc-700" },
                    { id: "system", label: t("settings.system"), preview: "bg-gradient-to-br from-white to-zinc-900 border-zinc-300" },
                  ].map((themeOption) => (
                    <button
                      key={themeOption.id}
                      onClick={() => setTheme(themeOption.id as "light" | "dark" | "system")}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all",
                        theme === themeOption.id
                          ? "border-blue-500 bg-blue-50 dark:border-blue-400"
                          : "border-zinc-200 dark:border-zinc-700",
                        theme === themeOption.id && "dark:bg-blue-950/40"
                      )}
                    >
                      <div className={cn("h-8 w-full rounded-lg border", themeOption.preview)} />
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{themeOption.label}</span>
                    </button>
                  ))}
                </div>
              </SettingsCard>

              <SettingsCard title={t("settings.display")}>
                <div className="space-y-3">
                  <ToggleRow
                    label={t("settings.compactSidebar")}
                    description={t("settings.compactDesc")}
                    checked={false}
                    onChange={() => {}}
                  />
                  <ToggleRow
                    label={t("settings.animations")}
                    description={t("settings.animationsDesc")}
                    checked={true}
                    onChange={() => {}}
                  />
                </div>
              </SettingsCard>

              <SettingsCard title={t("settings.language")}>
                <div className="space-y-2">
                  {supportedLanguages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => changeLanguage(lang.code)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                        i18n.language === lang.code
                          ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-400"
                          : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                      )}
                    >
                      <span>{lang.label}</span>
                      {i18n.language === lang.code && (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </SettingsCard>
            </div>
          )}

          {activeSection === "data" && (
            <div className="space-y-4">
              <SettingsCard title={t("settings.mailData")}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">{t("settings.syncedEmails")}</p>
                      <p className="text-xs text-zinc-400">{t("settings.recentEmails")}</p>
                    </div>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">--</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">{t("settings.dataSource")}</p>
                      <p className="text-xs text-zinc-400">Outlook / Gmail</p>
                    </div>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Outlook</span>
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title={t("settings.cache")}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{t("settings.localCache")}</p>
                    <p className="text-xs text-zinc-400">{t("settings.cacheDesc")}</p>
                  </div>
                  <button className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900">
                    {t("settings.clear")}
                  </button>
                </div>
              </SettingsCard>
            </div>
          )}

          {activeSection === "about" && (
            <div className="space-y-4">
              <SettingsCard title={t("settings.aboutInfo")}>
                <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center justify-between">
                    <span>{t("settings.appName")}</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Mery</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t("settings.version")}</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">0.1.0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t("settings.buildTime")}</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">2026-04-16</span>
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard title={t("settings.techStack")}>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: "React", ver: "19.2" },
                    { name: "Vite", ver: "7.1" },
                    { name: "TailwindCSS", ver: "4.2" },
                    { name: "TypeScript", ver: "5.9" },
                  ].map((tech) => (
                    <div key={tech.name} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{tech.name}</p>
                      <p className="text-[10px] text-zinc-400">v{tech.ver}</p>
                    </div>
                  ))}
                </div>
              </SettingsCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          checked ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-700"
        )}
      >
        <div className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )} />
      </button>
    </div>
  );
}

// Icons
function AccountIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
function BellIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
}
function PaletteIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>;
}
function DatabaseIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>;
}
function InfoIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
}
