import { describe, it, expect } from "vitest";
import {
  allocateShortage,
  computeCounters,
  computeLoadedQuantities,
  loadedGroupKey,
  type LoadingMatchRow,
  type ShortageOrderedRow,
} from "./route-sheet-loading";

describe("loadedGroupKey", () => {
  it("builds (orderId|productId) key — лот не входить", () => {
    expect(loadedGroupKey({ orderId: "o1", productId: "p1" })).toBe("o1|p1");
    expect(loadedGroupKey({ orderId: null, productId: "p1" })).toBe("|p1");
  });
});

describe("computeLoadedQuantities", () => {
  it("сумує різні лоти одного товару під одну позицію (o1|p1)", () => {
    const rows: LoadingMatchRow[] = [
      {
        orderId: "o1",
        productId: "p1",
        lotId: "l1",
        quantity: 1,
        loaded: true,
        isReturn: false,
      },
      {
        orderId: "o1",
        productId: "p1",
        lotId: "l2",
        quantity: 1,
        loaded: true,
        isReturn: false,
      },
    ];
    const map = computeLoadedQuantities(rows);
    // Різні лоти того самого товару → один ключ, сума = 2 (це і був баг).
    expect(map.get("o1|p1")).toBe(2);
  });

  it("aggregates rows sharing the same key", () => {
    const rows: LoadingMatchRow[] = [
      {
        orderId: "o1",
        productId: "p1",
        lotId: null,
        quantity: 2,
        loaded: true,
        isReturn: false,
      },
      {
        orderId: "o1",
        productId: "p1",
        lotId: null,
        quantity: 3,
        loaded: true,
        isReturn: false,
      },
    ];
    expect(computeLoadedQuantities(rows).get("o1|p1")).toBe(5);
  });

  it("excludes rows that are not loaded or are returns", () => {
    const rows: LoadingMatchRow[] = [
      {
        orderId: "o1",
        productId: "p1",
        lotId: "l1",
        quantity: 1,
        loaded: false,
        isReturn: false,
      },
      {
        orderId: "o1",
        productId: "p1",
        lotId: "l2",
        quantity: 1,
        loaded: true,
        isReturn: true,
      },
    ];
    const map = computeLoadedQuantities(rows);
    expect(map.size).toBe(0);
  });
});

describe("allocateShortage", () => {
  it("shortage = ordered − available, per order", () => {
    const ordered: ShortageOrderedRow[] = [
      { orderId: "o1", productId: "p1", quantity: 3 },
    ];
    const available = new Map([["p1", 1]]);
    const out = allocateShortage(ordered, available);
    expect(out).toEqual([{ orderId: "o1", productId: "p1", shortage: 2 }]);
  });

  it("returns nothing when available >= ordered", () => {
    const ordered: ShortageOrderedRow[] = [
      { orderId: "o1", productId: "p1", quantity: 2 },
    ];
    expect(allocateShortage(ordered, new Map([["p1", 5]]))).toEqual([]);
  });

  it("allocates shared stock across multiple orders in order", () => {
    const ordered: ShortageOrderedRow[] = [
      { orderId: "o1", productId: "p1", quantity: 2 },
      { orderId: "o2", productId: "p1", quantity: 2 },
    ];
    // Only 3 free lots: o1 gets 2, o2 gets 1 → o2 short by 1.
    const out = allocateShortage(ordered, new Map([["p1", 3]]));
    expect(out).toEqual([{ orderId: "o2", productId: "p1", shortage: 1 }]);
  });

  it("treats missing product availability as zero", () => {
    const ordered: ShortageOrderedRow[] = [
      { orderId: "o1", productId: "pX", quantity: 4 },
    ];
    const out = allocateShortage(ordered, new Map());
    expect(out).toEqual([{ orderId: "o1", productId: "pX", shortage: 4 }]);
  });
});

describe("computeCounters", () => {
  it("computes ordersCount / orderedQty / loadedQty / shortageQty", () => {
    const counters = computeCounters({
      ordersCount: 2,
      items: [
        { quantity: 3, quantityLoaded: 1 },
        { quantity: 2, quantityLoaded: 2 },
      ],
      shortage: [{ shortage: 2 }, { shortage: 1 }],
    });
    expect(counters).toEqual({
      ordersCount: 2,
      orderedQty: 5,
      loadedQty: 3,
      shortageQty: 3,
    });
  });

  it("zeroes when no data", () => {
    expect(
      computeCounters({ ordersCount: 0, items: [], shortage: [] }),
    ).toEqual({ ordersCount: 0, orderedQty: 0, loadedQty: 0, shortageQty: 0 });
  });
});
