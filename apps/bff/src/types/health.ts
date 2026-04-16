/**
 * 健康检查类型
 */

export type HealthCheckServiceStatus = {
  status: "up" | "down" | "disabled";
  latencyMs?: number;
  error?: string;
};

export type HealthCheckResult = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    redis: HealthCheckServiceStatus;
    prisma: HealthCheckServiceStatus;
    gateway: HealthCheckServiceStatus;
  };
  uptime: number;
};
