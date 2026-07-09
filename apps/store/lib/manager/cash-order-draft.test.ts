import { describe, it, expect, vi, beforeEach } from "vitest";

// Грошова безпека: перевіряємо, що чернеткові шляхи касового ордера НЕ
// проводять жодних рухів (борг/ДДС) і пишуть лише один рядок зі status="draft".

const {
  mockPrisma,
  applyDebtMovementSafeMock,
  applyCashFlowMovementsSafeMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    mgrCashOrder: { create: vi.fn(), update: vi.fn() },
  },
  applyDebtMovementSafeMock: vi.fn(),
  applyCashFlowMovementsSafeMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("./debt-register", () => ({
  applyDebtMovementSafe: applyDebtMovementSafeMock,
}));
vi.mock("./cashflow-register", () => ({
  applyCashFlowMovementsSafe: applyCashFlowMovementsSafeMock,
}));

import { createCashOrderDraft, updateCashOrderDraft } from "./cash-order";

const paid = { uah: 4300, eur: 0, usd: 0, uahCashless: 0 };
const rates = { eur: 43, usd: 40 };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.mgrCashOrder.create.mockResolvedValue({
    id: "co-draft-1",
    status: "draft",
  });
  mockPrisma.mgrCashOrder.update.mockResolvedValue({
    id: "co-draft-1",
    status: "draft",
  });
});

describe("createCashOrderDraft (грошова безпека)", () => {
  it("пише один рядок зі status='draft', archived=false", async () => {
    const res = await createCashOrderDraft({
      saleId: "sale-1",
      customerId: "cust-1",
      type: "income",
      paid,
      rates,
      agentUserId: "u1",
    });
    expect(res.id).toBe("co-draft-1");
    expect(mockPrisma.mgrCashOrder.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.mgrCashOrder.create.mock.calls[0]![0].data;
    expect(data.status).toBe("draft");
    expect(data.archived).toBe(false);
    // Зведена сума лише для показу у списку (не обліковий рух): 4300/43 = 100 €.
    expect(data.documentSumEur).toBe(100);
  });

  it("НЕ створює авто-ордер здачі (лише один create)", async () => {
    await createCashOrderDraft({ paid, rates });
    expect(mockPrisma.mgrCashOrder.create).toHaveBeenCalledTimes(1);
  });

  it("НЕ проводить рухів боргу/ДДС", async () => {
    await createCashOrderDraft({ saleId: "s1", paid, rates });
    expect(applyDebtMovementSafeMock).not.toHaveBeenCalled();
    expect(applyCashFlowMovementsSafeMock).not.toHaveBeenCalled();
  });
});

describe("updateCashOrderDraft (грошова безпека)", () => {
  it("оновлює лише шапку зі status='draft', БЕЗ рухів", async () => {
    await updateCashOrderDraft("co-draft-1", { paid, rates });
    expect(mockPrisma.mgrCashOrder.update).toHaveBeenCalledTimes(1);
    const args = mockPrisma.mgrCashOrder.update.mock.calls[0]![0];
    expect(args.where).toEqual({ id: "co-draft-1" });
    expect(args.data.status).toBe("draft");
    expect(applyDebtMovementSafeMock).not.toHaveBeenCalled();
    expect(applyCashFlowMovementsSafeMock).not.toHaveBeenCalled();
  });
});
