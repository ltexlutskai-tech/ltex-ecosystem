import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
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

const MANAGER_USER = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

function makeReq(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/clients${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

const SAMPLE_CLIENT = {
  id: "c1",
  code1C: "000000001",
  name: "Test Client",
  phonePrimary: "+380501112233",
  city: "Київ",
  region: "Київська",
  debt: { toString: () => "1234.56" },
  overdueDebt: { toString: () => "0.00" },
  daysSinceLastPurchase: 10,
  lastPurchaseAt: new Date("2026-05-01"),
  statusGeneral: { code: "active", label: "Активний", colorHex: "#16a34a" },
  statusOperational: null,
  searchChannel: { code: "google", label: "Google" },
  deliveryMethod: null,
  assignments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.mgrClient.count.mockResolvedValue(1);
  mockPrisma.mgrClient.findMany.mockResolvedValue([SAMPLE_CLIENT]);
});

describe("GET /api/v1/manager/clients", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns paginated list on happy path", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
    expect(json.items).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.page).toBe(1);
    expect(json.pageSize).toBe(50);
    expect(json.totalPages).toBe(1);
  });

  it("applies hideTrash filter by default (excludes 7777-prefixed names)", async () => {
    await GET(makeReq());
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const where = callArgs.where as { AND?: Array<{ NOT?: unknown }> };
    const nots = (where.AND ?? []).filter((c) => "NOT" in c);
    expect(nots.length).toBeGreaterThan(0);
  });

  it("filters by status when query param given", async () => {
    await GET(makeReq("status=inactive"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const where = callArgs.where as {
      AND?: Array<{ statusGeneral?: { code: string } }>;
    };
    const statusFilter = (where.AND ?? []).find(
      (c) => c.statusGeneral !== undefined,
    );
    expect(statusFilter?.statusGeneral?.code).toBe("inactive");
  });

  it("filters by onlyMine using current user id", async () => {
    await GET(makeReq("onlyMine=true"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const where = callArgs.where as {
      AND?: Array<{
        assignments?: { some: { userId: string } };
      }>;
    };
    const mine = (where.AND ?? []).find((c) => c.assignments !== undefined);
    expect(mine?.assignments?.some.userId).toBe("u1");
  });

  it("search query uses OR across name/phone/city/phones[].phone", async () => {
    await GET(makeReq("search=Амер"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const where = callArgs.where as {
      AND?: Array<{ OR?: Array<Record<string, unknown>> }>;
    };
    const searchClause = (where.AND ?? []).find((c) => c.OR !== undefined);
    expect(searchClause?.OR).toHaveLength(4);
  });

  it("respects pagination page=2 pageSize=10", async () => {
    mockPrisma.mgrClient.count.mockResolvedValue(45);
    await GET(makeReq("page=2&pageSize=10"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    expect(callArgs.skip).toBe(10);
    expect(callArgs.take).toBe(10);
  });

  it("returns 400 on invalid pageSize", async () => {
    const res = await GET(makeReq("pageSize=500"));
    expect(res.status).toBe(400);
  });

  it("maps debt to string in response", async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as { items: Array<{ debt: string }> };
    expect(json.items[0]?.debt).toBe("1234.56");
  });
});
