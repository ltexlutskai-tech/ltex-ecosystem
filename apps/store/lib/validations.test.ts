import { describe, it, expect } from "vitest";
import {
  orderSchema,
  orderCustomerSchema,
  orderItemSchema,
  syncProductSchema,
  syncCategoriesSchema,
  syncPricesSchema,
  syncLotsSchema,
  syncRatesSchema,
  syncOrdersImportSchema,
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
    const result = orderCustomerSchema.safeParse({
      ...validCustomer,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("requires phone min 10 chars", () => {
    const result = orderCustomerSchema.safeParse({
      ...validCustomer,
      phone: "123",
    });
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
    expect(
      orderItemSchema.safeParse({ ...validItem, priceEur: 0 }).success,
    ).toBe(false);
    expect(
      orderItemSchema.safeParse({ ...validItem, priceEur: -5 }).success,
    ).toBe(false);
  });

  it("requires positive weight", () => {
    expect(orderItemSchema.safeParse({ ...validItem, weight: 0 }).success).toBe(
      false,
    );
  });

  it("requires integer quantity", () => {
    expect(
      orderItemSchema.safeParse({ ...validItem, quantity: 1.5 }).success,
    ).toBe(false);
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
    const result = syncProductSchema.safeParse({
      ...validProduct,
      videoUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid videoUrl", () => {
    const result = syncProductSchema.safeParse({
      ...validProduct,
      videoUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("priceUnit must be kg or piece", () => {
    expect(
      syncProductSchema.safeParse({ ...validProduct, priceUnit: "kg" }).success,
    ).toBe(true);
    expect(
      syncProductSchema.safeParse({ ...validProduct, priceUnit: "piece" })
        .success,
    ).toBe(true);
    expect(
      syncProductSchema.safeParse({ ...validProduct, priceUnit: "liter" })
        .success,
    ).toBe(false);
  });

  it("requires code1C", () => {
    const { code1C: _, ...without } = validProduct;
    expect(syncProductSchema.safeParse(without).success).toBe(false);
  });

  it("accepts S59 fields (gender/sizes/unitsPerKg/unitWeight)", () => {
    const result = syncProductSchema.safeParse({
      ...validProduct,
      gender: "Чоловіча",
      sizes: "M-XXL",
      unitsPerKg: "3-4 шт/кг",
      unitWeight: "0.25-0.35 кг",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null S59 fields", () => {
    const result = syncProductSchema.safeParse({
      ...validProduct,
      gender: null,
      sizes: null,
      unitsPerKg: null,
      unitWeight: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts product without any S59 fields", () => {
    expect(syncProductSchema.safeParse(validProduct).success).toBe(true);
  });

  it("rejects gender over 50 chars", () => {
    const result = syncProductSchema.safeParse({
      ...validProduct,
      gender: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects sizes over 100 chars", () => {
    const result = syncProductSchema.safeParse({
      ...validProduct,
      sizes: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe("syncCategoriesSchema", () => {
  it("accepts top-level category", () => {
    const result = syncCategoriesSchema.safeParse([
      { slug: "odyag", name: "Одяг", position: 1 },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts category with parent", () => {
    const result = syncCategoriesSchema.safeParse([
      { slug: "odyag", name: "Одяг" },
      { slug: "shtany", name: "Штани", parentSlug: "odyag", position: 1 },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts null parentSlug", () => {
    const result = syncCategoriesSchema.safeParse([
      { slug: "odyag", name: "Одяг", parentSlug: null },
    ]);
    expect(result.success).toBe(true);
  });

  it("requires slug", () => {
    const result = syncCategoriesSchema.safeParse([{ name: "Одяг" }]);
    expect(result.success).toBe(false);
  });

  it("requires name", () => {
    const result = syncCategoriesSchema.safeParse([{ slug: "odyag" }]);
    expect(result.success).toBe(false);
  });

  it("rejects empty slug", () => {
    const result = syncCategoriesSchema.safeParse([{ slug: "", name: "Одяг" }]);
    expect(result.success).toBe(false);
  });

  it("rejects negative position", () => {
    const result = syncCategoriesSchema.safeParse([
      { slug: "odyag", name: "Одяг", position: -1 },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer position", () => {
    const result = syncCategoriesSchema.safeParse([
      { slug: "odyag", name: "Одяг", position: 1.5 },
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts empty array", () => {
    expect(syncCategoriesSchema.safeParse([]).success).toBe(true);
  });
});

describe("syncPricesSchema", () => {
  const validPrice = {
    productCode1C: "PROD-0260",
    priceType: "wholesale",
    amount: 7.9,
  };

  it("accepts wholesale price", () => {
    expect(syncPricesSchema.safeParse([validPrice]).success).toBe(true);
  });

  it("accepts akciya price with validFrom + validTo", () => {
    const result = syncPricesSchema.safeParse([
      {
        ...validPrice,
        priceType: "akciya",
        amount: 6.5,
        currency: "EUR",
        validFrom: "2026-05-01T00:00:00Z",
        validTo: "2026-05-31T23:59:59Z",
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts custom priceType (e.g. retail)", () => {
    const result = syncPricesSchema.safeParse([
      { ...validPrice, priceType: "retail" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts null validTo", () => {
    const result = syncPricesSchema.safeParse([
      { ...validPrice, validTo: null },
    ]);
    expect(result.success).toBe(true);
  });

  it("requires productCode1C", () => {
    const { productCode1C: _, ...without } = validPrice;
    expect(syncPricesSchema.safeParse([without]).success).toBe(false);
  });

  it("rejects non-positive amount", () => {
    expect(
      syncPricesSchema.safeParse([{ ...validPrice, amount: 0 }]).success,
    ).toBe(false);
    expect(
      syncPricesSchema.safeParse([{ ...validPrice, amount: -1 }]).success,
    ).toBe(false);
  });

  it("rejects unsupported currency", () => {
    const result = syncPricesSchema.safeParse([
      { ...validPrice, currency: "GBP" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects invalid validFrom format", () => {
    const result = syncPricesSchema.safeParse([
      { ...validPrice, validFrom: "2026-05-01" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects priceType over 50 chars", () => {
    const result = syncPricesSchema.safeParse([
      { ...validPrice, priceType: "a".repeat(51) },
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts empty array", () => {
    expect(syncPricesSchema.safeParse([]).success).toBe(true);
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
    const result = syncLotsSchema.safeParse([
      {
        ...validLot,
        quantity: 50,
        status: "on_sale",
        videoUrl: "https://youtube.com/watch?v=abc",
      },
    ]);
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
    const result = syncRatesSchema.safeParse([
      {
        ...validRate,
        date: "2025-01-15T12:00:00Z",
        source: "1c",
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects invalid currency", () => {
    const result = syncRatesSchema.safeParse([
      { ...validRate, currencyFrom: "GBP" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive rate", () => {
    const result = syncRatesSchema.safeParse([{ ...validRate, rate: 0 }]);
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = syncRatesSchema.safeParse([
      { ...validRate, date: "not-a-date" },
    ]);
    expect(result.success).toBe(false);
  });
});

describe("syncOrdersImportSchema", () => {
  const validImportOrder = {
    code1C: "ORD-1С-001",
    customer: {
      name: "Іван Петров",
      phone: "+380676710515",
    },
    items: [
      {
        productCode1C: "PROD-0260",
        priceEur: 161.95,
        weight: 20.5,
        quantity: 1,
      },
    ],
  };

  it("accepts minimal valid order", () => {
    expect(syncOrdersImportSchema.safeParse([validImportOrder]).success).toBe(
      true,
    );
  });

  it("accepts full order with all optional fields", () => {
    const result = syncOrdersImportSchema.safeParse([
      {
        ...validImportOrder,
        customer: {
          code1C: "CUST-001",
          name: "Іван Петров",
          phone: "+380676710515",
          email: "ivan@example.com",
          telegram: "@ivan",
          city: "Луцьк",
        },
        status: "confirmed",
        totalEur: 161.95,
        totalUah: 7080.92,
        exchangeRate: 43.72,
        notes: "Доставка Новою Поштою, відділення 5",
        createdAt: "2026-05-01T12:00:00Z",
        items: [
          {
            barcode: "2580101020506101332006008T",
            productCode1C: "PROD-0260",
            priceEur: 161.95,
            weight: 20.5,
            quantity: 1,
          },
        ],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts null/optional customer fields", () => {
    const result = syncOrdersImportSchema.safeParse([
      {
        ...validImportOrder,
        customer: {
          code1C: null,
          name: "Анонім",
          phone: null,
          email: null,
          telegram: null,
          city: null,
        },
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts items without barcode (general product, manager picks lot)", () => {
    const result = syncOrdersImportSchema.safeParse([
      {
        ...validImportOrder,
        items: [
          {
            productCode1C: "PROD-0260",
            priceEur: 50,
            weight: 10,
            quantity: 1,
          },
        ],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts empty items array (order placeholder)", () => {
    const result = syncOrdersImportSchema.safeParse([
      { ...validImportOrder, items: [] },
    ]);
    expect(result.success).toBe(true);
  });

  it("requires code1C", () => {
    const { code1C: _code, ...without } = validImportOrder;
    expect(syncOrdersImportSchema.safeParse([without]).success).toBe(false);
  });

  it("requires customer name", () => {
    const result = syncOrdersImportSchema.safeParse([
      { ...validImportOrder, customer: { name: "" } },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects unsupported status", () => {
    const result = syncOrdersImportSchema.safeParse([
      { ...validImportOrder, status: "delivered" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects negative totals", () => {
    expect(
      syncOrdersImportSchema.safeParse([{ ...validImportOrder, totalEur: -1 }])
        .success,
    ).toBe(false);
    expect(
      syncOrdersImportSchema.safeParse([{ ...validImportOrder, totalUah: -1 }])
        .success,
    ).toBe(false);
  });

  it("rejects non-positive exchange rate", () => {
    expect(
      syncOrdersImportSchema.safeParse([
        { ...validImportOrder, exchangeRate: 0 },
      ]).success,
    ).toBe(false);
  });

  it("accepts zero priceEur/weight (free/sample lots)", () => {
    const result = syncOrdersImportSchema.safeParse([
      {
        ...validImportOrder,
        items: [
          {
            productCode1C: "PROD-0260",
            priceEur: 0,
            weight: 0,
            quantity: 1,
          },
        ],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects non-integer item quantity", () => {
    const result = syncOrdersImportSchema.safeParse([
      {
        ...validImportOrder,
        items: [
          {
            productCode1C: "PROD-0260",
            priceEur: 10,
            weight: 5,
            quantity: 1.5,
          },
        ],
      },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects invalid customer email", () => {
    const result = syncOrdersImportSchema.safeParse([
      {
        ...validImportOrder,
        customer: { name: "Іван", email: "not-an-email" },
      },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects invalid createdAt format", () => {
    const result = syncOrdersImportSchema.safeParse([
      { ...validImportOrder, createdAt: "2026-05-01" },
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts empty array", () => {
    expect(syncOrdersImportSchema.safeParse([]).success).toBe(true);
  });
});
