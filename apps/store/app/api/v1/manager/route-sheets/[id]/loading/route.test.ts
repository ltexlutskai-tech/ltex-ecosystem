import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  addLoadingMock,
  deleteLoadingMock,
  updateLoadingMock,
  countersMock,
  RouteSheetLoadingError,
} = vi.hoisted(() => {
  class RouteSheetLoadingError extends Error {
    status: number;
    constructor(message: string, status = 409) {
      super(message);
      this.name = "RouteSheetLoadingError";
      this.status = status;
    }
  }
  return {
    mockPrisma: { routeSheet: { findUnique: vi.fn() } },
    getCurrentUserMock: vi.fn(),
    addLoadingMock: vi.fn(),
    deleteLoadingMock: vi.fn(),
    updateLoadingMock: vi.fn(),
    countersMock: vi.fn(),
    RouteSheetLoadingError,
  };
});

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/route-sheet-loading", () => ({
  addLoadingByBarcode: (...args: unknown[]) => addLoadingMock(...args),
  deleteLoadingRow: (...args: unknown[]) => deleteLoadingMock(...args),
  updateLoadingRow: (...args: unknown[]) => updateLoadingMock(...args),
  computeRouteSheetCounters: (...args: unknown[]) => countersMock(...args),
  RouteSheetLoadingError,
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
const COUNTERS = {
  ordersCount: 1,
  orderedQty: 2,
  loadedQty: 1,
  shortageQty: 1,
};

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/route-sheets/rs1/loading",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
function deleteReq(qs = "?loadingId=ld1"): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/route-sheets/rs1/loading${qs}`,
    { method: "DELETE" },
  );
}
function patchReq(body: unknown, qs = "?loadingId=ld1"): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/route-sheets/rs1/loading${qs}`,
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
  countersMock.mockResolvedValue(COUNTERS);
});

describe("POST .../loading", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ barcode: "123" }), { params });
    expect(res.status).toBe(401);
  });

  it("404 when sheet missing", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ barcode: "123" }), { params });
    expect(res.status).toBe(404);
  });

  it("409 when sheet completed (locked)", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    const res = await POST(postReq({ barcode: "123" }), { params });
    expect(res.status).toBe(409);
    expect(addLoadingMock).not.toHaveBeenCalled();
  });

  it("400 on empty barcode", async () => {
    const res = await POST(postReq({ barcode: "" }), { params });
    expect(res.status).toBe(400);
  });

  it("adds loading row + returns counters (200)", async () => {
    addLoadingMock.mockResolvedValueOnce({
      row: { id: "ld1", barcode: "123", lotId: "l1" },
    });
    const res = await POST(postReq({ barcode: "123" }), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      row: { id: string };
      counters: typeof COUNTERS;
    };
    expect(json.row.id).toBe("ld1");
    expect(json.counters.shortageQty).toBe(1);
    expect(addLoadingMock).toHaveBeenCalledWith(
      "rs1",
      "123",
      "u1",
      expect.any(Date),
      {
        targetOrderId: null,
      },
    );
  });

  it("скан у виділене замовлення (orderId) → targetOrderId", async () => {
    addLoadingMock.mockResolvedValueOnce({ row: { id: "ld2" } });
    const res = await POST(postReq({ barcode: "123", orderId: "o1" }), {
      params,
    });
    expect(res.status).toBe(200);
    expect(addLoadingMock).toHaveBeenCalledWith(
      "rs1",
      "123",
      "u1",
      expect.any(Date),
      { targetOrderId: "o1" },
    );
  });

  it("400 коли без ШК", async () => {
    const res = await POST(postReq({}), { params });
    expect(res.status).toBe(400);
    expect(addLoadingMock).not.toHaveBeenCalled();
  });

  it("409 on foreign active reservation (booking guard)", async () => {
    addLoadingMock.mockRejectedValueOnce(
      new RouteSheetLoadingError("Активна бронь мішка до 01.06.2026", 409),
    );
    const res = await POST(postReq({ barcode: "123" }), { params });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("Активна бронь");
  });

  it("409 on duplicate lot", async () => {
    addLoadingMock.mockRejectedValueOnce(
      new RouteSheetLoadingError("Лот вже додано", 409),
    );
    const res = await POST(postReq({ barcode: "123" }), { params });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Лот вже додано");
  });

  it("404 when barcode not resolved to a lot", async () => {
    addLoadingMock.mockRejectedValueOnce(
      new RouteSheetLoadingError("Не знайдено товар за ШК", 404),
    );
    const res = await POST(postReq({ barcode: "999" }), { params });
    expect(res.status).toBe(404);
  });
});

describe("DELETE .../loading", () => {
  it("400 when loadingId missing", async () => {
    const res = await DELETE(deleteReq("?"), { params });
    expect(res.status).toBe(400);
    expect(deleteLoadingMock).not.toHaveBeenCalled();
  });

  it("409 when sheet completed", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(409);
  });

  it("deletes row + recomputes counters (200)", async () => {
    deleteLoadingMock.mockResolvedValueOnce(undefined);
    const res = await DELETE(deleteReq("?loadingId=ld1"), { params });
    expect(res.status).toBe(200);
    expect(deleteLoadingMock).toHaveBeenCalledWith("rs1", "ld1");
    const json = (await res.json()) as { counters: typeof COUNTERS };
    expect(json.counters.orderedQty).toBe(2);
  });
});

describe("PATCH .../loading", () => {
  it("400 when no fields", async () => {
    const res = await PATCH(patchReq({}), { params });
    expect(res.status).toBe(400);
  });

  it("toggles isReturn + recomputes counters (200)", async () => {
    updateLoadingMock.mockResolvedValueOnce(undefined);
    const res = await PATCH(patchReq({ isReturn: true }), { params });
    expect(res.status).toBe(200);
    expect(updateLoadingMock).toHaveBeenCalledWith("rs1", "ld1", {
      isReturn: true,
    });
  });

  it("409 when sheet completed", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    const res = await PATCH(patchReq({ loaded: false }), { params });
    expect(res.status).toBe(409);
    expect(updateLoadingMock).not.toHaveBeenCalled();
  });
});
