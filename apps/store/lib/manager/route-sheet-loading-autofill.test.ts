import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  routeSheet: { findUnique: vi.fn() },
  routeSheetOrder: { findMany: vi.fn() },
  routeSheetItem: { findMany: vi.fn(), update: vi.fn() },
  routeSheetLoading: { findMany: vi.fn(), createMany: vi.fn() },
  lot: { findMany: vi.fn() },
  order: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@ltex/db", () => ({ prisma: mockDb, Prisma: {} }));

const isActiveReservationSpy = vi.hoisted(() => vi.fn().mockReturnValue(false));
vi.mock("@/lib/manager/lot-booking", () => ({
  isActiveReservation: isActiveReservationSpy,
}));

vi.mock("@/lib/manager/order-pricing", () => ({
  unitPriceForType: () => 5,
}));

import { autoFillLoading } from "./route-sheet-loading";

const lot = (id: string, productId: string, over = {}) => ({
  id,
  productId,
  status: "free",
  barcode: `BC-${id}`,
  weight: 20,
  reservedByUserId: null,
  reservedUntil: null,
  product: { prices: [{ priceType: "wholesale", amount: 5, currency: "EUR" }] },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  isActiveReservationSpy.mockReturnValue(false);
  // getRouteSheetAllowedAgents — без агентів рейсу.
  mockDb.routeSheet.findUnique.mockResolvedValue({
    expeditorUserId: null,
    createdByUserId: null,
  });
  mockDb.routeSheetOrder.findMany.mockResolvedValue([]);
  mockDb.order.findMany.mockResolvedValue([]);
  // $transaction runs the callback with a tx whose recompute reads are empty.
  mockDb.$transaction.mockImplementation(
    async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      mockDb.routeSheetItem.findMany.mockResolvedValueOnce([]); // recompute reads
      mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
      return cb(mockDb);
    },
  );
  mockDb.routeSheetLoading.createMany.mockResolvedValue({ count: 0 });
});

describe("autoFillLoading", () => {
  it("assigns up to (ordered − loaded) free lots per position", async () => {
    mockDb.routeSheetItem.findMany.mockResolvedValueOnce([
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        quantity: 2,
        quantityLoaded: 0,
      },
    ]);
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]); // none loaded yet
    mockDb.lot.findMany.mockResolvedValueOnce([
      lot("l1", "p1"),
      lot("l2", "p1"),
      lot("l3", "p1"),
    ]);

    const res = await autoFillLoading("rs1", "u1");
    expect(res.added).toBe(2); // capped at need=2
    const createArg = mockDb.routeSheetLoading.createMany.mock
      .calls[0]?.[0] as {
      data: Array<{ lotId: string; weight: number; pricePerKg: number }>;
    };
    expect(createArg.data.map((r) => r.lotId)).toEqual(["l1", "l2"]);
    expect(createArg.data[0]?.weight).toBe(20);
    expect(createArg.data[0]?.pricePerKg).toBe(5);
  });

  it("skips lots already loaded on the sheet", async () => {
    mockDb.routeSheetItem.findMany.mockResolvedValueOnce([
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        quantity: 2,
        quantityLoaded: 0,
      },
    ]);
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([{ lotId: "l1" }]);
    mockDb.lot.findMany.mockResolvedValueOnce([
      lot("l1", "p1"),
      lot("l2", "p1"),
    ]);

    const res = await autoFillLoading("rs1", "u1");
    expect(res.added).toBe(1); // l1 skipped (already loaded), only l2
    const createArg = mockDb.routeSheetLoading.createMany.mock
      .calls[0]?.[0] as {
      data: Array<{ lotId: string }>;
    };
    expect(createArg.data.map((r) => r.lotId)).toEqual(["l2"]);
  });

  it("skips lots under a foreign active reservation", async () => {
    mockDb.routeSheetItem.findMany.mockResolvedValueOnce([
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        quantity: 1,
        quantityLoaded: 0,
      },
    ]);
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
    mockDb.lot.findMany.mockResolvedValueOnce([
      lot("l1", "p1", { reservedByUserId: "other" }),
      lot("l2", "p1"),
    ]);
    // l1 → active foreign reservation, l2 → free.
    isActiveReservationSpy.mockImplementation(
      (l: { id: string }) => l.id === "l1",
    );

    const res = await autoFillLoading("rs1", "u1");
    expect(res.added).toBe(1);
    const createArg = mockDb.routeSheetLoading.createMany.mock
      .calls[0]?.[0] as {
      data: Array<{ lotId: string }>;
    };
    expect(createArg.data.map((r) => r.lotId)).toEqual(["l2"]);
  });

  it("does not assign the same lot to two positions", async () => {
    mockDb.routeSheetItem.findMany.mockResolvedValueOnce([
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        quantity: 1,
        quantityLoaded: 0,
      },
      {
        orderId: "o2",
        customerId: "c2",
        productId: "p1",
        quantity: 1,
        quantityLoaded: 0,
      },
    ]);
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
    mockDb.lot.findMany.mockResolvedValueOnce([
      lot("l1", "p1"),
      lot("l2", "p1"),
    ]);

    const res = await autoFillLoading("rs1", "u1");
    expect(res.added).toBe(2);
    const createArg = mockDb.routeSheetLoading.createMany.mock
      .calls[0]?.[0] as {
      data: Array<{ lotId: string; orderId: string }>;
    };
    // o1 → l1, o2 → l2 (pool consumed, no double-assign).
    expect(createArg.data.map((r) => r.lotId).sort()).toEqual(["l1", "l2"]);
  });

  it("returns added=0 when nothing ordered", async () => {
    mockDb.routeSheetItem.findMany.mockResolvedValueOnce([]);
    const res = await autoFillLoading("rs1", "u1");
    expect(res.added).toBe(0);
    expect(mockDb.routeSheetLoading.createMany).not.toHaveBeenCalled();
  });
});
