import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("home page loads with hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/L-TEX/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("catalog page loads", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page).toHaveTitle(/Каталог|L-TEX/);
  });

  test("lots page loads", async ({ page }) => {
    await page.goto("/lots");
    await expect(page).toHaveTitle(/Лоти|L-TEX/);
  });

  test("contacts page loads", async ({ page }) => {
    await page.goto("/contacts");
    await expect(page).toHaveTitle(/Контакти|L-TEX/);
  });

  test("404 page for non-existing URL", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.locator("text=404")).toBeVisible();
  });

  test("header navigation links work", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("header nav");
    await expect(nav).toBeVisible();

    // Click catalog link
    await nav.getByRole("link", { name: /каталог/i }).click();
    await expect(page).toHaveURL(/\/catalog/);
  });

  test("footer is visible on all pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toBeVisible();
  });
});
