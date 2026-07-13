import { describe, it, expect } from "vitest";
import {
  createSaleSchema,
  saleDraftSchema,
  saleItemInputSchema,
  updateSaleSchema,
} from "./manager-sale";

describe("saleItemInputSchema", () => {
  it("accepts lot-bound item з lotId + barcode", () => {
    const result = saleItemInputSchema.safeParse({
      productId: "p1",
      lotId: "l1",
      barcode: "B0001",
      pricePerKg: 2.5,
      weight: 25.5,
      quantity: 1,
      priceEur: 63.75,
    });
    expect(result.success).toBe(true);
  });

  it("accepts general item з lotId=null / barcode=null", () => {
    const result = saleItemInputSchema.safeParse({
      productId: "p1",
      lotId: null,
      barcode: null,
      pricePerKg: 2,
      weight: 10,
      quantity: 1,
      priceEur: 20,
    });
    expect(result.success).toBe(true);
  });

  it("default quantity = 1", () => {
    const result = saleItemInputSchema.parse({
      productId: "p1",
      pricePerKg: 1,
      weight: 10,
      priceEur: 10,
    });
    expect(result.quantity).toBe(1);
  });

  it("rejects negative weight", () => {
    const result = saleItemInputSchema.safeParse({
      productId: "p1",
      pricePerKg: 1,
      weight: -1,
      priceEur: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative pricePerKg", () => {
    const result = saleItemInputSchema.safeParse({
      productId: "p1",
      pricePerKg: -0.5,
      weight: 10,
      priceEur: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("createSaleSchema", () => {
  const minimalItem = {
    productId: "p1",
    pricePerKg: 1,
    weight: 10,
    priceEur: 10,
  };

  it("accepts valid sale з 1 item", () => {
    const result = createSaleSchema.safeParse({
      customerId: "c1",
      items: [minimalItem],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty items array", () => {
    const result = createSaleSchema.safeParse({
      customerId: "c1",
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty customerId", () => {
    const result = createSaleSchema.safeParse({
      customerId: "",
      items: [minimalItem],
    });
    expect(result.success).toBe(false);
  });

  it("rejects items array >200", () => {
    const items = Array.from({ length: 201 }, () => minimalItem);
    const result = createSaleSchema.safeParse({ customerId: "c1", items });
    expect(result.success).toBe(false);
  });

  it("приймає менеджерські поля", () => {
    const result = createSaleSchema.safeParse({
      customerId: "c1",
      items: [minimalItem],
      priceTypeId: "pt-1",
      deliveryMethod: "post",
      novaPoshtaBranch: "12",
      cashOnDelivery: true,
      assignedAgentUserId: "u-2",
      onTradeAgent: false,
      exportTo1C: false,
      expressWaybill: "20450000123",
      exchangeRateEur: 43.5,
      exchangeRateUsd: 39.2,
    });
    expect(result.success).toBe(true);
  });

  it("дефолти cashOnDelivery=false / onTradeAgent=true / exportTo1C=true", () => {
    const result = createSaleSchema.parse({
      customerId: "c1",
      items: [minimalItem],
    });
    expect(result.cashOnDelivery).toBe(false);
    expect(result.onTradeAgent).toBe(true);
    expect(result.exportTo1C).toBe(true);
  });

  it("приймає код доставки з довідника (7.3) та відхиляє задовгий", () => {
    const ok = createSaleSchema.safeParse({
      customerId: "c1",
      items: [minimalItem],
      deliveryMethod: "nova-poshta",
    });
    expect(ok.success).toBe(true);

    const tooLong = createSaleSchema.safeParse({
      customerId: "c1",
      items: [minimalItem],
      deliveryMethod: "x".repeat(51),
    });
    expect(tooLong.success).toBe(false);
  });

  it("приймає deliveryMethod null", () => {
    const result = createSaleSchema.safeParse({
      customerId: "c1",
      items: [minimalItem],
      deliveryMethod: null,
    });
    expect(result.success).toBe(true);
  });

  it("відхиляє novaPoshtaBranch >20 символів", () => {
    const result = createSaleSchema.safeParse({
      customerId: "c1",
      items: [minimalItem],
      novaPoshtaBranch: "x".repeat(21),
    });
    expect(result.success).toBe(false);
  });
});

describe("updateSaleSchema", () => {
  const minimalItem = {
    productId: "p1",
    pricePerKg: 1,
    weight: 10,
    priceEur: 10,
  };

  it("accepts valid edit body без customerId", () => {
    const result = updateSaleSchema.safeParse({
      items: [minimalItem],
      notes: "оновлено",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty items array", () => {
    const result = updateSaleSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it("accepts notes=null (clear comment)", () => {
    const result = updateSaleSchema.safeParse({
      items: [minimalItem],
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts canonical status value", () => {
    const result = updateSaleSchema.safeParse({
      items: [minimalItem],
      status: "not_posted",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-canonical status", () => {
    const result = updateSaleSchema.safeParse({
      items: [minimalItem],
      status: "delivered",
    });
    expect(result.success).toBe(false);
  });
});

describe("saleDraftSchema (relaxed draft mode для autosave)", () => {
  const minimalItem = {
    productId: "p1",
    pricePerKg: 1,
    weight: 10,
    priceEur: 10,
  };

  it("приймає майже порожнє тіло (лише draft:true)", () => {
    expect(saleDraftSchema.safeParse({ draft: true }).success).toBe(true);
  });

  it("приймає draft із порожнім масивом items", () => {
    expect(saleDraftSchema.safeParse({ draft: true, items: [] }).success).toBe(
      true,
    );
  });

  it("приймає draft без customerId (клієнт ще не обраний)", () => {
    const result = saleDraftSchema.safeParse({
      draft: true,
      notes: "чернетка",
      deliveryMethod: "post",
    });
    expect(result.success).toBe(true);
  });

  it("приймає draft із повними рядками + менеджерськими полями", () => {
    const result = saleDraftSchema.safeParse({
      draft: true,
      customerId: "c1",
      items: [minimalItem],
      cashOnDelivery: true,
      onTradeAgent: false,
      expressWaybill: "20450000123",
    });
    expect(result.success).toBe(true);
  });

  it("відхиляє тіло без прапорця draft (не draft-режим)", () => {
    expect(saleDraftSchema.safeParse({ customerId: "c1" }).success).toBe(false);
  });

  it("відхиляє некоректний рядок (від'ємна ціна)", () => {
    const result = saleDraftSchema.safeParse({
      draft: true,
      items: [{ ...minimalItem, pricePerKg: -1 }],
    });
    expect(result.success).toBe(false);
  });
});
