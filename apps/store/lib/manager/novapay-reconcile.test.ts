import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const reminderCreate = vi.fn();

vi.mock("@ltex/db", () => ({
  prisma: {
    sale: { findMany: (...a: unknown[]) => findMany(...a) },
    mgrReminder: { create: (...a: unknown[]) => reminderCreate(...a) },
  },
}));

const trackTtnMany = vi.fn();
vi.mock("@/lib/delivery/nova-poshta", () => ({
  trackTtnMany: (...a: unknown[]) => trackTtnMany(...a),
}));

const createCashOrderDraft = vi.fn();
vi.mock("@/lib/manager/cash-order", () => ({
  createCashOrderDraft: (...a: unknown[]) => createCashOrderDraft(...a),
}));

import { reconcileNovaPayPayments } from "./novapay-reconcile";

function sale(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    expressWaybill: "204500",
    codAmountUah: 1500,
    exchangeRateEur: 45,
    exchangeRateUsd: 40,
    assignedAgentUserId: "u1",
    number1C: null,
    code1C: null,
    docNumber: 12,
    customer: { name: "ТОВ Клієнт" },
    ...over,
  };
}

beforeEach(() => {
  findMany.mockReset();
  reminderCreate.mockReset().mockResolvedValue({});
  trackTtnMany.mockReset();
  createCashOrderDraft.mockReset().mockResolvedValue({ id: "co1" });
});

describe("reconcileNovaPayPayments", () => {
  it("returns zero when no candidates", async () => {
    findMany.mockResolvedValue([]);
    const res = await reconcileNovaPayPayments();
    expect(res).toEqual({ checked: 0, drafted: 0 });
    expect(trackTtnMany).not.toHaveBeenCalled();
  });

  it("drafts a cash order + reminder when TTN delivered", async () => {
    findMany.mockResolvedValue([sale()]);
    trackTtnMany.mockResolvedValue(
      new Map([
        [
          "204500",
          { status: "Отримано", statusCode: "10", scheduledDeliveryDate: "" },
        ],
      ]),
    );
    const res = await reconcileNovaPayPayments();
    expect(res).toEqual({ checked: 1, drafted: 1 });
    expect(createCashOrderDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        saleId: "s1",
        type: "income",
        paid: { uah: 0, eur: 0, usd: 0, uahCashless: 1500 },
        rates: { eur: 45, usd: 40 },
      }),
    );
    expect(reminderCreate).toHaveBeenCalledTimes(1);
  });

  it("skips sales not yet delivered", async () => {
    findMany.mockResolvedValue([sale()]);
    trackTtnMany.mockResolvedValue(
      new Map([
        [
          "204500",
          { status: "В дорозі", statusCode: "5", scheduledDeliveryDate: "" },
        ],
      ]),
    );
    const res = await reconcileNovaPayPayments();
    expect(res).toEqual({ checked: 1, drafted: 0 });
    expect(createCashOrderDraft).not.toHaveBeenCalled();
  });

  it("does not send reminder when no assigned agent", async () => {
    findMany.mockResolvedValue([sale({ assignedAgentUserId: null })]);
    trackTtnMany.mockResolvedValue(
      new Map([
        [
          "204500",
          { status: "Отримано", statusCode: "9", scheduledDeliveryDate: "" },
        ],
      ]),
    );
    const res = await reconcileNovaPayPayments();
    expect(res.drafted).toBe(1);
    expect(reminderCreate).not.toHaveBeenCalled();
  });
});
