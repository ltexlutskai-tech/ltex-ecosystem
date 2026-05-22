import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, getMyClientCodes1CMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrCashOrder: { findMany: vi.fn(), count: vi.fn() },
      sale: { findUnique: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
    getMyClientCodes1CMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
}));
vi.mock("@/lib/manager/sale-ownership", () => ({
  getMyClientCodes1C: (...a: unknown[]) => getMyClientCodes1CMock(...a),
}));
// createCashOrderWithChange imported by route but unused in GET — stub it.
vi.mock("@/lib/manager/cash-order", () => ({
  createCashOrderWithChange: vi.fn(),
}));

import { GET } from "./route";

const MANAGER = { id: "u1", role: "manager" as const };
const ADMIN = { id: "admin1", role: "admin" as const };

function getReq(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/cash-orders${qs}`, {
    method: "GET",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  getMyClientCodes1CMock.mockResolvedValue(["000001"]);
  mockPrisma.mgrCashOrder.findMany.mockResolvedValue([]);
  mockPrisma.mgrCashOrder.count.mockResolvedValue(0);
});

describe("GET /api/v1/manager/cash-orders", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  it("short-circuits manager with 0 clients (no DB query)", async () => {
    getMyClientCodes1CMock.mockResolvedValueOnce([]);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; total: number };
    expect(json.items).toHaveLength(0);
    expect(json.total).toBe(0);
    expect(mockPrisma.mgrCashOrder.findMany).not.toHaveBeenCalled();
  });

  it("admin (null scope) queries without ownership clause", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    getMyClientCodes1CMock.mockResolvedValueOnce(null);
    mockPrisma.mgrCashOrder.findMany.mockResolvedValueOnce([
      {
        id: "co1",
        code1C: null,
        docNumber: 1,
        type: "income",
        documentSumEur: 50,
        archived: false,
        paidAt: new Date(),
        saleId: null,
        customer: { id: "c1", name: "Х", code1C: "X" },
        sale: null,
        bankAccountRef: null,
        cashFlowArticleRef: null,
      },
    ]);
    mockPrisma.mgrCashOrder.count.mockResolvedValueOnce(1);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; total: number };
    expect(json.items).toHaveLength(1);
    expect(json.total).toBe(1);
    const where = mockPrisma.mgrCashOrder.findMany.mock.calls[0]?.[0]
      ?.where as { AND?: unknown };
    expect(where.AND).toBeUndefined();
  });

  it("manager scope passes ownership clause to where", async () => {
    await GET(getReq());
    const where = mockPrisma.mgrCashOrder.findMany.mock.calls[0]?.[0]
      ?.where as { AND?: unknown[] };
    expect(Array.isArray(where.AND)).toBe(true);
  });

  it("clamps pageSize and parses type/archived/search query", async () => {
    await GET(getReq("?type=expense&archived=true&search=42&pageSize=5"));
    const args = mockPrisma.mgrCashOrder.findMany.mock.calls[0]?.[0] as {
      take: number;
      where: { type?: string; archived?: boolean };
    };
    expect(args.take).toBe(20); // 5 clamped to default
    expect(args.where.type).toBe("expense");
    expect(args.where.archived).toBeUndefined(); // archived=true → no filter
  });
});
