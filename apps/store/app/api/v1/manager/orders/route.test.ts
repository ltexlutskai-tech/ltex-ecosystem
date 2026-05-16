import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  createOrderWithItemsMock,
  FakePrismaError,
} = vi.hoisted(() => {
  class FakePrismaError extends Error {
    code: string;
    constructor(code: string, message = "fake") {
      super(message);
      this.code = code;
    }
  }
  return {
    mockPrisma: {
      mgrClient: { findMany: vi.fn() },
      order: { findMany: vi.fn(), count: vi.fn() },
      customer: { findUnique: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
    createOrderWithItemsMock: vi.fn(),
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
vi.mock("@/lib/manager/order-create", () => ({
  createOrderWithItems: (...args: unknown[]) =>
    createOrderWithItemsMock(...args),
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
  return new NextRequest(`http://localhost/api/v1/manager/orders${qs}`);
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeOrder(id: string, code: string): unknown {
  return {
    id,
    code1C: code,
    status: "approved",
    totalEur: 100,
    totalUah: 4300,
    createdAt: new Date("2026-05-10T10:00:00Z"),
    customer: { id: "cust1", name: "Test Customer", code1C: "000001" },
    _count: { items: 3 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/orders", () => {
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
    expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
  });

  it("returns orders scoped to manager's clients", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
      { code1C: "000001" },
      { code1C: "000002" },
    ]);
    mockPrisma.order.findMany.mockResolvedValueOnce([
      fakeOrder("ord1", "000000123"),
    ]);
    mockPrisma.order.count.mockResolvedValueOnce(1);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ id: string }>;
      total: number;
    };
    expect(json.items[0]?.id).toBe("ord1");
    expect(json.total).toBe(1);

    const findManyArgs = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { customer?: { code1C?: { in?: string[] } } };
    };
    expect(findManyArgs.where.customer?.code1C?.in).toEqual([
      "000001",
      "000002",
    ]);
  });

  it("admin sees all orders without scope", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([
      fakeOrder("ord1", "000000123"),
    ]);
    mockPrisma.order.count.mockResolvedValueOnce(1);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { customer?: unknown };
    };
    expect(args.where.customer).toBeUndefined();
    expect(mockPrisma.mgrClient.findMany).not.toHaveBeenCalled();
  });

  it("applies search filter (OR on code1C / customer.name)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    await GET(req("?search=Іванов"));
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { OR?: unknown[] };
    };
    expect(args.where.OR).toHaveLength(2);
  });

  it("applies status filter only when in allow-list", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    await GET(req("?status=approved"));
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { status?: string };
    };
    expect(args.where.status).toBe("approved");
  });

  it("ignores invalid status value", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    await GET(req("?status=hacker"));
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { status?: string };
    };
    expect(args.where.status).toBeUndefined();
  });

  it("applies date range filter", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    await GET(req("?from=2026-05-01&to=2026-05-31"));
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { createdAt?: { gte?: Date; lte?: Date } };
    };
    expect(args.where.createdAt?.gte).toBeInstanceOf(Date);
    expect(args.where.createdAt?.lte).toBeInstanceOf(Date);
  });

  it("returns empty list when manager filters by foreign clientCode1C", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    const res = await GET(req("?clientCode1C=999999"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; total: number };
    expect(json.items).toEqual([]);
    expect(json.total).toBe(0);
    expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
  });

  it("clamps pageSize to [10..100]", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    await GET(req("?pageSize=5"));
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(args.take).toBe(10);
  });
});

describe("POST /api/v1/manager/orders", () => {
  const validBody = {
    customerId: "cust1",
    items: [{ productId: "p1", weight: 10, quantity: 1, priceEur: 100 }],
  };

  function fakeCreatedOrder() {
    return {
      id: "ord1",
      code1C: null,
      status: "draft",
      totalEur: 100,
      totalUah: 4300,
      exchangeRate: 43,
      notes: null,
      createdAt: new Date("2026-05-15T10:00:00Z"),
      customer: { id: "cust1", code1C: "000001", name: "Test" },
      items: [
        {
          id: "i1",
          productId: "p1",
          lotId: null,
          priceEur: 100,
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

  it("returns 404 коли customer не існує", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 403 коли manager не власник клієнта", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "cust1",
      code1C: "FOREIGN",
      name: "Foreign client",
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "MINE-1" }]);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(403);
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it("admin може створити для будь-якого клієнта", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "cust1",
      code1C: "FOREIGN",
      name: "Foreign",
    });
    createOrderWithItemsMock.mockResolvedValueOnce(fakeCreatedOrder());
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
    expect(mockPrisma.mgrClient.findMany).not.toHaveBeenCalled();
  });

  it("manager успішно створює для свого клієнта", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "cust1",
      code1C: "000001",
      name: "Mine",
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    createOrderWithItemsMock.mockResolvedValueOnce(fakeCreatedOrder());
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string };
    expect(json.id).toBe("ord1");
  });

  it("returns 400 на FK violation (Prisma P2003)", async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "cust1",
      code1C: "000001",
      name: "Mine",
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    createOrderWithItemsMock.mockRejectedValueOnce(
      new FakePrismaError("P2003"),
    );
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(400);
  });
});
