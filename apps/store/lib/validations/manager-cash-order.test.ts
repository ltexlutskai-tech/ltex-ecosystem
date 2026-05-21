import { describe, it, expect } from "vitest";
import { createCashOrderSchema } from "./manager-cash-order";

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
