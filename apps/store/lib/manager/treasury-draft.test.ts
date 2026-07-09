import { describe, it, expect, vi, beforeEach } from "vitest";

// Грошова безпека: чернеткові шляхи казначейських документів пишуть лише
// status="draft" і НЕ створюють жодних рухів ДДС/боргу.

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    bankPaymentIncoming: { create: vi.fn(), update: vi.fn() },
    bankPaymentOutgoing: { create: vi.fn(), update: vi.fn() },
    cashTransfer: { create: vi.fn(), update: vi.fn() },
    cashFlowMovement: { createMany: vi.fn(), deleteMany: vi.fn() },
    mgrDebtMovement: { findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import {
  createBankPaymentIncomingDraft,
  updateBankPaymentIncomingDraft,
  createBankPaymentOutgoingDraft,
  createCashTransferDraft,
  updateCashTransferDraft,
} from "./treasury-posting";

const draft = {
  draft: true as const,
  amount: 4300,
  currency: "UAH" as const,
  rateEur: 43,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of [
    mockPrisma.bankPaymentIncoming,
    mockPrisma.bankPaymentOutgoing,
    mockPrisma.cashTransfer,
  ]) {
    m.create.mockResolvedValue({ id: "doc-1", status: "draft" });
    m.update.mockResolvedValue({ id: "doc-1", status: "draft" });
  }
});

function expectNoMovements() {
  expect(mockPrisma.cashFlowMovement.createMany).not.toHaveBeenCalled();
  expect(mockPrisma.mgrDebtMovement.deleteMany).not.toHaveBeenCalled();
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
}

describe("Bank payment draft — грошова безпека", () => {
  it("createBankPaymentIncomingDraft пише status='draft', amountEur зведено, БЕЗ рухів", async () => {
    const res = await createBankPaymentIncomingDraft(draft, "u1");
    expect(res.id).toBe("doc-1");
    const data = mockPrisma.bankPaymentIncoming.create.mock.calls[0]![0].data;
    expect(data.status).toBe("draft");
    expect(data.amountEur).toBe(100); // 4300/43
    expect(data.createdByUserId).toBe("u1");
    expectNoMovements();
  });

  it("updateBankPaymentIncomingDraft оновлює без рухів", async () => {
    await updateBankPaymentIncomingDraft("doc-1", draft);
    expect(mockPrisma.bankPaymentIncoming.update).toHaveBeenCalledTimes(1);
    expectNoMovements();
  });

  it("createBankPaymentOutgoingDraft пише status='draft' без рухів", async () => {
    await createBankPaymentOutgoingDraft(draft, "u1");
    const data = mockPrisma.bankPaymentOutgoing.create.mock.calls[0]![0].data;
    expect(data.status).toBe("draft");
    expectNoMovements();
  });
});

describe("Cash transfer draft — грошова безпека", () => {
  it("createCashTransferDraft пише status='draft' без рухів ДДС", async () => {
    await createCashTransferDraft(
      { draft: true, amount: 1000, currency: "UAH", rateEur: 40 },
      "u1",
    );
    const data = mockPrisma.cashTransfer.create.mock.calls[0]![0].data;
    expect(data.status).toBe("draft");
    expect(data.amountEur).toBe(25); // 1000/40
    expectNoMovements();
  });

  it("updateCashTransferDraft оновлює без рухів", async () => {
    await updateCashTransferDraft("doc-1", {
      draft: true,
      amount: 1000,
      currency: "EUR",
      rateEur: 40,
    });
    const data = mockPrisma.cashTransfer.update.mock.calls[0]![0].data;
    expect(data.amountEur).toBe(1000); // EUR → as-is
    expectNoMovements();
  });
});
