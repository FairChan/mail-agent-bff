CREATE TABLE IF NOT EXISTS "GoogleAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "mailboxUserIdHint" TEXT,
  "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "accessTokenCiphertext" TEXT NOT NULL,
  "refreshTokenCiphertext" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GoogleAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GoogleAccount_userId_email_key"
  ON "GoogleAccount"("userId", "email");

CREATE INDEX IF NOT EXISTS "GoogleAccount_userId_email_idx"
  ON "GoogleAccount"("userId", "email");

ALTER TABLE "GoogleAccount"
  ADD CONSTRAINT "GoogleAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
