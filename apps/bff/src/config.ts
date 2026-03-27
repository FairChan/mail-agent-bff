import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  TRUST_PROXY: z.string().default("false"),
  OPENCLAW_GATEWAY_BASE_URL: z.url().default("http://127.0.0.1:18789"),
  OPENCLAW_GATEWAY_BEARER: z.string().min(1),
  BFF_API_KEY: z.string().min(16),
  OPENCLAW_AGENT_ID: z.string().min(1).default("main"),
  GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment config: ${details}`);
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

export const env = {
  ...parsed.data,
  trustProxy: parseTrustProxy(parsed.data.TRUST_PROXY),
  allowedTools: new Set(
    parsed.data.ALLOWED_TOOLS.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  ),
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
};

export type Env = typeof env;
