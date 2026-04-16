/**
 * Agent 路由
 * 包含 /api/agent/* 和 /api/gateway/* 端点
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { InvokeToolInput } from "../gateway.js";

export type AgentDeps = {
  invokeTool: (input: InvokeToolInput) => Promise<unknown>;
  queryAgent: (input: {
    message: string;
    user?: string;
    sessionKey?: string;
    timeoutMs?: number;
  }) => Promise<unknown>;
  sessionTokenForRequest: (request: FastifyRequest) => string | null;
  gatewayInvokeDenylist: Set<string>;
  recordMetric: (operation: string, durationMs: number, success: boolean) => void;
};

const gatewayInvokeSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
  action: z.string().optional(),
  sessionKey: z.string().optional(),
});

const agentQuerySchema = z.object({
  message: z.string().min(1),
  timeoutMs: z.number().optional(),
});

const agentMailQuerySchema = z.object({
  question: z.string().min(1),
  limit: z.number().optional(),
  horizonDays: z.number().optional(),
  timeZone: z.string().optional(),
});

export function registerAgentRoutes(server: FastifyInstance, deps: AgentDeps) {
  function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const token = deps.sessionTokenForRequest(request);
    if (!token) {
      reply.status(401);
      return null;
    }
    return token;
  }

  // ========== Gateway 工具调用 ==========

  server.post("/api/gateway/tools/invoke", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const parsed = gatewayInvokeSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: "Invalid request body" };
    }

    const { tool, args, action, sessionKey } = parsed.data;

    // 安全检查：禁止高危工具
    if (deps.gatewayInvokeDenylist.has(tool)) {
      reply.status(403);
      return { ok: false, error: `Tool '${tool}' is not allowed via HTTP API` };
    }

    try {
      const result = await deps.invokeTool({
        tool,
        args: args ?? {},
        action,
        sessionKey,
      });
      deps.recordMetric("gateway_invoke", Date.now() - start, true);
      return { ok: true, result };
    } catch (err) {
      deps.recordMetric("gateway_invoke", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });

  // ========== Agent 查询 ==========

  server.post("/api/agent/query", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const parsed = agentQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: "Invalid request body" };
    }

    const { message, timeoutMs } = parsed.data;

    try {
      const result = await deps.queryAgent({
        message,
        user: token,
        timeoutMs,
      });
      deps.recordMetric("agent_query", Date.now() - start, true);
      return { ok: true, result };
    } catch (err) {
      deps.recordMetric("agent_query", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });

  // ========== Agent 邮件问答 (简化版) ==========

  server.post("/api/agent/mail-query", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const token = requireAuth(request, reply);
    if (!token) return;

    const parsed = agentMailQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { ok: false, error: "Invalid request body" };
    }

    const { question, limit = 20, horizonDays = 7, timeZone = "Asia/Shanghai" } = parsed.data;

    try {
      const result = await deps.queryAgent({
        message: `You are a mail assistant. The user asks: "${question}". ` +
          `Please answer based on the available mail context. ` +
          `Limit: ${limit} emails, Horizon: ${horizonDays} days, TimeZone: ${timeZone}`,
        user: token,
        timeoutMs: 30000,
      });
      deps.recordMetric("agent_mail_query", Date.now() - start, true);
      return { ok: true, result };
    } catch (err) {
      deps.recordMetric("agent_mail_query", Date.now() - start, false);
      reply.status(502);
      return { ok: false, error: String(err) };
    }
  });
}
