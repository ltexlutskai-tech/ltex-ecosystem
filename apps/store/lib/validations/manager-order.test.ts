import { describe, it, expect } from "vitest";
import {
  createOrderSchema,
  orderDraftSchema,
  orderItemInputSchema,
  updateOrderSchema,
} from "./manager-order";

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
      overdueDays: 14,
      items: [{ productId: "p1", weight: 10, quantity: 1, priceEur: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("вимагає overdueDays (обов'язкове поле, 8.1)", () => {
    const result = createOrderSchema.safeParse({
      customerId: "c1",
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
    });
    expect(result.success).toBe(false);
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

  it("приймає менеджерські поля (Етап 1)", () => {
    const result = createOrderSchema.safeParse({
      customerId: "c1",
      overdueDays: 14,
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
      priceTypeId: "pt-1",
      cashOnDelivery: true,
      assignedAgentUserId: "u-2",
      exportTo1C: false,
    });
    expect(result.success).toBe(true);
  });

  it("дефолти cashOnDelivery=false і exportTo1C=true", () => {
    const result = createOrderSchema.parse({
      customerId: "c1",
      overdueDays: 14,
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
    });
    expect(result.cashOnDelivery).toBe(false);
    expect(result.exportTo1C).toBe(true);
  });
});

describe("updateOrderSchema", () => {
  it("accepts valid edit body без customerId", () => {
    const result = updateOrderSchema.safeParse({
      items: [{ productId: "p1", weight: 10, priceEur: 50 }],
      overdueDays: 14,
      notes: "оновлено",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty items array", () => {
    const result = updateOrderSchema.safeParse({ items: [], overdueDays: 14 });
    expect(result.success).toBe(false);
  });

  it("accepts notes=null (clear comment)", () => {
    const result = updateOrderSchema.safeParse({
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
      overdueDays: 14,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts canonical status value", () => {
    const result = updateOrderSchema.safeParse({
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
      overdueDays: 14,
      status: "not_posted",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-canonical / legacy status", () => {
    const result = updateOrderSchema.safeParse({
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
      overdueDays: 14,
      status: "delivered",
    });
    expect(result.success).toBe(false);
  });

  it("дефолти cashOnDelivery=false і exportTo1C=true", () => {
    const result = updateOrderSchema.parse({
      items: [{ productId: "p1", weight: 10, priceEur: 0 }],
      overdueDays: 14,
    });
    expect(result.cashOnDelivery).toBe(false);
    expect(result.exportTo1C).toBe(true);
  });
});

describe("orderDraftSchema (relaxed draft mode для autosave)", () => {
  const minimalItem = { productId: "p1", weight: 10, priceEur: 10 };

  it("приймає майже порожнє тіло (лише draft:true)", () => {
    expect(orderDraftSchema.safeParse({ draft: true }).success).toBe(true);
  });

  it("приймає draft із порожнім масивом items", () => {
    expect(orderDraftSchema.safeParse({ draft: true, items: [] }).success).toBe(
      true,
    );
  });

  it("приймає draft без customerId (клієнт ще не обраний)", () => {
    const result = orderDraftSchema.safeParse({
      draft: true,
      notes: "чернетка",
      overdueDays: 14,
    });
    expect(result.success).toBe(true);
  });

  it("приймає draft із повними рядками + менеджерськими полями", () => {
    const result = orderDraftSchema.safeParse({
      draft: true,
      customerId: "c1",
      items: [minimalItem],
      cashOnDelivery: true,
      overdueDays: 14,
    });
    expect(result.success).toBe(true);
  });

  it("відхиляє тіло без прапорця draft (не draft-режим)", () => {
    expect(orderDraftSchema.safeParse({ customerId: "c1" }).success).toBe(
      false,
    );
  });

  it("відхиляє некоректний рядок (від'ємна вага)", () => {
    const result = orderDraftSchema.safeParse({
      draft: true,
      items: [{ ...minimalItem, weight: -1 }],
    });
    expect(result.success).toBe(false);
  });
});
