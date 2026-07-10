import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  routeSheet: { findUnique: vi.fn() },
  routeSheetOrder: { findMany: vi.fn(), findFirst: vi.fn() },
  routeSheetItem: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  routeSheetLoading: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  lot: { findMany: vi.fn(), findUnique: vi.fn() },
  order: { findMany: vi.fn(), findUnique: vi.fn() },
  customer: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@ltex/db", () => ({ prisma: mockDb, Prisma: {} }));

const isActiveReservationSpy = vi.hoisted(() => vi.fn().mockReturnValue(false));
vi.mock("@/lib/manager/lot-booking", () => ({
  isActiveReservation: isActiveReservationSpy,
}));
vi.mock("@/lib/manager/order-pricing", () => ({ unitPriceForType: () => 5 }));

import { addLoadingManual } from "./route-sheet-loading";

const freeLot = (id: string, over = {}) => ({
  id,
  productId: "p1",
  status: "free",
  barcode: `BC-${id}`,
  weight: 20,
  reservedByUserId: null,
  reservedUntil: null,
  product: {
    id: "p1",
    name: "Куртки",
    articleCode: "ART-1",
    priceUnit: "kg",
    prices: [{ priceType: "wholesale", amount: 5, currency: "EUR" }],
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  isActiveReservationSpy.mockReturnValue(false);
  // getRouteSheetAllowedAgents → без агентів.
  mockDb.routeSheet.findUnique.mockResolvedValue({
    expeditorUserId: null,
    createdByUserId: null,
  });
  mockDb.routeSheetOrder.findMany.mockResolvedValue([]);
  mockDb.order.findMany.mockResolvedValue([]);
  mockDb.routeSheetLoading.findFirst.mockResolvedValue(null); // no dup
  mockDb.order.findUnique.mockResolvedValue({ code1C: "ORD-1" });
  mockDb.customer.findUnique.mockResolvedValue({ name: "Клієнт А" });
  // $transaction: run cb; create returns row; recompute reads empty.
  mockDb.$transaction.mockImplementation(
    async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      mockDb.routeSheetItem.findMany.mockResolvedValueOnce([]);
      mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
      return cb(mockDb);
    },
  );
});

describe("addLoadingManual", () => {
  it("бере перший вільний лот товару і прив'язує до виділеного замовлення", async () => {
    // already loaded on sheet: none.
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
    mockDb.lot.findMany.mockResolvedValueOnce([freeLot("l1"), freeLot("l2")]);
    // targetOrder match → item of that order+product.
    mockDb.routeSheetItem.findFirst.mockResolvedValueOnce({
      orderId: "o1",
      customerId: "c1",
    });
    mockDb.routeSheetLoading.create.mockResolvedValueOnce({
      id: "ld1",
      orderId: "o1",
      customerId: "c1",
      productId: "p1",
      lotId: "l1",
      barcode: "BC-l1",
      unit: null,
      quantity: 1,
      weight: 20,
      price: 100,
      sum: 100,
      pricePerKg: 5,
      loaded: true,
      isReturn: false,
    });

    const { row } = await addLoadingManual("rs1", {
      productId: "p1",
      targetOrderId: "o1",
    });
    expect(row.lotId).toBe("l1");
    expect(row.orderId).toBe("o1");
    const createArg = mockDb.routeSheetLoading.create.mock.calls[0]?.[0] as {
      data: { lotId: string; orderId: string | null; weight: number };
    };
    expect(createArg.data.lotId).toBe("l1");
    expect(createArg.data.orderId).toBe("o1");
    expect(createArg.data.weight).toBe(20);
  });

  it("немає вільного мішка → 409", async () => {
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
    mockDb.lot.findMany.mockResolvedValueOnce([]); // no free lots
    await expect(
      addLoadingManual("rs1", { productId: "p1", targetOrderId: "o1" }),
    ).rejects.toThrow(/Немає вільного мішка/);
    expect(mockDb.routeSheetLoading.create).not.toHaveBeenCalled();
  });

  it("пропускає лот під чужою бронню (не агента рейсу)", async () => {
    isActiveReservationSpy.mockImplementation(
      (l: { id: string }) => l.id === "l1",
    );
    mockDb.routeSheetLoading.findMany.mockResolvedValueOnce([]);
    mockDb.lot.findMany.mockResolvedValueOnce([
      freeLot("l1", { reservedByUserId: "stranger" }),
      freeLot("l2"),
    ]);
    mockDb.routeSheetItem.findFirst.mockResolvedValueOnce({
      orderId: "o1",
      customerId: "c1",
    });
    mockDb.routeSheetLoading.create.mockResolvedValueOnce({
      id: "ld2",
      orderId: "o1",
      customerId: "c1",
      productId: "p1",
      lotId: "l2",
      barcode: "BC-l2",
      unit: null,
      quantity: 1,
      weight: 20,
      price: 100,
      sum: 100,
      pricePerKg: 5,
      loaded: true,
      isReturn: false,
    });

    const { row } = await addLoadingManual("rs1", {
      productId: "p1",
      targetOrderId: "o1",
    });
    expect(row.lotId).toBe("l2"); // l1 пропущено (чужа бронь)
  });
});
