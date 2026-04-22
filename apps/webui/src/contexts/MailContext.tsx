/**
 * 邮件上下文
 * 提供全局邮件状态管理
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from "react";
import type {
  MailSourceProfile,
  MailSourceProvider,
  MailProviderDescriptor,
  MailTriageResult,
  MailInsightsResult,
  MailInboxViewerResponse,
  MailPriorityRule,
  NotificationPreferences,
  MailNotificationPreferencesResult,
  MailNotificationPollResult,
  MailCalendarDraft,
  TriageMailItem,
  KnowledgeBaseStats,
  MailKnowledgeRecord,
  EventCluster,
  PersonProfile,
  MailProcessingRunResult,
  MailPersonalizationFeedbackInput,
  MailPersonalizationLearningResult,
  MailPersonalizationTargetType,
  MailQuadrant,
} from "@mail-agent/shared-types";
import { useAuth } from "./AuthContext";
import { getApiErrorMessage, readApiPayload } from "../utils/http";

// ========== 类型定义 ==========

interface MailState {
  // 邮件源
  sources: MailSourceProfile[];
  activeSourceId: string | null;
  isLoadingSources: boolean;
  providers: MailProviderDescriptor[];

  // 邮件列表
  inbox: MailInboxViewerResponse | null;
  triage: MailTriageResult | null;
  insights: MailInsightsResult | null;
  isLoadingMail: boolean;

  // 邮件详情
  selectedMail: TriageMailItem | null;
  isLoadingDetail: boolean;
  mailBodyCache: Map<string, string>;

  // 优先级规则
  priorityRules: MailPriorityRule[];

  // 通知偏好
  notificationPrefs: NotificationPreferences | null;
  notificationSnapshot: MailNotificationPollResult | null;
  isPollingNotifications: boolean;
  notificationStreamStatus: "idle" | "connecting" | "connected" | "error";
  notificationStreamError: string | null;

  // 新邮件处理
  processingResult: MailProcessingRunResult | null;
  isProcessingMail: boolean;

  // 知识库
  kbStats: KnowledgeBaseStats | null;
  kbMails: MailKnowledgeRecord[];
  kbMailsPage: {
    total: number;
    limit: number;
    offset: number;
  };
  kbEvents: EventCluster[];
  kbPersons: PersonProfile[];

  // 错误状态
  error: string | null;
}

function mailBodyCacheKey(sourceId: string | null | undefined, messageId: string): string {
  return `${sourceId ?? "no-source"}::${messageId}`;
}

type MailAction =
  | { type: "SET_SOURCES"; payload: { sources: MailSourceProfile[]; activeSourceId: string | null } }
  | { type: "SET_PROVIDERS"; payload: MailProviderDescriptor[] }
  | { type: "SET_ACTIVE_SOURCE"; payload: string | null }
  | { type: "SET_LOADING_SOURCES"; payload: boolean }
  | { type: "SET_INBOX"; payload: MailInboxViewerResponse }
  | { type: "SET_TRIAGE"; payload: MailTriageResult }
  | { type: "SET_INSIGHTS"; payload: MailInsightsResult }
  | { type: "SET_SELECTED_MAIL"; payload: TriageMailItem | null }
  | { type: "SET_LOADING_MAIL"; payload: boolean }
  | { type: "SET_LOADING_DETAIL"; payload: boolean }
  | { type: "SET_PRIORITY_RULES"; payload: MailPriorityRule[] }
  | { type: "SET_NOTIFICATION_PREFS"; payload: NotificationPreferences }
  | { type: "SET_NOTIFICATION_SNAPSHOT"; payload: MailNotificationPollResult | null }
  | { type: "SET_POLLING_NOTIFICATIONS"; payload: boolean }
  | { type: "SET_NOTIFICATION_STREAM_STATUS"; payload: MailState["notificationStreamStatus"] }
  | { type: "SET_NOTIFICATION_STREAM_ERROR"; payload: string | null }
  | { type: "SET_PROCESSING_RESULT"; payload: MailProcessingRunResult | null }
  | { type: "SET_PROCESSING_MAIL"; payload: boolean }
  | { type: "SET_KB_STATS"; payload: KnowledgeBaseStats }
  | { type: "SET_KB_MAILS"; payload: { mails: MailKnowledgeRecord[]; total?: number; limit?: number; offset?: number } }
  | { type: "SET_KB_EVENTS"; payload: EventCluster[] }
  | { type: "SET_KB_PERSONS"; payload: PersonProfile[] }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_MAIL_BODY_CACHE"; payload: { messageId: string; bodyContent: string } }
  | { type: "RESET" };

const initialState: MailState = {
  sources: [],
  activeSourceId: null,
  isLoadingSources: false,
  providers: [],
  inbox: null,
  triage: null,
  insights: null,
  isLoadingMail: false,
  selectedMail: null,
  isLoadingDetail: false,
  mailBodyCache: new Map(),
  priorityRules: [],
  notificationPrefs: null,
  notificationSnapshot: null,
  isPollingNotifications: false,
  notificationStreamStatus: "idle",
  notificationStreamError: null,
  processingResult: null,
  isProcessingMail: false,
  kbStats: null,
  kbMails: [],
  kbMailsPage: {
    total: 0,
    limit: 20,
    offset: 0,
  },
  kbEvents: [],
  kbPersons: [],
  error: null,
};

function mailReducer(state: MailState, action: MailAction): MailState {
  switch (action.type) {
    case "SET_SOURCES":
      return {
        ...state,
        sources: action.payload.sources,
        activeSourceId: action.payload.activeSourceId,
        isLoadingSources: false,
        ...(state.activeSourceId !== action.payload.activeSourceId
          ? {
              mailBodyCache: new Map(),
              inbox: null,
              triage: null,
              insights: null,
              selectedMail: null,
              isLoadingMail: false,
              isLoadingDetail: false,
              isProcessingMail: false,
              notificationPrefs: null,
              notificationSnapshot: null,
              notificationStreamStatus: "idle",
              notificationStreamError: null,
              processingResult: null,
              kbStats: null,
              kbMails: [],
              kbMailsPage: initialState.kbMailsPage,
              kbEvents: [],
              kbPersons: [],
              error: null,
            }
          : {}),
      };
    case "SET_ACTIVE_SOURCE":
      return {
        ...state,
        activeSourceId: action.payload,
        mailBodyCache: new Map(),
        inbox: null,
        triage: null,
        insights: null,
        selectedMail: null,
        isLoadingMail: false,
        isLoadingDetail: false,
        isProcessingMail: false,
        notificationPrefs: null,
        notificationSnapshot: null,
        notificationStreamStatus: "idle",
        notificationStreamError: null,
        processingResult: null,
        kbStats: null,
        kbMails: [],
        kbMailsPage: initialState.kbMailsPage,
        kbEvents: [],
        kbPersons: [],
        error: null,
      };
    case "SET_PROVIDERS":
      return { ...state, providers: action.payload };
    case "SET_LOADING_SOURCES":
      return { ...state, isLoadingSources: action.payload };
    case "SET_INBOX":
      return { ...state, inbox: action.payload, isLoadingMail: false };
    case "SET_TRIAGE":
      return { ...state, triage: action.payload, isLoadingMail: false };
    case "SET_INSIGHTS":
      return { ...state, insights: action.payload, isLoadingMail: false };
    case "SET_SELECTED_MAIL":
      return { ...state, selectedMail: action.payload, isLoadingDetail: false };
    case "SET_LOADING_MAIL":
      return { ...state, isLoadingMail: action.payload, ...(action.payload ? { error: null } : {}) };
    case "SET_LOADING_DETAIL":
      return { ...state, isLoadingDetail: action.payload };
    case "SET_PRIORITY_RULES":
      return { ...state, priorityRules: action.payload };
    case "SET_NOTIFICATION_PREFS":
      return { ...state, notificationPrefs: action.payload };
    case "SET_NOTIFICATION_SNAPSHOT":
      return {
        ...state,
        notificationSnapshot: action.payload,
        notificationPrefs: action.payload?.preferences ?? state.notificationPrefs,
        isPollingNotifications: false,
      };
    case "SET_POLLING_NOTIFICATIONS":
      return { ...state, isPollingNotifications: action.payload };
    case "SET_NOTIFICATION_STREAM_STATUS":
      return { ...state, notificationStreamStatus: action.payload };
    case "SET_NOTIFICATION_STREAM_ERROR":
      return { ...state, notificationStreamError: action.payload };
    case "SET_PROCESSING_RESULT":
      return { ...state, processingResult: action.payload, isProcessingMail: false };
    case "SET_PROCESSING_MAIL":
      return {
        ...state,
        isProcessingMail: action.payload,
        ...(action.payload ? { processingResult: null } : {}),
      };
    case "SET_KB_STATS":
      return { ...state, kbStats: action.payload };
    case "SET_KB_MAILS":
      return {
        ...state,
        kbMails: action.payload.mails,
        kbMailsPage: {
          total: action.payload.total ?? action.payload.mails.length,
          limit: action.payload.limit ?? state.kbMailsPage.limit,
          offset: action.payload.offset ?? state.kbMailsPage.offset,
        },
      };
    case "SET_KB_EVENTS":
      return { ...state, kbEvents: action.payload };
    case "SET_KB_PERSONS":
      return { ...state, kbPersons: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_MAIL_BODY_CACHE": {
      const newCache = new Map(state.mailBodyCache);
      newCache.set(action.payload.messageId, action.payload.bodyContent);
      return { ...state, mailBodyCache: newCache };
    }
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

interface MailContextValue extends MailState {
  // 邮件源操作
  fetchSources: () => Promise<void>;
  fetchProviders: () => Promise<void>;
  addSource: (label: string, mailboxUserId?: string, connectedAccountId?: string) => Promise<void>;
  connectImapSource: (input: {
    provider: Exclude<MailSourceProvider, "outlook">;
    label?: string;
    email: string;
    username?: string;
    appPassword: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
  }) => Promise<MailSourceProfile | null>;
  selectSource: (sourceId: string) => Promise<void>;
  deleteSource: (sourceId: string) => Promise<void>;
  verifySource: (sourceId: string) => Promise<boolean>;
  launchOutlookAuth: (forceReinitiate?: boolean) => Promise<OutlookLaunchResult>;
  launchGmailAuth: () => Promise<GmailLaunchResult>;

  // 邮件操作
  fetchInbox: (limit?: number) => Promise<void>;
  fetchTriage: (limit?: number) => Promise<void>;
  fetchInsights: (limit?: number, horizonDays?: number) => Promise<void>;
  fetchMailDetail: (messageId: string) => Promise<{ bodyContent?: string; bodyPreview?: string } | null>;
  syncToCalendar: (messageId: string, subject: string, type: string, dueAt: string) => Promise<void>;

  // 问答
  askMailQuestion: (question: string) => Promise<string>;

  // 优先级规则
  fetchPriorityRules: () => Promise<void>;
  addPriorityRule: (rule: Omit<MailPriorityRule, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updatePriorityRule: (rule: MailPriorityRule) => Promise<void>;
  deletePriorityRule: (ruleId: string) => Promise<void>;

  // 个性化反馈
  fetchPersonalizationLearning: () => Promise<MailPersonalizationLearningResult | null>;
  recordPersonalizationFeedback: (
    events: MailPersonalizationFeedbackInput[],
    options?: { silent?: boolean; sourceId?: string | null }
  ) => Promise<MailPersonalizationLearningResult | null>;
  savePersonalizationOverride: (input: {
    targetType: MailPersonalizationTargetType;
    targetId: string;
    quadrant: MailQuadrant | null;
    context?: MailPersonalizationFeedbackInput["context"];
  }) => Promise<MailPersonalizationLearningResult | null>;

  // 通知偏好
  fetchNotificationPrefs: () => Promise<void>;
  updateNotificationPrefs: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  pollNotifications: (
    limit?: number,
    horizonDays?: number,
    options?: { silent?: boolean }
  ) => Promise<MailNotificationPollResult | null>;

	  // 新邮件处理
	  runMailProcessing: (limit?: number, horizonDays?: number) => Promise<MailProcessingRunResult>;
	  saveKnowledgeCard: (messageId: string, tags?: string[]) => Promise<MailKnowledgeRecord | null>;
	  syncCalendarDrafts: (items: MailCalendarDraft[]) => Promise<{
    syncedIds: string[];
    failedIds: string[];
    syncedKeys: string[];
    failedKeys: string[];
    createdCount: number;
    deduplicatedCount: number;
    failedCount: number;
  }>;

  // 知识库
  fetchKbStats: () => Promise<void>;
  fetchKbMails: (options?: { limit?: number; offset?: number }) => Promise<void>;
  fetchKbEvents: () => Promise<void>;
  fetchKbPersons: () => Promise<void>;
  triggerSummarize: (options?: { windowDays?: number; limit?: number }) => Promise<string | null>;

  // 状态重置
  resetMailState: () => void;
  clearSelectedMail: () => void;
  setSelectedMail: (mail: TriageMailItem | null) => void;
  prefetchMailBodies: (messageIds: string[]) => void;
}

type OutlookLaunchResult = {
  status: string;
  ready: boolean;
  sourceId: string | null;
  activeSourceId: string | null;
  mailboxUserIdHint: string | null;
  message: string | null;
  account: {
    accountId: string;
    displayName: string;
    email: string;
    mailboxUserIdHint: string;
  } | null;
  source: MailSourceProfile | null;
  hasActiveConnection?: boolean;
  needsUserAction?: boolean;
  redirectUrl?: string | null;
  connectedAccountId?: string | null;
  sessionInstructions?: string | null;
};

type GmailLaunchResult = {
  status: string;
  ready: boolean;
  sourceId: string | null;
  activeSourceId: string | null;
  mailboxUserIdHint: string | null;
  message: string | null;
  account: {
    email: string;
    mailboxUserIdHint: string;
  } | null;
  source: MailSourceProfile | null;
};

type DirectAuthAttemptState = "pending" | "succeeded" | "failed" | "unknown";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const MailContext = createContext<MailContextValue | null>(null);

// ========== API 函数 ==========

const notificationFallbackProcessingIntervalMs = 45_000;
const notificationFallbackProcessingLimit = 20;
const notificationFallbackProcessingWindowDays = 2;

function calendarDraftKey(item: Pick<MailCalendarDraft, "messageId" | "type" | "dueAt">): string {
  return `${item.messageId}:${item.type}:${item.dueAt}`;
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  const data = await readApiPayload(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, response));
  }

  return data as T;
}

function extractNotificationPreferences(
  result: NotificationPreferences | MailNotificationPreferencesResult
): NotificationPreferences {
  if ("preferences" in result) {
    return result.preferences;
  }

  return result;
}

function parseJsonData<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// ========== Provider ==========

interface MailProviderProps {
  children: React.ReactNode;
  apiBase?: string;
}

export function MailProvider({ children, apiBase = "/api" }: MailProviderProps) {
  const [state, dispatch] = useReducer(mailReducer, initialState);
  const { isAuthenticated } = useAuth();
  const stateRef = useRef(state);
  const activeSourceIdRef = useRef<string | null>(state.activeSourceId);
  const sourcesRequestIdRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
    activeSourceIdRef.current = state.activeSourceId;
  }, [state]);

  // ========== 邮件源操作 ==========

  const fetchSources = useCallback(async () => {
    const requestId = sourcesRequestIdRef.current + 1;
    sourcesRequestIdRef.current = requestId;
    dispatch({ type: "SET_LOADING_SOURCES", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: { sources: MailSourceProfile[]; activeSourceId: string | null } }>(
        `${apiBase}/mail/sources`
      );
      if (requestId !== sourcesRequestIdRef.current) {
        return;
      }
      if (data.ok) {
        activeSourceIdRef.current = data.result.activeSourceId;
        dispatch({
          type: "SET_SOURCES",
          payload: { sources: data.result.sources, activeSourceId: data.result.activeSourceId },
        });
      }
    } catch (err) {
      if (requestId !== sourcesRequestIdRef.current) {
        return;
      }
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch sources" });
      dispatch({ type: "SET_LOADING_SOURCES", payload: false });
    }
  }, [apiBase]);

  const fetchProviders = useCallback(async () => {
    try {
      const data = await apiFetch<{ ok: boolean; result: { providers: MailProviderDescriptor[] } }>(
        `${apiBase}/mail/providers`
      );
      if (data.ok) {
        dispatch({ type: "SET_PROVIDERS", payload: data.result.providers });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch providers" });
    }
  }, [apiBase]);

  const addSource = useCallback(async (label: string, mailboxUserId?: string, connectedAccountId?: string) => {
    try {
      await apiFetch(`${apiBase}/mail/sources`, {
        method: "POST",
        body: JSON.stringify({
          label,
          connectionType: "composio",
          mailboxUserId,
          connectedAccountId,
          provider: "outlook",
        }),
      });
      await fetchSources();
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to add source" });
      throw err;
    }
  }, [apiBase, fetchSources]);

  const connectImapSource = useCallback(async (input: {
    provider: Exclude<MailSourceProvider, "outlook">;
    label?: string;
    email: string;
    username?: string;
    appPassword: string;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
  }) => {
    try {
      const data = await apiFetch<{
        ok: boolean;
        result: { source: MailSourceProfile; activeSourceId: string | null };
      }>(`${apiBase}/mail/connections/imap`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      await fetchSources();
      return data.result.source ?? null;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to connect IMAP source" });
      throw err;
    }
  }, [apiBase, fetchSources]);

  const selectSource = useCallback(async (sourceId: string) => {
    try {
      await apiFetch(`${apiBase}/mail/sources/select`, {
        method: "POST",
        body: JSON.stringify({ id: sourceId }),
      });
      activeSourceIdRef.current = sourceId;
      dispatch({ type: "SET_ACTIVE_SOURCE", payload: sourceId });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to select source" });
      throw err;
    }
  }, [apiBase]);

  const deleteSource = useCallback(async (sourceId: string) => {
    try {
      await apiFetch(`${apiBase}/mail/sources/delete`, {
        method: "POST",
        body: JSON.stringify({ id: sourceId }),
      });
      await fetchSources();
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to delete source" });
      throw err;
    }
  }, [apiBase, fetchSources]);

  const verifySource = useCallback(async (sourceId: string) => {
    try {
      const data = await apiFetch<{ ok: boolean; result: { ready: boolean } }>(
        `${apiBase}/mail/sources/verify`,
        { method: "POST", body: JSON.stringify({ sourceId }) }
      );
      return data.result?.ready ?? false;
    } catch {
      return false;
    }
  }, [apiBase]);

  const mergeConnectedSource = useCallback((payload: {
    source?: MailSourceProfile | null;
    sourceId?: string | null;
    activeSourceId?: string | null;
  }) => {
    if (!payload.source && !payload.sourceId && !payload.activeSourceId) {
      return;
    }

    const existing = stateRef.current.sources;
    const mergedSources = payload.source
      ? [
          payload.source,
          ...existing.filter((source) => source.id !== payload.source?.id),
        ]
      : existing;

    dispatch({
      type: "SET_SOURCES",
      payload: {
        sources: mergedSources,
        activeSourceId: payload.activeSourceId ?? payload.sourceId ?? stateRef.current.activeSourceId,
      },
    });
    void fetchSources();
  }, [fetchSources]);

  const pollDirectAuthStatus = useCallback(async <TPayload extends Record<string, unknown>>(
    provider: "outlook" | "gmail",
    attemptId: string
  ): Promise<{
    state: DirectAuthAttemptState;
    message: string | null;
    detail: string | null;
    payload: TPayload | null;
  } | null> => {
    const deadline = Date.now() + 20000;
    let lastObserved:
      | {
          state: DirectAuthAttemptState;
          message: string | null;
          detail: string | null;
          payload: TPayload | null;
        }
      | null = null;

    while (Date.now() < deadline) {
      try {
        const data = await apiFetch<{
          ok: boolean;
          result: {
            state: DirectAuthAttemptState;
            message?: string | null;
            detail?: string | null;
            payload?: TPayload | null;
          };
        }>(`${apiBase}/mail/connections/${provider}/direct/status?attemptId=${encodeURIComponent(attemptId)}`);
        const result = data.result;
        lastObserved = {
          state: result.state,
          message: result.message ?? null,
          detail: result.detail ?? null,
          payload: result.payload ?? null,
        };
        if (result.state === "succeeded" || result.state === "failed") {
          return lastObserved;
        }
      } catch (error) {
        if (error instanceof Error && (error.message.includes("Unauthorized") || error.message.includes("401"))) {
          throw error;
        }
      }

      await delay(450);
    }

    return lastObserved;
  }, [apiBase]);

  const resolveAllowedDirectAuthOrigins = useCallback(() => {
    if (typeof window === "undefined") {
      return new Set<string>();
    }

    const allowed = new Set<string>([window.location.origin]);
    const addOrigin = (value: string) => {
      try {
        const parsed = new URL(value, window.location.origin);
        allowed.add(parsed.origin);

        if (parsed.hostname === "127.0.0.1") {
          allowed.add(`${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ""}`);
        } else if (parsed.hostname === "localhost") {
          allowed.add(`${parsed.protocol}//127.0.0.1${parsed.port ? `:${parsed.port}` : ""}`);
        }
      } catch {
        // Ignore invalid origins.
      }
    };

    addOrigin(apiBase);
    return allowed;
  }, [apiBase]);

  const launchOutlookAuth = useCallback(async (_forceReinitiate = false): Promise<OutlookLaunchResult> => {
    if (typeof window === "undefined") {
      throw new Error("Microsoft Outlook 登录只能在浏览器环境中发起");
    }

    return await new Promise<OutlookLaunchResult>((resolve, reject) => {
      const attemptId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const popup = window.open(
        `${apiBase}/mail/connections/outlook/direct/start?appOrigin=${encodeURIComponent(window.location.origin)}&attemptId=${encodeURIComponent(attemptId)}`,
        "true-sight-outlook-direct-auth",
        "popup=yes,width=540,height=720,resizable=yes,scrollbars=yes"
      );

      if (!popup) {
        reject(new Error("浏览器拦截了 Microsoft 登录窗口，请允许弹窗后重试。"));
        return;
      }

      let settled = false;
      let closeRecoveryStarted = false;
      const timeout = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        try {
          popup.close();
        } catch {
          // Ignore close failures.
        }
        reject(new Error("Microsoft 登录超时，请重试。"));
      }, 180000);

      const poll = window.setInterval(() => {
        if (!settled && popup.closed) {
          if (closeRecoveryStarted) {
            return;
          }
          closeRecoveryStarted = true;
          window.clearInterval(poll);
          void recoverAfterPopupClosed();
        }
      }, 500);

      const cleanup = () => {
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        window.removeEventListener("message", onMessage);
      };

      const resolveSuccess = (payload: {
        status?: string;
        ready?: boolean;
        sourceId?: string | null;
        activeSourceId?: string | null;
        mailboxUserIdHint?: string | null;
        message?: string | null;
        account?: {
          accountId: string;
          displayName: string;
          email: string;
          mailboxUserIdHint: string;
        } | null;
        source?: MailSourceProfile | null;
      }) => {
        settled = true;
        cleanup();
        try {
          popup.close();
        } catch {
          // Ignore close failures.
        }

        mergeConnectedSource(payload);
        resolve({
          status: payload.status || "connected",
          ready: Boolean(payload.ready),
          sourceId: payload.sourceId ?? null,
          activeSourceId: payload.activeSourceId ?? null,
          mailboxUserIdHint: payload.mailboxUserIdHint ?? payload.account?.mailboxUserIdHint ?? null,
          message: payload.message ?? null,
          account: payload.account ?? null,
          source: payload.source ?? null,
        });
      };

      const resolveFailure = (
        payload: { detail?: string | null; message?: string | null; error?: string | null } | null | undefined,
        fallback: string
      ) => {
        settled = true;
        cleanup();
        try {
          popup.close();
        } catch {
          // Ignore close failures.
        }
        reject(new Error(payload?.detail || payload?.message || payload?.error || fallback));
      };

      const recoverAfterPopupClosed = async () => {
        try {
          const status = await pollDirectAuthStatus<{
            status?: string;
            ready?: boolean;
            sourceId?: string | null;
            activeSourceId?: string | null;
            mailboxUserIdHint?: string | null;
            message?: string | null;
            account?: {
              accountId: string;
              displayName: string;
              email: string;
              mailboxUserIdHint: string;
            } | null;
            source?: MailSourceProfile | null;
            detail?: string | null;
            error?: string | null;
          }>("outlook", attemptId);
          if (settled) {
            return;
          }
          if (status?.state === "succeeded" && status.payload) {
            resolveSuccess(status.payload);
            return;
          }
          if (status?.state === "failed") {
            resolveFailure(
              status.payload ?? {
                detail: status.detail,
                message: status.message,
              },
              "Microsoft 登录失败"
            );
            return;
          }
        } catch (error) {
          if (settled) {
            return;
          }
          resolveFailure(
            {
              message: error instanceof Error ? error.message : "Microsoft 登录失败",
            },
            "Microsoft 登录失败"
          );
          return;
        }

        if (settled) {
          return;
        }
        resolveFailure(
          {
            message: "Microsoft 登录窗口已关闭，授权未完成。",
          },
          "Microsoft 登录窗口已关闭，授权未完成。"
        );
      };

      const onMessage = (event: MessageEvent) => {
        const payload = event.data as
          | {
              type?: string;
              attemptId?: string;
              ok?: boolean;
              status?: string;
              ready?: boolean;
              sourceId?: string | null;
              activeSourceId?: string | null;
              mailboxUserIdHint?: string | null;
              message?: string | null;
              account?: {
                accountId: string;
                displayName: string;
                email: string;
                mailboxUserIdHint: string;
              } | null;
              source?: MailSourceProfile | null;
              error?: string;
              detail?: string;
            }
          | null;

        if (!payload || payload.type !== "outlook-direct-auth") {
          return;
        }

        const allowedOrigins = resolveAllowedDirectAuthOrigins();
        if (event.source !== popup || !allowedOrigins.has(event.origin)) {
          return;
        }

        if (payload.attemptId !== attemptId) {
          return;
        }

        if (!payload.ok) {
          resolveFailure(payload, "Microsoft 登录失败");
          return;
        }

        resolveSuccess(payload);
      };

      window.addEventListener("message", onMessage);
      popup.focus();
    });
  }, [apiBase, mergeConnectedSource, pollDirectAuthStatus, resolveAllowedDirectAuthOrigins]);

  const launchGmailAuth = useCallback(async (): Promise<GmailLaunchResult> => {
    if (typeof window === "undefined") {
      throw new Error("Google Gmail 登录只能在浏览器环境中发起");
    }

    return await new Promise<GmailLaunchResult>((resolve, reject) => {
      const attemptId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const popup = window.open(
        `${apiBase}/mail/connections/gmail/direct/start?appOrigin=${encodeURIComponent(window.location.origin)}&attemptId=${encodeURIComponent(attemptId)}`,
        "true-sight-gmail-direct-auth",
        "popup=yes,width=540,height=720,resizable=yes,scrollbars=yes"
      );

      if (!popup) {
        reject(new Error("浏览器拦截了 Gmail 登录窗口，请允许弹窗后重试。"));
        return;
      }

      let settled = false;
      let closeRecoveryStarted = false;
      const timeout = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        try {
          popup.close();
        } catch {
          // Ignore close failures.
        }
        reject(new Error("Gmail 登录超时，请重试。"));
      }, 180000);

      const poll = window.setInterval(() => {
        if (!settled && popup.closed) {
          if (closeRecoveryStarted) {
            return;
          }
          closeRecoveryStarted = true;
          window.clearInterval(poll);
          void recoverAfterPopupClosed();
        }
      }, 500);

      const cleanup = () => {
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        window.removeEventListener("message", onMessage);
      };

      const resolveSuccess = (payload: {
        status?: string;
        ready?: boolean;
        sourceId?: string | null;
        activeSourceId?: string | null;
        mailboxUserIdHint?: string | null;
        message?: string | null;
        account?: {
          email: string;
          mailboxUserIdHint: string;
        } | null;
        source?: MailSourceProfile | null;
      }) => {
        settled = true;
        cleanup();
        try {
          popup.close();
        } catch {
          // Ignore close failures.
        }

        mergeConnectedSource(payload);
        resolve({
          status: payload.status || "connected",
          ready: Boolean(payload.ready),
          sourceId: payload.sourceId ?? null,
          activeSourceId: payload.activeSourceId ?? null,
          mailboxUserIdHint: payload.mailboxUserIdHint ?? payload.account?.mailboxUserIdHint ?? null,
          message: payload.message ?? null,
          account: payload.account ?? null,
          source: payload.source ?? null,
        });
      };

      const resolveFailure = (
        payload: { detail?: string | null; message?: string | null; error?: string | null } | null | undefined,
        fallback: string
      ) => {
        settled = true;
        cleanup();
        try {
          popup.close();
        } catch {
          // Ignore close failures.
        }
        reject(new Error(payload?.detail || payload?.message || payload?.error || fallback));
      };

      const recoverAfterPopupClosed = async () => {
        try {
          const status = await pollDirectAuthStatus<{
            status?: string;
            ready?: boolean;
            sourceId?: string | null;
            activeSourceId?: string | null;
            mailboxUserIdHint?: string | null;
            message?: string | null;
            account?: {
              email: string;
              mailboxUserIdHint: string;
            } | null;
            source?: MailSourceProfile | null;
            detail?: string | null;
            error?: string | null;
          }>("gmail", attemptId);
          if (settled) {
            return;
          }
          if (status?.state === "succeeded" && status.payload) {
            resolveSuccess(status.payload);
            return;
          }
          if (status?.state === "failed") {
            resolveFailure(
              status.payload ?? {
                detail: status.detail,
                message: status.message,
              },
              "Gmail 登录失败"
            );
            return;
          }
        } catch (error) {
          if (settled) {
            return;
          }
          resolveFailure(
            {
              message: error instanceof Error ? error.message : "Gmail 登录失败",
            },
            "Gmail 登录失败"
          );
          return;
        }

        if (settled) {
          return;
        }
        resolveFailure(
          {
            message: "Gmail 登录窗口已关闭，授权未完成。",
          },
          "Gmail 登录窗口已关闭，授权未完成。"
        );
      };

      const onMessage = (event: MessageEvent) => {
        const payload = event.data as
          | {
              type?: string;
              attemptId?: string;
              ok?: boolean;
              status?: string;
              ready?: boolean;
              sourceId?: string | null;
              activeSourceId?: string | null;
              mailboxUserIdHint?: string | null;
              message?: string | null;
              account?: {
                email: string;
                mailboxUserIdHint: string;
              } | null;
              source?: MailSourceProfile | null;
              error?: string;
              detail?: string;
            }
          | null;

        if (!payload || payload.type !== "gmail-direct-auth") {
          return;
        }

        const allowedOrigins = resolveAllowedDirectAuthOrigins();
        if (event.source !== popup || !allowedOrigins.has(event.origin)) {
          return;
        }

        if (payload.attemptId !== attemptId) {
          return;
        }

        if (!payload.ok) {
          resolveFailure(payload, "Gmail 登录失败");
          return;
        }

        resolveSuccess(payload);
      };

      window.addEventListener("message", onMessage);
      popup.focus();
    });
  }, [apiBase, mergeConnectedSource, pollDirectAuthStatus, resolveAllowedDirectAuthOrigins]);

  // ========== 邮件操作 ==========

  const fetchInbox = useCallback(async (limit = 30) => {
    const requestedSourceId = activeSourceIdRef.current;
    if (!requestedSourceId) {
      return;
    }

    dispatch({ type: "SET_LOADING_MAIL", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: MailInboxViewerResponse }>(
        `${apiBase}/mail/inbox/view?limit=${limit}`
      );
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      if (data.ok) {
        dispatch({ type: "SET_INBOX", payload: data.result });
      }
    } catch (err) {
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch inbox" });
      dispatch({ type: "SET_LOADING_MAIL", payload: false });
    }
  }, [apiBase]);

  const fetchTriage = useCallback(async (limit = 50) => {
    const requestedSourceId = activeSourceIdRef.current;
    if (!requestedSourceId) {
      return;
    }

    dispatch({ type: "SET_LOADING_MAIL", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: MailTriageResult }>(
        `${apiBase}/mail/triage?limit=${limit}`
      );
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      if (data.ok) {
        dispatch({ type: "SET_TRIAGE", payload: data.result });
      }
    } catch (err) {
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch triage" });
      dispatch({ type: "SET_LOADING_MAIL", payload: false });
    }
  }, [apiBase]);

  const fetchInsights = useCallback(async (limit = 50, horizonDays = 7) => {
    const requestedSourceId = activeSourceIdRef.current;
    if (!requestedSourceId) {
      return;
    }

    dispatch({ type: "SET_LOADING_MAIL", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: MailInsightsResult }>(
        `${apiBase}/mail/insights?limit=${limit}&horizonDays=${horizonDays}`
      );
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      if (data.ok) {
        dispatch({ type: "SET_INSIGHTS", payload: data.result });
      }
    } catch (err) {
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch insights" });
      dispatch({ type: "SET_LOADING_MAIL", payload: false });
    }
  }, [apiBase]);

  const fetchMailDetail = useCallback(async (messageId: string): Promise<{ bodyContent?: string; bodyPreview?: string } | null> => {
    const requestedSourceId = activeSourceIdRef.current;
    if (!requestedSourceId) {
      return null;
    }
    dispatch({ type: "SET_LOADING_DETAIL", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: { bodyContent?: string; bodyPreview?: string } }>(
        `${apiBase}/mail/message?messageId=${encodeURIComponent(messageId)}&sourceId=${encodeURIComponent(requestedSourceId)}`
      );
      if (activeSourceIdRef.current !== requestedSourceId) {
        dispatch({ type: "SET_LOADING_DETAIL", payload: false });
        return null;
      }
      if (data.ok) {
        dispatch({ type: "SET_LOADING_DETAIL", payload: false });
        return data.result;
      }
      return null;
    } catch (err) {
      if (activeSourceIdRef.current !== requestedSourceId) {
        dispatch({ type: "SET_LOADING_DETAIL", payload: false });
        return null;
      }
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch mail detail" });
      dispatch({ type: "SET_LOADING_DETAIL", payload: false });
      return null;
    }
  }, [apiBase]);

  const syncToCalendar = useCallback(async (messageId: string, subject: string, type: string, dueAt: string) => {
    try {
      await apiFetch(`${apiBase}/mail/calendar/sync`, {
        method: "POST",
        body: JSON.stringify({ messageId, subject, type, dueAt, sourceId: state.activeSourceId ?? undefined }),
      });
      if (state.activeSourceId) {
        void apiFetch(`${apiBase}/mail/personalization-feedback`, {
          method: "POST",
          body: JSON.stringify({
            sourceId: state.activeSourceId,
            events: [
              {
                targetType: "mail",
                targetId: messageId,
                eventType: "calendar_sync",
                context: {
                  rawMessageId: messageId,
                  mailId: messageId,
                  subject,
                },
              },
            ],
          }),
        }).catch(() => undefined);
      }
    } catch (err) {
      throw err;
    }
  }, [apiBase, state.activeSourceId]);

  // ========== 问答 ==========

  const askMailQuestion = useCallback(async (question: string): Promise<string> => {
    try {
      const data = await apiFetch<{ ok: boolean; result: { answer: string } }>(
        `${apiBase}/mail/query`,
        {
          method: "POST",
          body: JSON.stringify({ question }),
        }
      );
      return data.result?.answer ?? "抱歉，无法回答这个问题。";
    } catch (err) {
      return err instanceof Error ? err.message : "Failed to answer question";
    }
  }, [apiBase]);

  // ========== 优先级规则 ==========

  const fetchPriorityRules = useCallback(async () => {
    try {
      const data = await apiFetch<{ ok: boolean; result: { rules: MailPriorityRule[] } }>(
        `${apiBase}/mail/priority-rules`
      );
      if (data.ok) {
        dispatch({ type: "SET_PRIORITY_RULES", payload: data.result.rules });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch priority rules" });
    }
  }, [apiBase]);

  const addPriorityRule = useCallback(async (rule: Omit<MailPriorityRule, "id" | "createdAt" | "updatedAt">) => {
    try {
      await apiFetch(`${apiBase}/mail/priority-rules`, {
        method: "POST",
        body: JSON.stringify(rule),
      });
      await fetchPriorityRules();
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to add rule" });
      throw err;
    }
  }, [apiBase, fetchPriorityRules]);

  const updatePriorityRule = useCallback(async (rule: MailPriorityRule) => {
    try {
      await apiFetch(`${apiBase}/mail/priority-rules/update`, {
        method: "POST",
        body: JSON.stringify(rule),
      });
      await fetchPriorityRules();
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to update rule" });
      throw err;
    }
  }, [apiBase, fetchPriorityRules]);

  const deletePriorityRule = useCallback(async (ruleId: string) => {
    try {
      await apiFetch(`${apiBase}/mail/priority-rules/delete`, {
        method: "POST",
        body: JSON.stringify({ id: ruleId }),
      });
      await fetchPriorityRules();
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to delete rule" });
      throw err;
    }
  }, [apiBase, fetchPriorityRules]);

  const fetchPersonalizationLearning = useCallback(async (): Promise<MailPersonalizationLearningResult | null> => {
    const requestedSourceId = activeSourceIdRef.current;
    if (!requestedSourceId) {
      return null;
    }
    try {
      const data = await apiFetch<{
        ok: boolean;
        result?: {
          sourceId: string;
          state: MailPersonalizationLearningResult;
        };
      }>(`${apiBase}/mail/personalization-learning?sourceId=${encodeURIComponent(requestedSourceId)}`);
      if (!data.ok || !data.result || activeSourceIdRef.current !== requestedSourceId) {
        return null;
      }
      return data.result.state;
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        payload: err instanceof Error ? err.message : "Failed to load personalization learning state",
      });
      return null;
    }
  }, [apiBase]);

  const recordPersonalizationFeedback = useCallback(async (
    events: MailPersonalizationFeedbackInput[],
    options?: { silent?: boolean; sourceId?: string | null }
  ): Promise<MailPersonalizationLearningResult | null> => {
    const requestedSourceId = options?.sourceId ?? activeSourceIdRef.current;
    if (!requestedSourceId || events.length === 0) {
      return null;
    }

    try {
      const data = await apiFetch<{
        ok: boolean;
        result?: {
          sourceId: string;
          state: MailPersonalizationLearningResult;
        };
      }>(`${apiBase}/mail/personalization-feedback`, {
        method: "POST",
        keepalive: true,
        body: JSON.stringify({
          sourceId: requestedSourceId,
          events,
        }),
      });
      if (!data.ok || !data.result || activeSourceIdRef.current !== requestedSourceId) {
        return null;
      }
      return data.result.state;
    } catch (err) {
      if (!options?.silent) {
        dispatch({
          type: "SET_ERROR",
          payload: err instanceof Error ? err.message : "Failed to record personalization feedback",
        });
      }
      return null;
    }
  }, [apiBase]);

  async function refreshPersonalizationViews() {
    await Promise.allSettled([
      fetchInbox(30),
      fetchTriage(50),
      fetchKbStats(),
      fetchKbMails({
        limit: stateRef.current.kbMailsPage.limit,
        offset: stateRef.current.kbMailsPage.offset,
      }),
      fetchKbEvents(),
      fetchKbPersons(),
    ]);
  }

  const savePersonalizationOverride = useCallback(async (input: {
    targetType: MailPersonalizationTargetType;
    targetId: string;
    quadrant: MailQuadrant | null;
    context?: MailPersonalizationFeedbackInput["context"];
  }): Promise<MailPersonalizationLearningResult | null> => {
    const requestedSourceId = activeSourceIdRef.current;
    if (!requestedSourceId) {
      throw new Error("No active mail source selected");
    }

    try {
      const data = await apiFetch<{
        ok: boolean;
        result?: {
          sourceId: string;
          state: MailPersonalizationLearningResult;
        };
      }>(`${apiBase}/mail/personalization-overrides`, {
        method: "POST",
        body: JSON.stringify({
          sourceId: requestedSourceId,
          ...input,
        }),
      });

      if (!data.ok || !data.result || activeSourceIdRef.current !== requestedSourceId) {
        return null;
      }

      await refreshPersonalizationViews();

      return data.result.state;
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        payload: err instanceof Error ? err.message : "Failed to save personalization override",
      });
      throw err;
    }
  }, [apiBase, fetchInbox, fetchTriage]);

  // ========== 通知偏好 ==========

  const fetchNotificationPrefs = useCallback(async () => {
    const requestedSourceId = state.activeSourceId;
    try {
      const sourceQuery = requestedSourceId ? `?sourceId=${encodeURIComponent(requestedSourceId)}` : "";
      const data = await apiFetch<{ ok: boolean; result: NotificationPreferences | MailNotificationPreferencesResult }>(
        `${apiBase}/mail/notifications/preferences${sourceQuery}`
      );
      if (data.ok) {
        if (activeSourceIdRef.current !== requestedSourceId) {
          return;
        }
        dispatch({ type: "SET_NOTIFICATION_PREFS", payload: extractNotificationPreferences(data.result) });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch notification prefs" });
    }
  }, [apiBase, state.activeSourceId]);

  const updateNotificationPrefs = useCallback(async (prefs: Partial<NotificationPreferences>) => {
    try {
      const fallbackTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
      const current = state.notificationPrefs ?? {
        urgentPushEnabled: true,
        dailyDigestEnabled: true,
        digestHour: 20,
        digestMinute: 0,
        digestTimeZone: fallbackTimeZone,
      };
      await apiFetch(`${apiBase}/mail/notifications/preferences`, {
        method: "POST",
        body: JSON.stringify({ ...current, ...prefs, sourceId: state.activeSourceId ?? undefined }),
      });
      await fetchNotificationPrefs();
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to update notification prefs" });
      throw err;
    }
  }, [apiBase, state.activeSourceId, state.notificationPrefs, fetchNotificationPrefs]);

  const pollNotifications = useCallback(async (
    limit = 40,
    horizonDays = 7,
    options?: { silent?: boolean }
  ): Promise<MailNotificationPollResult | null> => {
    const requestedSourceId = state.activeSourceId;
    if (!requestedSourceId) {
      dispatch({ type: "SET_NOTIFICATION_SNAPSHOT", payload: null });
      return null;
    }

    dispatch({ type: "SET_POLLING_NOTIFICATIONS", payload: true });
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
      const params = new URLSearchParams({
        sourceId: requestedSourceId,
        limit: String(limit),
        horizonDays: String(horizonDays),
        tz: timeZone,
      });
      const data = await apiFetch<{ ok: boolean; result: MailNotificationPollResult }>(
        `${apiBase}/mail/notifications/poll?${params.toString()}`
      );

      if (!data.ok) {
        throw new Error("Notification poll failed");
      }

      if (activeSourceIdRef.current !== requestedSourceId) {
        dispatch({ type: "SET_POLLING_NOTIFICATIONS", payload: false });
        return null;
      }

      dispatch({ type: "SET_NOTIFICATION_SNAPSHOT", payload: data.result });
      return data.result;
    } catch (err) {
      dispatch({ type: "SET_POLLING_NOTIFICATIONS", payload: false });
      if (!options?.silent) {
        dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to poll notifications" });
      }
      return null;
    }
  }, [apiBase, state.activeSourceId]);

  const syncCalendarDrafts = useCallback(async (items: MailCalendarDraft[]) => {
    const sourceId = state.activeSourceId;
    if (!sourceId || items.length === 0) {
      return {
        syncedIds: [],
        failedIds: items.map((item) => item.messageId),
        syncedKeys: [],
        failedKeys: items.map((item) => calendarDraftKey(item)),
        createdCount: 0,
        deduplicatedCount: 0,
        failedCount: items.length,
      };
    }

    const syncedIds = new Set<string>();
    const failedIds = new Set<string>();
    const syncedKeys = new Set<string>();
    const failedKeys = new Set<string>();
    let createdCount = 0;
    let deduplicatedCount = 0;
    let failedCount = 0;

    for (let index = 0; index < items.length; index += 10) {
      const chunk = items.slice(index, index + 10);
      try {
        const data = await apiFetch<{
          ok: boolean;
          result: {
            createdCount: number;
            deduplicatedCount: number;
            failedCount: number;
            items: Array<
              | {
                  key: string;
                  messageId: string;
                  type: MailCalendarDraft["type"];
                  dueAt: string;
                  ok: true;
                }
              | {
                  key: string;
                  messageId: string;
                  type: MailCalendarDraft["type"];
                  dueAt: string;
                  ok: false;
                }
            >;
          };
        }>(`${apiBase}/mail/calendar/sync/batch`, {
          method: "POST",
          body: JSON.stringify({
            sourceId,
            items: chunk.map((item) => ({
              messageId: item.messageId,
              subject: item.subject,
              type: item.type,
              dueAt: item.dueAt,
              dueDateLabel: item.dueDateLabel,
              evidence: item.evidence,
              timeZone: item.timeZone,
            })),
          }),
        });

        createdCount += data.result.createdCount;
        deduplicatedCount += data.result.deduplicatedCount;
        failedCount += data.result.failedCount;

        for (const entry of data.result.items) {
          if (entry.ok) {
            syncedIds.add(entry.messageId);
            syncedKeys.add(calendarDraftKey(entry));
          } else {
            failedIds.add(entry.messageId);
            failedKeys.add(calendarDraftKey(entry));
          }
        }
      } catch {
        failedCount += chunk.length;
        for (const item of chunk) {
          failedIds.add(item.messageId);
          failedKeys.add(calendarDraftKey(item));
        }
      }
    }

    if (sourceId && syncedIds.size > 0) {
      const syncedDrafts = items.filter((item) => syncedIds.has(item.messageId));
      void apiFetch(`${apiBase}/mail/personalization-feedback`, {
        method: "POST",
        body: JSON.stringify({
          sourceId,
          events: syncedDrafts.map((item) => ({
            targetType: "mail" as const,
            targetId: item.messageId,
            eventType: "calendar_sync" as const,
            context: {
              rawMessageId: item.messageId,
              mailId: item.messageId,
              subject: item.subject,
            },
          })),
        }),
      }).catch(() => undefined);
    }

    return {
      syncedIds: Array.from(syncedIds),
      failedIds: Array.from(failedIds),
      syncedKeys: Array.from(syncedKeys),
      failedKeys: Array.from(failedKeys),
      createdCount,
      deduplicatedCount,
      failedCount,
    };
  }, [apiBase, state.activeSourceId]);

  useEffect(() => {
    if (!isAuthenticated || !state.activeSourceId) {
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "idle" });
      dispatch({ type: "SET_NOTIFICATION_STREAM_ERROR", payload: null });
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const requestedSourceId = state.activeSourceId;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
    let fallbackProcessingTimer: number | null = null;
    let fallbackProcessingInFlight = false;
    const ensureSourceStillActive = () => activeSourceIdRef.current === requestedSourceId;

    const runFallbackAutoProcessing = async () => {
      if (!ensureSourceStillActive() || fallbackProcessingInFlight) {
        return;
      }
      fallbackProcessingInFlight = true;
      try {
        const data = await apiFetch<{ ok: boolean; result: MailProcessingRunResult }>(
          `${apiBase}/mail/processing/run`,
          {
            method: "POST",
            body: JSON.stringify({
              limit: notificationFallbackProcessingLimit,
              horizonDays: 14,
              tz: timeZone,
              sourceId: requestedSourceId,
              trigger: "poll",
              windowDays: notificationFallbackProcessingWindowDays,
            }),
          }
        );
        if (!ensureSourceStillActive()) {
          return;
        }
        if (data.ok && data.result.sourceId === requestedSourceId) {
          dispatch({ type: "SET_PROCESSING_RESULT", payload: data.result });
        }
      } catch (err) {
        if (!ensureSourceStillActive()) {
          return;
        }
        if (err instanceof Error && err.message.includes("Mail processing already in progress")) {
          return;
        }
        dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "error" });
        dispatch({
          type: "SET_NOTIFICATION_STREAM_ERROR",
          payload: err instanceof Error ? err.message : "自动检查新邮件暂时不可用。",
        });
      } finally {
        fallbackProcessingInFlight = false;
      }
    };

    const startFallbackProcessingLoop = () => {
      if (fallbackProcessingTimer) {
        return;
      }
      void runFallbackAutoProcessing();
      fallbackProcessingTimer = window.setInterval(() => {
        void runFallbackAutoProcessing();
      }, notificationFallbackProcessingIntervalMs);
    };

    const stopFallbackProcessingLoop = () => {
      if (!fallbackProcessingTimer) {
        return;
      }
      window.clearInterval(fallbackProcessingTimer);
      fallbackProcessingTimer = null;
    };

    if (typeof window.EventSource === "undefined") {
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "idle" });
      dispatch({
        type: "SET_NOTIFICATION_STREAM_ERROR",
        payload: "当前浏览器不支持实时通知连接，已启用自动轮询检查。",
      });
      startFallbackProcessingLoop();
      return () => {
        stopFallbackProcessingLoop();
      };
    }

    dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "connecting" });
    dispatch({ type: "SET_NOTIFICATION_STREAM_ERROR", payload: null });

    const params = new URLSearchParams({
      sourceId: requestedSourceId,
      limit: "40",
      horizonDays: "7",
      tz: timeZone,
    });
    const eventSource = new EventSource(`${apiBase}/mail/notifications/stream?${params.toString()}`, {
      withCredentials: true,
    });
    let fallbackPolled = false;

    eventSource.addEventListener("open", () => {
      if (!ensureSourceStillActive()) {
        return;
      }
      stopFallbackProcessingLoop();
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "connected" });
      dispatch({ type: "SET_NOTIFICATION_STREAM_ERROR", payload: null });
    });

    eventSource.addEventListener("keepalive", () => {
      if (!ensureSourceStillActive()) {
        return;
      }
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "connected" });
    });

    eventSource.addEventListener("notification", (event) => {
      if (!ensureSourceStillActive()) {
        return;
      }
      const payload = parseJsonData<{ ok?: boolean; result?: MailNotificationPollResult }>(
        (event as MessageEvent<string>).data
      );
      if (!payload?.ok || !payload.result || payload.result.sourceId !== requestedSourceId) {
        return;
      }
      dispatch({ type: "SET_NOTIFICATION_SNAPSHOT", payload: payload.result });
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "connected" });
      dispatch({ type: "SET_NOTIFICATION_STREAM_ERROR", payload: null });
    });

    eventSource.addEventListener("mail_processing", (event) => {
      if (!ensureSourceStillActive()) {
        return;
      }
      const payload = parseJsonData<{ ok?: boolean; sourceId?: string; result?: MailProcessingRunResult }>(
        (event as MessageEvent<string>).data
      );
      if (!payload?.ok || !payload.result || payload.result.sourceId !== requestedSourceId) {
        return;
      }
      dispatch({ type: "SET_PROCESSING_RESULT", payload: payload.result });
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "connected" });
      dispatch({ type: "SET_NOTIFICATION_STREAM_ERROR", payload: null });
    });

    eventSource.addEventListener("notification_busy", () => {
      if (!ensureSourceStillActive()) {
        return;
      }
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "connected" });
    });

    eventSource.addEventListener("notification_error", (event) => {
      if (!ensureSourceStillActive()) {
        return;
      }
      const payload = parseJsonData<{ error?: string }>((event as MessageEvent<string>).data);
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "error" });
      dispatch({ type: "SET_NOTIFICATION_STREAM_ERROR", payload: payload?.error ?? "实时通知暂时不可用。" });
    });

    eventSource.addEventListener("session_expired", () => {
      if (!ensureSourceStillActive()) {
        return;
      }
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "error" });
      dispatch({ type: "SET_NOTIFICATION_STREAM_ERROR", payload: "会话已过期，请重新登录。" });
      eventSource.close();
    });

    eventSource.onerror = () => {
      if (!ensureSourceStillActive()) {
        return;
      }
      dispatch({ type: "SET_NOTIFICATION_STREAM_STATUS", payload: "error" });
      dispatch({ type: "SET_NOTIFICATION_STREAM_ERROR", payload: "实时通知连接中断，正在等待恢复。" });
      if (!fallbackPolled) {
        fallbackPolled = true;
        void pollNotifications(40, 7, { silent: true });
      }
      startFallbackProcessingLoop();
    };

    return () => {
      stopFallbackProcessingLoop();
      eventSource.close();
    };
  }, [apiBase, isAuthenticated, state.activeSourceId, pollNotifications]);

  // ========== 新邮件处理 ==========

  const runMailProcessing = useCallback(async (limit = 30, horizonDays = 14): Promise<MailProcessingRunResult> => {
    const requestedSourceId = activeSourceIdRef.current;
    dispatch({ type: "SET_PROCESSING_MAIL", payload: true });
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
      const data = await apiFetch<{ ok: boolean; result: MailProcessingRunResult }>(
        `${apiBase}/mail/processing/run`,
        {
          method: "POST",
          body: JSON.stringify({
            limit,
            horizonDays,
            tz: timeZone,
            sourceId: requestedSourceId ?? undefined,
          }),
        }
      );
      if (!data.ok) {
        throw new Error("Mail processing failed");
      }
      if (activeSourceIdRef.current === requestedSourceId && (!requestedSourceId || data.result.sourceId === requestedSourceId)) {
        dispatch({ type: "SET_PROCESSING_RESULT", payload: data.result });
      }
      return data.result;
    } catch (err) {
      if (activeSourceIdRef.current === requestedSourceId) {
        dispatch({ type: "SET_PROCESSING_MAIL", payload: false });
        dispatch({ type: "SET_PROCESSING_RESULT", payload: null });
        dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to process mail" });
      }
      throw err;
    }
  }, [apiBase]);

  // ========== 知识库 ==========

  const fetchKbStats = useCallback(async () => {
    const requestedSourceId = state.activeSourceId;
    if (!requestedSourceId) {
      return;
    }
    try {
      const params = new URLSearchParams({ sourceId: requestedSourceId });
      const data = await apiFetch<{
        ok: boolean;
        stats?: KnowledgeBaseStats;
        result?: KnowledgeBaseStats | { stats?: KnowledgeBaseStats };
      }>(
        `${apiBase}/mail-kb/stats?${params.toString()}`
      );
      const stats =
        data.stats ??
        ("stats" in (data.result ?? {}) ? (data.result as { stats?: KnowledgeBaseStats }).stats ?? null : (data.result as KnowledgeBaseStats | undefined) ?? null);
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      if (data.ok && stats) {
        dispatch({ type: "SET_KB_STATS", payload: stats });
      }
    } catch (err) {
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch KB stats" });
    }
  }, [apiBase, state.activeSourceId]);

  const fetchKbMails = useCallback(async (options?: { limit?: number; offset?: number }) => {
    const requestedSourceId = state.activeSourceId;
    if (!requestedSourceId) {
      return;
    }
    const limit = Math.min(200, Math.max(1, options?.limit ?? stateRef.current.kbMailsPage.limit));
    const offset = Math.max(0, options?.offset ?? 0);
    try {
      const params = new URLSearchParams({
        pageSize: String(limit),
        offset: String(offset),
        sourceId: requestedSourceId,
      });
      const data = await apiFetch<{
        ok: boolean;
        mails?: MailKnowledgeRecord[];
        total?: number;
        limit?: number;
        offset?: number;
        result?: { mails?: MailKnowledgeRecord[]; total?: number; limit?: number; offset?: number };
      }>(
        `${apiBase}/mail-kb/mails?${params.toString()}`
      );
      const mails = data.mails ?? data.result?.mails ?? [];
      const total = data.total ?? data.result?.total ?? mails.length;
      const resolvedLimit = data.limit ?? data.result?.limit ?? limit;
      const resolvedOffset = data.offset ?? data.result?.offset ?? offset;
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      if (data.ok) {
        dispatch({
          type: "SET_KB_MAILS",
          payload: {
            mails,
            total,
            limit: resolvedLimit,
            offset: resolvedOffset,
          },
        });
      }
    } catch (err) {
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch KB mails" });
    }
  }, [apiBase, state.activeSourceId]);

  const fetchKbEvents = useCallback(async () => {
    const requestedSourceId = state.activeSourceId;
    if (!requestedSourceId) {
      return;
    }
    try {
      const params = new URLSearchParams({ sourceId: requestedSourceId });
      const data = await apiFetch<{
        ok: boolean;
        events?: EventCluster[];
        result?: { events?: EventCluster[] };
      }>(
        `${apiBase}/mail-kb/events?${params.toString()}`
      );
      const events = data.events ?? data.result?.events ?? [];
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      if (data.ok) {
        dispatch({ type: "SET_KB_EVENTS", payload: events });
      }
    } catch (err) {
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch KB events" });
    }
  }, [apiBase, state.activeSourceId]);

  const fetchKbPersons = useCallback(async () => {
    const requestedSourceId = state.activeSourceId;
    if (!requestedSourceId) {
      return;
    }
    try {
      const params = new URLSearchParams({ sourceId: requestedSourceId });
      const data = await apiFetch<{
        ok: boolean;
        persons?: PersonProfile[];
        result?: { persons?: PersonProfile[] };
      }>(
        `${apiBase}/mail-kb/persons?${params.toString()}`
      );
      const persons = data.persons ?? data.result?.persons ?? [];
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      if (data.ok) {
        dispatch({ type: "SET_KB_PERSONS", payload: persons });
      }
    } catch (err) {
      if (activeSourceIdRef.current !== requestedSourceId) {
        return;
      }
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch KB persons" });
    }
  }, [apiBase, state.activeSourceId]);

  const saveKnowledgeCard = useCallback(async (messageId: string, tags: string[] = []): Promise<MailKnowledgeRecord | null> => {
    const requestedSourceId = state.activeSourceId;
    if (!requestedSourceId) {
      throw new Error("No active mail source selected");
    }
    try {
      const data = await apiFetch<{
        ok: boolean;
        result?: { mail?: MailKnowledgeRecord };
      }>(
        `${apiBase}/mail-kb/knowledge-card`,
        {
          method: "POST",
          body: JSON.stringify({
            sourceId: requestedSourceId,
            messageId,
            tags,
          }),
        }
      );
      if (activeSourceIdRef.current !== requestedSourceId) {
        return null;
      }
      const record = data.result?.mail ?? null;
      if (data.ok && record) {
        dispatch({
          type: "SET_KB_MAILS",
          payload: {
            mails: [
              record,
              ...stateRef.current.kbMails.filter((mail) => mail.mailId !== record.mailId && mail.rawId !== record.rawId),
            ].slice(0, stateRef.current.kbMailsPage.limit),
            total: Math.max(stateRef.current.kbMailsPage.total, stateRef.current.kbMails.length + 1),
            limit: stateRef.current.kbMailsPage.limit,
            offset: 0,
          },
        });
        void fetchKbStats();
      }
      return record;
    } catch (err) {
      if (activeSourceIdRef.current === requestedSourceId) {
        dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to save knowledge card" });
      }
      throw err;
    }
  }, [apiBase, fetchKbStats, state.activeSourceId]);

  const triggerSummarize = useCallback(async (options?: { windowDays?: number; limit?: number }): Promise<string | null> => {
    try {
      const requestedSourceId = state.activeSourceId;
      if (!requestedSourceId) {
        throw new Error("No active mail source selected");
      }
      const params = new URLSearchParams({ sourceId: requestedSourceId });
      const data = await apiFetch<{ ok: boolean; jobId?: string; error?: string }>(
        `${apiBase}/mail/knowledge-base/trigger?${params.toString()}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(typeof options?.windowDays === "number" ? { windowDays: options.windowDays } : {}),
            ...(typeof options?.limit === "number" ? { limit: options.limit } : {}),
          }),
        }
      );
      if (data.ok && data.jobId) {
        return data.jobId;
      }
      throw new Error(data.error || "Trigger failed");
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to trigger summarize" });
      throw err;
    }
  }, [apiBase, state.activeSourceId]);

  // ========== 状态重置 ==========

  const resetMailState = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const clearSelectedMail = useCallback(() => {
    dispatch({ type: "SET_SELECTED_MAIL", payload: null });
  }, []);

  const setSelectedMail = useCallback((mail: TriageMailItem | null) => {
    dispatch({ type: "SET_SELECTED_MAIL", payload: mail });
  }, []);

  // ========== 预加载邮件内容 ==========

  const prefetchMailBodies = useCallback((messageIds: string[]) => {
    const sourceId = activeSourceIdRef.current;
    if (!sourceId) {
      return;
    }
    // 过滤掉已经在缓存中的 ID
    const uncachedIds = messageIds.filter(
      (id) => !state.mailBodyCache.has(mailBodyCacheKey(sourceId, id))
    );

    // 并行预取前 5 个邮件的内容
    uncachedIds.slice(0, 5).forEach((messageId) => {
      fetchMailDetail(messageId).then((result) => {
        if (result?.bodyContent) {
          dispatch({
            type: "SET_MAIL_BODY_CACHE",
            payload: {
              messageId: mailBodyCacheKey(sourceId, messageId),
              bodyContent: result.bodyContent,
            },
          });
        }
      }).catch(() => {
        // 静默忽略错误
      });
    });
  }, [state.mailBodyCache, fetchMailDetail]);

  // ========== 自动加载数据 ==========

  useEffect(() => {
    if (isAuthenticated) {
      fetchProviders();
      fetchSources();
      fetchPriorityRules();
    } else {
      resetMailState();
    }
  }, [isAuthenticated, fetchProviders, fetchSources, fetchPriorityRules, resetMailState]);

  useEffect(() => {
    if (isAuthenticated && state.activeSourceId) {
      fetchNotificationPrefs();
    }
  }, [isAuthenticated, state.activeSourceId, fetchNotificationPrefs]);

  const value: MailContextValue = {
    ...state,
    fetchSources,
    fetchProviders,
    addSource,
    connectImapSource,
    selectSource,
    deleteSource,
    verifySource,
    launchOutlookAuth,
    launchGmailAuth,
    fetchInbox,
    fetchTriage,
    fetchInsights,
    fetchMailDetail,
    syncToCalendar,
    askMailQuestion,
    fetchPriorityRules,
    addPriorityRule,
    updatePriorityRule,
    deletePriorityRule,
    fetchPersonalizationLearning,
    recordPersonalizationFeedback,
    savePersonalizationOverride,
    fetchNotificationPrefs,
    updateNotificationPrefs,
	    pollNotifications,
	    runMailProcessing,
	    saveKnowledgeCard,
	    syncCalendarDrafts,
    fetchKbStats,
    fetchKbMails,
    fetchKbEvents,
    fetchKbPersons,
    triggerSummarize,
    resetMailState,
    clearSelectedMail,
    setSelectedMail,
    prefetchMailBodies,
  };

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>;
}

// ========== Hook ==========

export function useMail() {
  const context = useContext(MailContext);
  if (!context) {
    throw new Error("useMail must be used within MailProvider");
  }
  return context;
}
