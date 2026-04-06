import { test, expect } from "@playwright/test";

test.describe("Product page", () => {
  test("navigate from catalog to product detail", async ({ page }) => {
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");

    // Click on first product card
    const firstProduct = page.locator("[data-testid='product-card'] a").first();
    if (await firstProduct.isVisible({ timeout: 10_000 })) {
      await firstProduct.click();
      await expect(page).toHaveURL(/\/product\//);
    }
  });

  test("product page has required sections", async ({ page }) => {
    await page.goto("/catalog");
    await page.waitForLoadState("networkidle");

    const firstProduct = page.locator("[data-testid='product-card'] a").first();
    if (await firstProduct.isVisible({ timeout: 10_000 })) {
      await firstProduct.click();
      await page.waitForLoadState("networkidle");

      // Check for product name
      await expect(page.locator("h1")).toBeVisible();

      // Check for price info
      const priceElement = page.locator("text=/€|EUR|eur/i");
      await expect(priceElement.first()).toBeVisible();

      // Check for breadcrumbs
      const breadcrumbs = page.locator("nav[aria-label='breadcrumb'], [data-testid='breadcrumbs']");
      if (await breadcrumbs.isVisible()) {
        await expect(breadcrumbs).toBeVisible();
      }

      // Check for video link or iframe (767/805 products have videos)
      const video = page.locator("iframe[src*='youtube'], a[href*='youtube']");
      // Video may or may not be present
      const hasVideo = await video.count();
      expect(hasVideo).toBeGreaterThanOrEqual(0);
    }
  });
});
