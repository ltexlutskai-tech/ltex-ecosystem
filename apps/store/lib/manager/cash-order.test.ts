import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => {
  const tx = {
    mgrCashOrder: { create: vi.fn(), findMany: vi.fn() },
    sale: { findUnique: vi.fn(), update: vi.fn() },
  };
  return {
    mockPrisma: {
      mgrCashOrder: tx.mgrCashOrder,
      sale: tx.sale,
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  };
});

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import {
  computeChange,
  computeCashSummary,
  convertUahTo,
  createCashOrderWithChange,
} from "./cash-order";

const rates = { eur: 43, usd: 40 };

describe("convertUahTo", () => {
  it("returns UAH as-is", () => {
    expect(convertUahTo(1000, "UAH", rates)).toBe(1000);
  });
  it("converts UAH → EUR (2dp)", () => {
    expect(convertUahTo(430, "EUR", rates)).toBe(10);
    expect(convertUahTo(100, "EUR", rates)).toBe(2.33);
  });
  it("converts UAH → USD (2dp)", () => {
    expect(convertUahTo(400, "USD", rates)).toBe(10);
  });
  it("guards divide-by-zero rate → 0", () => {
    expect(convertUahTo(100, "EUR", { eur: 0, usd: 0 })).toBe(0);
    expect(convertUahTo(100, "USD", { eur: 0, usd: -1 })).toBe(0);
  });
});

describe("computeChange", () => {
  it("no change when paid exactly equals due", () => {
    const r = computeChange({
      dueUah: 1000,
      paid: { uah: 1000, eur: 0, usd: 0, uahCashless: 0 },
      rates,
    });
    expect(r.changeUah).toBe(0);
    expect(r.paidUah).toBe(1000);
  });

  it("change > 0 on overpay in UAH cash", () => {
    const r = computeChange({
      dueUah: 1000,
      paid: { uah: 1200, eur: 0, usd: 0, uahCashless: 0 },
      rates,
    });
    expect(r.changeUah).toBe(200);
  });

  it("EUR payment converts via rate (50 EUR @43 = 2150 UAH, due 1000 → change 1150)", () => {
    const r = computeChange({
      dueUah: 1000,
      paid: { uah: 0, eur: 50, usd: 0, uahCashless: 0 },
      rates,
    });
    expect(r.paidUah).toBe(2150);
    expect(r.changeUah).toBe(1150);
  });

  it("mixed currencies + cashless", () => {
    const r = computeChange({
      dueUah: 3000,
      paid: { uah: 500, eur: 10, usd: 20, uahCashless: 1000 },
      rates,
    });
    // 500 + 430 + 800 + 1000 = 2730 → underpay, no change
    expect(r.paidUah).toBe(2730);
    expect(r.changeUah).toBe(0);
  });

  it("underpay yields change 0 (never negative)", () => {
    const r = computeChange({
      dueUah: 5000,
      paid: { uah: 100, eur: 0, usd: 0, uahCashless: 0 },
      rates,
    });
    expect(r.changeUah).toBe(0);
  });

  it("zero EUR rate ignores EUR portion in paidUah", () => {
    const r = computeChange({
      dueUah: 0,
      paid: { uah: 0, eur: 100, usd: 0, uahCashless: 0 },
      rates: { eur: 0, usd: 0 },
    });
    expect(r.paidUah).toBe(0);
    expect(r.changeUah).toBe(0);
  });
});

describe("computeCashSummary", () => {
  const rates = { eur: 43, usd: 40 };

  it("debt when nothing paid (balance = due)", () => {
    const r = computeCashSummary({ dueUah: 1000, orders: [], rates });
    expect(r.receivedUah).toBe(0);
    expect(r.balanceUah).toBe(1000);
    expect(r.changeUah).toBe(0);
  });

  it("fully paid → balance 0", () => {
    const r = computeCashSummary({
      dueUah: 1000,
      orders: [
        {
          type: "income",
          amountUah: 1000,
          amountEur: 0,
          amountUsd: 0,
          amountUahCashless: 0,
        },
      ],
      rates,
    });
    expect(r.receivedUah).toBe(1000);
    expect(r.balanceUah).toBe(0);
  });

  it("prepayment → negative balance", () => {
    const r = computeCashSummary({
      dueUah: 1000,
      orders: [
        {
          type: "income",
          amountUah: 1500,
          amountEur: 0,
          amountUsd: 0,
          amountUahCashless: 0,
        },
      ],
      rates,
    });
    expect(r.receivedUah).toBe(1500);
    expect(r.balanceUah).toBe(-500);
  });

  it("income minus expense (change reduces received)", () => {
    const r = computeCashSummary({
      dueUah: 1000,
      orders: [
        {
          type: "income",
          amountUah: 1200,
          amountEur: 0,
          amountUsd: 0,
          amountUahCashless: 0,
        },
        {
          type: "expense",
          amountUah: 200,
          amountEur: 0,
          amountUsd: 0,
          amountUahCashless: 0,
        },
      ],
      rates,
    });
    expect(r.receivedUah).toBe(1000);
    expect(r.balanceUah).toBe(0);
    expect(r.changeUah).toBe(200);
  });

  it("cashless income counts toward received", () => {
    const r = computeCashSummary({
      dueUah: 1000,
      orders: [
        {
          type: "income",
          amountUah: 0,
          amountEur: 0,
          amountUsd: 0,
          amountUahCashless: 600,
        },
      ],
      rates,
    });
    expect(r.receivedUah).toBe(600);
    expect(r.balanceUah).toBe(400);
  });

  it("EUR/USD cash converted to UAH via snapshot rates", () => {
    // due 2000 грн; отримано 30 € (×43=1290) + 10 $ (×40=400) = 1690 грн.
    const r = computeCashSummary({
      dueUah: 2000,
      orders: [
        {
          type: "income",
          amountUah: 0,
          amountEur: 30,
          amountUsd: 10,
          amountUahCashless: 0,
        },
      ],
      rates,
    });
    expect(r.receivedUah).toBe(1690);
    expect(r.balanceUah).toBe(310);
  });

  it("change in EUR (expense) reduces received via rate", () => {
    // income 50 € = 2150; expense (здача) 3.49 € ≈ 150 грн → received ≈ 2000.
    const r = computeCashSummary({
      dueUah: 2000,
      orders: [
        {
          type: "income",
          amountUah: 0,
          amountEur: 50,
          amountUsd: 0,
          amountUahCashless: 0,
        },
        {
          type: "expense",
          amountUah: 0,
          amountEur: 3.49,
          amountUsd: 0,
          amountUahCashless: 0,
        },
      ],
      rates,
    });
    expect(r.receivedUah).toBe(2000);
    expect(r.balanceUah).toBe(0);
  });
});

describe("createCashOrderWithChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.sale.findUnique.mockResolvedValue({ cashOnDelivery: false });
    mockPrisma.mgrCashOrder.findMany.mockResolvedValue([]);
  });

  it("creates income order; no expense when paid exactly", async () => {
    mockPrisma.mgrCashOrder.create.mockResolvedValueOnce({ id: "co1" });
    const r = await createCashOrderWithChange({
      saleId: "sale1",
      type: "income",
      amounts: { uah: 1000, eur: 0, usd: 0, uahCashless: 0 },
      changeCurrency: "UAH",
      dueUah: 1000,
      rates,
    });
    expect(r.change).toBeNull();
    expect(mockPrisma.mgrCashOrder.create).toHaveBeenCalledTimes(1);
    const call = mockPrisma.mgrCashOrder.create.mock.calls[0]?.[0] as {
      data: { type: string; amountUah: number };
    };
    expect(call.data.type).toBe("income");
    expect(call.data.amountUah).toBe(1000);
  });

  it("creates a second expense order (change in UAH) on overpay", async () => {
    mockPrisma.mgrCashOrder.create
      .mockResolvedValueOnce({ id: "co-income" })
      .mockResolvedValueOnce({ id: "co-change" });
    const r = await createCashOrderWithChange({
      saleId: "sale1",
      type: "income",
      amounts: { uah: 1200, eur: 0, usd: 0, uahCashless: 0 },
      changeCurrency: "UAH",
      dueUah: 1000,
      rates,
    });
    expect(r.change).not.toBeNull();
    expect(mockPrisma.mgrCashOrder.create).toHaveBeenCalledTimes(2);
    const expenseCall = mockPrisma.mgrCashOrder.create.mock.calls[1]?.[0] as {
      data: {
        type: string;
        changeForId: string;
        amountUah: number;
        changeCurrency: string;
      };
    };
    expect(expenseCall.data.type).toBe("expense");
    expect(expenseCall.data.changeForId).toBe("co-income");
    expect(expenseCall.data.amountUah).toBe(200);
    expect(expenseCall.data.changeCurrency).toBe("UAH");
  });

  it("places change into EUR field when changeCurrency=EUR", async () => {
    mockPrisma.mgrCashOrder.create
      .mockResolvedValueOnce({ id: "co-income" })
      .mockResolvedValueOnce({ id: "co-change" });
    await createCashOrderWithChange({
      saleId: "sale1",
      type: "income",
      amounts: { uah: 1430, eur: 0, usd: 0, uahCashless: 0 },
      changeCurrency: "EUR",
      dueUah: 1000,
      rates,
    });
    const expenseCall = mockPrisma.mgrCashOrder.create.mock.calls[1]?.[0] as {
      data: { amountEur: number; amountUah: number };
    };
    // change 430 UAH / 43 = 10 EUR
    expect(expenseCall.data.amountEur).toBe(10);
    expect(expenseCall.data.amountUah).toBe(0);
  });

  it("updates Sale.codAmountUah when cashOnDelivery", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({ cashOnDelivery: true });
    mockPrisma.mgrCashOrder.create.mockResolvedValueOnce({ id: "co1" });
    mockPrisma.mgrCashOrder.findMany.mockResolvedValueOnce([
      {
        type: "income",
        amountUah: 400,
        amountEur: 0,
        amountUsd: 0,
        amountUahCashless: 0,
      },
    ]);
    await createCashOrderWithChange({
      saleId: "sale1",
      type: "income",
      amounts: { uah: 400, eur: 0, usd: 0, uahCashless: 0 },
      changeCurrency: "UAH",
      dueUah: 1000,
      rates,
    });
    const upd = mockPrisma.sale.update.mock.calls[0]?.[0] as {
      data: { codAmountUah: number | null };
    };
    expect(upd.data.codAmountUah).toBe(600);
  });

  it("sets codAmountUah=null when not cashOnDelivery", async () => {
    mockPrisma.mgrCashOrder.create.mockResolvedValueOnce({ id: "co1" });
    await createCashOrderWithChange({
      saleId: "sale1",
      type: "income",
      amounts: { uah: 1000, eur: 0, usd: 0, uahCashless: 0 },
      changeCurrency: "UAH",
      dueUah: 1000,
      rates,
    });
    const upd = mockPrisma.sale.update.mock.calls[0]?.[0] as {
      data: { codAmountUah: number | null };
    };
    expect(upd.data.codAmountUah).toBeNull();
  });
});
