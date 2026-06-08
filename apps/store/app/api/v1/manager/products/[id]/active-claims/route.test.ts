import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { getCurrentUserMock, getProductClaimsMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getProductClaimsMock: vi.fn(),
}));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/product-claims", () => ({
  getProductClaims: (...args: unknown[]) => getProductClaimsMock(...args),
}));

import { GET } from "./route";

const USER = {
  id: "u1",
  email: "a@b",
  fullName: "A",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
});

function req(id: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/products/${id}/active-claims`,
  );
}

describe("GET /api/v1/manager/products/[id]/active-claims", () => {
  it("повертає 401 коли не авторизований", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req("p1"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(401);
  });

  it("повертає shape ProductClaims з усіма полями", async () => {
    getProductClaimsMock.mockResolvedValueOnce({
      productId: "p1",
      totalWeight: 35.5,
      totalQuantity: 2,
      ordersCount: 1,
      managersCount: 1,
      orders: [
        {
          id: "o1",
          customerName: "Іван",
          agentName: "Петро",
          weight: 35.5,
          quantity: 2,
          status: "sent",
          createdAt: "2026-05-01T00:00:00.000Z",
          isMine: true,
        },
      ],
    });
    const res = await GET(req("p1"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalWeight).toBe(35.5);
    expect(body.totalQuantity).toBe(2);
    expect(body.ordersCount).toBe(1);
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].isMine).toBe(true);
  });

  it("пробрасає productId та currentUserId у getProductClaims", async () => {
    getProductClaimsMock.mockResolvedValueOnce({
      productId: "p1",
      totalWeight: 0,
      totalQuantity: 0,
      ordersCount: 0,
      managersCount: 0,
      orders: [],
    });
    await GET(req("p1"), { params: Promise.resolve({ id: "p1" }) });
    expect(getProductClaimsMock).toHaveBeenCalledWith("p1", "u1");
  });
});
