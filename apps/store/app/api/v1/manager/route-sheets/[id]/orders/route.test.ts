import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  addOrdersMock,
  removeOrderMock,
  reorderMock,
  RouteSheetFillError,
} = vi.hoisted(() => {
  class RouteSheetFillError extends Error {
    status: number;
    constructor(message: string, status = 409) {
      super(message);
      this.name = "RouteSheetFillError";
      this.status = status;
    }
  }
  return {
    mockPrisma: { routeSheet: { findUnique: vi.fn() } },
    getCurrentUserMock: vi.fn(),
    addOrdersMock: vi.fn(),
    removeOrderMock: vi.fn(),
    reorderMock: vi.fn(),
    RouteSheetFillError,
  };
});

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/route-sheet-fill", () => ({
  addOrdersToRouteSheet: (...args: unknown[]) => addOrdersMock(...args),
  removeOrderFromRouteSheet: (...args: unknown[]) => removeOrderMock(...args),
  reorderRouteSheetOrders: (...args: unknown[]) => reorderMock(...args),
  RouteSheetFillError,
}));

import { POST, DELETE, PATCH } from "./route";

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

const params = Promise.resolve({ id: "rs1" });

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/route-sheets/rs1/orders",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
function deleteReq(qs = "?orderId=o1"): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/route-sheets/rs1/orders${qs}`,
    { method: "DELETE" },
  );
}
function patchReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/route-sheets/rs1/orders",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  mockPrisma.routeSheet.findUnique.mockResolvedValue({
    id: "rs1",
    status: "draft",
  });
});

describe("POST .../orders", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ orderIds: ["o1"] }), { params });
    expect(res.status).toBe(401);
  });

  it("404 when sheet missing", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ orderIds: ["o1"] }), { params });
    expect(res.status).toBe(404);
  });

  it("409 when sheet completed (locked)", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    const res = await POST(postReq({ orderIds: ["o1"] }), { params });
    expect(res.status).toBe(409);
    expect(addOrdersMock).not.toHaveBeenCalled();
  });

  it("400 on empty orderIds", async () => {
    const res = await POST(postReq({ orderIds: [] }), { params });
    expect(res.status).toBe(400);
  });

  it("adds orders (200)", async () => {
    addOrdersMock.mockResolvedValueOnce({
      totalEur: 100,
      totalUah: 4300,
      added: 1,
    });
    const res = await POST(postReq({ orderIds: ["o1"] }), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { added: number };
    expect(json.added).toBe(1);
    expect(addOrdersMock).toHaveBeenCalledWith("rs1", ["o1"]);
  });

  it("409 when order already on another route (RouteSheetFillError)", async () => {
    addOrdersMock.mockRejectedValueOnce(
      new RouteSheetFillError("Замовлення вже в іншому маршруті", 409),
    );
    const res = await POST(postReq({ orderIds: ["o1"] }), { params });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Замовлення вже в іншому маршруті");
  });

  it("404 when order not found (RouteSheetFillError 404)", async () => {
    addOrdersMock.mockRejectedValueOnce(
      new RouteSheetFillError("Замовлення не знайдено", 404),
    );
    const res = await POST(postReq({ orderIds: ["ghost"] }), { params });
    expect(res.status).toBe(404);
  });
});

describe("DELETE .../orders", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(401);
  });

  it("400 when orderId missing", async () => {
    const res = await DELETE(deleteReq("?"), { params });
    expect(res.status).toBe(400);
    expect(removeOrderMock).not.toHaveBeenCalled();
  });

  it("409 when sheet completed", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(409);
  });

  it("removes order (200)", async () => {
    removeOrderMock.mockResolvedValueOnce({ totalEur: 0, totalUah: 0 });
    const res = await DELETE(deleteReq("?orderId=o1"), { params });
    expect(res.status).toBe(200);
    expect(removeOrderMock).toHaveBeenCalledWith("rs1", "o1");
  });
});

describe("PATCH .../orders (reorder)", () => {
  it("409 when sheet completed", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    const res = await PATCH(patchReq({ orderIds: ["o2", "o1"] }), { params });
    expect(res.status).toBe(409);
    expect(reorderMock).not.toHaveBeenCalled();
  });

  it("400 on empty orderIds", async () => {
    const res = await PATCH(patchReq({ orderIds: [] }), { params });
    expect(res.status).toBe(400);
    expect(reorderMock).not.toHaveBeenCalled();
  });

  it("reorders (200)", async () => {
    reorderMock.mockResolvedValueOnce(undefined);
    const res = await PATCH(patchReq({ orderIds: ["o2", "o1"] }), { params });
    expect(res.status).toBe(200);
    expect(reorderMock).toHaveBeenCalledWith("rs1", ["o2", "o1"]);
  });
});
