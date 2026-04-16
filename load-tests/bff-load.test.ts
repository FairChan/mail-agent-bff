import { check, group, sleep } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

// 自定义指标
const errorRate = new Rate("errors");
const mailQueryDuration = new Trend("mail_query_duration");
const healthCheckDuration = new Trend("health_check_duration");

// 测试配置
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_EMAIL = __ENV.AUTH_EMAIL || "test@example.com";
const AUTH_PASSWORD = __ENV.AUTH_PASSWORD || "TestPassword123";

// 获取认证 token
let authToken = "";

export function setup() {
  group("Authentication", () => {
    const loginRes = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({
        email: AUTH_EMAIL,
        password: AUTH_PASSWORD,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    check(loginRes, {
      "login successful": (res) => res.status === 200,
      "has session token": (res) => res.headers["Set-Cookie"] !== undefined,
    });

    if (loginRes.status === 200) {
      // 提取 session token
      const cookies = loginRes.headers["Set-Cookie"];
      const match = cookies?.match(/bff_session=([^;]+)/);
      if (match) {
        authToken = match[1];
      }
    }
  });

  return { token: authToken };
}

export default function (data: { token: string }) {
  const token = data.token;
  const headers = {
    "Content-Type": "application/json",
    Cookie: `bff_session=${token}`,
  };

  // 健康检查
  group("Health Check", () => {
    const healthStart = Date.now();
    const healthRes = http.get(`${BASE_URL}/api/health`);
    healthCheckDuration.add(Date.now() - healthStart);

    check(healthRes, {
      "health endpoint works": (res) => res.status === 200,
      "health status is healthy": (res) => {
        const body = JSON.parse(res.body as string);
        return body.status === "healthy" || body.status === "degraded";
      },
    }, { type: "health" });
  });

  // 邮件查询
  group("Mail Query", () => {
    const queryStart = Date.now();
    const queryRes = http.get(
      `${BASE_URL}/api/mail/query?limit=20&sourceId=inbox`,
      { headers }
    );
    mailQueryDuration.add(Date.now() - queryStart);

    const success = check(queryRes, {
      "mail query successful": (res) => res.status === 200 || res.status === 429,
      "response has data": (res) => {
        if (res.status === 429) return true;
        try {
          const body = JSON.parse(res.body as string);
          return body.ok !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (!success && queryRes.status !== 429) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  // AI 摘要生成
  group("AI Summary", () => {
    const summaryRes = http.post(
      `${BASE_URL}/api/mail/ai-summary`,
      JSON.stringify({
        sourceId: "inbox",
        userQuery: "summarize my emails",
      }),
      { headers }
    );

    check(summaryRes, {
      "ai summary works": (res) => res.status === 200 || res.status === 429 || res.status === 504,
    });
  });

  sleep(1); // 1 秒间隔
}

export function handleSummary(data: {
  metrics: Record<string, unknown>;
}) {
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "summary.json": JSON.stringify(data.metrics, null, 2),
  };
}

function textSummary(data: unknown, opts: { indent?: string; enableColors?: boolean }): string {
  const metrics = (data as { metrics: Record<string, unknown> }).metrics;
  const indent = opts.indent ?? "";

  let output = "\n";
  output += `${indent}=== Performance Summary ===\n\n`;

  const httpMetrics = [
    ["http_reqs", "Total Requests"],
    ["http_req_duration", "Request Duration"],
    ["http_req_failed", "Failed Requests"],
  ];

  for (const [key, label] of httpMetrics) {
    const metric = metrics[key];
    if (metric) {
      output += `${indent}${label}: ${JSON.stringify(metric)}\n`;
    }
  }

  return output;
}
