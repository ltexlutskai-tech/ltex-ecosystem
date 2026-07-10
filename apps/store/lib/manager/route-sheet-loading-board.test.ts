import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  routeSheet: { findUnique: vi.fn() },
  routeSheetItem: { findMany: vi.fn() },
  routeSheetOrder: { findMany: vi.fn() },
  routeSheetLoading: { findMany: vi.fn() },
  routeSheetSaleItem: { findMany: vi.fn() },
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

const freeLot = (over = {}) => ({
  productId: "p1",
  status: "free",
  reservedByUserId: null,
  reservedUntil: null,
  ...over,
});

describe("computeLoadingBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // getRouteSheetAllowedAgents: без агентів рейсу.
    mockDb.routeSheet.findUnique.mockResolvedValue({
      expeditorUserId: null,
      createdByUserId: null,
    });
    mockDb.routeSheetOrder.findMany.mockResolvedValue([
      { orderId: "o1", customerId: "c1", city: "Луцьк" },
    ]);
    // order.findMany обслуговує і allowed-agents (assignedAgentUserId), і резолв
    // імен (id/code1C) — даємо повний об'єкт.
    mockDb.order.findMany.mockResolvedValue([
      { id: "o1", code1C: "ORD-1", assignedAgentUserId: null },
    ]);
    mockDb.customer.findMany.mockResolvedValue([
      { id: "c1", name: "Клієнт А", city: "Луцьк" },
    ]);
    mockDb.product.findMany.mockResolvedValue([
      { id: "p1", name: "Куртки", articleCode: "ART-1" },
    ]);
  });

  it("групує по замовленню, рахує вільний залишок (мінус завантажене), продано і колір", async () => {
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
    // 1 лот уже завантажений на цей МЛ.
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([
      { productId: "p1", lotId: "l1" },
    ]);
    // Продано 1 по цьому замовленню+товару.
    mockDb.routeSheetSaleItem.findMany.mockResolvedValueOnce([
      { orderId: "o1", productId: "p1", quantity: 1 },
    ]);
    // 4 вільні лоти → полиця = 4 − 1(завантажений) = 3.
    mockDb.lot.findMany.mockResolvedValueOnce([
      freeLot(),
      freeLot(),
      freeLot(),
      freeLot(),
    ]);

    const board = await computeLoadingBoard("rs1");
    expect(board).toHaveLength(1);
    const g = board[0]!;
    expect(g.orderNumber).toBe("ORD-1");
    expect(g.customerName).toBe("Клієнт А");
    expect(g.orderedQty).toBe(2);
    expect(g.loadedQty).toBe(1);
    expect(g.soldQty).toBe(1);
    const row = g.rows[0]!;
    expect(row.ordered).toBe(2);
    expect(row.loaded).toBe(1);
    expect(row.remaining).toBe(1);
    expect(row.freeStock).toBe(3); // 4 вільних − 1 завантажений
    expect(row.booked).toBe(0);
    expect(row.sold).toBe(1);
    expect(row.color).toBe("yellow");
  });

  it("бронь від стороннього менеджера йде в «booked», не у вільний залишок; колір red", async () => {
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
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
    mockDb.routeSheetSaleItem.findMany.mockResolvedValueOnce([]);
    // Єдиний лот заброньований стороннім → booked=1, free=0.
    const { isActiveReservation } = await import("@/lib/manager/lot-booking");
    (
      isActiveReservation as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue(true);
    mockDb.lot.findMany.mockResolvedValueOnce([
      freeLot({ reservedByUserId: "stranger" }),
    ]);

    const board = await computeLoadingBoard("rs1");
    const row = board[0]!.rows[0]!;
    expect(row.freeStock).toBe(0);
    expect(row.booked).toBe(1);
    expect(row.color).toBe("red");
    (
      isActiveReservation as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue(false);
  });

  it("порожньо коли немає позицій", async () => {
    mockDb.routeSheetItem.findMany.mockResolvedValueOnce([]);
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
    mockDb.routeSheetSaleItem.findMany.mockResolvedValueOnce([]);
    const board = await computeLoadingBoard("rs1");
    expect(board).toEqual([]);
  });
});
