import type { FastifyBaseLogger } from "fastify";
import { env } from "../config.js";
import { MastraRuntime } from "./mastra-runtime.js";
import { OpenClawRuntime } from "./openclaw-runtime.js";
import type { AgentRuntime } from "./types.js";

export function createAgentRuntime(logger: FastifyBaseLogger): AgentRuntime {
  if (env.agentRuntime === "openclaw") {
    return new OpenClawRuntime();
  }

  return new MastraRuntime(logger);
}

export type { TenantContext } from "./types.js";
