-- CreateTable
CREATE TABLE "AgentPrivacyState" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPrivacyState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPrivacyState_threadId_key" ON "AgentPrivacyState"("threadId");

-- CreateIndex
CREATE INDEX "AgentPrivacyState_userId_sourceId_expiresAt_idx" ON "AgentPrivacyState"("userId", "sourceId", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentPrivacyState_expiresAt_idx" ON "AgentPrivacyState"("expiresAt");

-- AddForeignKey
ALTER TABLE "AgentPrivacyState" ADD CONSTRAINT "AgentPrivacyState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
