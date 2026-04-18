/**
 * Mail Agent 工作台 - 共享类型定义
 * 这些类型在 BFF 和 WebUI 之间共享，确保类型一致性
 */
export type MailQuadrant = "unprocessed" | "urgent_important" | "not_urgent_important" | "urgent_not_important" | "not_urgent_not_important";
export type MailScoreScale = "ratio" | "ten";
export type MailInsightType = "ddl" | "meeting" | "exam" | "event";
export type MailSourceProvider = "outlook";
export type MailRoutingCheckStatus = "skipped" | "verified" | "failed" | "unverifiable";
export type MailQaIntent = "tomorrow_ddl" | "upcoming" | "unread_count" | "urgent_important" | "unknown";
export type AiSummaryLocale = "zh-CN" | "en-US" | "ja-JP";
export type ViewKey = "tutorial" | "inbox" | "allmail" | "agent" | "stats" | "calendar" | "knowledgebase" | "settings";
export type AuthLocale = "zh" | "en" | "ja";
export type TriageMailItem = {
    id: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    bodyPreview: string;
    webLink: string;
    aiSummary?: string;
    isRead?: boolean;
    importance?: string;
    quadrant?: MailQuadrant;
    receivedDateTime?: string;
};
export type MailTriageResult = {
    generatedAt: string;
    total: number;
    counts: Record<MailQuadrant, number>;
    quadrants: Record<MailQuadrant, TriageMailItem[]>;
    allItems: TriageMailItem[];
};
export type MailInsightItem = {
    messageId: string;
    subject: string;
    dueAt: string;
    dueDateLabel: string;
    type: MailInsightType;
    evidence?: string;
    aiSummary?: string;
    fromName?: string;
    fromAddress?: string;
    receivedDateTime?: string;
    quadrant?: MailQuadrant;
    confidence?: number;
    reasons?: string[];
};
export type MailInsightsResult = {
    generatedAt?: string;
    horizonDays: number;
    timeZone: string;
    digest?: {
        total: number;
        unread: number;
        urgentImportant: number;
        highImportance: number;
        upcomingCount: number;
        tomorrowDdlCount: number;
    };
    tomorrowDdl?: MailInsightItem[];
    upcoming: MailInsightItem[];
    signalsWithoutDate?: Array<{
        messageId: string;
        subject: string;
        fromName: string;
        quadrant: MailQuadrant;
        type: MailInsightType;
        evidence: string;
    }>;
};
export type MailInboxViewerItem = {
    id: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    bodyPreview: string;
    receivedDateTime: string;
    isRead: boolean;
    importance: string;
    hasAttachments: boolean;
    webLink: string;
};
export type MailInboxViewerResponse = {
    generatedAt: string;
    total: number;
    items: MailInboxViewerItem[];
};
export type MailDetailResponse = {
    id: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    receivedDateTime: string;
    importance: string;
    isRead: boolean;
    hasAttachments: boolean;
    webLink: string;
    bodyContentType: string;
    bodyContent: string;
    bodyPreview: string;
};
export type MailRoutingCheckResult = {
    required: boolean;
    status: MailRoutingCheckStatus;
    verified: boolean;
    message: string;
};
export type MailSourceRoutingStatus = {
    verifiedAt: string;
    routingVerified: boolean;
    failFast: boolean;
    message: string;
    mailbox: MailRoutingCheckResult;
    connectedAccount: MailRoutingCheckResult;
};
export type MailSourceProfile = {
    id: string;
    name: string;
    provider: MailSourceProvider;
    connectionType?: "composio" | "microsoft";
    microsoftAccountId?: string;
    emailHint: string;
    mailboxUserId?: string;
    connectedAccountId?: string;
    enabled: boolean;
    ready: boolean;
    routingStatus?: MailSourceRoutingStatus;
    createdAt?: string;
    updatedAt?: string;
};
export type MailRoutingProbeResult = {
    ok: boolean;
    error?: string;
};
export type MailPriorityRuleField = "from" | "subject" | "body" | "any";
export type MailPriorityRule = {
    id: string;
    name: string;
    pattern: string;
    field: MailPriorityRuleField;
    quadrant: MailQuadrant;
    priority: number;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};
export type MailCalendarSyncInput = {
    messageId: string;
    subject: string;
    type: MailInsightType;
    dueAt: string;
    dueDateLabel?: string;
    evidence?: string;
    timeZone?: string;
};
export type MailCalendarDraft = MailCalendarSyncInput & {
    confidence?: number;
};
export type MailCalendarSyncResponse = {
    eventId: string;
    eventSubject: string;
    eventWebLink: string;
    start: {
        dateTime: string;
        timeZone: string;
    };
    end: {
        dateTime: string;
        timeZone: string;
    };
};
export type MailCalendarDeleteResponse = {
    eventId: string;
    deleted: boolean;
    alreadyDeleted: boolean;
};
export type MailCalendarBatchSyncResult = {
    sourceId: string;
    total: number;
    createdCount: number;
    deduplicatedCount: number;
    failedCount: number;
    items: Array<{
        key: string;
        messageId: string;
        type: MailInsightType;
        dueAt: string;
        ok: true;
        deduplicated: boolean;
        verified?: boolean;
        result: MailCalendarSyncResponse;
    } | {
        key: string;
        messageId: string;
        type: MailInsightType;
        dueAt: string;
        ok: false;
        error: string;
    }>;
};
export type MailQaReference = {
    messageId: string;
    subject: string;
    fromName: string;
    fromAddress?: string;
    receivedDateTime?: string;
    dueAt?: string;
    dueDateLabel?: string;
    evidence?: string;
    type?: MailInsightType;
    quadrant?: MailQuadrant;
};
export type MailQaResponse = {
    generatedAt: string;
    question: string;
    intent: MailQaIntent;
    answer: string;
    horizonDays: number;
    timeZone: string;
    references: MailQaReference[];
};
export type AuthUser = {
    id: string;
    email: string;
    displayName: string;
    locale: AiSummaryLocale;
};
export type SessionEnvelope = {
    ok: boolean;
    authenticated: boolean;
    user?: AuthUser;
};
export type AuthLoginEnvelope = {
    user: AuthUser;
};
export type AuthRegisterEnvelope = {
    pending: true;
    email: string;
    expiresInSeconds: number;
    resendAvailableInSeconds: number;
    delivery?: "sent" | "logged";
};
export type AuthVerifyEnvelope = {
    user: AuthUser;
};
export type AuthResendVerificationEnvelope = AuthRegisterEnvelope;
export type AuthMeEnvelope = {
    user: AuthUser;
};
export type MailKnowledgeRecord = {
    mailId: string;
    rawId: string;
    subject: string;
    personId: string;
    eventId: string | null;
    importanceScore: number;
    urgencyScore: number;
    scoreScale?: MailScoreScale;
    quadrant: MailQuadrant;
    summary: string;
    receivedAt: string;
    processedAt: string;
    webLink?: string;
};
export type EventCluster = {
    eventId: string;
    name: string;
    summary: string;
    keyInfo: string[];
    relatedMailIds: string[];
    lastUpdated: string;
    tags: string[];
};
export type PersonProfile = {
    personId: string;
    email: string;
    name: string;
    profile: string;
    role: string;
    importance: number;
    recentInteractions: number;
    lastUpdated: string;
    avatarUrl?: string;
};
export type MailSubjectIndex = {
    mailId: string;
    subject: string;
    receivedAt: string;
};
export type MailScoreIndex = {
    mailId: string;
    importanceScore: number;
    urgencyScore: number;
    scoreScale?: MailScoreScale;
    quadrant: MailQuadrant;
    timestamp: string;
};
export type KnowledgeBaseStats = {
    totalMails: number;
    totalEvents: number;
    totalPersons: number;
    processedAt: string;
    dateRange: {
        start: string;
        end: string;
    };
    quadrantDistribution: Record<MailQuadrant, number>;
};
export type KnowledgeBaseResult = {
    newMailsCount: number;
    newEventsCount: number;
    newPersonsCount: number;
    updatedEventsCount: number;
    updatedPersonsCount: number;
    stats: KnowledgeBaseStats;
};
export type ApiResponse<T> = {
    ok: boolean;
    error?: string;
    errorCode?: string;
};
export type MailSourceMutationEnvelope = ApiResponse<{
    source: MailSourceProfile;
    activeSourceId: string | null;
}>;
export type MailSourceSelectEnvelope = ApiResponse<{
    activeSourceId: string | null;
}>;
export type MailSourceDeleteEnvelope = ApiResponse<{
    id: string;
    deleted: boolean;
    activeSourceId: string | null;
}>;
export type MailSourceVerifyEnvelope = ApiResponse<{
    sourceId: string;
    ready: boolean;
    routingStatus: MailSourceRoutingStatus;
}>;
export type MailSourcesEnvelope = ApiResponse<{
    sources: MailSourceProfile[];
    activeSourceId: string | null;
}>;
export type MailTriageEnvelope = ApiResponse<{
    sourceId: string;
    result: MailTriageResult;
}>;
export type MailInsightsEnvelope = ApiResponse<{
    sourceId: string;
    result: MailInsightsResult;
}>;
export type MailQueryEnvelope = ApiResponse<{
    answer: string;
}>;
export type CalendarSyncEnvelope = ApiResponse<{
    sourceId: string;
    result: MailCalendarSyncResponse;
    deduplicated: boolean;
}>;
export type CalendarDeleteEnvelope = ApiResponse<{
    sourceId: string;
    result: MailCalendarDeleteResponse;
}>;
export type CalendarBatchSyncEnvelope = ApiResponse<{
    result: MailCalendarBatchSyncResult;
}>;
export type OutlookLaunchEnvelope = ApiResponse<{
    status: "active" | "initiated" | "failed";
    hasActiveConnection: boolean;
    needsUserAction: boolean;
    redirectUrl: string | null;
    connectedAccountId: string | null;
    mailboxUserIdHint: string | null;
    sessionInstructions: string | null;
    message: string | null;
}>;
export type AutoConnectEnvelope = ApiResponse<{
    phase: string;
    message: string;
    activeSourceId: string | null;
}>;
export type NotificationPreferences = {
    urgentPushEnabled: boolean;
    dailyDigestEnabled: boolean;
    digestHour: number;
    digestMinute: number;
    digestTimeZone: string;
    updatedAt?: string;
};
export type NotificationStateView = {
    seenUrgentCount: number;
    lastDigestDateKey: string | null;
    lastDigestSentAt: string | null;
};
export type MailNotificationPreferencesResult = {
    sourceId: string;
    preferences: NotificationPreferences;
    state: NotificationStateView;
};
export type MailNotificationUrgentItem = {
    messageId: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    receivedDateTime: string;
    webLink: string;
    reasons: string[];
};
export type MailDailyDigestNotification = {
    triggeredAt: string;
    dateKey: string;
    timeZone: string;
    digest: {
        date: string;
        total: number;
        unread: number;
        urgentImportant: number;
        highImportance: number;
        upcomingCount: number;
        tomorrowDdlCount: number;
    };
    tomorrowDdl: Array<{
        messageId: string;
        subject: string;
        dueDateLabel: string;
    }>;
    upcoming: Array<{
        messageId: string;
        subject: string;
        type: MailInsightType;
        dueDateLabel: string;
    }>;
};
export type MailNotificationPollResult = MailNotificationPreferencesResult & {
    generatedAt: string;
    triage: {
        total: number;
        counts: Record<MailQuadrant, number>;
    };
    urgent: {
        totalUrgentImportant: number;
        newItems: MailNotificationUrgentItem[];
    };
    dailyDigest: MailDailyDigestNotification | null;
};
export type MailProcessingRunResult = {
    status: "completed" | "partial";
    warnings: string[];
    sourceId: string;
    startedAt: string;
    completedAt: string;
    limit: number;
    horizonDays: number;
    timeZone: string;
    knowledgeBase: {
        status: "completed" | "failed";
        processedCount: number;
        newMailCount: number;
        updatedMailCount: number;
        newEventCount: number;
        updatedEventCount: number;
        newSenderCount: number;
        updatedSenderCount: number;
        errors: string[];
    };
    triage: {
        total: number;
        counts: Record<MailQuadrant, number>;
    };
    urgent: {
        totalUrgentImportant: number;
        newItems: MailNotificationUrgentItem[];
    };
    dailyDigest: MailDailyDigestNotification | null;
    calendarDrafts: MailCalendarDraft[];
};
export declare const quadrantMeta: Record<MailQuadrant, {
    tone: string;
    badge: string;
    bgClass: string;
    textClass: string;
}>;
export declare const quadrantLabelsByLocale: Record<AuthLocale, Record<MailQuadrant, string>>;
export declare const insightTypeLabels: Record<MailInsightType, string>;
export declare const viewItems: Array<{
    key: ViewKey;
}>;
export declare const viewLabelsByLocale: Record<AuthLocale, Record<ViewKey, {
    label: string;
    short: string;
}>>;
export declare function getQuadrantPriority(quadrant: MailQuadrant): number;
export declare function getQuadrantColor(quadrant: MailQuadrant): {
    bg: string;
    border: string;
    text: string;
};
