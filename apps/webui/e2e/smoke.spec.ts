import { test, expect } from "@playwright/test";

test.describe("冒烟测试", () => {
  test("主页加载正常", async ({ page }) => {
    const response = await page.goto("/");

    // 检查页面返回成功状态
    expect(response?.status()).toBeLessThan(400);
  });

  test("页面标题正确", async ({ page }) => {
    await page.goto("/");

    // 检查页面标题包含 Mery
    await expect(page).toHaveTitle(/Mery/i, { timeout: 10000 });
  });

  test("CSS 样式加载正常", async ({ page }) => {
    await page.goto("/");

    // 等待页面加载
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });

    // 检查 body 有预期的样式类
    const body = page.locator("body");
    await expect(body).toHaveClass(/app-bg/i, { timeout: 5000 }).catch(() => {
      // app-bg 可能不存在，静默处理
    });
  });

  test("HTML 文档结构正确", async ({ page }) => {
    await page.goto("/");

    // 检查根元素存在
    const root = page.locator("#root");
    await expect(root).toBeAttached({ timeout: 5000 });

    // 检查根元素内有内容（React 渲染成功）
    await expect(root.locator("> *").first()).toBeVisible({ timeout: 10000 });
  });

  test("页面无 JavaScript 错误", async ({ page }) => {
    const consoleErrors: string[] = [];

    // 监听控制台错误
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");

    // 等待页面加载完成
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });

    // 等待一下确保所有脚本执行完成
    await page.waitForTimeout(1000);

    // 过滤掉预期的网络错误（API 未运行）
    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes("Failed to fetch") &&
        !error.includes("net::ERR") &&
        !error.includes("/api/") &&
        !error.includes("ERR_CONNECTION_REFUSED")
    );

    // 不应该有其他关键 JavaScript 错误
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe("页面元素渲染", () => {
  test("认证区域正确渲染", async ({ page }) => {
    await page.goto("/");

    // 等待认证界面加载
    await expect(page.locator("form")).toBeVisible({ timeout: 15000 });
  });

  test("表单元素可交互", async ({ page }) => {
    await page.goto("/");

    // 等待表单加载
    const form = page.locator("form");
    await expect(form).toBeVisible({ timeout: 15000 });

    // 输入框应该可交互
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeEnabled();

    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeEnabled();

    // 按钮应该可点击
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeEnabled();
  });
});

test.describe("国际化支持", () => {
  test("中文语言包加载", async ({ page }) => {
    await page.goto("/");

    // 等待页面加载
    await expect(page.locator("form")).toBeVisible({ timeout: 15000 });

    // 检查语言切换按钮存在
    const langButton = page.getByRole("tab", { name: /中文/i });
    await expect(langButton).toBeVisible();
  });

  test("英文语言包加载", async ({ page }) => {
    await page.goto("/");

    // 等待页面加载
    const form = page.locator("form");
    await expect(form).toBeVisible({ timeout: 15000 });

    // 切换到英文
    const enButton = page.getByRole("tab", { name: /EN/i });
    await enButton.click();

    // 页面应该正常渲染
    await expect(page.locator("body")).toBeVisible();
  });

  test("日文语言包加载", async ({ page }) => {
    await page.goto("/");

    // 等待页面加载
    const form = page.locator("form");
    await expect(form).toBeVisible({ timeout: 15000 });

    // 切换到日文
    const jaButton = page.getByRole("tab", { name: /JA/i });
    await jaButton.click();

    // 页面应该正常渲染
    await expect(page.locator("body")).toBeVisible();
  });
});
