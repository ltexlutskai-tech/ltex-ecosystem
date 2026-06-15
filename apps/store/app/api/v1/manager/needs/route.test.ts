import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { getCurrentUserMock, computeNeedsMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  computeNeedsMock: vi.fn(),
}));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/needs", () => ({
  computeNeeds: (...args: unknown[]) => computeNeedsMock(...args),
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

function req(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/needs${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  computeNeedsMock.mockResolvedValue({ products: [], byAgent: [], orders: [] });
});

describe("GET /api/v1/manager/needs", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(computeNeedsMock).not.toHaveBeenCalled();
  });

  it("returns { products, byAgent, orders } shape", async () => {
    computeNeedsMock.mockResolvedValueOnce({
      products: [
        {
          productId: "p1",
          articleCode: "A1",
          name: "Сорочки",
          unit: "кг",
          ordered: 30,
          available: 10,
          needed: 20,
        },
      ],
      byAgent: [],
      orders: [],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      products: Array<{ needed: number }>;
      byAgent: unknown[];
      orders: unknown[];
    };
    expect(json.products[0]?.needed).toBe(20);
    expect(json.byAgent).toEqual([]);
    expect(json.orders).toEqual([]);
  });

  it("passes the viewer to computeNeeds (scope enforced inside helper)", async () => {
    await GET(req());
    const args = computeNeedsMock.mock.calls[0] as [unknown, { id: string }];
    expect(args[1].id).toBe("u1");
  });

  it("defaults deficitOnly=true and parses filters", async () => {
    await GET(
      req("?clientId=c1&agentUserId=ag1&city=Луцьк&dateFrom=2026-05-01"),
    );
    const filters = computeNeedsMock.mock.calls[0]?.[0] as {
      clientId?: string;
      agentUserId?: string;
      city?: string;
      dateFrom?: Date;
      deficitOnly?: boolean;
    };
    expect(filters.clientId).toBe("c1");
    expect(filters.agentUserId).toBe("ag1");
    expect(filters.city).toBe("Луцьк");
    expect(filters.dateFrom).toBeInstanceOf(Date);
    expect(filters.deficitOnly).toBe(true);
  });

  it("deficitOnly=false disables the deficit filter", async () => {
    await GET(req("?deficitOnly=false"));
    const filters = computeNeedsMock.mock.calls[0]?.[0] as {
      deficitOnly?: boolean;
    };
    expect(filters.deficitOnly).toBe(false);
  });
});
