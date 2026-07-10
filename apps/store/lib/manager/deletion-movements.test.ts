import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  sale: { findUnique: vi.fn() },
  mgrCashOrder: { findUnique: vi.fn(), findMany: vi.fn() },
  routeSheet: { findUnique: vi.fn() },
  mgrDebtMovement: { findMany: vi.fn(), deleteMany: vi.fn() },
  transitMovement: { deleteMany: vi.fn() },
}));
vi.mock("@ltex/db", () => ({ prisma: mockDb }));

const recomputeSpy = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const applyDebtSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/manager/debt-register", () => ({
  recomputeDebtForClients: recomputeSpy,
  applyDebtMovementSafe: applyDebtSpy,
}));

const removeSaleSpy = vi.hoisted(() => vi.fn());
const applySaleSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/manager/sale-movement-hooks", () => ({
  removeSaleMovements: removeSaleSpy,
  applySaleMovements: applySaleSpy,
}));

const deleteCashflowSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
const applyCashflowSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/manager/cashflow-register", () => ({
  deleteCashFlowMovementsForOrder: deleteCashflowSpy,
  applyCashFlowMovementsSafe: applyCashflowSpy,
}));

const dispatchTransitSpy = vi.hoisted(() => vi.fn());
const completeTransitSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/manager/route-sheet-transit", () => ({
  applyDispatchTransitSafe: dispatchTransitSpy,
  applyCompleteTransitSafe: completeTransitSpy,
}));

import { reverseDocMovements, reapplyDocMovements } from "./deletion-movements";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reverseDocMovements", () => {
  it("sale: deletes debt movements, removes sale movements, recomputes debt", async () => {
    mockDb.sale.findUnique.mockResolvedValue({ id: "s1", code1C: null });
    mockDb.mgrDebtMovement.findMany.mockResolvedValue([{ clientId: "c1" }]);
    mockDb.mgrDebtMovement.deleteMany.mockResolvedValue({ count: 1 });

    await reverseDocMovements("sale", "s1");

    expect(mockDb.mgrDebtMovement.deleteMany).toHaveBeenCalledWith({
      where: { sourceType: "sale", sourceId: "s1" },
    });
    expect(removeSaleSpy).toHaveBeenCalledWith("s1"); // recorder = code1C ?? id
    expect(recomputeSpy).toHaveBeenCalledWith(mockDb, ["c1"]);
  });

  it("sale: uses code1C as recorder when present", async () => {
    mockDb.sale.findUnique.mockResolvedValue({ id: "s1", code1C: "HEX9" });
    mockDb.mgrDebtMovement.findMany.mockResolvedValue([]);
    mockDb.mgrDebtMovement.deleteMany.mockResolvedValue({ count: 0 });

    await reverseDocMovements("sale", "s1");
    expect(removeSaleSpy).toHaveBeenCalledWith("HEX9");
  });

  it("cash_order: deletes debt + cashflow (incl. change orders), recomputes", async () => {
    mockDb.mgrDebtMovement.findMany.mockResolvedValue([{ clientId: "c2" }]);
    mockDb.mgrCashOrder.findMany.mockResolvedValue([{ id: "chg1" }]);
    mockDb.mgrDebtMovement.deleteMany.mockResolvedValue({ count: 1 });

    await reverseDocMovements("cash_order", "co1");

    expect(deleteCashflowSpy).toHaveBeenCalledWith(mockDb, ["co1", "chg1"]);
    expect(recomputeSpy).toHaveBeenCalledWith(mockDb, ["c2"]);
  });

  it("route_sheet: deletes transit movements", async () => {
    mockDb.transitMovement.deleteMany.mockResolvedValue({ count: 3 });
    await reverseDocMovements("route_sheet", "rs1");
    expect(mockDb.transitMovement.deleteMany).toHaveBeenCalledWith({
      where: { recorderCode1C: "rs1" },
    });
  });

  it("order / client: no-op (no live movements)", async () => {
    await reverseDocMovements("order", "o1");
    await reverseDocMovements("client", "cl1");
    expect(removeSaleSpy).not.toHaveBeenCalled();
    expect(deleteCashflowSpy).not.toHaveBeenCalled();
  });
});

describe("reapplyDocMovements", () => {
  it("sale posted: re-applies sale movements + debt", async () => {
    mockDb.sale.findUnique.mockResolvedValue({
      id: "s1",
      status: "posted",
      archived: true,
      customerId: "cust1",
      totalEur: 120,
      createdAt: new Date("2026-01-01"),
    });

    await reapplyDocMovements("sale", "s1");
    expect(applySaleSpy).toHaveBeenCalledWith("s1");
    expect(applyDebtSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "sale",
        sourceId: "s1",
        amountEur: 120,
        kind: "sale",
      }),
    );
  });

  it("sale draft: re-applies movements but no debt", async () => {
    mockDb.sale.findUnique.mockResolvedValue({
      id: "s2",
      status: "draft",
      archived: false,
      customerId: "cust1",
      totalEur: 0,
      createdAt: new Date("2026-01-01"),
    });

    await reapplyDocMovements("sale", "s2");
    expect(applySaleSpy).toHaveBeenCalledWith("s2");
    expect(applyDebtSpy).not.toHaveBeenCalled();
  });

  it("route_sheet completed: re-applies dispatch + complete transit", async () => {
    mockDb.routeSheet.findUnique.mockResolvedValue({ status: "completed" });
    await reapplyDocMovements("route_sheet", "rs1");
    expect(dispatchTransitSpy).toHaveBeenCalledWith("rs1");
    expect(completeTransitSpy).toHaveBeenCalledWith("rs1");
  });
});
