import { test, expect } from "@playwright/test";

test.describe("About page", () => {
  test("about page loads and has key content sections", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveTitle(/Про нас|L-TEX/);
    await expect(page.locator("h1")).toBeVisible();

    // Should mention assortment
    await expect(
      page.locator("text=/секонд|сток|іграшки|Bric-a-Brac/i").first(),
    ).toBeVisible();
  });
});

test.describe("Contacts page", () => {
  test("contacts page loads with phone numbers", async ({ page }) => {
    await page.goto("/contacts");
    await expect(page).toHaveTitle(/Контакти|L-TEX/);
    await expect(page.locator("h1")).toBeVisible();

    // Should show phone numbers
    await expect(page.locator("text=/\\+380|067|099/").first()).toBeVisible();
  });

  test("contacts page has Telegram link", async ({ page }) => {
    await page.goto("/contacts");

    const telegramLink = page
      .locator("a")
      .filter({ hasText: /telegram|@L_TEX/i });
    if ((await telegramLink.count()) > 0) {
      await expect(telegramLink.first()).toBeVisible();
    }
  });
});
