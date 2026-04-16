/**
 * 邮件会话状态类型
 */

import type { MailPriorityRule } from "../../../../packages/shared-types/src/index.js";

export type MailSourceProvider = "outlook";

export type MailSourceRoutingCheckStatus = "skipped" | "verified" | "failed" | "unverifiable";

export type MailSourceRoutingCheckResult = {
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
  mailbox: MailSourceRoutingCheckResult;
  connectedAccount: MailSourceRoutingCheckResult;
};

export type MailSourceProfile = {
  id: string;
  name: string;
  provider: MailSourceProvider;
  emailHint: string;
  mailboxUserId?: string;
  connectedAccountId?: string;
  enabled: boolean;
  ready: boolean;
  routingStatus?: MailSourceRoutingStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type MailSourceProfileView = MailSourceProfile & {
  ready: boolean;
  routingStatus?: MailSourceRoutingStatus;
};

export type SessionNotificationPreferences = {
  urgentPushEnabled: boolean;
  dailyDigestEnabled: boolean;
  digestHour: number;
  digestMinute: number;
  digestTimeZone: string;
};

export type SessionNotificationState = {
  seenUrgentMessageIds: Map<string, number>;
  lastDigestDateKey: string | null;
  lastDigestSentAt: string | null;
};
