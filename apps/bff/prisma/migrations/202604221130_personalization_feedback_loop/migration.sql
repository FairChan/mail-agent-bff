-- CreateTable
CREATE TABLE "PersonalizationFeedbackEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "quadrant" TEXT,
    "dwellMs" INTEGER,
    "contextJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalizationFeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizationOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "quadrant" TEXT NOT NULL,
    "contextJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizationLearnedSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "evidenceJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizationLearnedSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonalizationFeedbackEvent_userId_sourceId_createdAt_idx" ON "PersonalizationFeedbackEvent"("userId", "sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalizationFeedbackEvent_userId_sourceId_targetType_targetI_idx" ON "PersonalizationFeedbackEvent"("userId", "sourceId", "targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalizationFeedbackEvent_userId_sourceId_eventType_created_idx" ON "PersonalizationFeedbackEvent"("userId", "sourceId", "eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalizationOverride_userId_sourceId_targetType_targetId_key" ON "PersonalizationOverride"("userId", "sourceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "PersonalizationOverride_userId_sourceId_updatedAt_idx" ON "PersonalizationOverride"("userId", "sourceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalizationLearnedSignal_userId_sourceId_kind_value_key" ON "PersonalizationLearnedSignal"("userId", "sourceId", "kind", "value");

-- CreateIndex
CREATE INDEX "PersonalizationLearnedSignal_userId_sourceId_kind_updatedAt_idx" ON "PersonalizationLearnedSignal"("userId", "sourceId", "kind", "updatedAt");

-- AddForeignKey
ALTER TABLE "PersonalizationFeedbackEvent" ADD CONSTRAINT "PersonalizationFeedbackEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizationOverride" ADD CONSTRAINT "PersonalizationOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizationLearnedSignal" ADD CONSTRAINT "PersonalizationLearnedSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
