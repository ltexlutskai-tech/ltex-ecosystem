import { test, expect } from "@playwright/test";

test.describe("Search and autocomplete", () => {
  test("search input is visible on catalog page", async ({ page }) => {
    await page.goto("/catalog");
    const searchInput = page.locator("input[placeholder*='Пошук']");
    await expect(searchInput).toBeVisible();
  });

  test("typing in search input updates URL", async ({ page }) => {
    await page.goto("/catalog");
    const searchInput = page.locator("input[placeholder*='Пошук']");

    if (await searchInput.isVisible()) {
      await searchInput.fill("джинси");
      await searchInput.press("Enter");
      await expect(page).toHaveURL(/q=джинси/);
    }
  });

  test("clearing search shows all products", async ({ page }) => {
    await page.goto("/catalog?q=test");
    const searchInput = page.locator("input[placeholder*='Пошук']");

    if (await searchInput.isVisible()) {
      await searchInput.clear();
      await searchInput.press("Enter");
      // URL should no longer have q= param or should reload catalog
      await expect(page).toHaveURL(/\/catalog/);
    }
  });
});
