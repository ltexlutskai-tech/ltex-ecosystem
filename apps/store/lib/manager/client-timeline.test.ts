import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn() },
    mgrClientTimelineEntry: { create: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));

import {
  recordClientEvent,
  recordClientEventSafe,
  buildOrderEventBody,
  buildSaleEventBody,
  buildPaymentEventBody,
  buildBronEventBody,
  buildReminderEventBody,
} from "./client-timeline";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.mgrClientTimelineEntry.create.mockResolvedValue({ id: "t1" });
});

describe("recordClientEvent — резолв клієнта", () => {
  it("резолвить за clientId (MgrClient.id) і створює запис", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "c1" });
    const ok = await recordClientEvent({
      clientId: "c1",
      kind: "bron",
      body: "Бронь",
      authorUserId: "u1",
    });
    expect(ok).toBe(true);
    expect(mockPrisma.mgrClientTimelineEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: "c1",
        kind: "bron",
        body: "Бронь",
        authorUserId: "u1",
      }),
    });
  });

  it("резолвить за customerId через спільний code1C", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ code1C: "K-100" });
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "mc9" });
    const ok = await recordClientEvent({
      customerId: "cust1",
      kind: "order",
      body: "Замовлення",
    });
    expect(ok).toBe(true);
    expect(mockPrisma.customer.findUnique).toHaveBeenCalled();
    expect(mockPrisma.mgrClient.findUnique).toHaveBeenCalledWith({
      where: { code1C: "K-100" },
      select: { id: true },
    });
    expect(mockPrisma.mgrClientTimelineEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: "mc9", kind: "order" }),
    });
  });

  it("пропускає (false) коли MgrClient не резолвиться за clientId", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const ok = await recordClientEvent({
      clientId: "nope",
      kind: "payment",
      body: "Оплата",
    });
    expect(ok).toBe(false);
    expect(mockPrisma.mgrClientTimelineEntry.create).not.toHaveBeenCalled();
  });

  it("пропускає коли Customer без code1C", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ code1C: null });
    const ok = await recordClientEvent({
      customerId: "cust2",
      kind: "sale",
      body: "Реалізація",
    });
    expect(ok).toBe(false);
    expect(mockPrisma.mgrClientTimelineEntry.create).not.toHaveBeenCalled();
  });

  it("пропускає коли немає ані clientId, ані customerId", async () => {
    const ok = await recordClientEvent({ kind: "comment", body: "X" });
    expect(ok).toBe(false);
    expect(mockPrisma.mgrClient.findUnique).not.toHaveBeenCalled();
  });
});

describe("recordClientEventSafe — fire-and-forget", () => {
  it("не кидає коли prisma валиться (ковтає помилку)", async () => {
    mockPrisma.mgrClient.findUnique.mockRejectedValueOnce(new Error("db down"));
    expect(() =>
      recordClientEventSafe({ clientId: "c1", kind: "order", body: "X" }),
    ).not.toThrow();
    // дозволяємо мікротаскам відпрацювати
    await Promise.resolve();
  });
});

describe("білдери тексту запису", () => {
  it("order/sale заголовки містять суму грн + кількість позицій", () => {
    expect(buildOrderEventBody(1234, 3)).toContain("Замовлення на");
    expect(buildOrderEventBody(1234, 3)).toContain("(3 позицій)");
    expect(buildSaleEventBody(500, 2)).toContain("Реалізація на");
    expect(buildSaleEventBody(500, 2)).toContain("грн");
  });

  it("payment показує грн (income) і розхід (expense)", () => {
    expect(
      buildPaymentEventBody({
        amountUah: 1000,
        amountEur: 0,
        amountUsd: 0,
        type: "income",
      }),
    ).toMatch(/^Оплата:/);
    expect(
      buildPaymentEventBody({
        amountUah: 0,
        amountEur: 50,
        amountUsd: 0,
        type: "expense",
      }),
    ).toMatch(/^Розхід:.*€/);
  });

  it("bron містить штрихкод і дату", () => {
    const body = buildBronEventBody("1234567890123", new Date("2026-06-02"));
    expect(body).toContain("Встановлення броні");
    expect(body).toContain("1234567890123");
  });

  it("reminder обрізає довгий текст до ~80 символів", () => {
    const long = "А".repeat(200);
    const body = buildReminderEventBody(long);
    expect(body.startsWith("Нагадування: ")).toBe(true);
    expect(body).toContain("…");
    expect(body.length).toBeLessThan(120);
  });
});
