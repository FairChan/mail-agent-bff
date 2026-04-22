import React, { useEffect, useMemo, useRef, useState } from "react";
import type { MailProviderDescriptor, MailSourceProvider, ViewKey } from "@mail-agent/shared-types";
import { useApp } from "../../contexts/AppContext";
import { useAuth } from "../../contexts/AuthContext";
import { useMail } from "../../contexts/MailContext";
import { cn } from "../../lib/utils";
import { CalmButton, CalmPill, CalmSurface } from "../ui/Calm";
import { formatImapConnectionError, formatOauthConnectionError } from "../../utils/mailConnectionFeedback";

interface SidebarProps {
  onClose?: () => void;
}

const EXPANDED_WIDTH = 224;
const COLLAPSED_WIDTH = 64;
type SidebarImapProvider = Extract<
  MailSourceProvider,
  "gmail" | "icloud" | "netease163" | "qq" | "aliyun" | "custom_imap"
>;

const FALLBACK_IMAP_PROVIDERS: Array<{
  id: SidebarImapProvider;
  label: string;
  imap?: MailProviderDescriptor["imap"];
  notes: string[];
}> = [
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    imap: { host: "imap.gmail.com", port: 993, secure: true, usernameHint: "email" },
    notes: ["Gmail 推荐优先走上面的 Google 直连；这里保留应用专用密码 IMAP 兜底路径。"],
  },
  {
    id: "icloud",
    label: "Apple iCloud Mail",
    imap: { host: "imap.mail.me.com", port: 993, secure: true, usernameHint: "email" },
    notes: ["需要 Apple 应用专用密码。"],
  },
  {
    id: "netease163",
    label: "网易 163 邮箱",
    imap: { host: "imap.163.com", port: 993, secure: true, usernameHint: "email" },
    notes: ["请先在 163 邮箱中开启 IMAP，并生成客户端授权码。"],
  },
  {
    id: "qq",
    label: "QQ 邮箱",
    imap: { host: "imap.qq.com", port: 993, secure: true, usernameHint: "email" },
    notes: ["请先在 QQ 邮箱中开启 IMAP，并生成授权码。"],
  },
  {
    id: "aliyun",
    label: "阿里邮箱",
    imap: { host: "imap.aliyun.com", port: 993, secure: true, usernameHint: "email" },
    notes: ["个人版一般使用 imap.aliyun.com；企业版可根据实际域名覆盖 Host。"],
  },
  {
    id: "custom_imap",
    label: "Custom IMAP",
    notes: ["适合学校邮箱和企业邮箱，请填写实际的 IMAP Host 与端口。"],
  },
];

function AccountActionModal({
  open,
  busy,
  gmailBusy,
  imapBusy,
  error,
  info,
  imapProviders,
  selectedImapProvider,
  imapProvider,
  imapLabel,
  imapEmail,
  imapUsername,
  imapPassword,
  imapHost,
  imapPort,
  onClose,
  onOutlookLogin,
  onGmailLogin,
  onImapProviderChange,
  onImapLabelChange,
  onImapEmailChange,
  onImapUsernameChange,
  onImapPasswordChange,
  onImapHostChange,
  onImapPortChange,
  onImapConnect,
}: {
  open: boolean;
  busy: boolean;
  gmailBusy: boolean;
  imapBusy: boolean;
  error: string | null;
  info: string | null;
  imapProviders: Array<{
    id: SidebarImapProvider;
    label: string;
    imap?: MailProviderDescriptor["imap"];
    notes: string[];
  }>;
  selectedImapProvider: {
    id: SidebarImapProvider;
    label: string;
    imap?: MailProviderDescriptor["imap"];
    notes: string[];
  } | null;
  imapProvider: SidebarImapProvider;
  imapLabel: string;
  imapEmail: string;
  imapUsername: string;
  imapPassword: string;
  imapHost: string;
  imapPort: string;
  onClose: () => void;
  onOutlookLogin: () => void;
  onGmailLogin: () => void;
  onImapProviderChange: (provider: SidebarImapProvider) => void;
  onImapLabelChange: (value: string) => void;
  onImapEmailChange: (value: string) => void;
  onImapUsernameChange: (value: string) => void;
  onImapPasswordChange: (value: string) => void;
  onImapHostChange: (value: string) => void;
  onImapPortChange: (value: string) => void;
  onImapConnect: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1
      );

    const frame = window.requestAnimationFrame(() => {
      getFocusableElements()[0]?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <CalmSurface
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-mail-dialog-title"
        className="relative z-10 mx-4 max-h-[88vh] w-full max-w-2xl overflow-y-auto p-6 sm:p-7"
        beam
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="connect-mail-dialog-title" className="text-lg font-semibold text-[color:var(--ink)]">连接邮箱</p>
            <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
              把 Outlook、Gmail 和 IMAP 邮箱都放进一个入口里。连接成功后，侧边栏会立即刷新；如果失败，会把原因直接返回给你。
            </p>
          </div>
          <CalmButton type="button" onClick={onClose} variant="ghost" className="h-10 w-10 rounded-2xl p-0" aria-label="关闭连接邮箱弹窗">
            <CloseIcon />
          </CalmButton>
        </div>

        <div className="mt-5 space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">OAuth 直连</p>
              <p className="text-[11px] text-[color:var(--ink-subtle)]">授权完成后自动刷新邮箱源</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={onOutlookLogin}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-[1.2rem] border border-[color:var(--border-info)] bg-[color:var(--surface-info)] p-4 text-left transition hover:translate-y-[-1px] hover:shadow-[var(--shadow-soft)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <MailIcon active />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Microsoft Outlook</p>
                  <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
                    跳转微软官方登录页，授权回调会自动写回当前会话。
                  </p>
                </div>
                <CalmPill tone="info">{busy ? "连接中" : "直连"}</CalmPill>
              </button>

              <button
                type="button"
                onClick={onGmailLogin}
                disabled={gmailBusy}
                className="flex w-full items-center gap-3 rounded-[1.2rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-muted)] p-4 text-left transition hover:translate-y-[-1px] hover:shadow-[var(--shadow-soft)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500 text-white">
                  <MailIcon active />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Google Gmail</p>
                  <p className="mt-1 text-xs text-[color:var(--ink-subtle)]">
                    跳转 Google 官方登录页，授权完成后直接返回当前工作台。
                  </p>
                </div>
                <CalmPill tone="muted">{gmailBusy ? "连接中" : "直连"}</CalmPill>
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">IMAP 授权码接入</p>
              <p className="text-[11px] text-[color:var(--ink-subtle)]">适合 iCloud、163、QQ、阿里邮箱和学校邮箱</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                <span>邮箱类型</span>
                <select
                  value={imapProvider}
                  onChange={(event) => onImapProviderChange(event.target.value as SidebarImapProvider)}
                  className="calm-input h-11"
                >
                  {imapProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                <span>显示名称</span>
                <input
                  type="text"
                  value={imapLabel}
                  onChange={(event) => onImapLabelChange(event.target.value)}
                  placeholder={selectedImapProvider ? `${selectedImapProvider.label} name@example.com` : "Mail source label"}
                  className="calm-input h-11"
                />
              </label>

              <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                <span>邮箱地址</span>
                <input
                  type="email"
                  value={imapEmail}
                  onChange={(event) => onImapEmailChange(event.target.value)}
                  placeholder="name@example.com"
                  className="calm-input h-11"
                />
              </label>

              <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                <span>用户名</span>
                <input
                  type="text"
                  value={imapUsername}
                  onChange={(event) => onImapUsernameChange(event.target.value)}
                  placeholder="默认使用邮箱地址"
                  className="calm-input h-11"
                />
              </label>

              <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                <span>授权码 / 应用专用密码</span>
                <input
                  type="password"
                  value={imapPassword}
                  onChange={(event) => onImapPasswordChange(event.target.value)}
                  placeholder="仅本地加密保存，不会发送给大模型"
                  className="calm-input h-11"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_7rem]">
                <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                  <span>IMAP Host</span>
                  <input
                    type="text"
                    value={imapHost}
                    onChange={(event) => onImapHostChange(event.target.value)}
                    placeholder="imap.example.com"
                    className="calm-input h-11"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[color:var(--ink-muted)]">
                  <span>Port</span>
                  <input
                    type="number"
                    value={imapPort}
                    onChange={(event) => onImapPortChange(event.target.value)}
                    placeholder="993"
                    className="calm-input h-11"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[1.15rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--ink-muted)] shadow-[var(--shadow-inset)]">
              <div className="grid gap-1">
                <span>当前版本强制使用 TLS/SSL 加密连接</span>
                <span className="text-xs text-[color:var(--ink-subtle)]">
                  为了避免授权码经由明文 IMAP 传输，这里固定走加密链路。
                </span>
              </div>
              <span className="rounded-full border border-emerald-400/35 bg-emerald-500/12 px-3 py-1 text-xs font-medium text-emerald-200">
                TLS
              </span>
            </div>

            {selectedImapProvider?.notes.length ? (
              <div className="rounded-[1.15rem] border border-[color:var(--border-soft)] bg-[color:var(--surface-soft)] px-4 py-3 text-xs text-[color:var(--ink-subtle)] shadow-[var(--shadow-inset)]">
                {selectedImapProvider.notes[0]}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <CalmButton
                type="button"
                onClick={onImapConnect}
                disabled={imapBusy || !imapEmail.trim() || !imapPassword.trim()}
                variant="primary"
                className="h-11"
              >
                <MailIcon active />
                {imapBusy ? "连接中" : "连接 IMAP 邮箱"}
              </CalmButton>
              <p className="text-xs text-[color:var(--ink-subtle)]">
                连接成功后，这个邮箱会立刻出现在侧边栏里。
              </p>
            </div>
          </section>
        </div>

        {info ? (
          <p className="mt-4 rounded-[1.1rem] border border-[color:var(--border-success)] bg-[color:var(--surface-success)] px-4 py-3 text-xs text-[color:var(--pill-success-ink)]">
            {info}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-[1.1rem] border border-[color:var(--border-urgent)] bg-[color:var(--surface-urgent)] px-4 py-3 text-xs text-[color:var(--pill-urgent-ink)]">
            {error}
          </p>
        ) : null}
      </CalmSurface>
    </div>
  );
}

export function Sidebar({ onClose }: SidebarProps) {
  const {
    setCurrentView,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    isMobile,
  } = useApp();
  const { user, logout } = useAuth();
  const {
    activeSourceId,
    sources,
    providers,
    selectSource,
    fetchSources,
    connectImapSource,
    launchOutlookAuth,
    launchGmailAuth,
  } = useMail();

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectGmailBusy, setConnectGmailBusy] = useState(false);
  const [connectImapBusy, setConnectImapBusy] = useState(false);
  const [connectInfo, setConnectInfo] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [imapProvider, setImapProvider] = useState<SidebarImapProvider>("gmail");
  const [imapLabel, setImapLabel] = useState("");
  const [imapEmail, setImapEmail] = useState("");
  const [imapUsername, setImapUsername] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("");

  const activeSource = useMemo(
    () => sources.find((source) => source.id === activeSourceId) ?? null,
    [activeSourceId, sources]
  );
  const imapProviders = useMemo(() => {
    const available = providers.filter(
      (provider) => provider.connectionTypes.includes("imap_password") && provider.id !== "outlook"
    ) as Array<MailProviderDescriptor & { id: SidebarImapProvider }>;

    if (available.length > 0) {
      return available.map((provider) => ({
        id: provider.id,
        label: provider.label,
        imap: provider.imap,
        notes: provider.notes,
      }));
    }

    return FALLBACK_IMAP_PROVIDERS;
  }, [providers]);
  const selectedImapProvider = useMemo(
    () => imapProviders.find((provider) => provider.id === imapProvider) ?? imapProviders[0] ?? null,
    [imapProvider, imapProviders]
  );

  const collapsed = !isMobile && sidebarCollapsed;
  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
  const currentSourceLabel = activeSource?.name || activeSource?.emailHint || "未连接邮箱";

  useEffect(() => {
    if (!selectedImapProvider) {
      return;
    }

    if (!imapProviders.some((provider) => provider.id === imapProvider)) {
      setImapProvider(selectedImapProvider.id);
    }

    if (!imapHost.trim()) {
      setImapHost(selectedImapProvider.imap?.host ?? "");
      setImapPort(selectedImapProvider.imap?.port ? String(selectedImapProvider.imap.port) : "");
    }
  }, [imapHost, imapProvider, imapProviders, selectedImapProvider]);

  const applyImapProviderDefaults = (providerId: SidebarImapProvider) => {
    const descriptor = imapProviders.find((provider) => provider.id === providerId);
    setImapProvider(providerId);
    setImapHost(descriptor?.imap?.host ?? "");
    setImapPort(descriptor?.imap?.port ? String(descriptor.imap.port) : "");
  };

  const handleViewChange = (view: ViewKey) => {
    setCurrentView(view);
    onClose?.();
  };

  const handleSourceSwitch = async (sourceId: string) => {
    if (sourceId === activeSourceId) {
      return;
    }
    await selectSource(sourceId);
    onClose?.();
  };

  const handleLogout = async () => {
    if (confirm("确定要退出登录吗？")) {
      await logout();
    }
  };

  const handleOutlookLogin = async () => {
    setConnectBusy(true);
    setConnectError(null);
    setConnectInfo(null);
    try {
      const result = await launchOutlookAuth(false);
      await fetchSources();
      setConnectInfo(result.message || "Outlook 已连接，新的邮箱源已经同步回侧边栏。");
    } catch (error) {
      setConnectError(formatOauthConnectionError("outlook", error));
    } finally {
      setConnectBusy(false);
    }
  };

  const handleGmailLogin = async () => {
    setConnectGmailBusy(true);
    setConnectError(null);
    setConnectInfo(null);
    try {
      const result = await launchGmailAuth();
      await fetchSources();
      setConnectInfo(result.message || "Gmail 已连接，新的邮箱源已经同步回侧边栏。");
    } catch (error) {
      setConnectError(formatOauthConnectionError("gmail", error));
    } finally {
      setConnectGmailBusy(false);
    }
  };

  const handleImapConnect = async () => {
    if (!imapEmail.trim()) {
      setConnectError("请输入邮箱地址。");
      return;
    }
    if (!imapPassword.trim()) {
      setConnectError("请输入授权码或应用专用密码。");
      return;
    }

    setConnectImapBusy(true);
    setConnectError(null);
    setConnectInfo(null);
    try {
      const connected = await connectImapSource({
        provider: imapProvider,
        label: imapLabel.trim() || undefined,
        email: imapEmail.trim(),
        username: imapUsername.trim() || imapEmail.trim(),
        appPassword: imapPassword.trim(),
        imapHost: imapHost.trim() || undefined,
        imapPort: imapPort.trim() ? Number(imapPort) : undefined,
        imapSecure: true,
      });
      await fetchSources();
      setConnectInfo(
        connected?.ready === false
          ? `${connected?.name ?? selectedImapProvider?.label ?? "邮箱"} 已创建，但仍需进一步验证。`
          : `${connected?.name ?? selectedImapProvider?.label ?? "邮箱"} 已连接，侧边栏已经同步刷新。`
      );
      setImapLabel("");
      setImapEmail("");
      setImapUsername("");
      setImapPassword("");
      applyImapProviderDefaults(imapProvider);
    } catch (error) {
      setConnectError(formatImapConnectionError(error));
    } finally {
      setConnectImapBusy(false);
    }
  };

  return (
    <>
      <aside
        className={cn(
          "relative z-20 flex h-full flex-col overflow-hidden border-r border-[color:var(--border-soft)] backdrop-blur-sm transition-[width,background-color] duration-150",
          collapsed
            ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(255,255,255,0.36))] dark:bg-[linear-gradient(180deg,rgba(22,28,38,0.9),rgba(18,24,34,0.82))]"
            : "bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(246,248,251,0.62))] dark:bg-[linear-gradient(180deg,rgba(22,28,38,0.94),rgba(18,24,34,0.88))]"
        )}
        style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        role="navigation"
        aria-label="导航菜单"
      >
        <div className={cn("flex h-16 items-center border-b border-[color:var(--border-soft)]", collapsed ? "justify-center px-0" : "justify-end px-3")}>
          {!isMobile ? (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[color:var(--ink-subtle)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]",
                collapsed ? "ml-0 mt-1" : ""
              )}
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
          ) : onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[color:var(--ink-subtle)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
              aria-label="关闭侧边栏"
            >
              <ChevronLeftIcon />
            </button>
          ) : null}
        </div>

        <div className={cn("border-b border-[color:var(--border-soft)] py-3", collapsed ? "px-1" : "px-2")}>
          {!collapsed ? (
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--ink-subtle)]">
                邮箱账户
              </span>
              <button
                type="button"
                onClick={() => {
                  setConnectError(null);
                  setConnectInfo(null);
                  setShowAccountModal(true);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-[color:var(--ink-subtle)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
                aria-label="添加邮箱账户"
              >
                <PlusIcon />
              </button>
            </div>
          ) : null}

          <div className={cn("space-y-0.5", collapsed ? "flex flex-col items-center" : "")}>
            {sources.map((source) => {
              const isActive = source.id === activeSourceId;
              const initials = getInitials(source.name || source.emailHint || source.id);
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => void handleSourceSwitch(source.id)}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all",
                    collapsed ? "justify-center" : "w-full",
                    isActive
                      ? "bg-[color:var(--surface-info)] text-[color:var(--pill-info-ink)] shadow-[var(--shadow-soft)]"
                      : "text-[color:var(--ink-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]"
                  )}
                  title={collapsed ? source.name || source.emailHint || source.id : undefined}
                  aria-label={isActive ? `当前邮箱源：${source.name || source.emailHint || source.id}` : `切换邮箱源：${source.name || source.emailHint || source.id}`}
                >
                  <div className={cn("relative flex shrink-0 items-center justify-center", collapsed ? "h-9 w-9" : "h-8 w-8")}>
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-xs font-bold text-white">
                      {initials}
                    </div>
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-zinc-950",
                        source.ready ? "bg-emerald-500" : "bg-amber-500"
                      )}
                    />
                  </div>

                  {!collapsed ? (
                    <div className="min-w-0 flex-1 text-left">
                      <p className={cn("truncate text-sm font-medium", isActive ? "text-[color:var(--pill-info-ink)]" : "text-[color:var(--ink)]")}>
                        {source.name || source.emailHint || source.id}
                      </p>
                      <p className="truncate text-[10px] text-[color:var(--ink-subtle)]">
                        {source.emailHint || source.id}
                      </p>
                    </div>
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setConnectError(null);
                setConnectInfo(null);
                setShowAccountModal(true);
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-xl py-2 text-[color:var(--ink-subtle)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]",
                collapsed ? "justify-center px-2" : "px-2"
              )}
              title={collapsed ? "连接邮箱" : undefined}
              aria-label="连接邮箱"
            >
              <div className={cn("flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[color:var(--border-info)] text-[color:var(--pill-info-ink)]", collapsed ? "h-9 w-9" : "h-8 w-8")}>
                <PlusIcon />
              </div>
              {!collapsed ? <span className="text-sm">连接邮箱</span> : null}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1" />

        <div className={cn("border-t border-[color:var(--border-soft)] px-2 py-3", collapsed ? "space-y-2" : "space-y-3")}>
          {!collapsed ? (
            <div className="calm-panel px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-subtle)]">当前邮箱</p>
              <p className="mt-1 truncate text-sm font-semibold text-[color:var(--ink)]">{currentSourceLabel}</p>
              <p className="mt-1 truncate text-[11px] text-[color:var(--ink-subtle)]">{user?.displayName || user?.email || "未登录"}</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => handleViewChange("settings")}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-2 py-2 text-[color:var(--ink-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]",
              collapsed ? "justify-center" : "w-full"
            )}
            title={collapsed ? "账户中心" : undefined}
            aria-label="账户中心"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <SettingsIcon active={false} />
            </div>
            {!collapsed ? <span className="text-sm font-medium">账户中心</span> : null}
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-2 py-2 text-[color:var(--pill-urgent-ink)] transition hover:bg-[color:var(--surface-urgent)]",
              collapsed ? "justify-center" : "w-full"
            )}
            title={collapsed ? "退出登录" : undefined}
            aria-label="退出登录"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <LogoutIcon />
            </div>
            {!collapsed ? <span className="text-sm font-medium">退出登录</span> : null}
          </button>
        </div>
      </aside>

      <AccountActionModal
        open={showAccountModal}
        busy={connectBusy}
        gmailBusy={connectGmailBusy}
        imapBusy={connectImapBusy}
        error={connectError}
        info={connectInfo}
        imapProviders={imapProviders}
        selectedImapProvider={selectedImapProvider}
        imapProvider={imapProvider}
        imapLabel={imapLabel}
        imapEmail={imapEmail}
        imapUsername={imapUsername}
        imapPassword={imapPassword}
        imapHost={imapHost}
        imapPort={imapPort}
        onClose={() => setShowAccountModal(false)}
        onOutlookLogin={() => void handleOutlookLogin()}
        onGmailLogin={() => void handleGmailLogin()}
        onImapProviderChange={applyImapProviderDefaults}
        onImapLabelChange={setImapLabel}
        onImapEmailChange={setImapEmail}
        onImapUsernameChange={setImapUsername}
        onImapPasswordChange={setImapPassword}
        onImapHostChange={setImapHost}
        onImapPortChange={setImapPort}
        onImapConnect={() => void handleImapConnect()}
      />
    </>
  );
}

function getInitials(value: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    return "ME";
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length > 1) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function InboxIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v12H4z" />
      <path d="M4 13h4l2 3h4l2-3h4" />
    </svg>
  );
}

function MailIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m21 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L3 7" />
    </svg>
  );
}

function AgentIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4" />
      <path d="M7 8h10a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-4Z" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
      <path d="M9 18c.8.64 1.8 1 3 1s2.2-.36 3-1" />
    </svg>
  );
}

function KnowledgeIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v2.5" />
      <path d="m4.93 4.93 1.77 1.77" />
      <path d="M2 12h2.5" />
      <path d="m4.93 19.07 1.77-1.77" />
      <path d="M12 19.5V22" />
      <path d="m17.3 17.3 1.77 1.77" />
      <path d="M19.5 12H22" />
      <path d="m17.3 6.7 1.77-1.77" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function GuideIcon({ active }: { active: boolean }) {
  return (
    <svg className={cn("h-5 w-5", active ? "text-current" : "text-current")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M12 4h9" />
      <path d="M4 9h16" />
      <path d="M4 15h8" />
      <path d="M4 4h2" />
      <path d="M4 20h2" />
    </svg>
  );
}
