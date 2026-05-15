import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: { findUnique: vi.fn() },
    order: { findMany: vi.fn(), count: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { GET } from "./route";

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
  return new NextRequest(
    `http://localhost/api/v1/manager/clients/c1/orders${qs}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

describe("GET /api/v1/manager/clients/[id]/orders", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 if client not found", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 if client belongs to another manager", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
      agentUserId: "other-user",
      assignments: [],
    });
    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("returns empty list when client.code1C is null", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: null,
      agentUserId: MANAGER.id,
      assignments: [],
    });
    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; total: number };
    expect(json.items).toEqual([]);
    expect(json.total).toBe(0);
    expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
  });

  it("returns orders for manager-owned client", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
      agentUserId: null,
      assignments: [{ id: "a1" }],
    });
    mockPrisma.order.findMany.mockResolvedValueOnce([
      {
        id: "ord1",
        code1C: "000000123",
        status: "approved",
        totalEur: 100,
        totalUah: 4300,
        createdAt: new Date("2026-05-10T10:00:00Z"),
        _count: { items: 5 },
      },
    ]);
    mockPrisma.order.count.mockResolvedValueOnce(1);

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ id: string; code1C: string; itemCount: number }>;
      total: number;
    };
    expect(json.total).toBe(1);
    expect(json.items[0]?.id).toBe("ord1");
    expect(json.items[0]?.itemCount).toBe(5);
  });

  it("admin can see orders for any client", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      code1C: "000001",
      agentUserId: "someone-else",
      assignments: [],
    });
    mockPrisma.order.findMany.mockResolvedValueOnce([]);
    mockPrisma.order.count.mockResolvedValueOnce(0);

    const res = await GET(req(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
  });
});
