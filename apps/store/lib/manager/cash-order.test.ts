import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => {
  // Один набір делегатів спільний для `tx` (усередині $transaction) і singleton
  // `prisma` — щоб і транзакційний запис руху боргу (`applyDebtMovementTx`), і
  // перерахунок кешу після коміту (`recomputeDebtForClientsSafe`) працювали.
  const delegates = {
    mgrCashOrder: { create: vi.fn(), findMany: vi.fn() },
    sale: { findUnique: vi.fn(), update: vi.fn() },
    customer: { findUnique: vi.fn() },
    mgrClient: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    mgrDebtMovement: { upsert: vi.fn(), groupBy: vi.fn() },
  };
  return {
    mockPrisma: {
      ...delegates,
      $transaction: vi.fn(async (cb: (t: typeof delegates) => unknown) =>
        cb(delegates),
      ),
    },
  };
});

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import {
  computeChange,
  computeCashSummary,
  convertUahTo,
  createCashOrderWithChange,
  createPaymentOrders,
  reduceToEur,
  reduceChangeToEur,
  computeBalanceEur,
  computePaymentRecommendations,
  computeChangeRecommendations,
  PAYMENT_REMAINDER_DISCOUNT_THRESHOLD_EUR,
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

// ─── Етап 2: EUR-base формули (аудит §B; rEur=43, rUsd=40) ──────────────────

describe("reduceToEur", () => {
  it("sums cash EUR + UAH/43 + cashless/43 + USD*40/43", () => {
    // 10€ + 430грн(=10€) + 215грн безнал(=5€) + 21.5$(*40/43=20€) = 45€
    const r = reduceToEur(
      { uah: 430, eur: 10, usd: 21.5, uahCashless: 215 },
      rates,
    );
    expect(r).toBe(45);
  });
  it("pure UAH cash → /rEur (round2)", () => {
    // 100грн / 43 = 2.3255… → 2.33
    expect(
      reduceToEur({ uah: 100, eur: 0, usd: 0, uahCashless: 0 }, rates),
    ).toBe(2.33);
  });
  it("rEur<=0 → UAH/cashless/USD contributions are 0", () => {
    expect(
      reduceToEur(
        { uah: 1000, eur: 7, usd: 50, uahCashless: 500 },
        { eur: 0, usd: 40 },
      ),
    ).toBe(7);
  });
  it("rUsd<=0 → USD contribution 0 (UAH still counts)", () => {
    // 430грн/43 = 10€; USD ignored
    expect(
      reduceToEur(
        { uah: 430, eur: 0, usd: 100, uahCashless: 0 },
        { eur: 43, usd: 0 },
      ),
    ).toBe(10);
  });
});

describe("reduceChangeToEur", () => {
  it("sums change EUR + UAH/43 + USD*40/43 (no cashless)", () => {
    // 5€ + 430грн(10€) + 4.3$(*40/43=4€) = 19€
    expect(reduceChangeToEur({ uah: 430, eur: 5, usd: 4.3 }, rates)).toBe(19);
  });
  it("rEur<=0 → only EUR cash counts", () => {
    expect(
      reduceChangeToEur({ uah: 1000, eur: 3, usd: 50 }, { eur: 0, usd: 40 }),
    ).toBe(3);
  });
});

describe("computeBalanceEur", () => {
  it("debt when underpaid (>0)", () => {
    expect(
      computeBalanceEur({ sumToPayEur: 100, paidEur: 60, changeEur: 0 }),
    ).toBe(40);
  });
  it("overpay when paid more (negative)", () => {
    expect(
      computeBalanceEur({ sumToPayEur: 100, paidEur: 130, changeEur: 0 }),
    ).toBe(-30);
  });
  it("change adds back to balance", () => {
    // paid 130, but 30 returned as change → net settled
    expect(
      computeBalanceEur({ sumToPayEur: 100, paidEur: 130, changeEur: 30 }),
    ).toBe(0);
  });
});

describe("computePaymentRecommendations", () => {
  it("recommends remaining in 3 currencies", () => {
    // remain = 100 - 60 = 40€ → 1720грн, 43$ (40*43/40)
    const r = computePaymentRecommendations({
      sumToPayEur: 100,
      paidEur: 60,
      rates,
    });
    expect(r.payEur).toBe(40);
    expect(r.payUah).toBe(1720);
    expect(r.payUsd).toBe(43);
  });
  it("returns all zero when overpaid (remain < 0)", () => {
    const r = computePaymentRecommendations({
      sumToPayEur: 100,
      paidEur: 120,
      rates,
    });
    expect(r).toEqual({ payEur: 0, payUah: 0, payUsd: 0 });
  });
  it("zero rates guard → UAH/USD recs are 0", () => {
    const r = computePaymentRecommendations({
      sumToPayEur: 100,
      paidEur: 0,
      rates: { eur: 0, usd: 0 },
    });
    expect(r.payEur).toBe(100);
    expect(r.payUah).toBe(0);
    expect(r.payUsd).toBe(0);
  });
});

describe("computeChangeRecommendations", () => {
  it("recommends change in 3 currencies when overpaid", () => {
    // balance -30€ → 30€, 1290грн, 32.25$ (30*43/40)
    const r = computeChangeRecommendations({ balanceEur: -30, rates });
    expect(r.changeEur).toBe(30);
    expect(r.changeUah).toBe(1290);
    expect(r.changeUsd).toBe(32.25);
  });
  it("returns zero when no overpay (balance >= 0)", () => {
    expect(computeChangeRecommendations({ balanceEur: 10, rates })).toEqual({
      changeEur: 0,
      changeUah: 0,
      changeUsd: 0,
    });
  });
});

describe("PAYMENT_REMAINDER_DISCOUNT_THRESHOLD_EUR", () => {
  it("defaults to 5 €", () => {
    expect(PAYMENT_REMAINDER_DISCOUNT_THRESHOLD_EUR).toBe(5);
  });
});

describe("createPaymentOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.sale.findUnique.mockResolvedValue({ cashOnDelivery: false });
    mockPrisma.mgrCashOrder.findMany.mockResolvedValue([]);
  });

  it("creates income order with documentSumEur (no change)", async () => {
    mockPrisma.mgrCashOrder.create.mockResolvedValueOnce({ id: "co1" });
    const r = await createPaymentOrders({
      saleId: "sale1",
      customerId: "cust1",
      type: "income",
      paid: { uah: 4300, eur: 0, usd: 0, uahCashless: 0 },
      change: { uah: 0, eur: 0, usd: 0 },
      rates,
      sumToPayEur: 100,
    });
    expect(r.change).toBeNull();
    expect(mockPrisma.mgrCashOrder.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.mgrCashOrder.create.mock.calls[0]?.[0] as {
      data: {
        type: string;
        documentSumEur: number;
        rateEur: number;
        customerId: string;
      };
    };
    expect(data.data.type).toBe("income");
    expect(data.data.documentSumEur).toBe(100); // 4300/43
    expect(data.data.rateEur).toBe(43);
    expect(data.data.customerId).toBe("cust1");
  });

  it("creates expense change order on manual change", async () => {
    mockPrisma.mgrCashOrder.create
      .mockResolvedValueOnce({ id: "co-income" })
      .mockResolvedValueOnce({ id: "co-change" });
    const r = await createPaymentOrders({
      saleId: "sale1",
      type: "income",
      paid: { uah: 4730, eur: 0, usd: 0, uahCashless: 0 },
      change: { uah: 430, eur: 0, usd: 0 },
      rates,
      sumToPayEur: 100,
    });
    expect(r.change).not.toBeNull();
    expect(mockPrisma.mgrCashOrder.create).toHaveBeenCalledTimes(2);
    const expense = mockPrisma.mgrCashOrder.create.mock.calls[1]?.[0] as {
      data: {
        type: string;
        changeForId: string;
        amountUah: number;
        documentSumEur: number;
      };
    };
    expect(expense.data.type).toBe("expense");
    expect(expense.data.changeForId).toBe("co-income");
    expect(expense.data.amountUah).toBe(430);
    expect(expense.data.documentSumEur).toBe(10); // 430/43
  });

  it("supports standalone payment without saleId (no sale.update)", async () => {
    mockPrisma.mgrCashOrder.create.mockResolvedValueOnce({ id: "co1" });
    await createPaymentOrders({
      saleId: null,
      customerId: "cust1",
      type: "income",
      paid: { uah: 4300, eur: 0, usd: 0, uahCashless: 0 },
      change: { uah: 0, eur: 0, usd: 0 },
      rates,
      sumToPayEur: 100,
    });
    expect(mockPrisma.sale.update).not.toHaveBeenCalled();
  });

  it("C1: рух боргу (−settledEur) пишеться у ТІЙ САМІЙ транзакції", async () => {
    mockPrisma.mgrCashOrder.create.mockResolvedValueOnce({
      id: "co1",
      createdAt: new Date("2026-07-01T10:00:00Z"),
    });
    // Клієнт резолвиться → рух пишеться; groupBy для recompute після коміту.
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ code1C: "ABC" });
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "mgr-1" });
    mockPrisma.mgrDebtMovement.groupBy.mockResolvedValue([]);

    await createPaymentOrders({
      saleId: null,
      customerId: "cust1",
      type: "income",
      paid: { uah: 4300, eur: 0, usd: 0, uahCashless: 0 }, // 100€ погашення
      change: { uah: 0, eur: 0, usd: 0 },
      rates,
      sumToPayEur: 100,
    });

    expect(mockPrisma.mgrDebtMovement.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.mgrDebtMovement.upsert.mock.calls[0]?.[0] as {
      where: { mgr_debt_movement_source: { sourceId: string } };
      create: { amountEur: number; kind: string; clientId: string };
    };
    expect(call.where.mgr_debt_movement_source.sourceId).toBe("co1");
    expect(call.create.kind).toBe("payment");
    expect(call.create.clientId).toBe("mgr-1");
    // Оплата 100€ ЗМЕНШУЄ борг → рух від'ємний.
    expect(call.create.amountEur).toBe(-100);
    // Кеш перераховується після коміту.
    expect(mockPrisma.mgrDebtMovement.groupBy).toHaveBeenCalled();
  });

  it("expense (standalone) НЕ пише рух боргу", async () => {
    mockPrisma.mgrCashOrder.create.mockResolvedValueOnce({ id: "co1" });
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ code1C: "ABC" });
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "mgr-1" });

    await createPaymentOrders({
      saleId: null,
      customerId: "cust1",
      type: "expense",
      paid: { uah: 4300, eur: 0, usd: 0, uahCashless: 0 },
      change: { uah: 0, eur: 0, usd: 0 },
      rates,
      sumToPayEur: 100,
    });

    expect(mockPrisma.mgrDebtMovement.upsert).not.toHaveBeenCalled();
  });
});
