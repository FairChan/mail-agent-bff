import type { MailInsightItem } from "@mail-agent/shared-types";

export function buildCalendarKey(item: Pick<MailInsightItem, "messageId" | "type" | "dueAt">): string {
  return `${item.messageId}:${item.type}:${item.dueAt}`;
}
