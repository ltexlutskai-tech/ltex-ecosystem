import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  fetchClosuresFromOnecMock,
  closeClosuresViaOnecMock,
  getMyClientCodes1CMock,
  createOrderWithItemsMock,
  recordClientEventSafeMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
  fetchClosuresFromOnecMock: vi.fn(),
  closeClosuresViaOnecMock: vi.fn(),
  getMyClientCodes1CMock: vi.fn(),
  createOrderWithItemsMock: vi.fn(),
  recordClientEventSafeMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/order-ownership", () => ({
  getMyClientCodes1C: (...args: unknown[]) => getMyClientCodes1CMock(...args),
}));
vi.mock("@/lib/manager/closures-sync", () => ({
  fetchClosuresFromOnec: (...args: unknown[]) =>
    fetchClosuresFromOnecMock(...args),
  closeClosuresViaOnec: (...args: unknown[]) =>
    closeClosuresViaOnecMock(...args),
}));
vi.mock("@/lib/manager/order-create", () => ({
  createOrderWithItems: (...args: unknown[]) =>
    createOrderWithItemsMock(...args),
}));
vi.mock("@/lib/manager/client-timeline", () => ({
  recordClientEventSafe: (...args: unknown[]) =>
    recordClientEventSafeMock(...args),
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

function getReq(clientId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/closures/${clientId}`,
  );
}

function postReq(clientId: string, body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/closures/${clientId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function ctx(clientId: string): { params: Promise<{ clientId: string }> } {
  return { params: Promise.resolve({ clientId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/closures/[clientId]", () => {
  it("returns 401 коли не authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(getReq("c1"), ctx("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 коли клієнт не знайдений", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await GET(getReq("c1"), ctx("c1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 коли клієнт чужий (manager)", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000999",
    });
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001", "000002"]);
    const res = await GET(getReq("c1"), ctx("c1"));
    expect(res.status).toBe(403);
  });

  it("returns 200 з items коли все ОК (happy path)", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
    });
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: "cust1" });
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001"]);
    fetchClosuresFromOnecMock.mockResolvedValueOnce({
      ok: true,
      items: [
        {
          orderUid: "u1",
          orderNumber: "L-1",
          orderDate: "2026-01-01",
          productUid: "p1",
          productName: "Test Mix",
          quantity: 10,
          sum: 100,
          sold: 5,
          status: "Новий",
        },
      ],
    });
    const res = await GET(getReq("c1"), ctx("c1"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items).toHaveLength(1);
  });

  it("admin отримує доступ до будь-якого клієнта", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "any",
      code1C: "000999",
    });
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);
    getMyClientCodes1CMock.mockResolvedValueOnce(null); // admin → null
    fetchClosuresFromOnecMock.mockResolvedValueOnce({ ok: true, items: [] });
    const res = await GET(getReq("any"), ctx("any"));
    expect(res.status).toBe(200);
  });

  it("returns 502 коли 1С/proxy fail", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
    });
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001"]);
    fetchClosuresFromOnecMock.mockResolvedValueOnce({
      ok: false,
      items: [],
      errorMessage: "ONEC_SOAP_URL не виставлено",
    });
    const res = await GET(getReq("c1"), ctx("c1"));
    expect(res.status).toBe(502);
  });
});

describe("POST /api/v1/manager/closures/[clientId]", () => {
  const validItems = [
    {
      orderUid: "u1",
      productUid: "p1",
      quantity: 5,
      price: 100,
      addToNewOrder: false,
    },
  ];

  it("returns 401 коли не authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq("c1", { items: validItems }), ctx("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 на порожні items[]", async () => {
    const res = await POST(postReq("c1", { items: [] }), ctx("c1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 коли items shape невалідний (missing field)", async () => {
    const res = await POST(
      postReq("c1", { items: [{ orderUid: "x" }] }),
      ctx("c1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 коли клієнт чужий (manager)", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000999",
    });
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001"]);
    const res = await POST(postReq("c1", { items: validItems }), ctx("c1"));
    expect(res.status).toBe(403);
  });

  it("happy path: 200 + timeline-event записано", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
    });
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: "cust1" });
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001"]);
    closeClosuresViaOnecMock.mockResolvedValueOnce({
      ok: true,
      closedCount: 1,
      newOrderUid: null,
      newOrderNumber: null,
      alreadyProcessed: false,
    });
    const res = await POST(
      postReq("c1", { items: validItems, idempotencyKey: "k1" }),
      ctx("c1"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { closedCount: number; ok: boolean };
    expect(json.ok).toBe(true);
    expect(json.closedCount).toBe(1);
    expect(recordClientEventSafeMock).toHaveBeenCalledOnce();
    const eventArg = recordClientEventSafeMock.mock.calls[0]?.[0] as {
      kind: string;
      clientId: string;
    };
    expect(eventArg.kind).toBe("close_orders");
    expect(eventArg.clientId).toBe("c1");
  });

  it("idempotency-marker зберігається при повторі (alreadyProcessed=true)", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
    });
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001"]);
    closeClosuresViaOnecMock.mockResolvedValueOnce({
      ok: true,
      closedCount: 1,
      newOrderUid: "u-new",
      newOrderNumber: "L-NEW",
      alreadyProcessed: true,
    });
    const res = await POST(
      postReq("c1", { items: validItems, idempotencyKey: "stable-key" }),
      ctx("c1"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { alreadyProcessed: boolean };
    expect(json.alreadyProcessed).toBe(true);
  });

  it("partial closure: addToNewOrder=true + Customer існує → createOrder викликано", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
    });
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: "cust1" });
    getMyClientCodes1CMock.mockResolvedValueOnce(["000001"]);
    closeClosuresViaOnecMock.mockResolvedValueOnce({
      ok: true,
      closedCount: 1,
      newOrderUid: "u-new",
      newOrderNumber: "L-NEW-001",
      alreadyProcessed: false,
    });
    createOrderWithItemsMock.mockResolvedValueOnce({
      id: "local-ord-1",
      code1C: null,
    });
    const res = await POST(
      postReq("c1", {
        items: [{ ...validItems[0]!, addToNewOrder: true }],
      }),
      ctx("c1"),
    );
    expect(res.status).toBe(200);
    expect(createOrderWithItemsMock).toHaveBeenCalledOnce();
    const json = (await res.json()) as {
      localOrderId: string | null;
      newOrderNumber: string;
    };
    expect(json.localOrderId).toBe("local-ord-1");
    expect(json.newOrderNumber).toBe("L-NEW-001");
  });
});
