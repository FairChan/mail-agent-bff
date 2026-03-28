-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailSource" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "emailHint" TEXT NOT NULL,
    "mailboxUserId" TEXT,
    "connectedAccountId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriorityRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT,
    "name" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "quadrant" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriorityRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSession_tokenHash_key" ON "AppSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AppSession_userId_expiresAt_idx" ON "AppSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "MailSource_userId_createdAt_idx" ON "MailSource"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailSource_userId_externalId_key" ON "MailSource"("userId", "externalId");

-- CreateIndex
CREATE INDEX "PriorityRule_userId_sourceId_enabled_priority_idx" ON "PriorityRule"("userId", "sourceId", "enabled", "priority");

-- AddForeignKey
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailSource" ADD CONSTRAINT "MailSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityRule" ADD CONSTRAINT "PriorityRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityRule" ADD CONSTRAINT "PriorityRule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

