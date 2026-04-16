-- Mery Database Initialization
-- Note: Prisma Migrate will handle schema creation automatically

-- Create extension for UUID generation (optional)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE "mery" TO mery;
