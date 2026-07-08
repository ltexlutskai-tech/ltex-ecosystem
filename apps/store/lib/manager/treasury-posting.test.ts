import { describe, it, expect, vi, beforeEach } from "vitest";

// Спільний tx-об'єкт для $transaction(cb => cb(tx)).
const { mockPrisma, tx } = vi.hoisted(() => {
  const tx = {
    bankPaymentIncoming: { update: vi.fn() },
    bankPaymentOutgoing: { update: vi.fn() },
    cashTransfer: { update: vi.fn() },
    cashFlowMovement: { createMany: vi.fn(), deleteMany: vi.fn() },
    mgrDebtMovement: { deleteMany: vi.fn() },
  };
  return {
    tx,
    mockPrisma: {
      bankPaymentIncoming: { findUnique: vi.fn() },
      bankPaymentOutgoing: { findUnique: vi.fn() },
      cashTransfer: { findUnique: vi.fn() },
      mgrBankAccount: { findUnique: vi.fn() },
      mgrCashFlowArticle: { findUnique: vi.fn() },
      customer: { findUnique: vi.fn() },
      mgrClient: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      mgrDebtMovement: {
        findMany: vi.fn(),
        upsert: vi.fn(),
        groupBy: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  };
});

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import {
  buildBankPaymentLeg,
  buildCashTransferLegs,
  computeAmountEur,
  postBankPaymentIncoming,
  postBankPaymentOutgoing,
  postCashTransfer,
  cancelBankPaymentIncoming,
} from "./treasury-posting";
import { CASH_DESK_CODE } from "./cashflow-register";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── PURE: computeAmountEur ──────────────────────────────────────────────────

describe("computeAmountEur", () => {
  it("EUR → сама сума", () => {
    expect(computeAmountEur(100, "EUR", 43)).toBe(100);
  });
  it("UAH → amount / rateEur", () => {
    expect(computeAmountEur(430, "UAH", 43)).toBe(10);
  });
  it("нульовий курс → 0 (без ділення на 0)", () => {
    expect(computeAmountEur(430, "UAH", 0)).toBe(0);
  });
  it("USD → best-effort amount / rateEur", () => {
    expect(computeAmountEur(400, "USD", 40)).toBe(10);
  });
});

// ─── PURE: buildBankPaymentLeg ───────────────────────────────────────────────

describe("buildBankPaymentLeg", () => {
  it("прихід → 1 нога direction=0, amountUah=сума, amountUpr=€", () => {
    const legs = buildBankPaymentLeg(
      { currency: "UAH", amount: 430, amountEur: 10 },
      0,
      "acc-hex",
    );
    expect(legs).toEqual([
      {
        lineNo: 1,
        accountCode1C: "acc-hex",
        currencyCode: "UAH",
        direction: 0,
        amountUah: 430,
        amountUpr: 10,
      },
    ]);
  });

  it("розхід → direction=1", () => {
    const legs = buildBankPaymentLeg(
      { currency: "EUR", amount: 50, amountEur: 50 },
      1,
      "acc",
    );
    expect(legs[0]?.direction).toBe(1);
    expect(legs[0]?.currencyCode).toBe("EUR");
  });

  it("сума ≤ 0 → без ноги", () => {
    expect(
      buildBankPaymentLeg({ currency: "UAH", amount: 0, amountEur: 0 }, 0, "a"),
    ).toEqual([]);
  });
});

// ─── PURE: buildCashTransferLegs ─────────────────────────────────────────────

describe("buildCashTransferLegs", () => {
  it("2 ноги: розхід із джерела (lineNo=1) + прихід у призначення (lineNo=2)", () => {
    const legs = buildCashTransferLegs(
      { currency: "UAH", amount: 1000, amountEur: 25 },
      "from-acc",
      "to-acc",
    );
    expect(legs).toEqual([
      {
        lineNo: 1,
        accountCode1C: "from-acc",
        currencyCode: "UAH",
        direction: 1,
        amountUah: 1000,
        amountUpr: 25,
      },
      {
        lineNo: 2,
        accountCode1C: "to-acc",
        currencyCode: "UAH",
        direction: 0,
        amountUah: 1000,
        amountUpr: 25,
      },
    ]);
  });

  it("null рахунок → сентинел готівкової каси CASH", () => {
    const legs = buildCashTransferLegs(
      { currency: "UAH", amount: 500, amountEur: 12 },
      null,
      "bank-acc",
    );
    expect(legs[0]?.accountCode1C).toBe(CASH_DESK_CODE); // інкасація каса→банк
    expect(legs[1]?.accountCode1C).toBe("bank-acc");
  });

  it("сума ≤ 0 → без рухів", () => {
    expect(
      buildCashTransferLegs(
        { currency: "UAH", amount: 0, amountEur: 0 },
        null,
        "a",
      ),
    ).toEqual([]);
  });
});

// ─── postBankPaymentIncoming (mocked) ────────────────────────────────────────

describe("postBankPaymentIncoming", () => {
  it("документ не знайдено → not_found", async () => {
    mockPrisma.bankPaymentIncoming.findUnique.mockResolvedValueOnce(null);
    const r = await postBankPaymentIncoming("x");
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("не чернетка → not_draft", async () => {
    mockPrisma.bankPaymentIncoming.findUnique.mockResolvedValueOnce({
      id: "x",
      status: "posted",
    });
    const r = await postBankPaymentIncoming("x");
    expect(r).toEqual({ ok: false, error: "not_draft" });
  });

  it("проведення → status=posted + рух ДДС прихід (direction=0)", async () => {
    mockPrisma.bankPaymentIncoming.findUnique.mockResolvedValueOnce({
      id: "doc1",
      status: "draft",
      currency: "UAH",
      amount: 430,
      amountEur: 10,
      bankAccountId: "bank1",
      cashFlowArticleId: "art1",
      customerId: null, // без клієнта → без руху боргу
      paidAt: new Date("2026-07-01"),
    });
    mockPrisma.mgrBankAccount.findUnique.mockResolvedValueOnce({
      code1C: "bankhex",
    });
    mockPrisma.mgrCashFlowArticle.findUnique.mockResolvedValueOnce({
      code1C: "arthex",
    });

    const r = await postBankPaymentIncoming("doc1");
    expect(r).toEqual({ ok: true });

    expect(tx.bankPaymentIncoming.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc1" },
        data: expect.objectContaining({ status: "posted" }),
      }),
    );
    const createArg = tx.cashFlowMovement.createMany.mock.calls[0]?.[0];
    expect(createArg.skipDuplicates).toBe(true);
    expect(createArg.data).toEqual([
      expect.objectContaining({
        recorderCode1C: "local:doc1",
        lineNo: 1,
        direction: 0,
        accountCode1C: "bankhex",
        articleCode1C: "arthex",
        clientCode1C: null,
        amountUah: 430,
        amountUpr: 10,
        currencyCode: "UAH",
      }),
    ]);
  });
});

// ─── postBankPaymentOutgoing (mocked) ────────────────────────────────────────

describe("postBankPaymentOutgoing", () => {
  it("проведення → рух ДДС розхід (direction=1)", async () => {
    mockPrisma.bankPaymentOutgoing.findUnique.mockResolvedValueOnce({
      id: "out1",
      status: "draft",
      currency: "EUR",
      amount: 50,
      amountEur: 50,
      bankAccountId: null,
      cashFlowArticleId: null,
      customerId: null,
      paidAt: new Date("2026-07-02"),
    });

    const r = await postBankPaymentOutgoing("out1");
    expect(r).toEqual({ ok: true });
    const createArg = tx.cashFlowMovement.createMany.mock.calls[0]?.[0];
    expect(createArg.data[0]).toEqual(
      expect.objectContaining({
        recorderCode1C: "local:out1",
        direction: 1,
        currencyCode: "EUR",
        amountUah: 50,
        amountUpr: 50,
        accountCode1C: null,
      }),
    );
  });
});

// ─── postCashTransfer (mocked) ───────────────────────────────────────────────

describe("postCashTransfer", () => {
  it("проведення → 2 рухи ДДС (розхід каса + прихід банк)", async () => {
    mockPrisma.cashTransfer.findUnique.mockResolvedValueOnce({
      id: "tr1",
      status: "draft",
      currency: "UAH",
      amount: 1000,
      amountEur: 25,
      fromAccountId: null, // готівкова каса
      toAccountId: "bank1",
      cashFlowArticleId: null,
      transferredAt: new Date("2026-07-03"),
    });
    mockPrisma.mgrBankAccount.findUnique.mockResolvedValueOnce({
      code1C: "bankhex",
    });

    const r = await postCashTransfer("tr1");
    expect(r).toEqual({ ok: true });
    const data = tx.cashFlowMovement.createMany.mock.calls[0]?.[0].data;
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual(
      expect.objectContaining({
        lineNo: 1,
        direction: 1,
        accountCode1C: CASH_DESK_CODE,
      }),
    );
    expect(data[1]).toEqual(
      expect.objectContaining({
        lineNo: 2,
        direction: 0,
        accountCode1C: "bankhex",
      }),
    );
  });
});

// ─── cancelBankPaymentIncoming (mocked) ──────────────────────────────────────

describe("cancelBankPaymentIncoming", () => {
  it("не проведено → not_posted", async () => {
    mockPrisma.bankPaymentIncoming.findUnique.mockResolvedValueOnce({
      id: "x",
      status: "draft",
    });
    const r = await cancelBankPaymentIncoming("x");
    expect(r).toEqual({ ok: false, error: "not_posted" });
  });

  it("скасування → status=cancelled + прибирає ДДС і рух боргу", async () => {
    mockPrisma.bankPaymentIncoming.findUnique.mockResolvedValueOnce({
      id: "doc1",
      status: "posted",
      customerId: null, // без клієнта → recompute не викликається
    });
    mockPrisma.mgrDebtMovement.findMany.mockResolvedValueOnce([]);

    const r = await cancelBankPaymentIncoming("doc1");
    expect(r).toEqual({ ok: true });
    expect(tx.bankPaymentIncoming.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "cancelled", postedAt: null },
      }),
    );
    expect(tx.cashFlowMovement.deleteMany).toHaveBeenCalledWith({
      where: { recorderCode1C: "local:doc1" },
    });
    expect(tx.mgrDebtMovement.deleteMany).toHaveBeenCalledWith({
      where: { sourceType: "bank_payment_incoming", sourceId: "doc1" },
    });
  });
});
