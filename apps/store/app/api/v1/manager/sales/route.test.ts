import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => {
  return {
    mockPrisma: {
      mgrClient: { findMany: vi.fn() },
      sale: { findMany: vi.fn(), count: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
  };
});

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
  return new NextRequest(`http://localhost/api/v1/manager/sales${qs}`);
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
    expect(args.where.OR).toHaveLength(6);
    const json = JSON.stringify(args.where.OR);
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
