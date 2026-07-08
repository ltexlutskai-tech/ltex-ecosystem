import { describe, it, expect, vi } from "vitest";

vi.mock("@ltex/db", () => ({ prisma: {}, Prisma: {} }));

import {
  buildSaleMovementRows,
  type SaleMovementDoc,
  type SaleMovementItem,
} from "./sale-movement-hooks";

const occurredAt = new Date("2026-07-08T00:00:00Z");

function item(over: Partial<SaleMovementItem> = {}): SaleMovementItem {
  return {
    id: "it1",
    productId: "P1",
    lotId: "L1",
    barcode: "BC-1",
    weight: 25,
    quantity: 1,
    priceEur: 100,
    productCode1C: "CODE-P1",
    priceUnit: "kg",
    lotPurchasePriceEur: 2,
    ...over,
  };
}

function doc(
  items: SaleMovementItem[],
  over: Partial<SaleMovementDoc> = {},
): SaleMovementDoc {
  return {
    id: "sale-id-1",
    code1C: null,
    occurredAt,
    clientCode1C: "CLIENT-1",
    agentCode1C: "AGENT-1",
    items,
    ...over,
  };
}

const noCosts = new Map<string, number>();

describe("buildSaleMovementRows — реєстратор", () => {
  it("recorder = sale.id коли code1C=null (нова реалізація)", () => {
    const r = buildSaleMovementRows(doc([item()]), noCosts);
    expect(r.recorder).toBe("sale-id-1");
    expect(r.stock[0]?.recorderCode1C).toBe("sale-id-1");
    expect(r.sales[0]?.recorderCode1C).toBe("sale-id-1");
    expect(r.sales[0]?.saleCode1C).toBe("sale-id-1");
    expect(r.cost[0]?.recorderCode1C).toBe("sale-id-1");
  });

  it("recorder = code1C коли він є (історична реалізація)", () => {
    const r = buildSaleMovementRows(
      doc([item()], { code1C: "HEX123" }),
      noCosts,
    );
    expect(r.recorder).toBe("HEX123");
    expect(r.stock[0]?.recorderCode1C).toBe("HEX123");
  });
});

describe("buildSaleMovementRows — recordKind / три регістри", () => {
  it("stock=розхід(1), sales=продаж(0); по одному рядку на позицію", () => {
    const r = buildSaleMovementRows(
      doc([item(), item({ id: "it2" })]),
      noCosts,
    );
    expect(r.stock).toHaveLength(2);
    expect(r.sales).toHaveLength(2);
    expect(r.cost).toHaveLength(2);
    expect(r.stock[0]?.recordKind).toBe(1);
    expect(r.sales[0]?.recordKind).toBe(0);
  });

  it("виручка = priceEur рядка (знижок нема → revenueNoDiscount = revenue)", () => {
    const r = buildSaleMovementRows(doc([item({ priceEur: 87.5 })]), noCosts);
    expect(r.sales[0]?.revenueEur).toBe(87.5);
    expect(r.sales[0]?.revenueNoDiscountEur).toBe(87.5);
    expect(r.sales[0]?.costEur).toBeNull();
  });

  it("клієнт/агент проходять у SalesMovement", () => {
    const r = buildSaleMovementRows(doc([item()]), noCosts);
    expect(r.sales[0]?.clientCode1C).toBe("CLIENT-1");
    expect(r.sales[0]?.agentCode1C).toBe("AGENT-1");
    expect(r.sales[0]?.orderCode1C).toBeNull();
  });
});

describe("buildSaleMovementRows — одиниці (kg vs шт)", () => {
  it("kg: weightKg = сумарна вага рядка (без ×quantity), qty = мішки", () => {
    const r = buildSaleMovementRows(
      doc([item({ weight: 50, quantity: 2, priceUnit: "kg" })]),
      noCosts,
    );
    expect(r.stock[0]?.weightKg).toBe(50);
    expect(r.stock[0]?.qty).toBe(2);
    expect(r.sales[0]?.weightKg).toBe(50);
    expect(r.sales[0]?.qty).toBe(2);
  });

  it("штучний товар: weightKg = null, qty = кількість одиниць", () => {
    const r = buildSaleMovementRows(
      doc([item({ priceUnit: "шт", weight: 0, quantity: 3 })]),
      noCosts,
    );
    expect(r.stock[0]?.weightKg).toBeNull();
    expect(r.sales[0]?.weightKg).toBeNull();
    expect(r.stock[0]?.qty).toBe(3);
  });
});

describe("buildSaleMovementRows — собівартість", () => {
  it("з lot.purchasePriceEur: costEur = costPerKg × weight", () => {
    const r = buildSaleMovementRows(
      doc([item({ lotPurchasePriceEur: 2, weight: 25 })]),
      noCosts,
    );
    expect(r.cost[0]?.costEur).toBe(50); // 2 × 25
  });

  it("fallback на останню закупівельну ціну товару (costByProductId)", () => {
    const r = buildSaleMovementRows(
      doc([item({ lotPurchasePriceEur: null, productId: "P9", weight: 10 })]),
      new Map([["P9", 3]]),
    );
    expect(r.cost[0]?.costEur).toBe(30); // 3 × 10
  });

  it("немає ні лота, ні прайсу → costEur = 0 (рух усе одно пишемо)", () => {
    const r = buildSaleMovementRows(
      doc([item({ lotPurchasePriceEur: null, productId: "P404", weight: 10 })]),
      noCosts,
    );
    expect(r.cost[0]?.costEur).toBe(0);
  });

  it("lot.purchasePriceEur має пріоритет над мапою товару", () => {
    const r = buildSaleMovementRows(
      doc([item({ lotPurchasePriceEur: 5, productId: "P9", weight: 2 })]),
      new Map([["P9", 100]]),
    );
    expect(r.cost[0]?.costEur).toBe(10); // 5 × 2, а не 100 × 2
  });
});

describe("buildSaleMovementRows — lineNo / productCode1C", () => {
  it("lineNo послідовний (1,2,3) в усіх трьох регістрах", () => {
    const r = buildSaleMovementRows(
      doc([item({ id: "a" }), item({ id: "b" }), item({ id: "c" })]),
      noCosts,
    );
    expect(r.stock.map((x) => x.lineNo)).toEqual([1, 2, 3]);
    expect(r.sales.map((x) => x.lineNo)).toEqual([1, 2, 3]);
    expect(r.cost.map((x) => x.lineNo)).toEqual([1, 2, 3]);
  });

  it("productCode1C: code1C → barcode → синтетичний ключ", () => {
    const withCode = buildSaleMovementRows(doc([item()]), noCosts);
    expect(withCode.stock[0]?.productCode1C).toBe("CODE-P1");

    const byBarcode = buildSaleMovementRows(
      doc([item({ productCode1C: null, barcode: "BC-9" })]),
      noCosts,
    );
    expect(byBarcode.stock[0]?.productCode1C).toBe("BC-9");

    const synthetic = buildSaleMovementRows(
      doc([item({ id: "xyz", productCode1C: null, barcode: null })]),
      noCosts,
    );
    expect(synthetic.stock[0]?.productCode1C).toBe("sale-item:xyz");
  });

  it("lotCode1C = barcode рядка (null коли нема)", () => {
    const r = buildSaleMovementRows(doc([item({ barcode: null })]), noCosts);
    expect(r.stock[0]?.lotCode1C).toBeNull();
    expect(r.sales[0]?.lotCode1C).toBeNull();
  });
});
