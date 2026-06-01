import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, getOwnedClientIdsMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrClient: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
    },
    getCurrentUserMock: vi.fn(),
    getOwnedClientIdsMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

vi.mock("@/lib/manager/client-visibility", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/manager/client-visibility")
  >("@/lib/manager/client-visibility");
  return {
    ...actual,
    getOwnedClientIds: (...args: unknown[]) => getOwnedClientIdsMock(...args),
  };
});

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

const ADMIN_USER = {
  ...MANAGER_USER,
  id: "admin1",
  role: "admin" as const,
};

const SAMPLES = [
  {
    id: "c1",
    code1C: "001",
    name: "Алисів",
    tradePointName: "ТТ-1",
    city: "Київ",
    debt: { toString: () => "100.00" },
    priceTypeId: "pt-1",
    deliveryMethod: { code: "delivery" },
    agent: { id: "u1", fullName: "Alice" },
  },
  {
    id: "c2",
    code1C: "002",
    name: "Богданів",
    tradePointName: "ТТ-2",
    city: "Львів",
    debt: { toString: () => "0.00" },
    priceTypeId: null,
    deliveryMethod: null,
    agent: { id: "u9", fullName: "Олена" },
  },
];

function makeReq(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/clients/search-all${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.mgrClient.count.mockResolvedValue(2);
  mockPrisma.mgrClient.findMany.mockResolvedValue(SAMPLES);
});

describe("GET /api/v1/manager/clients/search-all", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("admin sees all с isOwned=true (no concept «своїх»)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN_USER);
    getOwnedClientIdsMock.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ id: string; isOwned: boolean }>;
    };
    expect(json.items).toHaveLength(2);
    expect(json.items.every((c) => c.isOwned)).toBe(true);
  });

  it("manager sees all clients with mixed isOwned flag", async () => {
    getOwnedClientIdsMock.mockResolvedValueOnce(new Set(["c1"]));
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ id: string; isOwned: boolean }>;
    };
    expect(json.items).toHaveLength(2);
    expect(json.items.find((c) => c.id === "c1")?.isOwned).toBe(true);
    expect(json.items.find((c) => c.id === "c2")?.isOwned).toBe(false);
  });

  it("search query filters by name/tradePointName/code1C/city (OR insensitive)", async () => {
    getOwnedClientIdsMock.mockResolvedValueOnce(new Set());
    await GET(makeReq("q=Алис"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0] as {
      where: { OR?: Array<Record<string, unknown>> };
    };
    expect(callArgs.where.OR).toBeDefined();
    expect(callArgs.where.OR).toHaveLength(6);
  });

  it("pagination — page=2&pageSize=10 → skip=10, take=10", async () => {
    getOwnedClientIdsMock.mockResolvedValueOnce(new Set());
    mockPrisma.mgrClient.count.mockResolvedValueOnce(25);
    await GET(makeReq("page=2&pageSize=10"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0] as {
      skip: number;
      take: number;
    };
    expect(callArgs.skip).toBe(10);
    expect(callArgs.take).toBe(10);
  });

  it("response shape — minimal fields without phones/messengers", async () => {
    getOwnedClientIdsMock.mockResolvedValueOnce(new Set(["c1"]));
    const res = await GET(makeReq());
    const json = (await res.json()) as {
      items: Array<Record<string, unknown>>;
    };
    const item = json.items[0];
    expect(item).toBeDefined();
    expect(Object.keys(item ?? {}).sort()).toEqual(
      [
        "id",
        "code1C",
        "name",
        "tradePointName",
        "city",
        "debt",
        "priceTypeId",
        "deliveryMethodCode",
        "agent",
        "isOwned",
      ].sort(),
    );
    // No phone / messenger / bankAccount keys leaked.
    expect(item).not.toHaveProperty("phonePrimary");
    expect(item).not.toHaveProperty("phones");
    expect(item).not.toHaveProperty("messengers");
    expect(item).not.toHaveProperty("bankAccounts");
  });
});
