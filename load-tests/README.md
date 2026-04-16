# 性能压测

## 工具

使用 [k6](https://k6.io/) 进行负载测试。

## 测试类型

1. **基础负载测试** (`bff-load.test.ts`)
   - 模拟正常使用场景
   - 10 并发用户，持续 10 分钟
   - 验证响应时间 P95 < 500ms

2. **峰值负载测试** (`peak-load.test.ts`)
   - 测试突发流量
   - 5 → 100 → 5 并发
   - 验证系统稳定性

3. **压力测试** (`k6-config.ts`)
   - 逐步增加负载
   - 找出系统瓶颈
   - 20 → 100 并发

## 快速开始

```bash
# 安装 k6
brew install k6  # macOS
sudo apt install k6  # Linux

# 运行测试
BASE_URL=http://localhost:3000 ./run-tests.sh
```

## CI/CD 集成

测试在 GitHub Actions 中每天凌晨 4:00 自动运行。
