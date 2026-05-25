import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    sale: { findMany: vi.fn() },
    mgrCashOrder: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    lot: { findMany: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { getRouteSheetDocuments } from "./route-sheet-documents";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.sale.findMany.mockResolvedValue([]);
  mockPrisma.mgrCashOrder.findMany.mockResolvedValue([]);
  mockPrisma.product.findMany.mockResolvedValue([]);
  mockPrisma.lot.findMany.mockResolvedValue([]);
});

describe("getRouteSheetDocuments", () => {
  it("queries sales/payments scoped by routeSheetId back-link", async () => {
    await getRouteSheetDocuments("rs1");
    const saleArgs = mockPrisma.sale.findMany.mock.calls[0]?.[0] as {
      where: { routeSheetId: string };
    };
    const payArgs = mockPrisma.mgrCashOrder.findMany.mock.calls[0]?.[0] as {
      where: { routeSheetId: string };
    };
    expect(saleArgs.where.routeSheetId).toBe("rs1");
    expect(payArgs.where.routeSheetId).toBe("rs1");
  });

  it("derives sales + saleItems with resolved product/lot names", async () => {
    mockPrisma.sale.findMany.mockResolvedValueOnce([
      {
        id: "s1",
        docNumber: 5,
        code1C: null,
        status: "draft",
        orderId: "o1",
        totalEur: 100,
        totalUah: 4300,
        customer: { id: "c1", name: "Клієнт А" },
        items: [
          {
            id: "si1",
            productId: "p1",
            lotId: "l1",
            barcode: null,
            quantity: 1,
            weight: 20,
            pricePerKg: 5,
            priceEur: 100,
          },
        ],
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValueOnce([
      { id: "p1", name: "Куртки", articleCode: "ART-1" },
    ]);
    mockPrisma.lot.findMany.mockResolvedValueOnce([
      { id: "l1", barcode: "BC-1" },
    ]);

    const result = await getRouteSheetDocuments("rs1");

    expect(result.sales).toHaveLength(1);
    expect(result.sales[0]?.customerName).toBe("Клієнт А");
    expect(result.sales[0]?.orderId).toBe("o1");
    expect(result.sales[0]?.totalUah).toBe(4300);

    expect(result.saleItems).toHaveLength(1);
    expect(result.saleItems[0]?.productName).toBe("Куртки");
    expect(result.saleItems[0]?.articleCode).toBe("ART-1");
    expect(result.saleItems[0]?.barcode).toBe("BC-1");
    expect(result.saleItems[0]?.saleNumber).toBe(5);
  });

  it("derives payments resolving customer via direct FK or sale", async () => {
    mockPrisma.mgrCashOrder.findMany.mockResolvedValueOnce([
      {
        id: "co1",
        docNumber: 7,
        type: "income",
        saleId: "s1",
        documentSumEur: 100,
        customer: null,
        sale: { customer: { id: "c1", name: "Клієнт Б" } },
      },
      {
        id: "co2",
        docNumber: 8,
        type: "expense",
        saleId: null,
        documentSumEur: 3,
        customer: { id: "c2", name: "Клієнт В" },
        sale: null,
      },
    ]);

    const result = await getRouteSheetDocuments("rs1");
    expect(result.payments).toHaveLength(2);
    expect(result.payments[0]?.customerName).toBe("Клієнт Б");
    expect(result.payments[0]?.type).toBe("income");
    expect(result.payments[1]?.customerName).toBe("Клієнт В");
    expect(result.payments[1]?.type).toBe("expense");
  });

  it("falls back to item barcode when lot has none", async () => {
    mockPrisma.sale.findMany.mockResolvedValueOnce([
      {
        id: "s1",
        docNumber: 1,
        code1C: null,
        status: "draft",
        orderId: null,
        totalEur: 0,
        totalUah: 0,
        customer: { id: "c1", name: "К" },
        items: [
          {
            id: "si1",
            productId: "p1",
            lotId: null,
            barcode: "MANUAL-BC",
            quantity: 1,
            weight: 10,
            pricePerKg: 0,
            priceEur: 0,
          },
        ],
      },
    ]);
    mockPrisma.product.findMany.mockResolvedValueOnce([
      { id: "p1", name: "Товар", articleCode: null },
    ]);

    const result = await getRouteSheetDocuments("rs1");
    expect(result.saleItems[0]?.barcode).toBe("MANUAL-BC");
    expect(result.saleItems[0]?.lotId).toBeNull();
  });
});
