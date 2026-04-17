import { expect, test, type Page } from "@playwright/test";

function registerSwitch(page: Page) {
  return page.getByRole("button", { name: /去注册|register|create account/i });
}

test.describe("auth flow", () => {
  test("renders the login screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });

    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("keeps language switch controls usable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });

    const englishButton = page.getByRole("button", { name: /EN/i });
    const japaneseButton = page.getByRole("button", { name: /JA/i });
    const chineseButton = page.getByRole("button", { name: /中文/i });

    if (await englishButton.isVisible()) {
      await englishButton.click();
      await expect(page.locator("body")).toBeVisible();
    }

    if (await japaneseButton.isVisible()) {
      await japaneseButton.click();
      await expect(page.locator("body")).toBeVisible();
    }

    if (await chineseButton.isVisible()) {
      await chineseButton.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("switches to the register screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });

    const switchButton = registerSwitch(page);
    await expect(switchButton).toBeVisible({ timeout: 5000 });
    await switchButton.click();

    await expect(page.locator("form")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toHaveCount(2);
  });
});

test.describe("login validation", () => {
  test("keeps the page stable on empty submit", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });

    await page.locator('button[type="submit"]').click();
    await expect(page.locator("body")).toBeVisible();
  });

  test("keeps the page stable when password is missing", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });

    await page.locator('input[type="email"]').fill("test@example.com");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("register validation", () => {
  test("renders the register form", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });

    const switchButton = registerSwitch(page);
    await expect(switchButton).toBeVisible({ timeout: 5000 });
    await switchButton.click();

    await expect(page.locator("form")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toHaveCount(2);
  });
});
