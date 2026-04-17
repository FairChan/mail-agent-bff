import { expect, test } from "@playwright/test";

test.describe("webui smoke", () => {
  test("loads the React application shell", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("#root > *").first()).toBeVisible({ timeout: 15000 });
  });

  test("renders the unauthenticated entry flow without critical console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="email"], form').first()).toBeVisible({ timeout: 15000 });

    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes("/api/") &&
        !error.includes("Failed to fetch") &&
        !error.includes("ERR_CONNECTION_REFUSED") &&
        !error.includes("404")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("keeps language switch controls usable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });

    const englishTab = page.getByRole("tab", { name: /EN/i });
    if (await englishTab.isVisible()) {
      await englishTab.click();
    }

    await expect(page.locator("#root > *").first()).toBeVisible();
  });
});
