import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  routeSheetItem: { findMany: vi.fn() },
  routeSheetOrder: { findMany: vi.fn() },
  routeSheetLoading: { findMany: vi.fn() },
  lot: { findMany: vi.fn() },
  order: { findMany: vi.fn() },
  customer: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
}));
vi.mock("@ltex/db", () => ({ prisma: mockDb, Prisma: {} }));

vi.mock("@/lib/manager/lot-booking", () => ({
  isActiveReservation: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/manager/order-pricing", () => ({ unitPriceForType: () => 5 }));

import { loadingRowColor, computeLoadingBoard } from "./route-sheet-loading";

describe("loadingRowColor", () => {
  it("green коли завантажено повністю", () => {
    expect(loadingRowColor({ ordered: 2, loaded: 2, stock: 3 })).toBe("green");
    expect(loadingRowColor({ ordered: 2, loaded: 3, stock: 0 })).toBe("green");
  });
  it("red коли треба вантажити, а залишку немає", () => {
    expect(loadingRowColor({ ordered: 2, loaded: 0, stock: 0 })).toBe("red");
    expect(loadingRowColor({ ordered: 2, loaded: 1, stock: 0 })).toBe("red");
  });
  it("yellow коли частково завантажено і залишок є", () => {
    expect(loadingRowColor({ ordered: 2, loaded: 1, stock: 5 })).toBe("yellow");
  });
  it("none коли не почато, товар на складі є", () => {
    expect(loadingRowColor({ ordered: 2, loaded: 0, stock: 5 })).toBe("none");
  });
  it("none коли нічого не замовлено", () => {
    expect(loadingRowColor({ ordered: 0, loaded: 0, stock: 5 })).toBe("none");
  });
});

describe("computeLoadingBoard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("групує по замовленню, рахує залишок складу (мінус завантажене) і колір", async () => {
    mockDb.routeSheetItem.findMany.mockResolvedValueOnce([
      {
        id: "it1",
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        unit: "кг",
        quantity: 2,
        price: 100,
        sum: 200,
        quantityLoaded: 1,
      },
    ]);
    mockDb.routeSheetOrder.findMany.mockResolvedValueOnce([
      { orderId: "o1", customerId: "c1", city: "Луцьк" },
    ]);
    // 1 лот цього товару вже завантажений на цей МЛ.
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([
      { productId: "p1", lotId: "l1" },
    ]);
    // 4 вільних лоти товару на складі → полиця = 4 − 1(завантажений) = 3.
    mockDb.lot.findMany.mockResolvedValueOnce([
      {
        productId: "p1",
        status: "free",
        reservedByUserId: null,
        reservedUntil: null,
      },
      {
        productId: "p1",
        status: "free",
        reservedByUserId: null,
        reservedUntil: null,
      },
      {
        productId: "p1",
        status: "free",
        reservedByUserId: null,
        reservedUntil: null,
      },
      {
        productId: "p1",
        status: "free",
        reservedByUserId: null,
        reservedUntil: null,
      },
    ]);
    mockDb.order.findMany.mockResolvedValueOnce([
      { id: "o1", code1C: "ORD-1" },
    ]);
    mockDb.customer.findMany.mockResolvedValueOnce([
      { id: "c1", name: "Клієнт А", city: "Луцьк" },
    ]);
    mockDb.product.findMany.mockResolvedValueOnce([
      { id: "p1", name: "Куртки", articleCode: "ART-1" },
    ]);

    const board = await computeLoadingBoard("rs1");
    expect(board).toHaveLength(1);
    const g = board[0]!;
    expect(g.orderNumber).toBe("ORD-1");
    expect(g.customerName).toBe("Клієнт А");
    expect(g.city).toBe("Луцьк");
    expect(g.orderedQty).toBe(2);
    expect(g.loadedQty).toBe(1);
    const row = g.rows[0]!;
    expect(row.ordered).toBe(2);
    expect(row.loaded).toBe(1);
    expect(row.remaining).toBe(1);
    expect(row.stock).toBe(3); // 4 вільних − 1 завантажений
    expect(row.color).toBe("yellow"); // частково, залишок є
  });

  it("red коли вільного залишку немає", async () => {
    mockDb.routeSheetItem.findMany.mockResolvedValueOnce([
      {
        id: "it1",
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        unit: "кг",
        quantity: 1,
        price: 100,
        sum: 100,
        quantityLoaded: 0,
      },
    ]);
    mockDb.routeSheetOrder.findMany.mockResolvedValueOnce([
      { orderId: "o1", customerId: "c1", city: null },
    ]);
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
    mockDb.lot.findMany.mockResolvedValueOnce([]); // нема вільних лотів
    mockDb.order.findMany.mockResolvedValueOnce([
      { id: "o1", code1C: "ORD-1" },
    ]);
    mockDb.customer.findMany.mockResolvedValueOnce([
      { id: "c1", name: "Клієнт А", city: null },
    ]);
    mockDb.product.findMany.mockResolvedValueOnce([
      { id: "p1", name: "Куртки", articleCode: "ART-1" },
    ]);

    const board = await computeLoadingBoard("rs1");
    expect(board[0]!.rows[0]!.stock).toBe(0);
    expect(board[0]!.rows[0]!.color).toBe("red");
  });

  it("порожньо коли немає позицій", async () => {
    mockDb.routeSheetItem.findMany.mockResolvedValueOnce([]);
    mockDb.routeSheetOrder.findMany.mockResolvedValueOnce([]);
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
    const board = await computeLoadingBoard("rs1");
    expect(board).toEqual([]);
  });
});
