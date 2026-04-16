/**
 * 健康检查路由
 * 包含 /live, /ready, /health, /api/meta 端点
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { HealthCheckResult } from "../types/health.js";

type MetricsStore = {
  getMetrics: () => Promise<Record<string, { count: number; totalDurationMs: number; errors: number }>>;
};

export type HealthCheckServices = {
  redis: { status: "up" | "down" | "disabled"; latencyMs?: number; error?: string };
  prisma: { status: "up" | "down" | "disabled"; latencyMs?: number; error?: string };
  gateway: { status: "up" | "down" | "disabled"; latencyMs?: number; error?: string };
};

export interface HealthCheckDeps {
  prismaAuthStore: unknown;
  redisMetricsStore: MetricsStore;
  getGatewayHealth: () => Promise<HealthCheckServices["gateway"]>;
  getPrismaHealth: () => Promise<HealthCheckServices["prisma"]>;
  getRedisHealth: () => Promise<HealthCheckServices["redis"]>;
  serverStartTime: number;
}

export function registerHealthRoutes(
  server: FastifyInstance,
  deps: HealthCheckDeps
) {
  // 存活探针 - Kubernetes liveness probe
  server.get("/live", async () => {
    return { status: "alive", timestamp: new Date().toISOString() };
  });

  // 就绪探针 - Kubernetes readiness probe
  server.get("/ready", async (_request: FastifyRequest, reply: FastifyReply) => {
    const [redisHealth, prismaHealth] = await Promise.allSettled([
      deps.getRedisHealth(),
      deps.getPrismaHealth(),
    ]);

    const redis = redisHealth.status === "fulfilled" ? redisHealth.value : { status: "down" as const, error: "unavailable" };
    const prisma = prismaHealth.status === "fulfilled" ? prismaHealth.value : { status: "down" as const, error: "unavailable" };

    const isReady = redis.status === "up" && prisma.status === "up";

    if (!isReady) {
      reply.status(503);
    }

    return {
      status: isReady ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      services: { redis, prisma },
    };
  });

  // 详细健康检查
  server.get("/health", async (_request: FastifyRequest, reply: FastifyReply) => {
    const [redisHealth, prismaHealth, gatewayHealth] = await Promise.allSettled([
      deps.getRedisHealth(),
      deps.getPrismaHealth(),
      deps.getGatewayHealth(),
    ]);

    const services: HealthCheckServices = {
      redis: redisHealth.status === "fulfilled" ? redisHealth.value : { status: "down" as const, error: "unavailable" },
      prisma: prismaHealth.status === "fulfilled" ? prismaHealth.value : { status: "down" as const, error: "unavailable" },
      gateway: gatewayHealth.status === "fulfilled" ? gatewayHealth.value : { status: "down" as const, error: "unavailable" },
    };

    const allUp = Object.values(services).every((s) => s.status === "up");
    const allDown = Object.values(services).every((s) => s.status === "down");

    let status: HealthCheckResult["status"];
    if (allUp) {
      status = "healthy";
    } else if (allDown) {
      status = "unhealthy";
    } else {
      status = "degraded";
    }

    const result: HealthCheckResult = {
      status,
      timestamp: new Date().toISOString(),
      services,
      uptime: Date.now() - deps.serverStartTime,
    };

    if (status === "unhealthy") {
      reply.status(503);
    }

    return result;
  });

  // 元信息端点
  server.get("/api/meta", async () => {
    return {
      name: "Mail Agent BFF",
      version: process.env.npm_package_version ?? "1.0.0",
      environment: process.env.NODE_ENV ?? "development",
      timestamp: new Date().toISOString(),
      capabilities: {
        outlook: true,
        knowledgeBase: true,
        aiSummary: true,
        calendar: true,
        notification: true,
      },
    };
  });

  // Prometheus 指标端点
  server.get("/api/metrics/prometheus", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await deps.redisMetricsStore.getMetrics();
      const lines: string[] = [
        '# HELP mail_agent_bff_up BFF service is up',
        '# TYPE mail_agent_bff_up gauge',
        'mail_agent_bff_up 1',
        `# HELP mail_agent_bff_uptime_seconds BFF uptime in seconds`,
        '# TYPE mail_agent_bff_uptime_seconds gauge',
        `mail_agent_bff_uptime_seconds ${Math.floor((Date.now() - deps.serverStartTime) / 1000)}`,
      ];

      for (const [op, data] of Object.entries(metrics)) {
        const m = data as { count: number; totalDurationMs: number; errors: number };
        const label = op.replace(/[^a-zA-Z0-9_]/g, "_");
        lines.push(`# HELP mail_agent_bff_operations_total Total operations for ${op}`);
        lines.push(`# TYPE mail_agent_bff_operations_total counter`);
        lines.push(`mail_agent_bff_operations_total{operation="${label}"} ${m.count}`);
        lines.push(`# HELP mail_agent_bff_errors_total Total errors for ${op}`);
        lines.push(`# TYPE mail_agent_bff_errors_total counter`);
        lines.push(`mail_agent_bff_errors_total{operation="${label}"} ${m.errors}`);
        if (m.count > 0) {
          const avgDuration = m.totalDurationMs / m.count;
          lines.push(`# HELP mail_agent_bff_operation_duration_ms_avg Average operation duration for ${op}`);
          lines.push(`# TYPE mail_agent_bff_operation_duration_ms_avg gauge`);
          lines.push(`mail_agent_bff_operation_duration_ms_avg{operation="${label}"} ${avgDuration.toFixed(2)}`);
        }
      }

      reply.header("Content-Type", "text/plain; charset=utf-8");
      return lines.join("\n") + "\n";
    } catch {
      reply.status(500);
      return "# Error collecting metrics\n";
    }
  });
}
