import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  TRUST_PROXY: z.string().default("false"),
  AGENT_RUNTIME: z.enum(["mastra", "openclaw"]).default("mastra"),
  OPENCLAW_GATEWAY_BASE_URL: z.url().default("http://127.0.0.1:18789"),
  OPENCLAW_GATEWAY_BEARER: z.string().optional(),
  COMPOSIO_PLATFORM_URL: z.url().default("https://platform.composio.dev/"),
  COMPOSIO_API_KEY: z.string().optional(),
  BFF_API_KEY: z.string().min(16),
  OPENCLAW_AGENT_ID: z.string().min(1).default("main"),
  GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  AGENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(6),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(30).default(8),
  LLM_PROVIDER_BASE_URL: z.string().optional(),
  LLM_PROVIDER_API_KEY: z.string().optional(),
  LLM_PROVIDER_MODEL: z.string().optional(),
  SILICONFLOW_BASE_URL: z.string().optional(),
  SILICONFLOW_API_KEY: z.string().optional(),
  SILICONFLOW_MODEL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  PRISMA_AUTH_ENABLED: z.string().default("false"),
  ENABLE_EMAIL_PERSISTENCE: z.string().default("false"),
  NODE_ENV: z.string().default("development"),
  SMTP_ENABLED: z.string().default("false"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.string().default("false"),
  OAUTH_ENABLED: z.string().default("false"),
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),
  OAUTH_REFRESH_TOKEN: z.string().optional(),
  OAUTH_USER: z.string().optional(),
  SESSION_TTL_MS: z.coerce.number().int().min(60000).max(604800000).default(28800000),
  LOGIN_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(1000).default(30),
  ALLOWED_TOOLS: z
    .string()
    .default(
      "COMPOSIO_SEARCH_TOOLS,COMPOSIO_GET_TOOL_SCHEMAS,COMPOSIO_MANAGE_CONNECTIONS,COMPOSIO_WAIT_FOR_CONNECTIONS,COMPOSIO_MULTI_EXECUTE_TOOL,sessions_list,session_status"
    ),
  CORS_ORIGINS: z
    .string()
    .default("http://127.0.0.1:5173,http://localhost:5173"),
  REDIS_AUTH_SESSIONS_ENABLED: z.string().default("false"),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  REDIS_KEY_PREFIX: z.string().min(1).default("true_sight:bff"),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(3000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment config: ${details}`);
}

const llmProviderBaseUrl =
  parsed.data?.LLM_PROVIDER_BASE_URL?.trim() || parsed.data?.SILICONFLOW_BASE_URL?.trim() || "";
const llmProviderApiKey =
  parsed.data?.LLM_PROVIDER_API_KEY?.trim() || parsed.data?.SILICONFLOW_API_KEY?.trim() || "";
const llmProviderModel =
  parsed.data?.LLM_PROVIDER_MODEL?.trim() || parsed.data?.SILICONFLOW_MODEL?.trim() || "";

if (parsed.success) {
  const runtime = parsed.data.AGENT_RUNTIME;
  const missing: string[] = [];
  if (runtime === "openclaw" && !parsed.data.OPENCLAW_GATEWAY_BEARER?.trim()) {
    missing.push("OPENCLAW_GATEWAY_BEARER");
  }
  if (runtime === "mastra") {
    if (!llmProviderBaseUrl) missing.push("LLM_PROVIDER_BASE_URL or SILICONFLOW_BASE_URL");
    if (!llmProviderApiKey) missing.push("LLM_PROVIDER_API_KEY or SILICONFLOW_API_KEY");
    if (!llmProviderModel) missing.push("LLM_PROVIDER_MODEL or SILICONFLOW_MODEL");
  }
  if (missing.length > 0) {
    throw new Error(`Invalid environment config: missing ${missing.join(", ")} for AGENT_RUNTIME=${runtime}`);
  }
}

function parseTrustProxy(raw: string): boolean | number | string[] {
  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "yes") {
    return true;
  }

  if (value === "false" || value === "no" || value.length === 0) {
    return false;
  }

  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseBooleanFlag(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value === "true" || value === "yes" || value === "1";
}

export const env = {
  ...parsed.data,
  agentRuntime: parsed.data.AGENT_RUNTIME,
  llmProviderBaseUrl,
  llmProviderApiKey,
  llmProviderModel,
  composioApiKey: parsed.data.COMPOSIO_API_KEY?.trim() || "",
  siliconFlowApiKey: parsed.data.SILICONFLOW_API_KEY?.trim() || "",
  siliconFlowBaseUrl: parsed.data.SILICONFLOW_BASE_URL?.trim() || "",
  siliconFlowModel: parsed.data.SILICONFLOW_MODEL?.trim() || "",
  smtpEnabled: parseBooleanFlag(parsed.data.SMTP_ENABLED),
  smtpSecure: parseBooleanFlag(parsed.data.SMTP_SECURE),
  oauthEnabled: parseBooleanFlag(parsed.data.OAUTH_ENABLED),
  oauthClientId: parsed.data.OAUTH_CLIENT_ID?.trim() || "",
  oauthClientSecret: parsed.data.OAUTH_CLIENT_SECRET?.trim() || "",
  oauthRefreshToken: parsed.data.OAUTH_REFRESH_TOKEN?.trim() || "",
  oauthUser: parsed.data.OAUTH_USER?.trim() || "",
  trustProxy: parseTrustProxy(parsed.data.TRUST_PROXY),
  allowedTools: new Set(
    parsed.data.ALLOWED_TOOLS.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  ),
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
  redisAuthSessionsEnabled: parseBooleanFlag(parsed.data.REDIS_AUTH_SESSIONS_ENABLED),
};

export type Env = typeof env;
