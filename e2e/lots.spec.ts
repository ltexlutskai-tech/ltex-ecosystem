import { test, expect } from "@playwright/test";

test.describe("Lots page", () => {
  test("lots page loads with title", async ({ page }) => {
    await page.goto("/lots");
    await expect(page).toHaveTitle(/Лоти|L-TEX/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("lots page shows lot cards or empty message", async ({ page }) => {
    await page.goto("/lots");
    await page.waitForLoadState("networkidle");

    // Either lot items exist or an empty state message
    const lots = page.locator("[data-testid='lot-card']");
    const emptyMsg = page.locator("text=/немає|порожньо|нічого/i");
    const hasLots = (await lots.count()) > 0;
    const hasEmptyMsg = (await emptyMsg.count()) > 0;
    expect(hasLots || hasEmptyMsg).toBeTruthy();
  });

  test("lots page has status filter buttons", async ({ page }) => {
    await page.goto("/lots");
    await page.waitForLoadState("networkidle");

    // Should have filter options for lot statuses
    const filters = page
      .locator("a, button")
      .filter({ hasText: /вільний|всі|акція|зарезервовано/i });
    const filterCount = await filters.count();
    expect(filterCount).toBeGreaterThan(0);
  });
});
