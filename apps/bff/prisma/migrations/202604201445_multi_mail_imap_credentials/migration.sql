CREATE TABLE IF NOT EXISTS "MailSourceCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "host" TEXT NOT NULL,
  "port" INTEGER NOT NULL,
  "secure" BOOLEAN NOT NULL DEFAULT true,
  "secretCiphertext" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailSourceCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MailSourceCredential_sourceId_key"
  ON "MailSourceCredential"("sourceId");

CREATE UNIQUE INDEX IF NOT EXISTS "MailSourceCredential_sourceId_userId_key"
  ON "MailSourceCredential"("sourceId", "userId");

CREATE INDEX IF NOT EXISTS "MailSourceCredential_userId_idx"
  ON "MailSourceCredential"("userId");

CREATE INDEX IF NOT EXISTS "MailSourceCredential_userId_sourceId_idx"
  ON "MailSourceCredential"("userId", "sourceId");

ALTER TABLE "MailSourceCredential"
  ADD CONSTRAINT "MailSourceCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailSourceCredential"
  ADD CONSTRAINT "MailSourceCredential_sourceId_userId_fkey"
  FOREIGN KEY ("sourceId", "userId") REFERENCES "MailSource"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
