-- Agent runtime tables must support the virtual default source id
-- (`default_outlook`) which does not exist in the MailSource table.
-- Keep sourceId for tenant scoping, but remove the DB-level FK.

ALTER TABLE "AgentThread" DROP CONSTRAINT IF EXISTS "AgentThread_sourceId_fkey";
ALTER TABLE "AgentMessage" DROP CONSTRAINT IF EXISTS "AgentMessage_sourceId_fkey";
ALTER TABLE "AgentMemory" DROP CONSTRAINT IF EXISTS "AgentMemory_sourceId_fkey";
ALTER TABLE "LlmRoute" DROP CONSTRAINT IF EXISTS "LlmRoute_sourceId_fkey";
ALTER TABLE "LlmUsage" DROP CONSTRAINT IF EXISTS "LlmUsage_sourceId_fkey";
