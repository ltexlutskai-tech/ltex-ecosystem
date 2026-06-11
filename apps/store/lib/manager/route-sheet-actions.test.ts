import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  markRouteSheetOrdersInactive,
  releaseRouteSheetReservations,
} from "./route-sheet-actions";

function makeTx() {
  return {
    routeSheetLoading: { findMany: vi.fn() },
    routeSheetOrder: { findMany: vi.fn() },
    lot: { updateMany: vi.fn() },
    order: { updateMany: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("releaseRouteSheetReservations", () => {
  it("clears reservation + marks loaded lots sold, excluding archived", async () => {
    const tx = makeTx();
    tx.routeSheetLoading.findMany.mockResolvedValue([
      { lotId: "l1" },
      { lotId: "l2" },
      { lotId: "l1" }, // duplicate → deduped
    ]);

    await releaseRouteSheetReservations(
      tx as unknown as Parameters<typeof releaseRouteSheetReservations>[0],
      "rs1",
    );

    expect(tx.lot.updateMany).toHaveBeenCalledTimes(1);
    const arg = tx.lot.updateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] }; status: unknown };
      data: Record<string, unknown>;
    };
    expect(arg.where.id.in.sort()).toEqual(["l1", "l2"]);
    expect(arg.where.status).toEqual({ not: "archived" });
    expect(arg.data).toMatchObject({
      reservedForClientId: null,
      reservedForName: null,
      reservedByUserId: null,
      reservedByName: null,
      reservedUntil: null,
      status: "sold",
    });
  });

  it("is a no-op when no loaded lots", async () => {
    const tx = makeTx();
    tx.routeSheetLoading.findMany.mockResolvedValue([]);

    await releaseRouteSheetReservations(
      tx as unknown as Parameters<typeof releaseRouteSheetReservations>[0],
      "rs1",
    );

    expect(tx.lot.updateMany).not.toHaveBeenCalled();
  });
});

describe("markRouteSheetOrdersInactive", () => {
  it("sets isActual=false for the sheet's orders", async () => {
    const tx = makeTx();
    tx.routeSheetOrder.findMany.mockResolvedValue([
      { orderId: "o1" },
      { orderId: "o2" },
    ]);

    await markRouteSheetOrdersInactive(
      tx as unknown as Parameters<typeof markRouteSheetOrdersInactive>[0],
      "rs1",
    );

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

    await markRouteSheetOrdersInactive(
      tx as unknown as Parameters<typeof markRouteSheetOrdersInactive>[0],
      "rs1",
    );

    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });
});
