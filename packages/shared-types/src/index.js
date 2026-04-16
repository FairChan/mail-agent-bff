/**
 * Mail Agent 工作台 - 共享类型定义
 * 这些类型在 BFF 和 WebUI 之间共享，确保类型一致性
 */
// ========== UI 相关常量 ==========
export const quadrantMeta = {
    urgent_important: {
        tone: "text-red-700",
        badge: "bg-red-50 text-red-700 ring-red-200",
        bgClass: "bg-red-500",
        textClass: "text-red-600",
    },
    not_urgent_important: {
        tone: "text-blue-700",
        badge: "bg-blue-50 text-blue-700 ring-blue-200",
        bgClass: "bg-blue-500",
        textClass: "text-blue-600",
    },
    urgent_not_important: {
        tone: "text-orange-700",
        badge: "bg-orange-50 text-orange-700 ring-orange-200",
        bgClass: "bg-orange-500",
        textClass: "text-orange-600",
    },
    not_urgent_not_important: {
        tone: "text-zinc-700",
        badge: "bg-zinc-100 text-zinc-700 ring-zinc-200",
        bgClass: "bg-zinc-400",
        textClass: "text-zinc-500",
    },
};
export const quadrantLabelsByLocale = {
    zh: {
        urgent_important: "紧急重要",
        not_urgent_important: "不紧急重要",
        urgent_not_important: "紧急不重要",
        not_urgent_not_important: "不紧急不重要",
    },
    en: {
        urgent_important: "Urgent & Important",
        not_urgent_important: "Important",
        urgent_not_important: "Urgent",
        not_urgent_not_important: "Later",
    },
    ja: {
        urgent_important: "緊急・重要",
        not_urgent_important: "重要",
        urgent_not_important: "緊急",
        not_urgent_not_important: "後回し",
    },
};
export const insightTypeLabels = {
    ddl: "DDL",
    meeting: "会议",
    exam: "考试",
    event: "事项",
};
export const viewItems = [
    { key: "inbox" },
    { key: "allmail" },
    { key: "stats" },
    { key: "calendar" },
    { key: "knowledgebase" },
    { key: "settings" },
    { key: "aichat" },
];
export const viewLabelsByLocale = {
    zh: {
        inbox: { label: "收件箱", short: "主页" },
        allmail: { label: "邮件历史", short: "历史" },
        stats: { label: "统计", short: "统计" },
        calendar: { label: "日历", short: "日历" },
        knowledgebase: { label: "知识库", short: "知识库" },
        settings: { label: "设置", short: "设置" },
        aichat: { label: "AI 助手", short: "AI" },
    },
    en: {
        inbox: { label: "Inbox", short: "Home" },
        allmail: { label: "Mail History", short: "History" },
        stats: { label: "Stats", short: "Stats" },
        calendar: { label: "Calendar", short: "Cal" },
        knowledgebase: { label: "Knowledge Base", short: "KB" },
        settings: { label: "Settings", short: "Settings" },
        aichat: { label: "AI Assistant", short: "AI" },
    },
    ja: {
        inbox: { label: "受信箱", short: "ホーム" },
        allmail: { label: "メール履歴", short: "履歴" },
        stats: { label: "統計", short: "統計" },
        calendar: { label: "カレンダー", short: "予定" },
        knowledgebase: { label: "ナレッジベース", short: "知識" },
        settings: { label: "設定", short: "設定" },
        aichat: { label: "AIアシスタント", short: "AI" },
    },
};
// ========== 工具函数 ==========
export function getQuadrantPriority(quadrant) {
    switch (quadrant) {
        case "urgent_important":
            return 0;
        case "not_urgent_important":
            return 1;
        case "urgent_not_important":
            return 2;
        case "not_urgent_not_important":
            return 3;
    }
}
export function getQuadrantColor(quadrant) {
    switch (quadrant) {
        case "urgent_important":
            return { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" };
        case "not_urgent_important":
            return { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" };
        case "urgent_not_important":
            return { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" };
        case "not_urgent_not_important":
            return { bg: "bg-zinc-50", border: "border-zinc-200", text: "text-zinc-700" };
    }
}
