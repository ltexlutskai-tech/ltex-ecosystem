import { describe, it, expect } from "vitest";
import {
  createCashOrderSchema,
  processPaymentSchema,
  discountRemainderSchema,
} from "./manager-cash-order";

describe("createCashOrderSchema", () => {
  it("accepts a valid cash payment with defaults", () => {
    const r = createCashOrderSchema.safeParse({
      saleId: "sale1",
      amountUah: 1000,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.amountEur).toBe(0);
      expect(r.data.amountUsd).toBe(0);
      expect(r.data.amountUahCashless).toBe(0);
      expect(r.data.changeCurrency).toBe("UAH");
    }
  });

  it("rejects when saleId is empty", () => {
    const r = createCashOrderSchema.safeParse({ saleId: "", amountUah: 100 });
    expect(r.success).toBe(false);
  });

  it("rejects when all amounts are zero (refine)", () => {
    const r = createCashOrderSchema.safeParse({
      saleId: "sale1",
      amountUah: 0,
      amountEur: 0,
      amountUsd: 0,
      amountUahCashless: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative amounts", () => {
    const r = createCashOrderSchema.safeParse({
      saleId: "sale1",
      amountUah: -5,
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown change currency", () => {
    const r = createCashOrderSchema.safeParse({
      saleId: "sale1",
      amountUah: 100,
      changeCurrency: "GBP",
    });
    expect(r.success).toBe(false);
  });

  it("accepts EUR-only payment + bank/article/comment", () => {
    const r = createCashOrderSchema.safeParse({
      saleId: "sale1",
      amountEur: 50,
      bankAccount: "UA00",
      cashFlowArticle: "Оплата від клієнта",
      comment: "готівка",
      changeCurrency: "EUR",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.amountEur).toBe(50);
      expect(r.data.changeCurrency).toBe("EUR");
    }
  });
});

describe("processPaymentSchema", () => {
  const base = { rateEur: 43, rateUsd: 40, sumToPayEur: 100 };

  it("accepts valid income via saleId with defaults", () => {
    const r = processPaymentSchema.safeParse({
      ...base,
      saleId: "sale1",
      amountUah: 4300,
      cashFlowArticleId: "art1", // стаття тепер обов'язкова
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe("income");
      expect(r.data.changeUah).toBe(0);
      expect(r.data.amountEur).toBe(0);
      expect(r.data.includeDebt).toBe(false);
    }
  });

  it("accepts valid income via clientId", () => {
    const r = processPaymentSchema.safeParse({
      ...base,
      clientId: "mgr1",
      amountUah: 4300,
      cashFlowArticleId: "art1", // стаття тепер обов'язкова
    });
    expect(r.success).toBe(true);
  });

  it("accepts valid expense with article (no paid amount required)", () => {
    const r = processPaymentSchema.safeParse({
      ...base,
      saleId: "sale1",
      type: "expense",
      cashFlowArticleId: "art1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when neither saleId nor clientId given", () => {
    const r = processPaymentSchema.safeParse({ ...base, amountUah: 100 });
    expect(r.success).toBe(false);
  });

  it("rejects expense without cashFlowArticleId", () => {
    const r = processPaymentSchema.safeParse({
      ...base,
      saleId: "sale1",
      type: "expense",
      amountUah: 100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects income with total paid 0", () => {
    const r = processPaymentSchema.safeParse({
      ...base,
      saleId: "sale1",
      amountUah: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-positive rates", () => {
    const r = processPaymentSchema.safeParse({
      saleId: "sale1",
      amountUah: 100,
      rateEur: 0,
      rateUsd: 40,
      sumToPayEur: 100,
    });
    expect(r.success).toBe(false);
  });
});

describe("discountRemainderSchema", () => {
  it("accepts a valid remainder", () => {
    const r = discountRemainderSchema.safeParse({
      saleId: "sale1",
      remainderEur: 3.5,
      rateEur: 43,
      rateUsd: 40,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a negative remainder (overpay)", () => {
    const r = discountRemainderSchema.safeParse({
      saleId: "sale1",
      remainderEur: -2,
      rateEur: 43,
      rateUsd: 40,
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-positive rateEur", () => {
    const r = discountRemainderSchema.safeParse({
      saleId: "sale1",
      remainderEur: 1,
      rateEur: -1,
      rateUsd: 40,
    });
    expect(r.success).toBe(false);
  });
});
