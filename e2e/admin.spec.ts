import { test, expect } from "@playwright/test";

test.describe("Admin login flow", () => {
  test("admin login page loads", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page).toHaveTitle(/Вхід|Адмін|L-TEX/);
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
  });

  test("admin login form validates empty fields", async ({ page }) => {
    await page.goto("/admin/login");
    const submitButton = page
      .locator("button[type='submit']")
      .or(page.locator("button").filter({ hasText: /увійти|вхід|login/i }));

    if (await submitButton.isVisible()) {
      await submitButton.click();
      // Form should not navigate away without valid credentials
      await expect(page).toHaveURL(/\/admin\/login/);
    }
  });

  test("unauthenticated access to admin redirects to login", async ({
    page,
  }) => {
    await page.goto("/admin/products");
    // Should redirect to login page
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("admin dashboard redirects unauthenticated users", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
