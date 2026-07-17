import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, getViewerOwnershipMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrReminder: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
      mgrReminderItem: { findMany: vi.fn() },
      mgrClient: { findUnique: vi.fn() },
      product: { findMany: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
    getViewerOwnershipMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));
vi.mock("@/lib/manager/client-visibility", () => ({
  getViewerOwnership: (...args: unknown[]) => getViewerOwnershipMock(...args),
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

function getReq(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/reminders${qs}`);
}
function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeReminder(id: string): unknown {
  return {
    id,
    body: "Передзвонити",
    remindAt: new Date("2026-05-20T08:00:00Z"),
    completedAt: null,
    snoozedUntilAt: null,
    periodicity: "none",
    isProductReminder: false,
    orderVideo: false,
    actionType: "none",
    source: "manual",
    lotId: null,
    productId: null,
    clientId: null,
    createdAt: new Date("2026-05-10T08:00:00Z"),
    client: null,
    owner: { id: "u1", fullName: "Alice" },
    items: [],
  };
}

function fakeProductReminder(id: string, items: unknown[]): unknown {
  return {
    ...(fakeReminder(id) as Record<string, unknown>),
    isProductReminder: true,
    periodicity: "event",
    clientId: "c1",
    client: { id: "c1", name: "ТОВ Ромашка" },
    body: "Товари для ТОВ Ромашка",
    items,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  mockPrisma.product.findMany.mockResolvedValue([]);
  mockPrisma.mgrReminderItem.findMany.mockResolvedValue([]);
});

describe("GET /api/v1/manager/reminders", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  it("scopes manager to own reminders + active-only by default", async () => {
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([fakeReminder("r1")]);
    mockPrisma.mgrReminder.count.mockResolvedValueOnce(1);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      reminders: Array<{ id: string }>;
      total: number;
    };
    expect(json.reminders[0]?.id).toBe("r1");
    expect(json.total).toBe(1);
    const args = mockPrisma.mgrReminder.findMany.mock.calls[0]?.[0] as {
      where: { ownerUserId?: string; completedAt?: null };
    };
    expect(args.where.ownerUserId).toBe("u1");
    expect(args.where.completedAt).toBeNull();
  });

  it("admin sees all (no ownerUserId scope)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([]);
    mockPrisma.mgrReminder.count.mockResolvedValueOnce(0);
    await GET(getReq());
    const args = mockPrisma.mgrReminder.findMany.mock.calls[0]?.[0] as {
      where: { ownerUserId?: string };
    };
    expect(args.where.ownerUserId).toBeUndefined();
  });

  it("completed=true lifts active-only filter", async () => {
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([]);
    mockPrisma.mgrReminder.count.mockResolvedValueOnce(0);
    await GET(getReq("?completed=true"));
    const args = mockPrisma.mgrReminder.findMany.mock.calls[0]?.[0] as {
      where: { completedAt?: null };
    };
    expect(args.where.completedAt).toBeUndefined();
  });

  it("orderVideo=true + q filter applied", async () => {
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([]);
    mockPrisma.mgrReminder.count.mockResolvedValueOnce(0);
    await GET(getReq("?orderVideo=true&q=відео"));
    const args = mockPrisma.mgrReminder.findMany.mock.calls[0]?.[0] as {
      where: { orderVideo?: boolean; body?: { contains?: string } };
    };
    expect(args.where.orderVideo).toBe(true);
    expect(args.where.body?.contains).toBe("відео");
  });

  it("clientId filter scopes where.clientId", async () => {
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([]);
    mockPrisma.mgrReminder.count.mockResolvedValueOnce(0);
    await GET(getReq("?clientId=c1"));
    const args = mockPrisma.mgrReminder.findMany.mock.calls[0]?.[0] as {
      where: { clientId?: string };
    };
    expect(args.where.clientId).toBe("c1");
  });

  it("clamps pageSize to [1..100]", async () => {
    mockPrisma.mgrReminder.findMany.mockResolvedValueOnce([]);
    mockPrisma.mgrReminder.count.mockResolvedValueOnce(0);
    await GET(getReq("?pageSize=999"));
    const args = mockPrisma.mgrReminder.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(args.take).toBe(100);
  });
});

describe("POST /api/v1/manager/reminders", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(
      postReq({ body: "x", remindAt: "2026-05-20T08:00:00Z" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on empty body", async () => {
    const res = await POST(
      postReq({ body: "", remindAt: "2026-05-20T08:00:00Z" }),
    );
    expect(res.status).toBe(400);
  });

  it("creates standalone reminder without client", async () => {
    mockPrisma.mgrReminder.create.mockResolvedValueOnce(fakeReminder("r1"));
    const res = await POST(
      postReq({
        body: "Передзвонити",
        remindAt: "2026-05-20T08:00:00Z",
        periodicity: "daily",
        orderVideo: true,
      }),
    );
    expect(res.status).toBe(201);
    const args = mockPrisma.mgrReminder.create.mock.calls[0]?.[0] as {
      data: {
        ownerUserId: string;
        clientId: string | null;
        periodicity: string;
        orderVideo: boolean;
        isProductReminder: boolean;
        source: string;
      };
    };
    expect(args.data.ownerUserId).toBe("u1");
    expect(args.data.clientId).toBeNull();
    expect(args.data.periodicity).toBe("daily");
    expect(args.data.orderVideo).toBe(true);
    expect(args.data.isProductReminder).toBe(false);
    expect(args.data.source).toBe("manual");
  });

  it("returns 400 when clientId not found", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await POST(
      postReq({
        body: "x",
        remindAt: "2026-05-20T08:00:00Z",
        clientId: "missing",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrReminder.create).not.toHaveBeenCalled();
  });

  it("returns 403 when client is foreign for manager", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "c1" });
    getViewerOwnershipMock.mockResolvedValueOnce("foreign");
    const res = await POST(
      postReq({ body: "x", remindAt: "2026-05-20T08:00:00Z", clientId: "c1" }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrReminder.create).not.toHaveBeenCalled();
  });

  it("creates reminder for owned client", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "c1" });
    getViewerOwnershipMock.mockResolvedValueOnce("mine");
    mockPrisma.mgrReminder.create.mockResolvedValueOnce(fakeReminder("r2"));
    const res = await POST(
      postReq({ body: "x", remindAt: "2026-05-20T08:00:00Z", clientId: "c1" }),
    );
    expect(res.status).toBe(201);
    const args = mockPrisma.mgrReminder.create.mock.calls[0]?.[0] as {
      data: { clientId: string | null };
    };
    expect(args.data.clientId).toBe("c1");
  });
});

describe("POST /api/v1/manager/reminders — тип «Для товарів»", () => {
  it("400 when items empty", async () => {
    const res = await POST(
      postReq({ isProductReminder: true, clientId: "c1", items: [] }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrReminder.create).not.toHaveBeenCalled();
  });

  it("400 when clientId missing for product reminder", async () => {
    const res = await POST(
      postReq({
        isProductReminder: true,
        items: [{ productId: "p1", quantity: 2 }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("403 when product client is foreign", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      name: "ТОВ Ромашка",
    });
    getViewerOwnershipMock.mockResolvedValueOnce("foreign");
    const res = await POST(
      postReq({
        isProductReminder: true,
        clientId: "c1",
        items: [{ productId: "p1", quantity: 1 }],
      }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrReminder.create).not.toHaveBeenCalled();
  });

  it("creates product reminder with event periodicity + nested items", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      name: "ТОВ Ромашка",
    });
    getViewerOwnershipMock.mockResolvedValueOnce("mine");
    mockPrisma.mgrReminderItem.findMany.mockResolvedValueOnce([]);
    mockPrisma.mgrReminder.create.mockResolvedValueOnce(
      fakeProductReminder("r3", [
        { id: "it1", productId: "p1", quantity: 2, done: false },
      ]),
    );
    mockPrisma.product.findMany.mockResolvedValueOnce([
      { id: "p1", name: "Куртки зимові", articleCode: "JKT" },
    ]);
    const res = await POST(
      postReq({
        isProductReminder: true,
        clientId: "c1",
        items: [{ productId: "p1", quantity: 2 }],
      }),
    );
    expect(res.status).toBe(201);
    const args = mockPrisma.mgrReminder.create.mock.calls[0]?.[0] as {
      data: {
        isProductReminder: boolean;
        periodicity: string;
        body: string;
        remindAt: Date;
        items: { create: { productId: string; quantity: number }[] };
      };
    };
    expect(args.data.isProductReminder).toBe(true);
    expect(args.data.periodicity).toBe("event");
    expect(args.data.body).toBe("Товари для ТОВ Ромашка");
    expect(args.data.remindAt).toBeInstanceOf(Date);
    expect(args.data.items.create).toEqual([{ productId: "p1", quantity: 2 }]);
    const json = (await res.json()) as {
      reminder: { items: { productName: string }[] };
      skippedProductIds: string[];
    };
    expect(json.reminder.items[0]?.productName).toBe("Куртки зимові");
    expect(json.skippedProductIds).toEqual([]);
  });

  it("persists orderId when product reminder is created from an order", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      name: "ТОВ Ромашка",
    });
    getViewerOwnershipMock.mockResolvedValueOnce("mine");
    mockPrisma.mgrReminderItem.findMany.mockResolvedValueOnce([]);
    mockPrisma.mgrReminder.create.mockResolvedValueOnce(
      fakeProductReminder("r5", [
        { id: "it5", productId: "p1", quantity: 1, done: false },
      ]),
    );
    mockPrisma.product.findMany.mockResolvedValueOnce([
      { id: "p1", name: "Куртки", articleCode: null },
    ]);
    const res = await POST(
      postReq({
        isProductReminder: true,
        clientId: "c1",
        orderId: "ord-1",
        items: [{ productId: "p1", quantity: 1 }],
      }),
    );
    expect(res.status).toBe(201);
    const args = mockPrisma.mgrReminder.create.mock.calls[0]?.[0] as {
      data: { orderId: string | null };
    };
    expect(args.data.orderId).toBe("ord-1");
  });

  it("antidubl: drops products already in active reminders, keeps the rest", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      name: "ТОВ Ромашка",
    });
    getViewerOwnershipMock.mockResolvedValueOnce("mine");
    // p1 вже у активному нагадуванні — має бути відкинутий.
    mockPrisma.mgrReminderItem.findMany.mockResolvedValueOnce([
      { productId: "p1" },
    ]);
    mockPrisma.mgrReminder.create.mockResolvedValueOnce(
      fakeProductReminder("r4", [
        { id: "it2", productId: "p2", quantity: 1, done: false },
      ]),
    );
    mockPrisma.product.findMany.mockResolvedValueOnce([
      { id: "p2", name: "Светри", articleCode: null },
    ]);
    const res = await POST(
      postReq({
        isProductReminder: true,
        clientId: "c1",
        items: [
          { productId: "p1", quantity: 3 },
          { productId: "p2", quantity: 1 },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const args = mockPrisma.mgrReminder.create.mock.calls[0]?.[0] as {
      data: { items: { create: { productId: string }[] } };
    };
    expect(args.data.items.create).toEqual([{ productId: "p2", quantity: 1 }]);
    const json = (await res.json()) as { skippedProductIds: string[] };
    expect(json.skippedProductIds).toEqual(["p1"]);
  });

  it("antidubl: 400 when ALL incoming products already active", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      name: "ТОВ Ромашка",
    });
    getViewerOwnershipMock.mockResolvedValueOnce("mine");
    mockPrisma.mgrReminderItem.findMany.mockResolvedValueOnce([
      { productId: "p1" },
      { productId: "p2" },
    ]);
    const res = await POST(
      postReq({
        isProductReminder: true,
        clientId: "c1",
        items: [
          { productId: "p1", quantity: 1 },
          { productId: "p2", quantity: 1 },
        ],
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("вже є в активних нагадуваннях");
    expect(mockPrisma.mgrReminder.create).not.toHaveBeenCalled();
  });
});
