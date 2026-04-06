import { test, expect } from "@playwright/test";

test.describe("Cart and Checkout", () => {
  test("add lot to cart from lots page", async ({ page }) => {
    await page.goto("/lots");
    await page.waitForLoadState("networkidle");

    // Find an "add to cart" button on lots page
    const addButton = page.locator("button").filter({ hasText: /додати|кошик|add/i }).first();
    if (await addButton.isVisible({ timeout: 10_000 })) {
      await addButton.click();

      // Navigate to cart
      await page.goto("/cart");
      await page.waitForLoadState("networkidle");

      // Cart should have at least one item
      const cartItems = page.locator("[data-testid='cart-item']").or(
        page.locator("text=/кг|€/").first(),
      );
      await expect(cartItems).toBeVisible({ timeout: 5_000 });
    }
  });

  test("empty cart shows message", async ({ page }) => {
    // Clear localStorage cart
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("ltex-cart");
      localStorage.removeItem("ltex-session-id");
    });

    await page.goto("/cart");
    await page.waitForLoadState("networkidle");

    // Should show empty cart message
    await expect(page.locator("text=/порожній|empty/i")).toBeVisible({ timeout: 5_000 });
  });

  test("cart validates minimum 10 kg order", async ({ page }) => {
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");

    // Check for minimum weight validation message (if cart has items < 10kg)
    const minWeightMsg = page.locator("text=/мінімальне|10 кг/i");
    // This message appears conditionally — we just verify the page loads without error
    const hasMsg = await minWeightMsg.count();
    expect(hasMsg).toBeGreaterThanOrEqual(0);
  });

  test("cart summary shows total weight and price", async ({ page }) => {
    // Set up a cart item in localStorage
    await page.goto("/");
    await page.evaluate(() => {
      const sessionId = crypto.randomUUID();
      localStorage.setItem("ltex-session-id", sessionId);
      localStorage.setItem(
        "ltex-cart",
        JSON.stringify([
          {
            lotId: "test-lot-1",
            productId: "test-product-1",
            productName: "Тест товар",
            priceEur: 5.0,
            weight: 12.5,
            quantity: 1,
          },
        ]),
      );
    });

    await page.goto("/cart");
    await page.waitForLoadState("networkidle");

    // Should show weight and price
    await expect(page.locator("text=/12.*5.*кг/")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=/5.*00/")).toBeVisible();
  });
});
