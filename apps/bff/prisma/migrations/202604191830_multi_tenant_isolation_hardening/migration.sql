-- Multi-tenant isolation hardening.
-- The current product is personal-tenant first: tenantId is derived from User.id
-- in application code. This migration adds durable audit storage and relational
-- guard rails so source-owned rows cannot silently point at another user's
-- MailSource when Postgres is available.

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "sourceId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "outcome" TEXT NOT NULL DEFAULT 'success',
  "requestId" TEXT,
  "ipHash" TEXT,
  "userAgentHash" TEXT,
  "sessionHash" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_userId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_sourceId_createdAt_idx" ON "AuditLog"("sourceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "MailSource_id_userId_key" ON "MailSource"("id", "userId");

-- Remove rows that already violate source ownership before adding hard guards.
-- These deletes are intentionally scoped to derived/cache tables where the
-- source of truth can be rebuilt from the mailbox.
DELETE FROM "AgentThread" t
USING "MailSource" s
WHERE t."sourceId" = s."id" AND t."userId" <> s."userId";

DELETE FROM "AgentMessage" m
USING "MailSource" s
WHERE m."sourceId" = s."id" AND m."userId" <> s."userId";

DELETE FROM "AgentMemory" m
USING "MailSource" s
WHERE m."sourceId" = s."id" AND m."userId" <> s."userId";

DELETE FROM "LlmUsage" u
USING "MailSource" s
WHERE u."sourceId" = s."id" AND u."userId" <> s."userId";

DELETE FROM "MailKbJob" j
USING "MailSource" s
WHERE j."sourceId" = s."id" AND j."userId" <> s."userId";

DELETE FROM "MailSummary" m
USING "MailSource" s
WHERE m."sourceId" = s."id" AND m."userId" <> s."userId";

DELETE FROM "MailEvent" e
USING "MailSource" s
WHERE e."sourceId" = s."id" AND e."userId" <> s."userId";

DELETE FROM "SenderProfile" p
USING "MailSource" s
WHERE p."sourceId" = s."id" AND p."userId" <> s."userId";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentThread_sourceId_userId_fkey') THEN
    ALTER TABLE "AgentThread"
      ADD CONSTRAINT "AgentThread_sourceId_userId_fkey"
      FOREIGN KEY ("sourceId", "userId") REFERENCES "MailSource"("id", "userId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentMessage_sourceId_userId_fkey') THEN
    ALTER TABLE "AgentMessage"
      ADD CONSTRAINT "AgentMessage_sourceId_userId_fkey"
      FOREIGN KEY ("sourceId", "userId") REFERENCES "MailSource"("id", "userId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentMemory_sourceId_userId_fkey') THEN
    ALTER TABLE "AgentMemory"
      ADD CONSTRAINT "AgentMemory_sourceId_userId_fkey"
      FOREIGN KEY ("sourceId", "userId") REFERENCES "MailSource"("id", "userId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LlmUsage_sourceId_userId_fkey') THEN
    ALTER TABLE "LlmUsage"
      ADD CONSTRAINT "LlmUsage_sourceId_userId_fkey"
      FOREIGN KEY ("sourceId", "userId") REFERENCES "MailSource"("id", "userId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MailKbJob_sourceId_userId_fkey') THEN
    ALTER TABLE "MailKbJob"
      ADD CONSTRAINT "MailKbJob_sourceId_userId_fkey"
      FOREIGN KEY ("sourceId", "userId") REFERENCES "MailSource"("id", "userId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MailSummary_sourceId_userId_fkey') THEN
    ALTER TABLE "MailSummary"
      ADD CONSTRAINT "MailSummary_sourceId_userId_fkey"
      FOREIGN KEY ("sourceId", "userId") REFERENCES "MailSource"("id", "userId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MailEvent_sourceId_userId_fkey') THEN
    ALTER TABLE "MailEvent"
      ADD CONSTRAINT "MailEvent_sourceId_userId_fkey"
      FOREIGN KEY ("sourceId", "userId") REFERENCES "MailSource"("id", "userId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SenderProfile_sourceId_userId_fkey') THEN
    ALTER TABLE "SenderProfile"
      ADD CONSTRAINT "SenderProfile_sourceId_userId_fkey"
      FOREIGN KEY ("sourceId", "userId") REFERENCES "MailSource"("id", "userId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS is intentionally not enabled in this migration. The current runtime uses
-- a shared Prisma client and does not yet set request-local `mery.user_id` /
-- `mery.tenant_id` for every database transaction. Enabling RLS here would be
-- either a no-op for table-owner roles or a deployment breaker for non-owner
-- roles. The immediate hardening in this migration is the audit table plus
-- composite source-owner foreign keys above.
