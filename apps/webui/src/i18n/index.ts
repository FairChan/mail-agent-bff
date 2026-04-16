import { resolveLocale, type SupportedLocale } from "./config.js";

export type LocaleMessages = Record<string, string>;

// Strict i18n key union type derived from locale files
export type I18nKey =
  | "app.name"
  | "nav.inbox" | "nav.stats" | "nav.calendar" | "nav.settings"
  | "auth.login" | "auth.register" | "auth.email" | "auth.password" | "auth.confirmPassword"
  | "auth.verificationCode" | "auth.sendCode" | "auth.submit" | "auth.username" | "auth.forgotPassword"
  | "auth.noAccount" | "auth.hasAccount" | "auth.loginHere" | "auth.registerHere"
  | "auth.passwordMismatch" | "auth.passwordMatch" | "auth.invalidEmail" | "auth.invalidPassword"
  | "auth.remember" | "auth.brand" | "auth.titleLogin" | "auth.titleRegister"
  | "auth.subtitleLogin" | "auth.subtitleRegister" | "auth.submitLogin" | "auth.submitRegister"
  | "auth.switchToLogin" | "auth.switchToRegister" | "auth.registerHint" | "auth.loginHint"
  | "auth.verifyStepTitle" | "auth.verifyStepSubtitle" | "auth.verifyCodeLabel"
  | "auth.verifyCodePlaceholder" | "auth.submitVerify" | "auth.resendCode" | "auth.codeSentTo"
  | "auth.backToForm" | "auth.sending" | "auth.verifying" | "auth.working"
  | "error.network" | "error.sessionExpired" | "error.serverError" | "error.invalidCredentials" | "error.rateLimit"
  | "inbox.title" | "inbox.empty" | "inbox.loading" | "inbox.error" | "inbox.retry"
  | "inbox.markRead" | "inbox.markUnread" | "inbox.delete" | "inbox.archive" | "inbox.reply" | "inbox.forward"
  | "inbox.today" | "inbox.yesterday" | "inbox.thisWeek" | "inbox.thisMonth" | "inbox.older"
  | "inbox.quadrant.urgent" | "inbox.quadrant.important" | "inbox.quadrant.normal" | "inbox.quadrant.other"
  | "inbox.quadrant.total"
  | "stats.title" | "stats.totalEmails" | "stats.unread" | "stats.thisWeek" | "stats.thisMonth"
  | "stats.aiSummary" | "stats.avgResponse" | "stats.classification" | "stats.classificationDesc"
  | "stats.topSenders" | "stats.noStatsSample" | "stats.metrics" | "stats.totalMail"
  | "stats.unreadMail" | "stats.upcomingItems" | "stats.tomorrowDdl"
  | "calendar.title" | "calendar.today" | "calendar.upcoming" | "calendar.noEvents" | "calendar.sync"
  | "calendar.createEvent" | "calendar.items" | "calendar.itemsCount" | "calendar.noSyncableItems" | "calendar.desc"
  | "settings.title" | "settings.account" | "settings.notifications" | "settings.dailyDigest"
  | "settings.timeZone" | "settings.language" | "settings.dataSources" | "settings.addSource"
  | "settings.deleteSource" | "settings.sourceLabel" | "settings.mailboxUserId" | "settings.connectedAccountId"
  | "settings.cancel" | "settings.confirm" | "settings.save" | "settings.delete"
  | "settings.connected" | "settings.disconnected" | "settings.connecting"
  | "settings.outlookAuth" | "settings.outlookAuthDesc" | "settings.loginOutlook" | "settings.authorizing"
  | "settings.autoAddAccount" | "settings.refreshSnapshot" | "settings.mailDataSource"
  | "settings.manualAddSource" | "settings.manualAddDesc" | "settings.sourceLabelPlaceholder"
  | "settings.mailboxUserIdPlaceholder" | "settings.composioAccountIdPlaceholder"
  | "settings.createAndVerify" | "settings.processing" | "settings.setActive"
  | "settings.verify" | "settings.ready" | "settings.pending" | "settings.active"
  | "common.mailbox" | "common.account" | "common.selectLanguage" | "common.mainNavigation"
  | "common.showShortcuts" | "common.shortcuts" | "common.closeSidebar" | "common.emailsCount"
  | "common.unknownTime" | "common.unknownSender" | "common.writing" | "common.addToCalendar"
  | "common.processing" | "common.undo" | "common.retrySessionCheck"
  | "common.dataSourceConfirmDelete" | "common.dataSourceDeleted" | "common.dataSourceSwitched"
  | "common.dataSourceVerified" | "common.dataSourceNotReady" | "common.sourceSnapshotRefreshed"
  | "common.noDataSourceAvailable" | "common.dataSourceNotVerified" | "common.dataSourceFailFastFailed"
  | "common.dataSourceRollbackSuccess" | "common.dataSourceCreatedAndVerified"
  | "common.autoConnectExecuted" | "common.browserNoSupportPopup" | "common.authWindowOpened"
  | "common.composioAuthWindowOpened" | "common.yourBrowserNoSupportBroadcastChannel"
  | "common.justNow" | "common.minutesAgo" | "common.hoursAgo" | "common.daysAgo"
  | "common.openAuthPage" | "common.fillCompleteDataSourceInfo"
  | "common.allMail" | "common.searchPlaceholder";

// Type guard for I18nKey
export function isI18nKey(key: string): key is I18nKey {
  const validKeys: readonly string[] = [
    "app.name",
    "nav.inbox", "nav.stats", "nav.calendar", "nav.settings",
    "auth.login", "auth.register", "auth.email", "auth.password", "auth.confirmPassword",
    "auth.verificationCode", "auth.sendCode", "auth.submit", "auth.username", "auth.forgotPassword",
    "auth.noAccount", "auth.hasAccount", "auth.loginHere", "auth.registerHere",
    "auth.passwordMismatch", "auth.passwordMatch", "auth.invalidEmail", "auth.invalidPassword",
    "auth.remember", "auth.brand", "auth.titleLogin", "auth.titleRegister",
    "auth.subtitleLogin", "auth.subtitleRegister", "auth.submitLogin", "auth.submitRegister",
    "auth.switchToLogin", "auth.switchToRegister", "auth.registerHint", "auth.loginHint",
    "auth.verifyStepTitle", "auth.verifyStepSubtitle", "auth.verifyCodeLabel",
    "auth.verifyCodePlaceholder", "auth.submitVerify", "auth.resendCode", "auth.codeSentTo",
    "auth.backToForm", "auth.sending", "auth.verifying", "auth.working",
    "error.network", "error.sessionExpired", "error.serverError", "error.invalidCredentials", "error.rateLimit",
    "inbox.title", "inbox.empty", "inbox.loading", "inbox.error", "inbox.retry",
    "inbox.markRead", "inbox.markUnread", "inbox.delete", "inbox.archive", "inbox.reply", "inbox.forward",
    "inbox.today", "inbox.yesterday", "inbox.thisWeek", "inbox.thisMonth", "inbox.older",
    "inbox.quadrant.urgent", "inbox.quadrant.important", "inbox.quadrant.normal", "inbox.quadrant.other",
    "inbox.quadrant.total",
    "stats.title", "stats.totalEmails", "stats.unread", "stats.thisWeek", "stats.thisMonth",
    "stats.aiSummary", "stats.avgResponse", "stats.classification", "stats.classificationDesc",
    "stats.topSenders", "stats.noStatsSample", "stats.metrics", "stats.totalMail",
    "stats.unreadMail", "stats.upcomingItems", "stats.tomorrowDdl",
    "calendar.title", "calendar.today", "calendar.upcoming", "calendar.noEvents", "calendar.sync",
    "calendar.createEvent", "calendar.items", "calendar.itemsCount", "calendar.noSyncableItems", "calendar.desc",
    "settings.title", "settings.account", "settings.notifications", "settings.dailyDigest",
    "settings.timeZone", "settings.language", "settings.dataSources", "settings.addSource",
    "settings.deleteSource", "settings.sourceLabel", "settings.mailboxUserId", "settings.connectedAccountId",
    "settings.cancel", "settings.confirm", "settings.save", "settings.delete",
    "settings.connected", "settings.disconnected", "settings.connecting",
    "settings.outlookAuth", "settings.outlookAuthDesc", "settings.loginOutlook", "settings.authorizing",
    "settings.autoAddAccount", "settings.refreshSnapshot", "settings.mailDataSource",
    "settings.manualAddSource", "settings.manualAddDesc", "settings.sourceLabelPlaceholder",
    "settings.mailboxUserIdPlaceholder", "settings.composioAccountIdPlaceholder",
    "settings.createAndVerify", "settings.processing", "settings.setActive",
    "settings.verify", "settings.ready", "settings.pending", "settings.active",
    "common.mailbox", "common.account", "common.selectLanguage", "common.mainNavigation",
    "common.showShortcuts", "common.shortcuts", "common.closeSidebar", "common.emailsCount",
    "common.unknownTime", "common.unknownSender", "common.writing", "common.addToCalendar",
    "common.processing", "common.undo", "common.retrySessionCheck",
    "common.dataSourceConfirmDelete", "common.dataSourceDeleted", "common.dataSourceSwitched",
    "common.dataSourceVerified", "common.dataSourceNotReady", "common.sourceSnapshotRefreshed",
    "common.noDataSourceAvailable", "common.dataSourceNotVerified", "common.dataSourceFailFastFailed",
    "common.dataSourceRollbackSuccess", "common.dataSourceCreatedAndVerified",
    "common.autoConnectExecuted", "common.browserNoSupportPopup", "common.authWindowOpened",
    "common.composioAuthWindowOpened", "common.yourBrowserNoSupportBroadcastChannel",
    "common.justNow", "common.minutesAgo", "common.hoursAgo", "common.daysAgo",
    "common.openAuthPage", "common.fillCompleteDataSourceInfo",
    "common.allMail", "common.searchPlaceholder",
  ];
  return validKeys.includes(key);
}

const messageCache = new Map<string, LocaleMessages>();

export async function loadMessages(locale: SupportedLocale): Promise<LocaleMessages> {
  if (messageCache.has(locale)) {
    return messageCache.get(locale)!;
  }
  
  try {
    const messages = await import(`./locales/${locale}.json`);
    messageCache.set(locale, messages.default);
    return messages.default;
  } catch {
    // Fallback to empty messages
    return {};
  }
}

// Strictly typed t function that accepts only valid I18nKey
export function t(key: I18nKey, messages: LocaleMessages, fallback?: string): string;
export function t(key: string, messages: LocaleMessages, fallback?: string): string {
  return messages[key] ?? fallback ?? key;
}

// Re-export config
export { resolveLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_LABELS } from "./config.js";
export type { SupportedLocale } from "./config.js";