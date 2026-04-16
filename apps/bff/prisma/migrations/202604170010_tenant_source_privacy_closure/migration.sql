-- Tenant/source privacy closure for mail sources, Microsoft direct auth,
-- LLM routes, agent memory metadata, and KB uniqueness boundaries.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeMailSourceId" TEXT;

ALTER TABLE "MailSource" ADD COLUMN IF NOT EXISTS "connectionType" TEXT NOT NULL DEFAULT 'composio';
ALTER TABLE "MailSource" ADD COLUMN IF NOT EXISTS "microsoftAccountId" TEXT;
ALTER TABLE "MailSource" ADD COLUMN IF NOT EXISTS "routingVerifiedAt" TIMESTAMP(3);
ALTER TABLE "MailSource" ADD COLUMN IF NOT EXISTS "routingStatusJson" TEXT;

CREATE INDEX IF NOT EXISTS "MailSource_userId_enabled_idx" ON "MailSource"("userId", "enabled");
CREATE INDEX IF NOT EXISTS "MailSource_userId_microsoftAccountId_idx" ON "MailSource"("userId", "microsoftAccountId");

CREATE TABLE IF NOT EXISTS "MicrosoftAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mailboxUserIdHint" TEXT,
    "tenantId" TEXT,
    "scope" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "accessTokenCiphertext" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicrosoftAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MicrosoftAccount_userId_accountId_key" ON "MicrosoftAccount"("userId", "accountId");
CREATE INDEX IF NOT EXISTS "MicrosoftAccount_userId_email_idx" ON "MicrosoftAccount"("userId", "email");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MicrosoftAccount_userId_fkey'
  ) THEN
    ALTER TABLE "MicrosoftAccount"
      ADD CONSTRAINT "MicrosoftAccount_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "AgentMemory" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'fact';
ALTER TABLE "AgentMemory" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "LlmRoute" ADD COLUMN IF NOT EXISTS "apiKeyCiphertext" TEXT;

DROP INDEX IF EXISTS "MailSummary_userId_externalMsgId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MailSummary_userId_sourceId_externalMsgId_key"
  ON "MailSummary"("userId", "sourceId", "externalMsgId");

DROP INDEX IF EXISTS "SenderProfile_userId_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "SenderProfile_userId_sourceId_email_key"
  ON "SenderProfile"("userId", "sourceId", "email");
