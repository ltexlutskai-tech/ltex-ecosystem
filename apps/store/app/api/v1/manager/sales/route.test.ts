import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  createSaleWithItemsMock,
  resolveCustomerForOrderMock,
  ResolveCustomerError,
  FakePrismaError,
} = vi.hoisted(() => {
  class FakePrismaError extends Error {
    code: string;
    constructor(code: string, message = "fake") {
      super(message);
      this.code = code;
    }
  }
  class ResolveCustomerError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.name = "ResolveCustomerError";
      this.status = status;
    }
  }
  return {
    mockPrisma: {
      mgrClient: { findMany: vi.fn() },
      sale: { findMany: vi.fn(), count: vi.fn() },
      routeSheet: { findUnique: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
    createSaleWithItemsMock: vi.fn(),
    resolveCustomerForOrderMock: vi.fn(),
    ResolveCustomerError,
    FakePrismaError,
  };
});

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: FakePrismaError },
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/sale-create", () => ({
  createSaleWithItems: (...args: unknown[]) => createSaleWithItemsMock(...args),
}));
vi.mock("@/lib/manager/resolve-customer", () => ({
  resolveCustomerForOrder: (...args: unknown[]) =>
    resolveCustomerForOrderMock(...args),
  ResolveCustomerError,
}));

import { GET, POST } from "./route";

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
const ADMIN = { ...MANAGER, id: "admin1", role: "admin" as const };

function req(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/sales${qs}`);
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeSale(id: string, docNumber: number): unknown {
  return {
    id,
    code1C: null,
    docNumber,
    status: "draft",
    totalEur: 100,
    totalUah: 4300,
    archived: false,
    isActual: true,
    createdAt: new Date("2026-05-10T10:00:00Z"),
    customer: {
      id: "cust1",
      name: "Test Customer",
      code1C: "000001",
      city: "Луцьк",
    },
    _count: { items: 3 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/sales", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns empty list immediately when manager has 0 clients", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; total: number };
    expect(json.items).toEqual([]);
    expect(json.total).toBe(0);
    expect(mockPrisma.sale.findMany).not.toHaveBeenCalled();
  });

  it("returns sales scoped to manager's clients", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
      { code1C: "000001" },
      { code1C: "000002" },
    ]);
    mockPrisma.sale.findMany.mockResolvedValueOnce([fakeSale("sale1", 1)]);
    mockPrisma.sale.count.mockResolvedValueOnce(1);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ id: string; docNumber: number }>;
      total: number;
    };
    expect(json.items[0]?.id).toBe("sale1");
    expect(json.items[0]?.docNumber).toBe(1);
    expect(json.total).toBe(1);

    const findManyArgs = mockPrisma.sale.findMany.mock.calls[0]?.[0] as {
      where: { customer?: { code1C?: { in?: string[] } } };
    };
    expect(findManyArgs.where.customer?.code1C?.in).toEqual([
      "000001",
      "000002",
    ]);
  });

  it("admin sees all sales without scope", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.sale.findMany.mockResolvedValueOnce([fakeSale("sale1", 1)]);
    mockPrisma.sale.count.mockResolvedValueOnce(1);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const args = mockPrisma.sale.findMany.mock.calls[0]?.[0] as {
      where: { customer?: unknown };
    };
    expect(args.where.customer).toBeUndefined();
    expect(mockPrisma.mgrClient.findMany).not.toHaveBeenCalled();
  });

  it("applies search filter (OR over code1C / customer / products)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.sale.findMany.mockResolvedValueOnce([]);
    mockPrisma.sale.count.mockResolvedValueOnce(0);

    await GET(req("?search=Іванов"));
    const args = mockPrisma.sale.findMany.mock.calls[0]?.[0] as {
      where: { OR?: unknown[] };
    };
    // number1C / code1C / customer name / phone / city / product name / articleCode
    expect(args.where.OR).toHaveLength(7);
    const json = JSON.stringify(args.where.OR);
    expect(json).toContain('"number1C"');
    expect(json).toContain('"items"');
    expect(json).toContain('"articleCode"');
  });

  it("ignores invalid status value", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.sale.findMany.mockResolvedValueOnce([]);
    mockPrisma.sale.count.mockResolvedValueOnce(0);

    await GET(req("?status=hacker"));
    const args = mockPrisma.sale.findMany.mock.calls[0]?.[0] as {
      where: { status?: string };
    };
    expect(args.where.status).toBeUndefined();
  });

  it("returns empty list when manager filters by foreign clientCode1C", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    const res = await GET(req("?clientCode1C=999999"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; total: number };
    expect(json.items).toEqual([]);
    expect(json.total).toBe(0);
    expect(mockPrisma.sale.findMany).not.toHaveBeenCalled();
  });

  it("clamps pageSize to [10..100]", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.sale.findMany.mockResolvedValueOnce([]);
    mockPrisma.sale.count.mockResolvedValueOnce(0);

    await GET(req("?pageSize=5"));
    const args = mockPrisma.sale.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(args.take).toBe(10);
  });

  it("hides archived by default; showArchived=true lifts it", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN);
    mockPrisma.sale.findMany.mockResolvedValue([]);
    mockPrisma.sale.count.mockResolvedValue(0);

    await GET(req());
    const a1 = mockPrisma.sale.findMany.mock.calls[0]?.[0] as {
      where: { archived?: boolean };
    };
    expect(a1.where.archived).toBe(false);

    await GET(req("?showArchived=true"));
    const a2 = mockPrisma.sale.findMany.mock.calls[1]?.[0] as {
      where: { archived?: boolean };
    };
    expect(a2.where.archived).toBeUndefined();
  });

  it("response row includes docNumber / city / isActual / createdAt string", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.sale.findMany.mockResolvedValueOnce([fakeSale("sale1", 5)]);
    mockPrisma.sale.count.mockResolvedValueOnce(1);

    const res = await GET(req());
    const json = (await res.json()) as {
      items: Array<{
        docNumber: number;
        isActual: boolean;
        customer: { city: string | null };
        createdAt: string;
      }>;
    };
    const row = json.items[0];
    expect(row?.docNumber).toBe(5);
    expect(row?.customer.city).toBe("Луцьк");
    expect(row?.isActual).toBe(true);
    expect(typeof row?.createdAt).toBe("string");
  });
});

describe("POST /api/v1/manager/sales", () => {
  const validBody = {
    customerId: "cust1",
    items: [
      { productId: "p1", pricePerKg: 4, weight: 10, quantity: 1, priceEur: 40 },
    ],
  };

  function fakeCreatedSale() {
    return {
      id: "sale1",
      code1C: null,
      docNumber: 7,
      status: "draft",
      totalEur: 40,
      totalUah: 1720,
      exchangeRateEur: 43,
      exchangeRateUsd: 0,
      notes: null,
      priceTypeId: null,
      deliveryMethod: null,
      novaPoshtaBranch: null,
      cashOnDelivery: false,
      codAmountUah: null,
      assignedAgentUserId: null,
      onTradeAgent: true,
      exportTo1C: true,
      expressWaybill: null,
      createdAt: new Date("2026-05-21T10:00:00Z"),
      customer: { id: "cust1", code1C: "000001", name: "Test" },
      items: [
        {
          id: "i1",
          productId: "p1",
          lotId: null,
          barcode: null,
          pricePerKg: 4,
          priceEur: 40,
          weight: 10,
          quantity: 1,
        },
      ],
    };
  }

  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    const res = await POST(postReq({ customerId: "", items: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 коли клієнта не знайдено (resolve кидає)", async () => {
    resolveCustomerForOrderMock.mockRejectedValueOnce(
      new ResolveCustomerError("Клієнта не знайдено", 400),
    );
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Клієнта не знайдено");
  });

  it("returns 403 коли manager не власник клієнта", async () => {
    resolveCustomerForOrderMock.mockResolvedValueOnce({
      id: "cust1",
      code1C: "FOREIGN",
      name: "Foreign",
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "MINE-1" }]);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(403);
    expect(createSaleWithItemsMock).not.toHaveBeenCalled();
  });

  it("manager успішно створює для свого клієнта (201)", async () => {
    resolveCustomerForOrderMock.mockResolvedValueOnce({
      id: "cust1",
      code1C: "000001",
      name: "Mine",
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    createSaleWithItemsMock.mockResolvedValueOnce(fakeCreatedSale());
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; docNumber: number };
    expect(json.id).toBe("sale1");
    expect(json.docNumber).toBe(7);
  });

  it("admin може створити для будь-якого клієнта", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    resolveCustomerForOrderMock.mockResolvedValueOnce({
      id: "cust1",
      code1C: "FOREIGN",
      name: "Foreign",
    });
    createSaleWithItemsMock.mockResolvedValueOnce(fakeCreatedSale());
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
    expect(mockPrisma.mgrClient.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 на FK violation (Prisma P2003)", async () => {
    resolveCustomerForOrderMock.mockResolvedValueOnce({
      id: "cust1",
      code1C: "000001",
      name: "Mine",
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    createSaleWithItemsMock.mockRejectedValueOnce(new FakePrismaError("P2003"));
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(400);
  });

  it("створення з routeSheetId передає його у createSaleWithItems", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    resolveCustomerForOrderMock.mockResolvedValueOnce({
      id: "cust1",
      code1C: "000001",
      name: "Mine",
    });
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({ id: "rs1" });
    createSaleWithItemsMock.mockResolvedValueOnce({
      ...fakeCreatedSale(),
      routeSheetId: "rs1",
    });
    const res = await POST(postReq({ ...validBody, routeSheetId: "rs1" }));
    expect(res.status).toBe(201);
    expect(mockPrisma.routeSheet.findUnique).toHaveBeenCalledWith({
      where: { id: "rs1" },
      select: { id: true },
    });
    const input = createSaleWithItemsMock.mock.calls[0]?.[0] as {
      routeSheetId?: string;
    };
    expect(input.routeSheetId).toBe("rs1");
    const json = (await res.json()) as { routeSheetId: string | null };
    expect(json.routeSheetId).toBe("rs1");
  });

  it("returns 404 коли routeSheetId не існує", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    resolveCustomerForOrderMock.mockResolvedValueOnce({
      id: "cust1",
      code1C: "000001",
      name: "Mine",
    });
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ ...validBody, routeSheetId: "missing" }));
    expect(res.status).toBe(404);
    expect(createSaleWithItemsMock).not.toHaveBeenCalled();
  });
});
