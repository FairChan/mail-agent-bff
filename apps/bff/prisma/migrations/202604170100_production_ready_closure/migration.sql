ALTER TABLE "MailSource"
  ADD COLUMN IF NOT EXISTS "connectionTrustedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "connectionTrustSource" TEXT,
  ADD COLUMN IF NOT EXISTS "connectionTrustDetailsJson" TEXT;

UPDATE "MailSource"
SET
  "connectionTrustedAt" = COALESCE("connectionTrustedAt", "updatedAt", NOW()),
  "connectionTrustSource" = COALESCE("connectionTrustSource", 'microsoft_direct_migration'),
  "connectionTrustDetailsJson" = COALESCE("connectionTrustDetailsJson", '{"reason":"microsoft direct source existed before trust fields"}')
WHERE
  "connectionType" = 'microsoft'
  AND "microsoftAccountId" IS NOT NULL
  AND "connectionTrustedAt" IS NULL;

UPDATE "MailSource"
SET
  "enabled" = FALSE,
  "routingVerifiedAt" = NULL,
  "routingStatusJson" = NULL
WHERE
  "connectionType" = 'composio'
  AND "connectedAccountId" IS NOT NULL
  AND "connectionTrustedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "MailSource_userId_connectionType_connectionTrustedAt_idx"
  ON "MailSource"("userId", "connectionType", "connectionTrustedAt");

CREATE TABLE IF NOT EXISTS "MailKbJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "totalMails" INTEGER NOT NULL DEFAULT 0,
  "processedMails" INTEGER NOT NULL DEFAULT 0,
  "totalEvents" INTEGER NOT NULL DEFAULT 0,
  "totalPersons" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MailKbJob_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MailKbJob_userId_fkey'
  ) THEN
    ALTER TABLE "MailKbJob"
      ADD CONSTRAINT "MailKbJob_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MailKbJob_sourceId_fkey'
  ) THEN
    ALTER TABLE "MailKbJob"
      ADD CONSTRAINT "MailKbJob_sourceId_fkey"
      FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MailKbJob_userId_sourceId_createdAt_idx"
  ON "MailKbJob"("userId", "sourceId", "createdAt");

CREATE INDEX IF NOT EXISTS "MailKbJob_status_createdAt_idx"
  ON "MailKbJob"("status", "createdAt");
