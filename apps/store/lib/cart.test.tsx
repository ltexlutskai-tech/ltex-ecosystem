import { describe, it, expect } from "vitest";
import { cartItemKey, type CartItem } from "./cart";

const baseLotItem: CartItem = {
  lotId: "lot-1",
  productId: "prod-1",
  productName: "Test product",
  barcode: "12345",
  weight: 25,
  priceEur: 50,
  quantity: 1,
};

const baseProductItem: CartItem = {
  productId: "prod-2",
  productName: "General product",
  weight: 25,
  priceEur: 30,
  quantity: 1,
};

describe("cartItemKey", () => {
  it("uses lotId when present", () => {
    expect(cartItemKey(baseLotItem)).toBe("lot-1");
  });

  it("falls back to product-prefixed productId for general items", () => {
    expect(cartItemKey(baseProductItem)).toBe("product-prod-2");
  });

  it("returns the same key for two general items of the same product", () => {
    const a: CartItem = { ...baseProductItem };
    const b: CartItem = { ...baseProductItem, weight: 30, priceEur: 35 };
    expect(cartItemKey(a)).toBe(cartItemKey(b));
  });

  it("returns distinct keys for different lots of the same product", () => {
    const lotA: CartItem = { ...baseLotItem, lotId: "lot-a" };
    const lotB: CartItem = { ...baseLotItem, lotId: "lot-b" };
    expect(cartItemKey(lotA)).not.toBe(cartItemKey(lotB));
  });

  it("treats a lot item and a general item of the same product as different keys", () => {
    const general: CartItem = { ...baseLotItem, lotId: undefined };
    expect(cartItemKey(baseLotItem)).not.toBe(cartItemKey(general));
  });
});
