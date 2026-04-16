import { check, group, sleep } from "k6";
import http from "k6/http";
import { Trend } from "k6/metrics";

const mailQueryDuration = new Trend("mail_query_duration");
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  scenarios: {
    spikes: {
      executor: "ramping-vus",
      startVUs: 5,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "1m", target: 100 },   // 突发到 100
        { duration: "30s", target: 5 },
        { duration: "1m", target: 5 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  group("Concurrent Mail Queries", () => {
    // 模拟多个并发请求
    const requests = {
      mail_inbox: {
        method: "GET",
        url: `${BASE_URL}/api/mail/query?limit=20`,
      },
      mail_sent: {
        method: "GET",
        url: `${BASE_URL}/api/mail/query?limit=20&folder=sent`,
      },
    };

    const responses = http.batch(requests);
    
    for (const res of Object.values(responses) as http.Response[]) {
      mailQueryDuration.add(res.timings.duration);
    }
  });

  sleep(2);
}
