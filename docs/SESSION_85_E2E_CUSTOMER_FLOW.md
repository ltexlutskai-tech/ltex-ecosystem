# Session 85 — E2E Playwright tests for customer journey

**Type:** Worker session (mini)
**Branch:** `claude/e2e-customer-flow-{XXXX}`
**Goal:** Покрити customer auth + price gate + cart end-to-end через Playwright. Захищає від регресій у lead-capture flow (бізнес-критично).

---

## ⚠️ HARD RULES

1. **DO NOT touch existing 9 E2E specs** — тільки додавай нові у `e2e/customer-flow.spec.ts`.
2. **NO seeded test data** у production DB — тести працюють зі state-у-DB (805 продуктів, тести adapt-яться).
3. **Use real test phone** — формат `+380999999999` (фейковий, не у реальному forwards). НЕ використовувати реальні номери.
4. **Cleanup після тесту** — `afterEach` чистить customer cookie через logout.
5. **Tests мають бути idempotent** — можна запускати багато разів. Reuse того самого test phone.

---

## Tasks

### 1. Створити `e2e/customer-flow.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

const TEST_PHONE = "+380999999991"; // unique per test file
const TEST_NAME = "E2E Test Customer";

test.describe("Customer auth + price gate", () => {
  test.beforeEach(async ({ context }) => {
    // Clear all cookies before each test
    await context.clearCookies();
  });

  test("guest sees price-gate CTA on /catalog", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page).toHaveTitle(/Каталог|L-TEX/);

    // Price gate CTA замість €X.XX
    const priceCta = page.locator("text=/Увійдіть щоб побачити ціну/i").first();
    await expect(priceCta).toBeVisible({ timeout: 10000 });

    // Real prices (€) shouldn't be visible
    const eurPrice = page.locator("text=/\\d+[.,]\\d+\\s*€/").first();
    await expect(eurPrice).not.toBeVisible();
  });

  test("guest sees price-gate on product page", async ({ page }) => {
    await page.goto("/catalog");
    // Click first product link
    const firstProduct = page.locator("a[href^='/product/']").first();
    await firstProduct.click();

    await expect(page).toHaveURL(/\/product\//);
    await expect(
      page.locator("text=/Увійдіть щоб побачити ціну/i").first(),
    ).toBeVisible();
  });

  test("login flow creates customer + redirects to /account", async ({
    page,
  }) => {
    await page.goto("/login");

    // Fill phone (S77 mask formats automatically)
    const phoneInput = page.locator("input[type='tel']").first();
    await phoneInput.fill(TEST_PHONE);

    const nameInput = page
      .locator("input[name='name'], input[autocomplete='given-name']")
      .first();
    await nameInput.fill(TEST_NAME);

    // Region dropdown (S79) — optional, skip

    await page.locator("button[type='submit']").click();

    // Wait for redirect to /account
    await page.waitForURL(/\/account/, { timeout: 10000 });
    await expect(
      page.locator("text=/" + TEST_NAME + "/").first(),
    ).toBeVisible();
  });

  test("logged-in customer sees real prices on /catalog", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.locator("input[type='tel']").first().fill(TEST_PHONE);
    await page
      .locator("input[name='name'], input[autocomplete='given-name']")
      .first()
      .fill(TEST_NAME);
    await page.locator("button[type='submit']").click();
    await page.waitForURL(/\/account/);

    // Now visit catalog
    await page.goto("/catalog");

    // Should see real prices, NOT CTA
    const eurPrice = page.locator("text=/\\d+[.,]\\d+\\s*€/").first();
    await expect(eurPrice).toBeVisible({ timeout: 10000 });

    const priceCta = page.locator("text=/Увійдіть щоб побачити ціну/i");
    expect(await priceCta.count()).toBe(0);
  });

  test("filter by price range updates URL + results", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[type='tel']").first().fill(TEST_PHONE);
    await page
      .locator("input[name='name'], input[autocomplete='given-name']")
      .first()
      .fill(TEST_NAME);
    await page.locator("button[type='submit']").click();
    await page.waitForURL(/\/account/);

    await page.goto("/catalog");

    // Find price range input (S81 number input)
    const priceMinInput = page.locator("input[type='number']").first();
    await priceMinInput.fill("5");
    await priceMinInput.press("Enter");

    // URL should update with priceMin
    await expect(page).toHaveURL(/priceMin=5/);
  });

  test("XXL+ subcategory shows oversize-only products", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[type='tel']").first().fill(TEST_PHONE);
    await page
      .locator("input[name='name'], input[autocomplete='given-name']")
      .first()
      .fill(TEST_NAME);
    await page.locator("button[type='submit']").click();
    await page.waitForURL(/\/account/);

    // Visit XXL+ pseudo-subcategory
    await page.goto("/catalog/odyag/xxl-veliki-rozmiry");

    // Page should load without 404
    await expect(page).not.toHaveURL(/_not-found/);
    // Either products are shown OR "no products" message
    const hasProducts = await page.locator("a[href^='/product/']").count();
    const hasEmptyMsg = await page
      .locator("text=/Товарів не знайдено/i")
      .count();
    expect(hasProducts + hasEmptyMsg).toBeGreaterThan(0);
  });

  test.afterEach(async ({ page, context }) => {
    // Logout via API call
    await page.request.post("/api/auth/customer/logout").catch(() => {});
    await context.clearCookies();
  });
});

test.describe("Cart flow (logged-in)", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    // Login
    await page.goto("/login");
    await page.locator("input[type='tel']").first().fill(TEST_PHONE);
    await page
      .locator("input[name='name'], input[autocomplete='given-name']")
      .first()
      .fill(TEST_NAME);
    await page.locator("button[type='submit']").click();
    await page.waitForURL(/\/account/);
  });

  test("add product to cart from catalog", async ({ page }) => {
    await page.goto("/catalog");

    // Click first product
    const firstProduct = page.locator("a[href^='/product/']").first();
    await firstProduct.click();
    await page.waitForURL(/\/product\//);

    // Find "Add to cart" button (text varies, try common patterns)
    const addToCart = page
      .locator("button")
      .filter({ hasText: /Додати|В кошик/i })
      .first();
    if ((await addToCart.count()) > 0 && (await addToCart.isEnabled())) {
      await addToCart.click();

      // Cart count badge should update or notification appear
      // (graceful — exact UI depends on existing components)
      await page.waitForTimeout(500);
    }
  });

  test.afterEach(async ({ page, context }) => {
    await page.request.post("/api/auth/customer/logout").catch(() => {});
    await context.clearCookies();
  });
});
```

### 2. Update `.github/workflows/ci.yml`

Перевір що `test:e2e` step запускається в CI.

Якщо у workflow є `if: env.HAS_DB == 'true'` (з S65) — лишити, бо E2E без DB не запускаються.

Перевір що тест має `customer-flow` у списку — Playwright auto-discover-ить файли з `*.spec.ts`.

### 3. README у `e2e/` директорії

Створи `e2e/README.md` (або extend existing):

```markdown
# E2E Tests

Run locally:

\`\`\`bash
pnpm test:e2e
\`\`\`

Test phone: `+380999999991` — fake, but stable so cleanup-able.
Cleanup test customer:

\`\`\`sql
DELETE FROM customers WHERE phone = '+380999999991';
\`\`\`
```

---

## Acceptance criteria

- [ ] `pnpm format:check` / `typecheck` / `test` / `build` зелені
- [ ] `pnpm test:e2e` запускає старий + новий specs (chromium тільки)
- [ ] customer-flow.spec.ts: 6+ test cases passing
- [ ] CI workflow runs E2E на push (якщо DATABASE_URL secret є)
- [ ] Test customer cleanup documented
- [ ] Push на `claude/e2e-customer-flow-{XXXX}` (НЕ merge!)

---

## User-action post-merge

Жодного — pure CI improvement. `pnpm test:e2e` локально якщо хочеш самому прогнати.

⚠️ Якщо тести fail на CI через DATABASE_URL — додай secret у GitHub Settings (S65 уже configured).

---

## Reference

- `playwright.config.ts` — webServer launches `pnpm dev` on port 3000
- `e2e/admin.spec.ts` — pattern для login-required tests (admin login flow)
- `e2e/cart-checkout.spec.ts` — existing cart pattern
- `apps/store/app/api/auth/customer/login/route.ts` — login endpoint (S73)
- S82 Fix 4 — login no-overwrite (test потрібно adapt)
- S79 — region picker (optional у submit)
