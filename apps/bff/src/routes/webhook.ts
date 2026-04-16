/**
 * Webhook 路由
 * 包含 /api/webhook/* 和 /api/mail/notifications/stream 端点
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { MetricsStore } from "./redis-session-store.js";

export type WebhookDeps = {
  setWebhookSecrets: (secrets: { secretKey?: string; inboundApiKey?: string }) => void;
  handleComposioMailEvent: (payload: unknown, headers: Record<string, string | undefined>) => Promise<unknown>;
  handleMsGraphNotification: (payload: unknown, headers: Record<string, string | undefined>) => Promise<unknown>;
  handleWebhookSubscribe: (payload: unknown, headers: Record<string, string | undefined>) => Promise<unknown>;
  getWebhookTunnelStatus: () => { tunnelUrl: string | null; lastCheck: number | null; healthy: boolean };
  updateTunnelUrl: (url: string) => void;
  purgeStaleSubscriptions: () => Promise<number>;
  registerMailNotificationStream: (
    sessionToken: string,
    reply: FastifyReply
  ) => { unregister: () => void; broadcastNewMailEvent: (event: unknown) => void };
  acquireStreamRef: (sessionToken: string) => boolean;
  releaseStreamRef: (sessionToken: string) => void;
  broadcastNewMailEvent: (sessionToken: string, event: unknown) => void;
  sessionTokenForRequest: (request: FastifyRequest) => string | null;
  recordMetric: (operation: string, durationMs: number, success: boolean) => void;
  getNotificationStreamIntervalMs: () => number;
  getNotificationStreamKeepaliveMs: () => number;
};

const subscribeSchema = z.object({
  challenge: z.string().optional(),
  webhookUrl: z.string().optional(),
  resource: z.string().optional(),
  notificationUrl: z.string().url().optional(),
  expirationDateTime: z.string().datetime().optional(),
});

export function registerWebhookRoutes(server: FastifyInstance, deps: WebhookDeps) {
  // 健康检查
  server.get("/api/webhook/status", async () => {
    const status = deps.getWebhookTunnelStatus();
    return {
      ok: true,
      result: {
        tunnelUrl: status.tunnelUrl,
        lastCheck: status.lastCheck,
        healthy: status.healthy,
        timestamp: new Date().toISOString(),
      },
    };
  });

  // 获取公开 URL
  server.get("/api/webhook/public-url", async (request: FastifyRequest, reply: FastifyReply) => {
    const tunnelStatus = deps.getWebhookTunnelStatus();
    if (!tunnelStatus.tunnelUrl) {
      reply.status(503);
      return { ok: false, error: "Tunnel URL not configured" };
    }
    return {
      ok: true,
      result: {
        publicUrl: tunnelStatus.tunnelUrl,
        expiresAt: null,
      },
    };
  });

  // 手动清理过期订阅
  server.post("/api/webhook/purge", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    try {
      const purged = await deps.purgeStaleSubscriptions();
      deps.recordMetric("webhook_purge", Date.now() - start, true);
      return { ok: true, result: { purgedSubscriptions: purged } };
    } catch (err) {
      deps.recordMetric("webhook_purge", Date.now() - start, false);
      reply.status(500);
      return { ok: false, error: String(err) };
    }
  });

  // Composio Webhook 订阅
  server.post("/api/webhook/subscribe", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const headers: Record<string, string | undefined> = {
      "x-composio-signature": request.headers["x-composio-signature"] as string | undefined,
      "x-webhook-secret": request.headers["x-webhook-secret"] as string | undefined,
    };

    try {
      const result = await deps.handleWebhookSubscribe(request.body, headers);
      deps.recordMetric("webhook_subscribe", Date.now() - start, true);
      return result;
    } catch (err) {
      deps.recordMetric("webhook_subscribe", Date.now() - start, false);
      reply.status(400);
      return { ok: false, error: String(err) };
    }
  });

  // Composio 邮件事件
  server.post("/api/webhook/mail-event", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const headers: Record<string, string | undefined> = {
      "x-composio-signature": request.headers["x-composio-signature"] as string | undefined,
      "x-webhook-secret": request.headers["x-webhook-secret"] as string | undefined,
    };

    try {
      const result = await deps.handleComposioMailEvent(request.body, headers);
      deps.recordMetric("webhook_mail_event", Date.now() - start, true);
      return result;
    } catch (err) {
      deps.recordMetric("webhook_mail_event", Date.now() - start, false);
      reply.status(400);
      return { ok: false, error: String(err) };
    }
  });

  // Microsoft Graph 订阅通知
  server.post("/api/webhook/outlook-subscription", async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    const headers: Record<string, string | undefined> = {
      "x-ms-clientprincipal-id": request.headers["x-ms-clientprincipal-id"] as string | undefined,
      "x-ms-clientprincipal-name": request.headers["x-ms-clientprincipal-name"] as string | undefined,
    };

    try {
      const result = await deps.handleMsGraphNotification(request.body, headers);
      deps.recordMetric("webhook_outlook_subscription", Date.now() - start, true);
      return result;
    } catch (err) {
      deps.recordMetric("webhook_outlook_subscription", Date.now() - start, false);
      reply.status(400);
      return { ok: false, error: String(err) };
    }
  });

  // 更新 Tunnel URL（内部使用）
  server.post("/api/webhook/update-tunnel", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    const url = String(body.url ?? "");

    if (!url) {
      reply.status(400);
      return { ok: false, error: "url is required" };
    }

    try {
      new URL(url);
    } catch {
      reply.status(400);
      return { ok: false, error: "Invalid URL format" };
    }

    deps.updateTunnelUrl(url);
    return { ok: true, result: { updatedUrl: url } };
  });

  // 通知流 - SSE (Server-Sent Events)
  server.get("/api/mail/notifications/stream", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionToken = deps.sessionTokenForRequest(request);
    if (!sessionToken) {
      reply.status(401);
      return reply.send({ ok: false, error: "Unauthorized" });
    }

    if (!deps.acquireStreamRef(sessionToken)) {
      reply.status(429);
      return reply.send({ ok: false, error: "Max streams reached for this session" });
    }

    const streamInterval = deps.getNotificationStreamIntervalMs();
    const keepalive = deps.getNotificationStreamKeepaliveMs();

    reply.raw!.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const streamId = `stream_${sessionToken}_${Date.now()}`;
    let lastPing = Date.now();

    // 心跳定时器
    const heartbeat = setInterval(() => {
      const elapsed = Date.now() - lastPing;
      if (elapsed > keepalive) {
        reply.raw!.write(`: ping\n\n`);
        lastPing = Date.now();
      }
    }, streamInterval);

    // 发送初始连接事件
    reply.raw!.write(`event: connected\ndata: ${JSON.stringify({ streamId, timestamp: new Date().toISOString() })}\n\n`);

    // 创建流引用
    const { unregister } = deps.registerMailNotificationStream(sessionToken, reply);

    request.raw!.on("close", () => {
      clearInterval(heartbeat);
      unregister();
      deps.releaseStreamRef(sessionToken);
    });

    request.raw!.on("error", () => {
      clearInterval(heartbeat);
      unregister();
      deps.releaseStreamRef(sessionToken);
    });
  });
}
