import { describe, it, expect, vi } from "vitest";
import { createOrderMock, createPaymentMock, updateClientMock } from "./mock";

describe("updateClientMock", () => {
  it("returns ok=true з mockMode=true прапорцем", async () => {
    const result = await updateClientMock(
      { idempotencyKey: "k1", payload: { code1C: "000001", name: "Test" } },
      { sleepFn: async () => undefined },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mockMode).toBe(true);
      expect(result.code1C).toBe("000001");
      expect(result.errors).toEqual([]);
    }
  });

  it("generates synthetic MOCK-* code1C when payload.code1C missing", async () => {
    const result = await updateClientMock(
      { idempotencyKey: "k2", payload: { name: "New client" } },
      { sleepFn: async () => undefined },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code1C).toMatch(/^MOCK-\d+$/);
    }
  });

  it("calls sleepFn with delay у вказаному вікні", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    await updateClientMock(
      { idempotencyKey: "k3", payload: { code1C: "x" } },
      { sleepFn: sleepSpy, minMs: 50, maxMs: 200 },
    );
    expect(sleepSpy).toHaveBeenCalledOnce();
    const arg = sleepSpy.mock.calls[0]?.[0];
    expect(typeof arg).toBe("number");
    expect(arg).toBeGreaterThanOrEqual(50);
    expect(arg).toBeLessThanOrEqual(200);
  });

  it("treats empty-string code1C як missing і генерує MOCK-*", async () => {
    const result = await updateClientMock(
      { idempotencyKey: "k4", payload: { code1C: "" } },
      { sleepFn: async () => undefined },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code1C).toMatch(/^MOCK-/);
    }
  });
});

describe("createOrderMock", () => {
  it("повертає ok=true з orderCode1C і mockMode=true", async () => {
    const result = await createOrderMock(
      {
        idempotencyKey: "k-ord-1",
        payload: { customerCode1C: "000001", totalEur: "100.00" },
      },
      { sleepFn: async () => undefined },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mockMode).toBe(true);
      expect(result.orderCode1C).toMatch(/^MOCK-ORD-/);
      expect(result.orderNumber).toMatch(/^L-MOCK-/);
      expect(result.errors).toEqual([]);
    }
  });

  it("zoom код з payload коли вже існує (re-create flow)", async () => {
    const result = await createOrderMock(
      {
        idempotencyKey: "k-ord-2",
        payload: { code1C: "PRE-EXIST" },
      },
      { sleepFn: async () => undefined },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.orderCode1C).toBe("PRE-EXIST");
    }
  });
});

describe("createPaymentMock", () => {
  it("повертає ok=true з paymentCode1C і mockMode=true", async () => {
    const result = await createPaymentMock(
      {
        idempotencyKey: "k-pay-1",
        payload: { orderCode1C: "L-2026-0123", amount: "1000.00" },
      },
      { sleepFn: async () => undefined },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mockMode).toBe(true);
      expect(result.paymentCode1C).toMatch(/^MOCK-PMT-/);
    }
  });

  it("calls sleepFn в delay window", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    await createPaymentMock(
      { idempotencyKey: "k-pay-2", payload: {} },
      { sleepFn: sleepSpy, minMs: 10, maxMs: 30 },
    );
    expect(sleepSpy).toHaveBeenCalledOnce();
    const arg = sleepSpy.mock.calls[0]?.[0];
    expect(typeof arg).toBe("number");
    expect(arg).toBeGreaterThanOrEqual(10);
    expect(arg).toBeLessThanOrEqual(30);
  });
});
