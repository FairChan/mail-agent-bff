-- Mastra embedded mail agent runtime, usage, memory, and DB-backed mail KB tables.

CREATE TABLE "AgentThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LlmRoute" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sourceId" TEXT,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "routeId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalMsgId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "importanceScore" DOUBLE PRECISION NOT NULL,
    "urgencyScore" DOUBLE PRECISION NOT NULL,
    "horizon" TEXT,
    "webLink" TEXT,
    "eventId" TEXT,
    "senderId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "type" TEXT,
    "title" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "keyInfo" TEXT NOT NULL DEFAULT '{}',
    "relatedMailCount" INTEGER NOT NULL DEFAULT 0,
    "firstMailAt" TIMESTAMP(3),
    "lastMailAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SenderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "importance" DOUBLE PRECISION,
    "summaryText" TEXT,
    "keyInfo" TEXT NOT NULL DEFAULT '{}',
    "totalMailCount" INTEGER NOT NULL DEFAULT 0,
    "lastMailAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SenderProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailScoreIndex" (
    "mailId" TEXT NOT NULL,
    "importanceScore" DOUBLE PRECISION NOT NULL,
    "urgencyScore" DOUBLE PRECISION NOT NULL,
    "quadrant" TEXT NOT NULL,
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailScoreIndex_pkey" PRIMARY KEY ("mailId")
);

CREATE TABLE "SubjectIndex" (
    "mailId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectIndex_pkey" PRIMARY KEY ("mailId")
);

CREATE INDEX "AgentThread_userId_sourceId_updatedAt_idx" ON "AgentThread"("userId", "sourceId", "updatedAt");
CREATE INDEX "AgentMessage_threadId_createdAt_idx" ON "AgentMessage"("threadId", "createdAt");
CREATE INDEX "AgentMessage_userId_sourceId_createdAt_idx" ON "AgentMessage"("userId", "sourceId", "createdAt");
CREATE UNIQUE INDEX "AgentMemory_userId_sourceId_key_key" ON "AgentMemory"("userId", "sourceId", "key");
CREATE INDEX "AgentMemory_userId_sourceId_updatedAt_idx" ON "AgentMemory"("userId", "sourceId", "updatedAt");
CREATE INDEX "LlmRoute_userId_sourceId_enabled_idx" ON "LlmRoute"("userId", "sourceId", "enabled");
CREATE INDEX "LlmUsage_userId_sourceId_createdAt_idx" ON "LlmUsage"("userId", "sourceId", "createdAt");
CREATE INDEX "LlmUsage_routeId_createdAt_idx" ON "LlmUsage"("routeId", "createdAt");
CREATE UNIQUE INDEX "MailSummary_userId_externalMsgId_key" ON "MailSummary"("userId", "externalMsgId");
CREATE INDEX "MailSummary_userId_sourceId_processedAt_idx" ON "MailSummary"("userId", "sourceId", "processedAt");
CREATE INDEX "MailSummary_eventId_idx" ON "MailSummary"("eventId");
CREATE INDEX "MailSummary_senderId_idx" ON "MailSummary"("senderId");
CREATE UNIQUE INDEX "MailEvent_userId_id_key" ON "MailEvent"("userId", "id");
CREATE INDEX "MailEvent_userId_sourceId_lastMailAt_idx" ON "MailEvent"("userId", "sourceId", "lastMailAt");
CREATE INDEX "MailEvent_userId_sourceId_startAt_idx" ON "MailEvent"("userId", "sourceId", "startAt");
CREATE INDEX "MailEvent_type_idx" ON "MailEvent"("type");
CREATE UNIQUE INDEX "SenderProfile_userId_email_key" ON "SenderProfile"("userId", "email");
CREATE INDEX "SenderProfile_userId_sourceId_lastSeenAt_idx" ON "SenderProfile"("userId", "sourceId", "lastSeenAt");
CREATE INDEX "MailScoreIndex_quadrant_idx" ON "MailScoreIndex"("quadrant");
CREATE INDEX "SubjectIndex_subject_idx" ON "SubjectIndex"("subject");

ALTER TABLE "AgentThread" ADD CONSTRAINT "AgentThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentThread" ADD CONSTRAINT "AgentThread_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AgentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LlmRoute" ADD CONSTRAINT "LlmRoute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LlmRoute" ADD CONSTRAINT "LlmRoute_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailSummary" ADD CONSTRAINT "MailSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailSummary" ADD CONSTRAINT "MailSummary_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailSummary" ADD CONSTRAINT "MailSummary_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MailEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MailSummary" ADD CONSTRAINT "MailSummary_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "SenderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MailEvent" ADD CONSTRAINT "MailEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailEvent" ADD CONSTRAINT "MailEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SenderProfile" ADD CONSTRAINT "SenderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SenderProfile" ADD CONSTRAINT "SenderProfile_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MailSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailScoreIndex" ADD CONSTRAINT "MailScoreIndex_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "MailSummary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectIndex" ADD CONSTRAINT "SubjectIndex_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "MailSummary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
