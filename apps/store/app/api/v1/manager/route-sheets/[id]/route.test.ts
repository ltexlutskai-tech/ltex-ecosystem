import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  loadingRowsMock,
  shortageMock,
  countersMock,
  documentsMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    routeSheet: { findUnique: vi.fn(), update: vi.fn() },
    order: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    lot: { findMany: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
  loadingRowsMock: vi.fn(),
  shortageMock: vi.fn(),
  countersMock: vi.fn(),
  documentsMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/route-sheet-loading", () => ({
  getRouteSheetLoadingRows: (...args: unknown[]) => loadingRowsMock(...args),
  computeRouteSheetShortage: (...args: unknown[]) => shortageMock(...args),
  computeRouteSheetCounters: (...args: unknown[]) => countersMock(...args),
}));
vi.mock("@/lib/manager/route-sheet-documents", () => ({
  getRouteSheetDocuments: (...args: unknown[]) => documentsMock(...args),
}));

import { GET, PATCH } from "./route";

const MANAGER = {
  id: "u1",
  email: "a@b.c",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

const params = Promise.resolve({ id: "rs1" });

function getReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/route-sheets/rs1");
}
function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/route-sheets/rs1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeSheet(over: Record<string, unknown> = {}) {
  return {
    id: "rs1",
    code1C: null,
    docNumber: 1,
    date: new Date("2026-05-20T10:00:00Z"),
    arrivalDate: null,
    status: "draft",
    routeId: null,
    expeditorUserId: null,
    comment: null,
    totalEur: 0,
    totalUah: 0,
    mileageStartKm: null,
    mileageEndKm: null,
    archived: false,
    route: null,
    expeditor: null,
    createdAt: new Date("2026-05-20T09:00:00Z"),
    updatedAt: new Date("2026-05-20T09:00:00Z"),
    orders: [],
    items: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  mockPrisma.order.findMany.mockResolvedValue([]);
  mockPrisma.customer.findMany.mockResolvedValue([]);
  mockPrisma.product.findMany.mockResolvedValue([]);
  mockPrisma.lot.findMany.mockResolvedValue([]);
  loadingRowsMock.mockResolvedValue([]);
  shortageMock.mockResolvedValue([]);
  countersMock.mockResolvedValue({
    ordersCount: 0,
    orderedQty: 0,
    loadedQty: 0,
    shortageQty: 0,
  });
  documentsMock.mockResolvedValue({ sales: [], saleItems: [], payments: [] });
});

describe("GET /api/v1/manager/route-sheets/[id]", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(401);
  });

  it("404 when not found", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
  });

  it("returns sheet with batch-resolved order/product names", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(
      fakeSheet({
        orders: [
          { id: "rso1", orderId: "o1", customerId: "c1", city: "Луцьк" },
        ],
        items: [
          {
            id: "rsi1",
            orderId: "o1",
            customerId: "c1",
            productId: "p1",
            lotId: null,
            unit: null,
            quantity: 2,
            price: 20,
            sum: 40,
            quantityLoaded: 0,
          },
        ],
      }),
    );
    mockPrisma.order.findMany.mockResolvedValueOnce([
      { id: "o1", code1C: "ORD-7" },
    ]);
    mockPrisma.customer.findMany.mockResolvedValueOnce([
      { id: "c1", name: "Клієнт А", city: "Луцьк", code1C: "000001" },
    ]);
    mockPrisma.product.findMany.mockResolvedValueOnce([
      { id: "p1", name: "Куртки", articleCode: "ART-1" },
    ]);

    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      sheet: {
        orders: Array<{ orderNumber: string | null; customerName: string }>;
        items: Array<{ productName: string; orderNumber: string | null }>;
      };
    };
    expect(json.sheet.orders[0]?.orderNumber).toBe("ORD-7");
    expect(json.sheet.orders[0]?.customerName).toBe("Клієнт А");
    expect(json.sheet.items[0]?.productName).toBe("Куртки");
    expect(json.sheet.items[0]?.orderNumber).toBe("ORD-7");
  });

  it("returns loading rows, shortage and counters (Stage 2)", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(fakeSheet());
    loadingRowsMock.mockResolvedValueOnce([
      { id: "ld1", barcode: "123", lotId: "l1", productId: "p1" },
    ]);
    shortageMock.mockResolvedValueOnce([
      { orderId: "o1", productId: "p1", shortage: 2 },
    ]);
    countersMock.mockResolvedValueOnce({
      ordersCount: 1,
      orderedQty: 5,
      loadedQty: 3,
      shortageQty: 2,
    });

    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      sheet: {
        loading: Array<{ id: string }>;
        shortage: Array<{ shortage: number }>;
        counters: { loadedQty: number; shortageQty: number };
      };
    };
    expect(json.sheet.loading[0]?.id).toBe("ld1");
    expect(json.sheet.shortage[0]?.shortage).toBe(2);
    expect(json.sheet.counters.loadedQty).toBe(3);
    expect(json.sheet.counters.shortageQty).toBe(2);
  });

  it("derives sales/saleItems/payments from back-links (Stage 3)", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(fakeSheet());
    documentsMock.mockResolvedValueOnce({
      sales: [{ id: "s1", docNumber: 3, customerName: "К", status: "draft" }],
      saleItems: [{ id: "si1", saleId: "s1", productName: "Товар" }],
      payments: [{ id: "co1", type: "income", documentSumEur: 100 }],
    });

    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    expect(documentsMock).toHaveBeenCalledWith("rs1");
    const json = (await res.json()) as {
      sheet: {
        sales: Array<{ id: string }>;
        saleItems: Array<{ id: string }>;
        payments: Array<{ id: string }>;
      };
    };
    expect(json.sheet.sales[0]?.id).toBe("s1");
    expect(json.sheet.saleItems[0]?.id).toBe("si1");
    expect(json.sheet.payments[0]?.id).toBe("co1");
  });
});

describe("PATCH /api/v1/manager/route-sheets/[id]", () => {
  it("404 when not found", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ comment: "x" }), { params });
    expect(res.status).toBe(404);
  });

  it("updates header fields (200)", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "draft",
    });
    mockPrisma.routeSheet.update.mockResolvedValueOnce(
      fakeSheet({ comment: "оновлено" }),
    );
    const res = await PATCH(patchReq({ comment: "оновлено", routeId: "r1" }), {
      params,
    });
    expect(res.status).toBe(200);
    const data = mockPrisma.routeSheet.update.mock.calls[0]?.[0] as {
      data: { comment: string; routeId: string };
    };
    expect(data.data.comment).toBe("оновлено");
    expect(data.data.routeId).toBe("r1");
  });

  it("409 when editing non-status field on completed sheet", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    const res = await PATCH(patchReq({ comment: "не можна" }), { params });
    expect(res.status).toBe(409);
    expect(mockPrisma.routeSheet.update).not.toHaveBeenCalled();
  });

  it("allows status change on completed sheet (unlock)", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    mockPrisma.routeSheet.update.mockResolvedValueOnce(
      fakeSheet({ status: "dispatched" }),
    );
    const res = await PATCH(patchReq({ status: "dispatched" }), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.routeSheet.update).toHaveBeenCalled();
  });

  it("400 on invalid status", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "draft",
    });
    const res = await PATCH(patchReq({ status: "nope" }), { params });
    expect(res.status).toBe(400);
  });
});
