/**
 * 邮件上下文
 * 提供全局邮件状态管理
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from "react";
import type { MailSourceProfile, MailTriageResult, MailInsightsResult, MailInboxViewerResponse, MailPriorityRule, NotificationPreferences, TriageMailItem, KnowledgeBaseStats, MailKnowledgeRecord, EventCluster, PersonProfile } from "@mail-agent/shared-types";
import { useAuth } from "./AuthContext";

// ========== 类型定义 ==========

interface MailState {
  // 邮件源
  sources: MailSourceProfile[];
  activeSourceId: string | null;
  isLoadingSources: boolean;

  // 邮件列表
  inbox: MailInboxViewerResponse | null;
  triage: MailTriageResult | null;
  insights: MailInsightsResult | null;
  isLoadingMail: boolean;

  // 邮件详情
  selectedMail: TriageMailItem | null;
  isLoadingDetail: boolean;

  // 优先级规则
  priorityRules: MailPriorityRule[];

  // 通知偏好
  notificationPrefs: NotificationPreferences | null;

  // 知识库
  kbStats: KnowledgeBaseStats | null;
  kbMails: MailKnowledgeRecord[];
  kbEvents: EventCluster[];
  kbPersons: PersonProfile[];

  // 错误状态
  error: string | null;
}

type MailAction =
  | { type: "SET_SOURCES"; payload: { sources: MailSourceProfile[]; activeSourceId: string } }
  | { type: "SET_ACTIVE_SOURCE"; payload: string }
  | { type: "SET_LOADING_SOURCES"; payload: boolean }
  | { type: "SET_INBOX"; payload: MailInboxViewerResponse }
  | { type: "SET_TRIAGE"; payload: MailTriageResult }
  | { type: "SET_INSIGHTS"; payload: MailInsightsResult }
  | { type: "SET_SELECTED_MAIL"; payload: TriageMailItem | null }
  | { type: "SET_LOADING_MAIL"; payload: boolean }
  | { type: "SET_LOADING_DETAIL"; payload: boolean }
  | { type: "SET_PRIORITY_RULES"; payload: MailPriorityRule[] }
  | { type: "SET_NOTIFICATION_PREFS"; payload: NotificationPreferences }
  | { type: "SET_KB_STATS"; payload: KnowledgeBaseStats }
  | { type: "SET_KB_MAILS"; payload: MailKnowledgeRecord[] }
  | { type: "SET_KB_EVENTS"; payload: EventCluster[] }
  | { type: "SET_KB_PERSONS"; payload: PersonProfile[] }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "RESET" };

const initialState: MailState = {
  sources: [],
  activeSourceId: null,
  isLoadingSources: false,
  inbox: null,
  triage: null,
  insights: null,
  isLoadingMail: false,
  selectedMail: null,
  isLoadingDetail: false,
  priorityRules: [],
  notificationPrefs: null,
  kbStats: null,
  kbMails: [],
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
      };
    case "SET_ACTIVE_SOURCE":
      return { ...state, activeSourceId: action.payload };
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
      return { ...state, isLoadingMail: action.payload };
    case "SET_LOADING_DETAIL":
      return { ...state, isLoadingDetail: action.payload };
    case "SET_PRIORITY_RULES":
      return { ...state, priorityRules: action.payload };
    case "SET_NOTIFICATION_PREFS":
      return { ...state, notificationPrefs: action.payload };
    case "SET_KB_STATS":
      return { ...state, kbStats: action.payload };
    case "SET_KB_MAILS":
      return { ...state, kbMails: action.payload };
    case "SET_KB_EVENTS":
      return { ...state, kbEvents: action.payload };
    case "SET_KB_PERSONS":
      return { ...state, kbPersons: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

interface MailContextValue extends MailState {
  // 邮件源操作
  fetchSources: () => Promise<void>;
  addSource: (name: string, mailboxUserId?: string) => Promise<void>;
  selectSource: (sourceId: string) => Promise<void>;
  deleteSource: (sourceId: string) => Promise<void>;
  verifySource: (sourceId: string) => Promise<boolean>;

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

  // 通知偏好
  fetchNotificationPrefs: () => Promise<void>;
  updateNotificationPrefs: (prefs: Partial<NotificationPreferences>) => Promise<void>;

  // 知识库
  fetchKbStats: () => Promise<void>;
  fetchKbMails: () => Promise<void>;
  fetchKbEvents: () => Promise<void>;
  fetchKbPersons: () => Promise<void>;
  triggerSummarize: () => Promise<string | null>;

  // 状态重置
  resetMailState: () => void;
  selectMail: (item: TriageMailItem) => void;
  clearSelectedMail: () => void;
}

const MailContext = createContext<MailContextValue | null>(null);

// ========== API 函数 ==========

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }

  return data as T;
}

// ========== Provider ==========

interface MailProviderProps {
  children: React.ReactNode;
  apiBase?: string;
}

export function MailProvider({ children, apiBase = "/api" }: MailProviderProps) {
  const [state, dispatch] = useReducer(mailReducer, initialState);
  const { isAuthenticated } = useAuth();

  // ========== 邮件源操作 ==========

  const fetchSources = useCallback(async () => {
    dispatch({ type: "SET_LOADING_SOURCES", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: { sources: MailSourceProfile[]; activeSourceId: string } }>(
        `${apiBase}/mail/sources`
      );
      if (data.ok) {
        dispatch({
          type: "SET_SOURCES",
          payload: { sources: data.result.sources, activeSourceId: data.result.activeSourceId },
        });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch sources" });
      dispatch({ type: "SET_LOADING_SOURCES", payload: false });
    }
  }, [apiBase]);

  const addSource = useCallback(async (name: string, mailboxUserId?: string) => {
    try {
      await apiFetch(`${apiBase}/mail/sources`, {
        method: "POST",
        body: JSON.stringify({ name, mailboxUserId }),
      });
      await fetchSources();
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to add source" });
      throw err;
    }
  }, [apiBase, fetchSources]);

  const selectSource = useCallback(async (sourceId: string) => {
    try {
      await apiFetch(`${apiBase}/mail/sources/select`, {
        method: "POST",
        body: JSON.stringify({ sourceId }),
      });
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

  // ========== 邮件操作 ==========

  const fetchInbox = useCallback(async (limit = 30) => {
    dispatch({ type: "SET_LOADING_MAIL", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: MailInboxViewerResponse }>(
        `${apiBase}/mail/inbox/view?limit=${limit}`
      );
      if (data.ok) {
        dispatch({ type: "SET_INBOX", payload: data.result });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch inbox" });
      dispatch({ type: "SET_LOADING_MAIL", payload: false });
    }
  }, [apiBase]);

  const fetchTriage = useCallback(async (limit = 50) => {
    dispatch({ type: "SET_LOADING_MAIL", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: MailTriageResult }>(
        `${apiBase}/mail/triage?limit=${limit}`
      );
      if (data.ok) {
        dispatch({ type: "SET_TRIAGE", payload: data.result });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch triage" });
      dispatch({ type: "SET_LOADING_MAIL", payload: false });
    }
  }, [apiBase]);

  const fetchInsights = useCallback(async (limit = 50, horizonDays = 7) => {
    dispatch({ type: "SET_LOADING_MAIL", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: MailInsightsResult }>(
        `${apiBase}/mail/insights?limit=${limit}&horizonDays=${horizonDays}`
      );
      if (data.ok) {
        dispatch({ type: "SET_INSIGHTS", payload: data.result });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch insights" });
      dispatch({ type: "SET_LOADING_MAIL", payload: false });
    }
  }, [apiBase]);

  const fetchMailDetail = useCallback(async (messageId: string): Promise<{ bodyContent?: string; bodyPreview?: string } | null> => {
    dispatch({ type: "SET_LOADING_DETAIL", payload: true });
    try {
      const data = await apiFetch<{ ok: boolean; result: { bodyContent?: string; bodyPreview?: string } }>(
        `${apiBase}/mail/message?messageId=${encodeURIComponent(messageId)}`
      );
      if (data.ok) {
        dispatch({ type: "SET_LOADING_DETAIL", payload: false });
        return data.result;
      }
      return null;
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch mail detail" });
      dispatch({ type: "SET_LOADING_DETAIL", payload: false });
      return null;
    }
  }, [apiBase]);

  const syncToCalendar = useCallback(async (messageId: string, subject: string, type: string, dueAt: string) => {
    try {
      await apiFetch(`${apiBase}/mail/calendar/sync`, {
        method: "POST",
        body: JSON.stringify({ messageId, subject, type, dueAt }),
      });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to sync to calendar" });
      throw err;
    }
  }, [apiBase]);

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

  // ========== 通知偏好 ==========

  const fetchNotificationPrefs = useCallback(async () => {
    try {
      const data = await apiFetch<{ ok: boolean; result: NotificationPreferences }>(
        `${apiBase}/mail/notifications/preferences`
      );
      if (data.ok) {
        dispatch({ type: "SET_NOTIFICATION_PREFS", payload: data.result });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch notification prefs" });
    }
  }, [apiBase]);

  const updateNotificationPrefs = useCallback(async (prefs: Partial<NotificationPreferences>) => {
    try {
      const current = state.notificationPrefs ?? {
        urgentPushEnabled: true,
        dailyDigestEnabled: true,
        digestHour: 8,
        digestMinute: 0,
        digestTimeZone: "Asia/Shanghai",
      };
      await apiFetch(`${apiBase}/mail/notifications/preferences`, {
        method: "POST",
        body: JSON.stringify({ ...current, ...prefs }),
      });
      await fetchNotificationPrefs();
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to update notification prefs" });
      throw err;
    }
  }, [apiBase, state.notificationPrefs, fetchNotificationPrefs]);

  // ========== 知识库 ==========

  const fetchKbStats = useCallback(async () => {
    try {
      const data = await apiFetch<{ ok: boolean; stats: KnowledgeBaseStats }>(
        `${apiBase}/mail-kb/stats`
      );
      if (data.ok) {
        dispatch({ type: "SET_KB_STATS", payload: data.stats });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch KB stats" });
    }
  }, [apiBase]);

  const fetchKbMails = useCallback(async () => {
    try {
      const data = await apiFetch<{ ok: boolean; mails: MailKnowledgeRecord[] }>(
        `${apiBase}/mail-kb/mails?pageSize=50`
      );
      if (data.ok) {
        dispatch({ type: "SET_KB_MAILS", payload: data.mails || [] });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch KB mails" });
    }
  }, [apiBase]);

  const fetchKbEvents = useCallback(async () => {
    try {
      const data = await apiFetch<{ ok: boolean; events: EventCluster[] }>(
        `${apiBase}/mail-kb/events`
      );
      if (data.ok) {
        dispatch({ type: "SET_KB_EVENTS", payload: data.events || [] });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch KB events" });
    }
  }, [apiBase]);

  const fetchKbPersons = useCallback(async () => {
    try {
      const data = await apiFetch<{ ok: boolean; persons: PersonProfile[] }>(
        `${apiBase}/mail-kb/persons`
      );
      if (data.ok) {
        dispatch({ type: "SET_KB_PERSONS", payload: data.persons || [] });
      }
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to fetch KB persons" });
    }
  }, [apiBase]);

  const triggerSummarize = useCallback(async (): Promise<string | null> => {
    try {
      const data = await apiFetch<{ ok: boolean; jobId?: string; error?: string }>(
        `${apiBase}/mail/knowledge-base/trigger`,
        { method: "POST" }
      );
      if (data.ok && data.jobId) {
        return data.jobId;
      }
      throw new Error(data.error || "Trigger failed");
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to trigger summarize" });
      throw err;
    }
  }, [apiBase]);

  // ========== 状态重置 ==========

  const resetMailState = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const clearSelectedMail = useCallback(() => {
    dispatch({ type: "SET_SELECTED_MAIL", payload: null });
  }, []);

  const selectMail = useCallback((item: TriageMailItem) => {
    dispatch({ type: "SET_SELECTED_MAIL", payload: item });
  }, []);

  // ========== 自动加载数据 ==========

  useEffect(() => {
    if (isAuthenticated) {
      fetchSources();
      fetchNotificationPrefs();
      fetchPriorityRules();
    } else {
      resetMailState();
    }
  }, [isAuthenticated, fetchSources, fetchNotificationPrefs, fetchPriorityRules, resetMailState]);

  const value: MailContextValue = {
    ...state,
    fetchSources,
    addSource,
    selectSource,
    deleteSource,
    verifySource,
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
    fetchNotificationPrefs,
    updateNotificationPrefs,
    fetchKbStats,
    fetchKbMails,
    fetchKbEvents,
    fetchKbPersons,
    triggerSummarize,
    resetMailState,
    selectMail,
    clearSelectedMail,
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
