import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dispatchRouteSheetLots,
  markRouteSheetOrdersInactive,
  returnRouteSheetLotsToStock,
  settleRouteSheetTransit,
} from "./route-sheet-actions";

function makeTx() {
  return {
    routeSheetLoading: { findMany: vi.fn() },
    routeSheetOrder: { findMany: vi.fn() },
    saleItem: { findMany: vi.fn() },
    lot: { updateMany: vi.fn() },
    order: { updateMany: vi.fn() },
  };
}

type Tx = Parameters<typeof dispatchRouteSheetLots>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dispatchRouteSheetLots", () => {
  it("clears reservation + sets loaded lots in_transit, excluding archived", async () => {
    const tx = makeTx();
    tx.routeSheetLoading.findMany.mockResolvedValue([
      { lotId: "l1" },
      { lotId: "l2" },
      { lotId: "l1" }, // duplicate → deduped
    ]);

    await dispatchRouteSheetLots(tx as unknown as Tx, "rs1");

    expect(tx.lot.updateMany).toHaveBeenCalledTimes(1);
    const arg = tx.lot.updateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] }; status: unknown };
      data: Record<string, unknown>;
    };
    expect(arg.where.id.in.sort()).toEqual(["l1", "l2"]);
    expect(arg.where.status).toEqual({ not: "archived" });
    expect(arg.data).toMatchObject({
      reservedForClientId: null,
      reservedUntil: null,
      status: "in_transit",
    });
  });

  it("is a no-op when no loaded lots", async () => {
    const tx = makeTx();
    tx.routeSheetLoading.findMany.mockResolvedValue([]);
    await dispatchRouteSheetLots(tx as unknown as Tx, "rs1");
    expect(tx.lot.updateMany).not.toHaveBeenCalled();
  });
});

describe("settleRouteSheetTransit", () => {
  it("marks sold lots sold and the rest free", async () => {
    const tx = makeTx();
    tx.routeSheetLoading.findMany.mockResolvedValue([
      { lotId: "l1" },
      { lotId: "l2" },
      { lotId: "l3" },
    ]);
    // Лот l1 проданий у реалізації цього МЛ; l2/l3 — повернені.
    tx.saleItem.findMany.mockResolvedValue([{ lotId: "l1" }]);

    await settleRouteSheetTransit(tx as unknown as Tx, "rs1");

    expect(tx.lot.updateMany).toHaveBeenCalledTimes(2);
    const soldCall = tx.lot.updateMany.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === "sold",
    )?.[0] as { where: { id: { in: string[] } } };
    const freeCall = tx.lot.updateMany.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === "free",
    )?.[0] as { where: { id: { in: string[] } } };
    expect(soldCall.where.id.in).toEqual(["l1"]);
    expect(freeCall.where.id.in.sort()).toEqual(["l2", "l3"]);
  });

  it("all lots free when none sold", async () => {
    const tx = makeTx();
    tx.routeSheetLoading.findMany.mockResolvedValue([{ lotId: "l1" }]);
    tx.saleItem.findMany.mockResolvedValue([]);

    await settleRouteSheetTransit(tx as unknown as Tx, "rs1");

    const calls = tx.lot.updateMany.mock.calls.map(
      (c) => (c[0] as { data: { status: string } }).data.status,
    );
    expect(calls).toEqual(["free"]);
  });

  it("is a no-op when no loaded lots", async () => {
    const tx = makeTx();
    tx.routeSheetLoading.findMany.mockResolvedValue([]);
    await settleRouteSheetTransit(tx as unknown as Tx, "rs1");
    expect(tx.lot.updateMany).not.toHaveBeenCalled();
  });
});

describe("returnRouteSheetLotsToStock", () => {
  it("returns in_transit lots to free", async () => {
    const tx = makeTx();
    tx.routeSheetLoading.findMany.mockResolvedValue([{ lotId: "l1" }]);

    await returnRouteSheetLotsToStock(tx as unknown as Tx, "rs1");

    const arg = tx.lot.updateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] }; status: string };
      data: Record<string, unknown>;
    };
    expect(arg.where.status).toBe("in_transit");
    expect(arg.data).toEqual({ status: "free" });
  });
});

describe("markRouteSheetOrdersInactive", () => {
  it("sets isActual=false for the sheet's orders", async () => {
    const tx = makeTx();
    tx.routeSheetOrder.findMany.mockResolvedValue([
      { orderId: "o1" },
      { orderId: "o2" },
    ]);

    await markRouteSheetOrdersInactive(tx as unknown as Tx, "rs1");

    expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
    const arg = tx.order.updateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
      data: Record<string, unknown>;
    };
    expect(arg.where.id.in.sort()).toEqual(["o1", "o2"]);
    expect(arg.data).toEqual({ isActual: false });
  });

  it("is a no-op when the sheet has no orders", async () => {
    const tx = makeTx();
    tx.routeSheetOrder.findMany.mockResolvedValue([]);
    await markRouteSheetOrdersInactive(tx as unknown as Tx, "rs1");
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });
});
