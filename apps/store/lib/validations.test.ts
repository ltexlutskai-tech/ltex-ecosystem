import { describe, it, expect } from "vitest";
import {
  orderSchema,
  orderCustomerSchema,
  orderItemSchema,
  syncProductSchema,
  syncLotsSchema,
  syncRatesSchema,
} from "./validations";

const validCustomer = {
  name: "Іван Петров",
  phone: "+380676710515",
  telegram: "@ivan",
};

const validItem = {
  lotId: "lot-1",
  productId: "prod-1",
  priceEur: 25.5,
  weight: 12,
  quantity: 1,
};

describe("orderCustomerSchema", () => {
  it("accepts valid customer", () => {
    expect(orderCustomerSchema.safeParse(validCustomer).success).toBe(true);
  });

  it("requires name", () => {
    const result = orderCustomerSchema.safeParse({ ...validCustomer, name: "" });
    expect(result.success).toBe(false);
  });

  it("requires phone min 10 chars", () => {
    const result = orderCustomerSchema.safeParse({ ...validCustomer, phone: "123" });
    expect(result.success).toBe(false);
  });

  it("telegram is optional", () => {
    const { telegram: _, ...withoutTelegram } = validCustomer;
    expect(orderCustomerSchema.safeParse(withoutTelegram).success).toBe(true);
  });
});

describe("orderItemSchema", () => {
  it("accepts valid item", () => {
    expect(orderItemSchema.safeParse(validItem).success).toBe(true);
  });

  it("requires positive price", () => {
    expect(orderItemSchema.safeParse({ ...validItem, priceEur: 0 }).success).toBe(false);
    expect(orderItemSchema.safeParse({ ...validItem, priceEur: -5 }).success).toBe(false);
  });

  it("requires positive weight", () => {
    expect(orderItemSchema.safeParse({ ...validItem, weight: 0 }).success).toBe(false);
  });

  it("requires integer quantity", () => {
    expect(orderItemSchema.safeParse({ ...validItem, quantity: 1.5 }).success).toBe(false);
  });
});

describe("orderSchema", () => {
  it("accepts valid order", () => {
    const result = orderSchema.safeParse({
      customer: validCustomer,
      items: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it("requires at least one item", () => {
    const result = orderSchema.safeParse({
      customer: validCustomer,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("notes are optional", () => {
    const result = orderSchema.safeParse({
      customer: validCustomer,
      items: [validItem],
      notes: "Доставка Новою Поштою",
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes over 1000 chars", () => {
    const result = orderSchema.safeParse({
      customer: validCustomer,
      items: [validItem],
      notes: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe("syncProductSchema", () => {
  const validProduct = {
    code1C: "NOM-001",
    name: "Футболки чоловічі",
    slug: "futbolky-cholovichi",
    categorySlug: "odyag",
    quality: "first",
    country: "england",
  };

  it("accepts valid product", () => {
    expect(syncProductSchema.safeParse(validProduct).success).toBe(true);
  });

  it("accepts full product with optional fields", () => {
    const result = syncProductSchema.safeParse({
      ...validProduct,
      articleCode: "ART-001",
      description: "Чоловічі футболки мікс",
      season: "summer",
      priceUnit: "kg",
      averageWeight: 0.3,
      videoUrl: "https://youtube.com/watch?v=abc",
      inStock: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty string videoUrl", () => {
    const result = syncProductSchema.safeParse({ ...validProduct, videoUrl: "" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid videoUrl", () => {
    const result = syncProductSchema.safeParse({ ...validProduct, videoUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("priceUnit must be kg or piece", () => {
    expect(syncProductSchema.safeParse({ ...validProduct, priceUnit: "kg" }).success).toBe(true);
    expect(syncProductSchema.safeParse({ ...validProduct, priceUnit: "piece" }).success).toBe(true);
    expect(syncProductSchema.safeParse({ ...validProduct, priceUnit: "liter" }).success).toBe(false);
  });

  it("requires code1C", () => {
    const { code1C: _, ...without } = validProduct;
    expect(syncProductSchema.safeParse(without).success).toBe(false);
  });
});

describe("syncLotsSchema", () => {
  const validLot = {
    barcode: "2000000001234",
    articleCode: "ART-001",
    weight: 25.5,
    priceEur: 3.5,
  };

  it("accepts valid lot array", () => {
    expect(syncLotsSchema.safeParse([validLot]).success).toBe(true);
  });

  it("accepts lot with all optional fields", () => {
    const result = syncLotsSchema.safeParse([{
      ...validLot,
      quantity: 50,
      status: "on_sale",
      videoUrl: "https://youtube.com/watch?v=abc",
    }]);
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = syncLotsSchema.safeParse([{ ...validLot, status: "sold" }]);
    expect(result.success).toBe(false);
  });

  it("rejects negative weight", () => {
    const result = syncLotsSchema.safeParse([{ ...validLot, weight: -1 }]);
    expect(result.success).toBe(false);
  });

  it("accepts empty array", () => {
    expect(syncLotsSchema.safeParse([]).success).toBe(true);
  });
});

describe("syncRatesSchema", () => {
  const validRate = {
    currencyFrom: "EUR" as const,
    currencyTo: "UAH" as const,
    rate: 42.5,
  };

  it("accepts valid rate array", () => {
    expect(syncRatesSchema.safeParse([validRate]).success).toBe(true);
  });

  it("accepts rate with date and source", () => {
    const result = syncRatesSchema.safeParse([{
      ...validRate,
      date: "2025-01-15T12:00:00Z",
      source: "1c",
    }]);
    expect(result.success).toBe(true);
  });

  it("rejects invalid currency", () => {
    const result = syncRatesSchema.safeParse([{ ...validRate, currencyFrom: "GBP" }]);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive rate", () => {
    const result = syncRatesSchema.safeParse([{ ...validRate, rate: 0 }]);
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = syncRatesSchema.safeParse([{ ...validRate, date: "not-a-date" }]);
    expect(result.success).toBe(false);
  });
});
