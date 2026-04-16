# 安全测试

## OWASP ZAP 扫描

### 快速开始

```bash
# 安装依赖
docker pull owasp/zap2docker-stable

# 运行扫描
./zap-scan.sh

# 指定目标
TARGET_URL=https://staging.true-sight.asia ./zap-scan.sh
```

### 扫描类型

1. **Baseline Scan**：快速扫描，15-30 分钟
   - 检查常见配置问题
   - 不执行主动攻击

2. **Full Scan**：深度扫描，1-2 小时
   ```bash
   docker run --rm \
     -v "$(pwd):/zap/wrk:rw" \
     owasp/zap2docker-stable:latest \
     zap-full-scan.py -t "$TARGET_URL" -J report.json
   ```

3. **API Scan**：API 特定扫描
   ```bash
   docker run --rm \
     -v "$(pwd):/zap/wrk:rw" \
     owasp/zap2docker-stable:latest \
     zap-api-scan.py -t "$TARGET_URL/openapi.json" -f openapi
   ```

### 告警级别

- **High**：需要立即修复（如 SQL 注入、XSS）
- **Medium**：应该修复（如 CSRF、敏感信息泄露）
- **Low**：建议修复（如缺少安全头）
- **Informational**：信息性（如调试信息）

### 修复指南

| 告警 | 修复方案 |
|------|---------|
| SQL Injection | 使用参数化查询或 ORM |
| XSS | 输出编码 + CSP |
| CSRF | SameSite Cookie + CSRF Token |
| Sensitive Data Exposure | HTTPS + 加密敏感数据 |
| Missing Security Headers | 配置 CSP/X-Frame-Options 等 |

### CI/CD 集成

在 GitHub Actions 中添加：

```yaml
security-zap:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Run ZAP Scan
      run: |
        docker pull owasp/zap2docker-stable
        docker run --rm \
          -v "$(pwd):/zap/wrk:rw" \
          owasp/zap2docker-stable:latest \
          zap-baseline.py -t "${{ secrets.ZAP_TARGET_URL }}" -J zap-report.json
    - name: Upload Report
      uses: actions/upload-artifact@v4
      with:
        name: zap-report
        path: zap-report.json
```

## 定期安全检查

建议每周运行一次完整扫描，并审查新发现的告警。
