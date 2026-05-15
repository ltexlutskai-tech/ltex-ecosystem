import { describe, it, expect } from "vitest";
import { createPaymentSchema } from "./manager-payment";

describe("createPaymentSchema", () => {
  it("accepts valid payment з минимум полів", () => {
    const result = createPaymentSchema.safeParse({
      orderId: "o1",
      method: "cash",
      amount: 1000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("UAH");
    }
  });

  it("accepts усі enum methods + currencies + externalId/paidAt", () => {
    const result = createPaymentSchema.safeParse({
      orderId: "o1",
      method: "bank_transfer",
      amount: 5_000_000,
      currency: "EUR",
      externalId: "txn-123",
      paidAt: "2026-05-15T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid method", () => {
    const result = createPaymentSchema.safeParse({
      orderId: "o1",
      method: "crypto",
      amount: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects amount ≤0", () => {
    const result = createPaymentSchema.safeParse({
      orderId: "o1",
      method: "cash",
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed paidAt (not datetime)", () => {
    const result = createPaymentSchema.safeParse({
      orderId: "o1",
      method: "cash",
      amount: 100,
      paidAt: "yesterday",
    });
    expect(result.success).toBe(false);
  });

  it("rejects amount >10_000_000", () => {
    const result = createPaymentSchema.safeParse({
      orderId: "o1",
      method: "cash",
      amount: 10_000_001,
    });
    expect(result.success).toBe(false);
  });
});
