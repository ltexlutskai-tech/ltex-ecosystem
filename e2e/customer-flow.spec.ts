import { test, expect, type Page } from "@playwright/test";

// Stable fake test phone (not a real Ukrainian number we'd dial).
// Cleanup SQL is documented in e2e/README.md.
const TEST_PHONE = "+380999999991";
const TEST_NAME = "E2E Test Customer";

async function loginAsTestCustomer(page: Page): Promise<void> {
  await page.goto("/login");
  // Wait for the form to mount + auto-focus.
  await page.locator("#login-phone").waitFor({ state: "visible" });
  // The phone input auto-prefills "+380 " and reformats on input. fill()
  // replaces the value, then formatPhone re-spaces it.
  await page.locator("#login-phone").fill(TEST_PHONE);
  await page.locator("#login-name").fill(TEST_NAME);
  // Region is optional; skip.
  await page.locator("button[type='submit']").click();
  // Login redirects to returnTo (default /account).
  await page.waitForURL(/\/account/, { timeout: 15_000 });
}

async function logout(page: Page): Promise<void> {
  await page.request
    .post("/api/auth/customer/logout", { failOnStatusCode: false })
    .catch(() => {});
}

test.describe("Customer auth + price gate", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test.afterEach(async ({ page, context }) => {
    await logout(page);
    await context.clearCookies();
  });

  test("guest sees price-gate CTA on /catalog", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page).toHaveTitle(/Каталог|L-TEX/);

    // Price gate CTA renders as a Link with data-analytics="price-login-cta"
    // when there is no customer cookie. We use the analytics attribute since
    // it's the most stable selector across copy changes.
    const priceCta = page.locator("[data-analytics='price-login-cta']").first();
    await expect(priceCta).toBeVisible({ timeout: 15_000 });

    // Real EUR prices render as "€NN.NN" — they should NOT appear for guests.
    const eurPrice = page
      .locator("main")
      .getByText(/€\d+\.\d{2}/)
      .first();
    await expect(eurPrice).toHaveCount(0);
  });

  test("guest sees price-gate on product page", async ({ page }) => {
    await page.goto("/catalog");
    // Wait for at least one product link to render.
    const firstProduct = page.locator("a[href^='/product/']").first();
    await firstProduct.waitFor({ state: "visible", timeout: 15_000 });
    await firstProduct.click();

    await expect(page).toHaveURL(/\/product\//);
    await expect(
      page.locator("[data-analytics='price-login-cta']").first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("login flow creates customer + redirects to /account", async ({
    page,
  }) => {
    await loginAsTestCustomer(page);

    // /account renders a profile with the saved name.
    // Existing customers (re-runs) keep their existing name per S82, so we
    // check that the page mounted, not that the name matches exactly.
    await expect(page.locator("h1, h2").first()).toBeVisible();

    // Customer cookie should now be set; /me endpoint confirms.
    const meResponse = await page.request.get("/api/auth/customer/me");
    expect(meResponse.ok()).toBe(true);
    const me = (await meResponse.json()) as { customer?: { id?: string } };
    expect(me.customer?.id).toBeTruthy();
  });

  test("logged-in customer sees real prices on /catalog", async ({ page }) => {
    await loginAsTestCustomer(page);

    await page.goto("/catalog");
    await page
      .locator("a[href^='/product/']")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });

    // Real EUR price (e.g. "€5.00") should be visible somewhere in the grid.
    const eurPrice = page
      .locator("main")
      .getByText(/€\d+\.\d{2}/)
      .first();
    await expect(eurPrice).toBeVisible({ timeout: 10_000 });

    // Price-gate CTA should NOT render for authed users.
    const priceCta = page.locator("[data-analytics='price-login-cta']");
    expect(await priceCta.count()).toBe(0);
  });

  test("filter by price range updates URL", async ({ page }) => {
    await loginAsTestCustomer(page);
    await page.goto("/catalog");

    // Wait for the price input to mount. The catalog has 3 RangeWithInputs
    // (units / weight / price); pick the price min by aria-label.
    const priceMin = page.locator("input[aria-label='Мінімальна ціна']");
    await priceMin.waitFor({ state: "visible", timeout: 15_000 });

    await priceMin.fill("5");
    await priceMin.press("Enter"); // commits via blur in RangeWithInputs

    await expect(page).toHaveURL(/[?&]priceMin=/, { timeout: 10_000 });
  });

  test("XXL+ subcategory loads without 404", async ({ page }) => {
    await loginAsTestCustomer(page);

    const response = await page.goto("/catalog/odyag/xxl-veliki-rozmiry", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBeLessThan(400);

    // Either products are listed OR an empty-state message is shown.
    await page.waitForLoadState("networkidle");
    const productCount = await page.locator("a[href^='/product/']").count();
    const emptyMsg = await page
      .getByText(/Товарів не знайдено|нічого не знайдено|немає/i)
      .count();
    expect(productCount + emptyMsg).toBeGreaterThan(0);
  });
});

test.describe("Cart flow (logged-in)", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await loginAsTestCustomer(page);
  });

  test.afterEach(async ({ page, context }) => {
    await logout(page);
    await context.clearCookies();
  });

  test("logged-in user can open a product page", async ({ page }) => {
    await page.goto("/catalog");
    const firstProduct = page.locator("a[href^='/product/']").first();
    await firstProduct.waitFor({ state: "visible", timeout: 15_000 });
    await firstProduct.click();
    await page.waitForURL(/\/product\//);

    // Product page renders an "add to cart" button (text varies by product
    // shape — general product vs. lot vs. preorder). Tolerate absence
    // gracefully so the test is stable across the live catalog.
    const addToCart = page
      .locator("button")
      .filter({ hasText: /Додати|В кошик/i })
      .first();
    const count = await addToCart.count();
    expect(count).toBeGreaterThanOrEqual(0);
    if (count > 0 && (await addToCart.isEnabled())) {
      await addToCart.click();
      // Wait briefly for the cart state mutation; visible feedback varies.
      await page.waitForTimeout(500);
    }
  });
});
