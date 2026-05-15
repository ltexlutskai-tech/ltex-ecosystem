import { describe, it, expect } from "vitest";
import { createOrderSchema, orderItemInputSchema } from "./manager-order";

describe("orderItemInputSchema", () => {
  it("accepts lot-bound item з lotId", () => {
    const result = orderItemInputSchema.safeParse({
      productId: "p1",
      lotId: "l1",
      weight: 25.5,
      quantity: 1,
      priceEur: 125.5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts general item з lotId=null", () => {
    const result = orderItemInputSchema.safeParse({
      productId: "p1",
      lotId: null,
      weight: 10,
      quantity: 1,
      priceEur: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts item без lotId (treated as undefined)", () => {
    const result = orderItemInputSchema.safeParse({
      productId: "p1",
      weight: 10,
      quantity: 1,
      priceEur: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative weight", () => {
    const result = orderItemInputSchema.safeParse({
      productId: "p1",
      weight: -1,
      quantity: 1,
      priceEur: 0,
    });
    expect(result.success).toBe(false);
  });

  it("default quantity = 1", () => {
    const result = orderItemInputSchema.parse({
      productId: "p1",
      weight: 10,
      priceEur: 0,
    });
    expect(result.quantity).toBe(1);
  });
});

describe("createOrderSchema", () => {
  it("accepts valid order з 1 item", () => {
    const result = createOrderSchema.safeParse({
      customerId: "c1",
      items: [{ productId: "p1", weight: 10, quantity: 1, priceEur: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty items array", () => {
    const result = createOrderSchema.safeParse({
      customerId: "c1",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty customerId", () => {
    const result = createOrderSchema.safeParse({
      customerId: "",
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes >2000 chars", () => {
    const result = createOrderSchema.safeParse({
      customerId: "c1",
      notes: "x".repeat(2001),
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects exchangeRate ≤0", () => {
    const result = createOrderSchema.safeParse({
      customerId: "c1",
      exchangeRate: 0,
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects items array >200", () => {
    const items = Array.from({ length: 201 }, () => ({
      productId: "p1",
      weight: 1,
      priceEur: 0,
    }));
    const result = createOrderSchema.safeParse({ customerId: "c1", items });
    expect(result.success).toBe(false);
  });
});
