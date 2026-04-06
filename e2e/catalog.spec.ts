import { test, expect } from "@playwright/test";

test.describe("Catalog", () => {
  test("shows products list", async ({ page }) => {
    await page.goto("/catalog");
    // Wait for products to load
    const products = page.locator("[data-testid='product-card']");
    await expect(products.first()).toBeVisible({ timeout: 10_000 });
    expect(await products.count()).toBeGreaterThan(0);
  });

  test("quality filter updates product list", async ({ page }) => {
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");

    // Select a quality filter
    const qualitySelect = page.locator("select").filter({ hasText: /Екстра|Крем|1й сорт/ });
    if (await qualitySelect.isVisible()) {
      await qualitySelect.selectOption("extra");
      await page.waitForURL(/quality=extra/);
      await expect(page).toHaveURL(/quality=extra/);
    }
  });

  test("search by product name", async ({ page }) => {
    await page.goto("/catalog");

    // Type in search field
    const searchInput = page.locator("input[placeholder*='Пошук']");
    if (await searchInput.isVisible()) {
      await searchInput.fill("футболк");
      await searchInput.press("Enter");
      await expect(page).toHaveURL(/q=футболк/);
    }
  });

  test("pagination works", async ({ page }) => {
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");

    // Check if pagination exists (only if there are enough products)
    const nextButton = page.locator("a, button").filter({ hasText: /наступна|далі|→|next/i });
    if (await nextButton.isVisible()) {
      await nextButton.click();
      await expect(page).toHaveURL(/page=2/);
    }
  });
});
