import type { MailInsightItem } from "../types";

export function buildCalendarKey(item: MailInsightItem): string {
  return [item.messageId, item.type, item.dueAt].filter(Boolean).join("::");
}

