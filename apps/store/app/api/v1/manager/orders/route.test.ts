import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  createOrderWithItemsMock,
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
      order: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
      customer: { findUnique: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
    createOrderWithItemsMock: vi.fn(),
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
vi.mock("@/lib/manager/order-create", () => ({
  createOrderWithItems: (...args: unknown[]) =>
    createOrderWithItemsMock(...args),
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
    status: "posted",
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
  // Дефолт: у клієнта немає активного замовлення (актуальність guard пропускає).
  mockPrisma.order.findFirst.mockResolvedValue(null);
});

describe("GET /api/v1/manager/orders", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("manager with 0 clients still queries by agent-scope (7.2 Block 2)", async () => {
    // Раніше короткозамикали на порожньо; тепер менеджер може бачити сайтові
    // замовлення, де він призначений агент → запит виконується.
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; total: number };
    expect(json.items).toEqual([]);
    expect(mockPrisma.order.findMany).toHaveBeenCalled();

    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { AND?: Array<{ OR?: Array<Record<string, unknown>> }> };
    };
    // Скоуп OR(code1C in [], assignedAgentUserId === viewer) через AND.
    const scopeOr = args.where.AND?.[0]?.OR;
    expect(JSON.stringify(scopeOr)).toContain("assignedAgentUserId");
  });

  it("returns orders scoped to manager (OR own code1C / assigned agent)", async () => {
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
      where: {
        AND?: Array<{
          OR?: Array<{
            customer?: { code1C?: { in?: string[] } };
            assignedAgentUserId?: string;
          }>;
        }>;
      };
    };
    const scopeOr = findManyArgs.where.AND?.[0]?.OR ?? [];
    expect(scopeOr[0]?.customer?.code1C?.in).toEqual(["000001", "000002"]);
    expect(scopeOr[1]?.assignedAgentUserId).toBeDefined();
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

  it("applies search filter (OR over code1C / customer / products)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    await GET(req("?search=Іванов"));
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { OR?: unknown[] };
    };
    // № (code1C + number1C) / клієнт (ім'я·телефон·місто) /
    // товари (назва·артикул) = 7 clauses
    expect(args.where.OR).toHaveLength(7);
    const json = JSON.stringify(args.where.OR);
    expect(json).toContain('"number1C"');
    expect(json).toContain('"items"');
    expect(json).toContain('"articleCode"');
  });

  it("applies status filter only when in allow-list", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    await GET(req("?status=sent"));
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { status?: string };
    };
    expect(args.where.status).toBe("sent");
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

  it("hides archived by default (where.archived = false)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    await GET(req());
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { archived?: boolean };
    };
    expect(args.where.archived).toBe(false);
  });

  it("showArchived=true lifts archived constraint", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    await GET(req("?showArchived=true"));
    const args = mockPrisma.order.findMany.mock.calls[0]?.[0] as {
      where: { archived?: boolean };
    };
    expect(args.where.archived).toBeUndefined();
  });

  it("response row includes city / isActual / archived", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findMany.mockResolvedValueOnce([
      fakeOrder("ord1", "000000123"),
    ]);
    mockPrisma.order.count.mockResolvedValueOnce(1);

    const res = await GET(req());
    const json = (await res.json()) as {
      items: Array<{
        isActual: boolean;
        archived: boolean;
        customer: { city: string | null };
        createdAt: string;
      }>;
    };
    const row = json.items[0];
    expect(row?.customer.city).toBe("Луцьк");
    expect(row?.isActual).toBe(true);
    expect(row?.archived).toBe(false);
    expect(typeof row?.createdAt).toBe("string");
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

  it("returns 400 коли клієнта не знайдено (resolve кидає 400)", async () => {
    resolveCustomerForOrderMock.mockRejectedValueOnce(
      new ResolveCustomerError("Клієнта не знайдено", 400),
    );
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Клієнта не знайдено");
  });

  it("резолвить MgrClient.id → Customer перед створенням", async () => {
    resolveCustomerForOrderMock.mockResolvedValueOnce({
      id: "cust1",
      code1C: "000001",
      name: "Mine",
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    createOrderWithItemsMock.mockResolvedValueOnce(fakeCreatedOrder());
    const res = await POST(postReq({ ...validBody, customerId: "mgr-1" }));
    expect(res.status).toBe(201);
    // resolve викликано з MgrClient.id, а createOrderWithItems — з Customer
    expect(resolveCustomerForOrderMock).toHaveBeenCalledWith("mgr-1");
    const args = createOrderWithItemsMock.mock.calls[0] as [
      unknown,
      { id: string },
      unknown,
    ];
    expect(args[1].id).toBe("cust1");
  });

  it("returns 403 коли manager не власник клієнта", async () => {
    resolveCustomerForOrderMock.mockResolvedValueOnce({
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
    resolveCustomerForOrderMock.mockResolvedValueOnce({
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
    resolveCustomerForOrderMock.mockResolvedValueOnce({
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

  it("приймає менеджерські поля й передає actor (поточний менеджер)", async () => {
    resolveCustomerForOrderMock.mockResolvedValueOnce({
      id: "cust1",
      code1C: "000001",
      name: "Mine",
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    createOrderWithItemsMock.mockResolvedValueOnce(fakeCreatedOrder());
    const res = await POST(
      postReq({
        ...validBody,
        priceTypeId: "pt-1",
        deliveryMethod: "post",
        cashOnDelivery: true,
        exportTo1C: false,
      }),
    );
    expect(res.status).toBe(201);
    const args = createOrderWithItemsMock.mock.calls[0] as [
      {
        priceTypeId?: string;
        deliveryMethod?: string;
        cashOnDelivery?: boolean;
      },
      unknown,
      { userId: string },
    ];
    expect(args[0].priceTypeId).toBe("pt-1");
    expect(args[0].deliveryMethod).toBe("post");
    expect(args[0].cashOnDelivery).toBe(true);
    expect(args[2].userId).toBe("u1");
  });

  it("передає post=true у createOrderWithItems (зберегти та провести)", async () => {
    resolveCustomerForOrderMock.mockResolvedValueOnce({
      id: "cust1",
      code1C: "000001",
      name: "Mine",
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    createOrderWithItemsMock.mockResolvedValueOnce(fakeCreatedOrder());
    const res = await POST(postReq({ ...validBody, post: true }));
    expect(res.status).toBe(201);
    const args = createOrderWithItemsMock.mock.calls[0] as [
      { post?: boolean },
      unknown,
      unknown,
    ];
    expect(args[0].post).toBe(true);
  });

  it("відхиляє невалідний deliveryMethod (400)", async () => {
    // 7.3: коди беруться з довідника (довільний рядок ≤50); задовгий — 400.
    const res = await POST(
      postReq({ ...validBody, deliveryMethod: "x".repeat(51) }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 на FK violation (Prisma P2003)", async () => {
    resolveCustomerForOrderMock.mockResolvedValueOnce({
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

  // ─── N1 — Актуальність guard ───────────────────────────────────────────
  describe("active-order guard (N1)", () => {
    function setupOwnedClient() {
      resolveCustomerForOrderMock.mockResolvedValueOnce({
        id: "cust1",
        code1C: "000001",
        name: "Mine",
      });
      mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
        { code1C: "000001" },
      ]);
    }

    it("повертає 409 active_order_exists коли у клієнта вже є активне", async () => {
      setupOwnedClient();
      mockPrisma.order.findFirst.mockResolvedValueOnce({
        id: "old1",
        code1C: "000000099",
        docNumber: 5,
      });
      const res = await POST(postReq(validBody));
      expect(res.status).toBe(409);
      const json = (await res.json()) as {
        code: string;
        existingOrderId: string;
        existingOrderNumber: string;
      };
      expect(json.code).toBe("active_order_exists");
      expect(json.existingOrderId).toBe("old1");
      expect(json.existingOrderNumber).toBe("000000099");
      expect(createOrderWithItemsMock).not.toHaveBeenCalled();
    });

    it("force від manager → 403 (немає прав)", async () => {
      setupOwnedClient();
      mockPrisma.order.findFirst.mockResolvedValueOnce({
        id: "old1",
        code1C: "000000099",
        docNumber: 5,
      });
      const res = await POST(postReq({ ...validBody, force: true }));
      expect(res.status).toBe(403);
      expect(createOrderWithItemsMock).not.toHaveBeenCalled();
    });

    it("force від admin → знімає старі активні + створює нове", async () => {
      getCurrentUserMock.mockResolvedValueOnce(ADMIN);
      resolveCustomerForOrderMock.mockResolvedValueOnce({
        id: "cust1",
        code1C: "FOREIGN",
        name: "Any",
      });
      mockPrisma.order.findFirst.mockResolvedValueOnce({
        id: "old1",
        code1C: "000000099",
        docNumber: 5,
      });
      createOrderWithItemsMock.mockResolvedValueOnce(fakeCreatedOrder());
      const res = await POST(postReq({ ...validBody, force: true }));
      expect(res.status).toBe(201);
      const args = createOrderWithItemsMock.mock.calls[0] as [
        unknown,
        unknown,
        unknown,
        { clearOtherActual: boolean },
      ];
      expect(args[3].clearOtherActual).toBe(true);
    });

    it("force через ?force=true query теж приймається (admin)", async () => {
      getCurrentUserMock.mockResolvedValueOnce(ADMIN);
      resolveCustomerForOrderMock.mockResolvedValueOnce({
        id: "cust1",
        code1C: "FOREIGN",
        name: "Any",
      });
      mockPrisma.order.findFirst.mockResolvedValueOnce({
        id: "old1",
        code1C: null,
        docNumber: 5,
      });
      createOrderWithItemsMock.mockResolvedValueOnce(fakeCreatedOrder());
      const res = await POST(
        new NextRequest("http://localhost/api/v1/manager/orders?force=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        }),
      );
      expect(res.status).toBe(201);
    });

    it("немає активного → створює нормально (clearOtherActual=false)", async () => {
      setupOwnedClient();
      // findFirst дефолтить null (beforeEach)
      createOrderWithItemsMock.mockResolvedValueOnce(fakeCreatedOrder());
      const res = await POST(postReq(validBody));
      expect(res.status).toBe(201);
      const args = createOrderWithItemsMock.mock.calls[0] as [
        unknown,
        unknown,
        unknown,
        { clearOtherActual: boolean },
      ];
      expect(args[3].clearOtherActual).toBe(false);
    });
  });
});
