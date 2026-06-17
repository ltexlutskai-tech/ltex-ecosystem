import { describe, it, expect } from "vitest";
import {
  buildSalesMovement,
  buildCashFlowMovement,
  buildStockMovement,
  buildOrderRemainderMovement,
  round2,
  round3,
} from "./registry-import-map";

const NOW = new Date("2026-06-17T10:00:00Z");

describe("round helpers", () => {
  it("round2 — два знаки", () => {
    expect(round2(1.005)).toBe(1.01); // EPSILON компенсує float-дрейф
    expect(round2(2.345)).toBe(2.35);
    expect(round2(10)).toBe(10);
  });
  it("round3 — три знаки", () => {
    expect(round3(18.0049)).toBe(18.005);
    expect(round3(15.2)).toBe(15.2);
  });
});

describe("buildSalesMovement", () => {
  it("прихід (recordKind 0) — округлення + costEur=null", () => {
    const r = buildSalesMovement({
      occurredAt: NOW,
      recorderCode1C: "aa",
      lineNo: 1,
      productCode1C: "p1",
      productId: "prod-1",
      lotCode1C: "lot-1",
      clientCode1C: "c1",
      clientId: "cli-1",
      agentCode1C: null,
      orderCode1C: "o1",
      saleCode1C: "s1",
      qty: 3.0001,
      weightKg: 60.249,
      revenueEur: 120.005,
      revenueNoDiscountEur: 130.004,
      recordKind: 0,
    });
    expect(r.recordKind).toBe(0);
    expect(r.qty).toBe(3);
    expect(r.weightKg).toBe(60.249);
    expect(r.revenueEur).toBe(120.01);
    expect(r.revenueNoDiscountEur).toBe(130);
    expect(r.costEur).toBeNull();
    expect(r.productId).toBe("prod-1");
  });

  it("повернення (recordKind 1) зберігається; null weight/no-discount", () => {
    const r = buildSalesMovement({
      occurredAt: NOW,
      recorderCode1C: "bb",
      lineNo: 2,
      productCode1C: null,
      productId: null,
      lotCode1C: null,
      clientCode1C: null,
      clientId: null,
      agentCode1C: null,
      orderCode1C: null,
      saleCode1C: null,
      qty: 1,
      weightKg: null,
      revenueEur: 50,
      revenueNoDiscountEur: null,
      recordKind: 1,
    });
    expect(r.recordKind).toBe(1);
    expect(r.weightKg).toBeNull();
    expect(r.revenueNoDiscountEur).toBeNull();
  });

  it("невідомий recordKind → нормалізується у 0", () => {
    const r = buildSalesMovement({
      occurredAt: NOW,
      recorderCode1C: "cc",
      lineNo: 3,
      productCode1C: "p",
      productId: null,
      lotCode1C: null,
      clientCode1C: null,
      clientId: null,
      agentCode1C: null,
      orderCode1C: null,
      saleCode1C: null,
      qty: 1,
      weightKg: 1,
      revenueEur: 1,
      revenueNoDiscountEur: 1,
      recordKind: 7,
    });
    expect(r.recordKind).toBe(0);
  });
});

describe("buildCashFlowMovement", () => {
  it("прихід — direction 0, округлення сум", () => {
    const r = buildCashFlowMovement({
      occurredAt: NOW,
      recorderCode1C: "rc",
      lineNo: 1,
      accountCode1C: "acc",
      articleCode1C: "art",
      direction: 0,
      clientCode1C: "cli",
      amountUah: 1000.005,
      amountUpr: 23.255,
    });
    expect(r.direction).toBe(0);
    expect(r.amountUah).toBe(1000.01);
    expect(r.amountUpr).toBe(23.26);
  });

  it("розхід — direction 1; null amountUpr", () => {
    const r = buildCashFlowMovement({
      occurredAt: NOW,
      recorderCode1C: "rc",
      lineNo: 2,
      accountCode1C: null,
      articleCode1C: null,
      direction: 1,
      clientCode1C: null,
      amountUah: 500,
      amountUpr: null,
    });
    expect(r.direction).toBe(1);
    expect(r.amountUpr).toBeNull();
  });
});

describe("buildStockMovement", () => {
  it("прихід — qty/weight round3, recordKind 0", () => {
    const r = buildStockMovement({
      occurredAt: NOW,
      recorderCode1C: "rc",
      lineNo: 1,
      warehouseCode1C: "wh",
      productCode1C: "p1",
      productId: "prod-1",
      lotCode1C: "lot",
      quality: "extra",
      qty: 10.0004,
      weightKg: 200.1239,
      recordKind: 0,
    });
    expect(r.recordKind).toBe(0);
    expect(r.qty).toBe(10);
    expect(r.weightKg).toBe(200.124);
  });

  it("розхід — recordKind 1; null weight", () => {
    const r = buildStockMovement({
      occurredAt: NOW,
      recorderCode1C: "rc",
      lineNo: 2,
      warehouseCode1C: null,
      productCode1C: "p1",
      productId: null,
      lotCode1C: null,
      quality: null,
      qty: 5,
      weightKg: null,
      recordKind: 1,
    });
    expect(r.recordKind).toBe(1);
    expect(r.weightKg).toBeNull();
  });
});

describe("buildOrderRemainderMovement", () => {
  it("мапить замовлення + товар + qty", () => {
    const r = buildOrderRemainderMovement({
      occurredAt: NOW,
      recorderCode1C: "rc",
      lineNo: 1,
      orderCode1C: "ord-hex",
      orderId: "order-1",
      productCode1C: "p1",
      productId: "prod-1",
      qty: 7.0001,
      recordKind: 0,
    });
    expect(r.orderCode1C).toBe("ord-hex");
    expect(r.orderId).toBe("order-1");
    expect(r.qty).toBe(7);
    expect(r.recordKind).toBe(0);
  });
});
