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

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));

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
  agent: null,
  assignments: [],
};

function findAndClause<T extends Record<string, unknown>>(
  callArgs: { where: { AND?: T[] } } | undefined,
  predicate: (c: T) => boolean,
): T | undefined {
  return (callArgs?.where.AND ?? []).find(predicate);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  mockPrisma.mgrClient.count.mockResolvedValue(1);
  mockPrisma.mgrClient.findMany.mockResolvedValue([SAMPLE_CLIENT]);
});

describe("GET /api/v1/manager/clients — base behaviour", () => {
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

  it("filters by legacy status code when query param given (back-compat)", async () => {
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

  it("manager — onlyMine URL param ігнорується (ownership enforced server-side)", async () => {
    // M1.3f: для менеджера завжди застосовується ownership filter, незалежно
    // від `onlyMine=true|false` у URL.
    await GET(makeReq("onlyMine=true"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const where = callArgs.where as {
      AND?: Array<{
        OR?: Array<{
          agentUserId?: string;
          assignments?: { some: { userId: string } };
        }>;
      }>;
    };
    const ownershipClause = (where.AND ?? []).find(
      (c) =>
        Array.isArray(c.OR) &&
        c.OR.some((o) => o.agentUserId !== undefined) &&
        c.OR.some((o) => o.assignments !== undefined),
    );
    expect(ownershipClause).toBeDefined();
  });

  it("search query uses OR across name/phone/city/phones[].phone/keywords", async () => {
    await GET(makeReq("search=Амер"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const where = callArgs.where as {
      AND?: Array<{ OR?: Array<Record<string, unknown>> }>;
    };
    const searchClause = (where.AND ?? []).find((c) => c.OR !== undefined);
    expect(searchClause?.OR).toHaveLength(5);
    expect(searchClause?.OR?.some((o) => "keywords" in o)).toBe(true);
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

describe("GET /api/v1/manager/clients — M1.3e extended filters", () => {
  it("multi-select statusId (CSV) → statusGeneralId IN [...]", async () => {
    await GET(makeReq("statusId=s1,s2,s3"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const clause = findAndClause<{ statusGeneralId?: { in: string[] } }>(
      callArgs,
      (c) => c.statusGeneralId !== undefined,
    );
    expect(clause?.statusGeneralId?.in).toEqual(["s1", "s2", "s3"]);
  });

  it("multi-select categoryTTId works", async () => {
    await GET(makeReq("categoryTTId=cat1,cat2"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const clause = findAndClause<{ categoryTTId?: { in: string[] } }>(
      callArgs,
      (c) => c.categoryTTId !== undefined,
    );
    expect(clause?.categoryTTId?.in).toEqual(["cat1", "cat2"]);
  });

  it("debtMin + debtMax range → debt gte/lte", async () => {
    await GET(makeReq("debtMin=100&debtMax=5000"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const clause = findAndClause<{
      debt?: { gte?: number; lte?: number; gt?: number; lt?: number };
    }>(callArgs, (c) => c.debt !== undefined);
    expect(clause?.debt?.gte).toBe(100);
    expect(clause?.debt?.lte).toBe(5000);
    expect(clause?.debt?.gt).toBeUndefined();
  });

  it("debtMin overrides hasDebt boolean", async () => {
    await GET(makeReq("debtMin=100&hasDebt=true"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const where = callArgs.where as {
      AND?: Array<{ debt?: { gte?: number; gt?: number } }>;
    };
    const debtClauses = (where.AND ?? []).filter((c) => c.debt !== undefined);
    expect(debtClauses).toHaveLength(1);
    expect(debtClauses[0]?.debt?.gte).toBe(100);
    expect(debtClauses[0]?.debt?.gt).toBeUndefined();
  });

  it("region LIKE %query% case-insensitive", async () => {
    await GET(makeReq("region=Київська"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const clause = findAndClause<{
      region?: { contains: string; mode: string };
    }>(callArgs, (c) => c.region !== undefined);
    expect(clause?.region?.contains).toBe("Київська");
    expect(clause?.region?.mode).toBe("insensitive");
  });

  it("hasNewMessage boolean → exact match", async () => {
    await GET(makeReq("hasNewMessage=true"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const clause = findAndClause<{ hasNewMessage?: boolean }>(
      callArgs,
      (c) => c.hasNewMessage !== undefined,
    );
    expect(clause?.hasNewMessage).toBe(true);
  });

  it("createdFrom + createdTo date range → createdAt gte/lte", async () => {
    await GET(makeReq("createdFrom=2026-01-01&createdTo=2026-12-31"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const clause = findAndClause<{
      createdAt?: { gte?: Date; lte?: Date };
    }>(callArgs, (c) => c.createdAt !== undefined);
    expect(clause?.createdAt?.gte).toBeInstanceOf(Date);
    expect(clause?.createdAt?.lte).toBeInstanceOf(Date);
  });

  it("agentUserId multi-select → agentUserId IN [...]", async () => {
    await GET(makeReq("agentUserId=u1,u2"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const clause = findAndClause<{ agentUserId?: { in: string[] } }>(
      callArgs,
      (c) => c.agentUserId !== undefined,
    );
    expect(clause?.agentUserId?.in).toEqual(["u1", "u2"]);
  });

  it("overdueDebtMin range → overdueDebt gte", async () => {
    await GET(makeReq("overdueDebtMin=50"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const clause = findAndClause<{ overdueDebt?: { gte?: number } }>(
      callArgs,
      (c) => c.overdueDebt !== undefined,
    );
    expect(clause?.overdueDebt?.gte).toBe(50);
  });

  it("combined filters: status multi + debt range + region", async () => {
    await GET(makeReq("statusId=s1,s2&debtMin=100&debtMax=1000&region=Львів"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const where = callArgs.where as {
      AND?: Array<Record<string, unknown>>;
    };
    const ands = where.AND ?? [];
    expect(ands.find((c) => "statusGeneralId" in c)).toBeDefined();
    expect(ands.find((c) => "debt" in c)).toBeDefined();
    expect(ands.find((c) => "region" in c)).toBeDefined();
  });

  it("empty CSV string skipped (statusId=) — без фільтра", async () => {
    await GET(makeReq("statusId="));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    const where = callArgs.where as {
      AND?: Array<{ statusGeneralId?: { in: string[] } }>;
    };
    const statusClause = (where.AND ?? []).find(
      (c) => c.statusGeneralId !== undefined,
    );
    expect(statusClause).toBeUndefined();
  });
});

describe("GET /api/v1/manager/clients — M1.3f visibility scope", () => {
  const ADMIN_USER = {
    id: "admin1",
    email: "admin@example.com",
    fullName: "Admin",
    role: "admin" as const,
    isActive: true,
    code1C: null,
    telegramLinked: false,
    notifyChannels: [],
    lastSeenAt: null,
  };

  function hasOwnershipClause(
    callArgs: { where: { AND?: Array<{ OR?: unknown }> } } | undefined,
  ): boolean {
    const ands = callArgs?.where.AND ?? [];
    return ands.some((c) => {
      if (!Array.isArray(c.OR)) return false;
      const types = (c.OR as Array<Record<string, unknown>>).map((o) =>
        Object.keys(o).join(","),
      );
      return types.includes("agentUserId") && types.includes("assignments");
    });
  }

  it("manager — ownership filter завжди додається у WHERE", async () => {
    await GET(makeReq());
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    expect(hasOwnershipClause(callArgs)).toBe(true);
  });

  it("manager + ?onlyMine=false → ownership filter ВСЕ ОДНО застосовано", async () => {
    // M1.3f hard rule: менеджер не може bypass-нути ownership через URL.
    await GET(makeReq("onlyMine=false"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    expect(hasOwnershipClause(callArgs)).toBe(true);
  });

  it("admin — без onlyMine — ownership filter не додається", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN_USER);
    await GET(makeReq());
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    expect(hasOwnershipClause(callArgs)).toBe(false);
  });

  it("admin + ?onlyMine=true — opt-in ownership filter", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN_USER);
    await GET(makeReq("onlyMine=true"));
    const callArgs = mockPrisma.mgrClient.findMany.mock.calls[0]?.[0];
    expect(hasOwnershipClause(callArgs)).toBe(true);
  });
});
