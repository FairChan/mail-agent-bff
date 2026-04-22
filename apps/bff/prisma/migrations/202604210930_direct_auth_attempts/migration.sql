-- CreateTable
CREATE TABLE "DirectAuthAttempt" (
    "id" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "message" TEXT,
    "detail" TEXT,
    "payloadJson" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectAuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectAuthAttempt_sessionHash_provider_attemptId_key" ON "DirectAuthAttempt"("sessionHash", "provider", "attemptId");

-- CreateIndex
CREATE INDEX "DirectAuthAttempt_sessionHash_expiresAt_idx" ON "DirectAuthAttempt"("sessionHash", "expiresAt");

-- CreateIndex
CREATE INDEX "DirectAuthAttempt_userId_expiresAt_idx" ON "DirectAuthAttempt"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "DirectAuthAttempt_expiresAt_idx" ON "DirectAuthAttempt"("expiresAt");

-- AddForeignKey
ALTER TABLE "DirectAuthAttempt" ADD CONSTRAINT "DirectAuthAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
