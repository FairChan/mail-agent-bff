import type { Options } from "k6/options";

export const options: Options = {
  // 测试场景配置
  scenarios: {
    // 基础负载测试：模拟正常使用
    basic_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 10 },   // 2 分钟内升到 10 并发
        { duration: "5m", target: 10 },   // 保持 10 并发 5 分钟
        { duration: "2m", target: 0 },   // 2 分钟内降到 0
      ],
      tags: { test_type: "basic_load" },
    },
    
    // 峰值负载测试
    peak_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 },   // 1 分钟内升到 50 并发
        { duration: "3m", target: 50 },  // 保持 50 并发 3 分钟
        { duration: "1m", target: 0 },    // 1 分钟内降到 0
      ],
      tags: { test_type: "peak_load" },
    },
    
    // 压力测试：逐步增加直到崩溃点
    stress_test: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 20 },
        { duration: "2m", target: 40 },
        { duration: "2m", target: 60 },
        { duration: "2m", target: 80 },
        { duration: "2m", target: 100 },
      ],
      tags: { test_type: "stress" },
    },
  },
  
  // 阈值配置
  thresholds: {
    // HTTP 阈值
    http_req_duration: ["p(95)<500"],     // 95% 请求 < 500ms
    http_req_failed: ["rate<0.01"],       // 失败率 < 1%
    
    // 自定义阈值
    "http_req_duration{test_type:basic_load}": ["p(95)<300"],
    "http_req_duration{test_type:peak_load}": ["p(95)<800"],
    
    // 检查阈值
    "checks{type:health}": ["rate>=0.99"],
  },
};
