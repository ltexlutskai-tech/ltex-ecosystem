import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    routeSheet: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
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

function req(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/route-sheets${qs}`);
}
function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/route-sheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeRow(id: string, docNumber: number): unknown {
  return {
    id,
    code1C: null,
    docNumber,
    date: new Date("2026-05-20T10:00:00Z"),
    arrivalDate: null,
    status: "draft",
    totalUah: 4300,
    totalEur: 100,
    archived: false,
    route: { id: "r1", name: "Луцьк" },
    expeditor: { id: "u1", fullName: "Alice" },
    _count: { orders: 2 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/route-sheets", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns all route sheets (no client scope)", async () => {
    mockPrisma.routeSheet.findMany.mockResolvedValueOnce([fakeRow("rs1", 1)]);
    mockPrisma.routeSheet.count.mockResolvedValueOnce(1);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ id: string; orderCount: number; date: string }>;
      total: number;
    };
    expect(json.items[0]?.id).toBe("rs1");
    expect(json.items[0]?.orderCount).toBe(2);
    expect(typeof json.items[0]?.date).toBe("string");
    expect(json.total).toBe(1);
  });

  it("hides archived by default; archived=true lifts", async () => {
    mockPrisma.routeSheet.findMany.mockResolvedValue([]);
    mockPrisma.routeSheet.count.mockResolvedValue(0);

    await GET(req());
    const a1 = mockPrisma.routeSheet.findMany.mock.calls[0]?.[0] as {
      where: { archived?: boolean };
    };
    expect(a1.where.archived).toBe(false);

    await GET(req("?archived=true"));
    const a2 = mockPrisma.routeSheet.findMany.mock.calls[1]?.[0] as {
      where: { archived?: boolean };
    };
    expect(a2.where.archived).toBeUndefined();
  });

  it("ignores invalid status", async () => {
    mockPrisma.routeSheet.findMany.mockResolvedValueOnce([]);
    mockPrisma.routeSheet.count.mockResolvedValueOnce(0);
    await GET(req("?status=hax"));
    const args = mockPrisma.routeSheet.findMany.mock.calls[0]?.[0] as {
      where: { status?: string };
    };
    expect(args.where.status).toBeUndefined();
  });

  it("clamps pageSize to [10..100]", async () => {
    mockPrisma.routeSheet.findMany.mockResolvedValueOnce([]);
    mockPrisma.routeSheet.count.mockResolvedValueOnce(0);
    await GET(req("?pageSize=5"));
    const args = mockPrisma.routeSheet.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(args.take).toBe(10);
  });
});

describe("POST /api/v1/manager/route-sheets", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({}));
    expect(res.status).toBe(401);
  });

  it("creates draft with createdByUserId (201)", async () => {
    mockPrisma.routeSheet.create.mockResolvedValueOnce({
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
    });
    const res = await POST(postReq({ comment: "тест" }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; status: string };
    expect(json.id).toBe("rs1");
    expect(json.status).toBe("draft");
    const data = mockPrisma.routeSheet.create.mock.calls[0]?.[0] as {
      data: { createdByUserId: string; status: string };
    };
    expect(data.data.createdByUserId).toBe("u1");
    expect(data.data.status).toBe("draft");
  });

  it("400 on invalid body (bad routeId type)", async () => {
    const res = await POST(postReq({ routeId: 123 }));
    expect(res.status).toBe(400);
    expect(mockPrisma.routeSheet.create).not.toHaveBeenCalled();
  });
});
