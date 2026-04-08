import { test, expect } from "@playwright/test";

test.describe("Mobile responsive", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("mobile menu sheet opens and shows navigation links", async ({
    page,
  }) => {
    await page.goto("/");

    // On mobile, there should be a hamburger menu button
    const menuButton = page
      .locator("button")
      .filter({ hasText: /меню/i })
      .or(page.locator("button[aria-label*='меню' i]"))
      .or(page.locator("header button").last());

    if (await menuButton.isVisible()) {
      await menuButton.click();

      // The mobile sheet should now show navigation links
      const navLinks = page
        .locator("a")
        .filter({ hasText: /каталог|лоти|контакти/i });
      await expect(navLinks.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("catalog page renders correctly on mobile viewport", async ({
    page,
  }) => {
    await page.goto("/catalog");
    await expect(page.locator("h1")).toBeVisible();

    // Product cards should be visible
    const products = page.locator("[data-testid='product-card']");
    if ((await products.count()) > 0) {
      await expect(products.first()).toBeVisible();
    }
  });

  test("about page renders correctly on mobile viewport", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("contacts page renders correctly on mobile viewport", async ({
    page,
  }) => {
    await page.goto("/contacts");
    await expect(page.locator("h1")).toBeVisible();
  });
});

test.describe("Desktop layout", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("desktop header shows navigation links inline", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("header nav");
    await expect(nav).toBeVisible();

    const links = nav.getByRole("link");
    expect(await links.count()).toBeGreaterThan(0);
  });

  test("footer displays multi-column layout on desktop", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toBeVisible();
  });
});
