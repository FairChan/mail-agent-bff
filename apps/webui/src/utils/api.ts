/**
 * 统一 API 客户端
 * 提供类型安全的 API 调用和错误处理
 */

import type {
  AuthUser,
  MailSourceProfile,
  MailTriageResult,
  MailInsightsResult,
  MailInboxViewerResponse,
  MailDetailResponse,
  MailPriorityRule,
  NotificationPreferences,
  MailNotificationPreferencesResult,
  MailNotificationPollResult,
  MailCalendarDraft,
  MailCalendarBatchSyncResult,
  KnowledgeBaseStats,
  EventCluster,
  PersonProfile,
} from "@mail-agent/shared-types";

// ========== 类型定义 ==========

export type ApiResponse<T> = {
  ok: boolean;
  error?: string;
  errorCode?: string;
};

export type ResultEnvelope<T> = ApiResponse<T> & {
  result: T;
};

function extractNotificationPreferences(
  result: NotificationPreferences | MailNotificationPreferencesResult
): NotificationPreferences {
  if ("preferences" in result) {
    return result.preferences;
  }

  return result;
}

// ========== API 客户端类 ==========

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl = "/api") {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      "Content-Type": "application/json",
    };
  }

  private getAuthHeaders(): Record<string, string> {
    return this.defaultHeaders;
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new ApiError(
        data.error || data.message || "Request failed",
        response.status,
        data.errorCode
      );
      throw error;
    }

    return data as T;
  }

  // ========== 认证 API ==========

  async checkSession(): Promise<{ authenticated: boolean; user?: AuthUser }> {
    const data = await this.request<{
      ok: boolean;
      authenticated: boolean;
      user?: AuthUser;
    }>("/auth/session");
    return { authenticated: data.authenticated, user: data.user };
  }

  async login(
    email: string,
    password: string,
    remember = false
  ): Promise<AuthUser> {
    const data = await this.request<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, remember }),
    });
    return data.user;
  }

  async register(
    email: string,
    displayName: string,
    password: string
  ): Promise<{
    pending: true;
    email: string;
    expiresInSeconds: number;
    resendAvailableInSeconds: number;
    delivery?: "sent" | "logged";
  }> {
    return this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username: displayName, password }),
    });
  }

  async verifyRegistration(email: string, code: string): Promise<AuthUser> {
    const data = await this.request<{ user: AuthUser }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    return data.user;
  }

  async resendVerificationCode(email: string): Promise<{
    pending: true;
    email: string;
    expiresInSeconds: number;
    resendAvailableInSeconds: number;
    delivery?: "sent" | "logged";
  }> {
    return this.request("/auth/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async logout(): Promise<void> {
    await this.request("/auth/logout", { method: "POST" });
  }

  async updatePreferences(
    prefs: { locale?: string; displayName?: string }
  ): Promise<AuthUser> {
    const data = await this.request<{ ok: boolean; user: AuthUser }>(
      "/auth/preferences",
      { method: "POST", body: JSON.stringify(prefs) }
    );
    return data.user;
  }

  // ========== 邮件源 API ==========

  async getSources(): Promise<{
    sources: MailSourceProfile[];
    activeSourceId: string | null;
  }> {
    const data = await this.request<ResultEnvelope<{
      sources: MailSourceProfile[];
      activeSourceId: string | null;
    }>>("/mail/sources");
    return data.result;
  }

  async addSource(
    name: string,
    mailboxUserId?: string
  ): Promise<{ source: MailSourceProfile; activeSourceId: string | null }> {
    const data = await this.request<ResultEnvelope<{
      source: MailSourceProfile;
      activeSourceId: string | null;
    }>>("/mail/sources", {
      method: "POST",
      body: JSON.stringify({ label: name, connectionType: "composio", mailboxUserId }),
    });
    return data.result;
  }

  async selectSource(sourceId: string): Promise<void> {
    await this.request("/mail/sources/select", {
      method: "POST",
      body: JSON.stringify({ sourceId }),
    });
  }

  async deleteSource(sourceId: string): Promise<void> {
    await this.request("/mail/sources/delete", {
      method: "POST",
      body: JSON.stringify({ id: sourceId }),
    });
  }

  async verifySource(sourceId: string): Promise<boolean> {
    const data = await this.request<ResultEnvelope<{
      ready: boolean;
    }>>("/mail/sources/verify", {
      method: "POST",
      body: JSON.stringify({ sourceId }),
    });
    return data.result.ready;
  }

  // ========== 邮件 API ==========

  async getTriage(limit = 50): Promise<MailTriageResult> {
    const data = await this.request<ResultEnvelope<MailTriageResult>>(
      `/mail/triage?limit=${limit}`
    );
    return data.result;
  }

  async getInsights(
    limit = 50,
    horizonDays = 7,
    timeZone?: string
  ): Promise<MailInsightsResult> {
    const params = new URLSearchParams({
      limit: String(limit),
      horizonDays: String(horizonDays),
    });
    if (timeZone) params.set("timeZone", timeZone);

    const data = await this.request<ResultEnvelope<MailInsightsResult>>(
      `/mail/insights?${params}`
    );
    return data.result;
  }

  async getInbox(limit = 30): Promise<MailInboxViewerResponse> {
    const data = await this.request<ResultEnvelope<MailInboxViewerResponse>>(
      `/mail/inbox/view?limit=${limit}`
    );
    return data.result;
  }

  async getMailDetail(messageId: string): Promise<MailDetailResponse> {
    const data = await this.request<ResultEnvelope<MailDetailResponse>>(
      `/mail/message?messageId=${encodeURIComponent(messageId)}`
    );
    return data.result;
  }

  async askMailQuestion(
    question: string,
    limit = 20,
    horizonDays = 7
  ): Promise<string> {
    const data = await this.request<ResultEnvelope<{ answer: string }>>(
      "/mail/query",
      {
        method: "POST",
        body: JSON.stringify({ question, limit, horizonDays }),
      }
    );
    return data.result.answer;
  }

  // ========== 日历 API ==========

  async syncToCalendar(
    messageId: string,
    subject: string,
    type: string,
    dueAt: string
  ): Promise<void> {
    await this.request("/mail/calendar/sync", {
      method: "POST",
      body: JSON.stringify({ messageId, subject, type, dueAt }),
    });
  }

  async syncCalendarBatch(
    items: MailCalendarDraft[],
    sourceId?: string
  ): Promise<MailCalendarBatchSyncResult> {
    const data = await this.request<ResultEnvelope<MailCalendarBatchSyncResult>>(
      "/mail/calendar/sync/batch",
      {
        method: "POST",
        body: JSON.stringify({
          ...(sourceId ? { sourceId } : {}),
          items: items.map((item) => ({
            messageId: item.messageId,
            subject: item.subject,
            type: item.type,
            dueAt: item.dueAt,
            dueDateLabel: item.dueDateLabel,
            evidence: item.evidence,
            timeZone: item.timeZone,
          })),
        }),
      }
    );
    return data.result;
  }

  async deleteCalendarEvent(eventId: string): Promise<void> {
    await this.request("/mail/calendar/delete", {
      method: "POST",
      body: JSON.stringify({ eventId }),
    });
  }

  // ========== 优先级规则 API ==========

  async getPriorityRules(): Promise<MailPriorityRule[]> {
    const data = await this.request<ResultEnvelope<{ rules: MailPriorityRule[] }>>(
      "/mail/priority-rules"
    );
    return data.result.rules;
  }

  async addPriorityRule(
    rule: Omit<MailPriorityRule, "id" | "createdAt" | "updatedAt">
  ): Promise<MailPriorityRule> {
    const data = await this.request<ResultEnvelope<{ rule: MailPriorityRule }>>(
      "/mail/priority-rules",
      { method: "POST", body: JSON.stringify(rule) }
    );
    return data.result.rule;
  }

  async updatePriorityRule(rule: MailPriorityRule): Promise<void> {
    await this.request("/mail/priority-rules/update", {
      method: "POST",
      body: JSON.stringify(rule),
    });
  }

  async deletePriorityRule(ruleId: string): Promise<void> {
    await this.request("/mail/priority-rules/delete", {
      method: "POST",
      body: JSON.stringify({ id: ruleId }),
    });
  }

  // ========== 通知偏好 API ==========

  async getNotificationPrefs(): Promise<NotificationPreferences> {
    const data = await this.request<
      ResultEnvelope<NotificationPreferences | MailNotificationPreferencesResult>
    >(
      "/mail/notifications/preferences"
    );
    return extractNotificationPreferences(data.result);
  }

  async updateNotificationPrefs(
    prefs: Partial<NotificationPreferences>
  ): Promise<void> {
    await this.request("/mail/notifications/preferences", {
      method: "POST",
      body: JSON.stringify(prefs),
    });
  }

  async pollNotifications(
    options: {
      sourceId?: string;
      limit?: number;
      horizonDays?: number;
      tz?: string;
    } = {}
  ): Promise<MailNotificationPollResult> {
    const params = new URLSearchParams();
    if (options.sourceId) {
      params.set("sourceId", options.sourceId);
    }
    params.set("limit", String(options.limit ?? 40));
    params.set("horizonDays", String(options.horizonDays ?? 7));
    if (options.tz) {
      params.set("tz", options.tz);
    }

    const data = await this.request<ResultEnvelope<MailNotificationPollResult>>(
      `/mail/notifications/poll?${params.toString()}`
    );
    return data.result;
  }

  // ========== Composio Outlook 授权 API ==========

  async launchOutlookAuth(forceReinitiate = false): Promise<{
    status: string;
    hasActiveConnection: boolean;
    needsUserAction: boolean;
    redirectUrl: string | null;
    connectedAccountId: string | null;
    mailboxUserIdHint: string | null;
    sessionInstructions: string | null;
    message: string | null;
  }> {
    const data = await this.request<{
      ok: boolean;
      error?: string;
      errorCode?: string;
      result?: {
        status: string;
        hasActiveConnection: boolean;
        needsUserAction: boolean;
        redirectUrl: string | null;
        connectedAccountId: string | null;
        mailboxUserIdHint: string | null;
        sessionInstructions: string | null;
        message: string | null;
      };
    }>("/mail/connections/outlook/launch-auth", {
      method: "POST",
      body: JSON.stringify({ forceReinitiate }),
    });
    if (!data.ok || !data.result) {
      const err = new ApiError(
        data.error || "授权发起失败",
        400,
        data.errorCode
      );
      throw err;
    }
    return data.result;
  }

  async waitForOutlookAuth(
    sessionId: string,
    timeoutMs = 120000
  ): Promise<{ connectedAccountId: string | null; mailboxUserId: string | null }> {
    const data = await this.request<{
      ok: boolean;
      result?: {
        connectedAccountId: string | null;
        mailboxUserId: string | null;
        status: string;
      };
    }>(
      `/mail/connections/outlook/wait-for-auth?sessionId=${encodeURIComponent(sessionId)}&timeoutMs=${timeoutMs}`
    );
    if (!data.ok || !data.result) {
      throw new ApiError("授权等待失败", 500);
    }
    return {
      connectedAccountId: data.result.connectedAccountId ?? null,
      mailboxUserId: data.result.mailboxUserId ?? null,
    };
  }

  // ========== 知识库 API ==========

  async getKnowledgeStats(): Promise<KnowledgeBaseStats> {
    const data = await this.request<ResultEnvelope<KnowledgeBaseStats>>(
      "/mail-kb/stats"
    );
    return data.result;
  }

  async getKnowledgeEvents(): Promise<EventCluster[]> {
    const data = await this.request<ResultEnvelope<{ events: EventCluster[] }>>(
      "/mail-kb/events"
    );
    return data.result.events;
  }

  async getKnowledgePersons(): Promise<PersonProfile[]> {
    const data = await this.request<ResultEnvelope<{ persons: PersonProfile[] }>>(
      "/mail-kb/persons"
    );
    return data.result.persons;
  }
}

// ========== API 错误类 ==========

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ========== 导出单例 ==========

export const api = new ApiClient();

export default api;
