import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { getCurrentUserMock, findUniqueMock, updateMock, deleteNpTtnMock } =
  vi.hoisted(() => ({
    getCurrentUserMock: vi.fn(),
    findUniqueMock: vi.fn(),
    updateMock: vi.fn(),
    deleteNpTtnMock: vi.fn(),
  }));

vi.mock("@ltex/db", () => ({
  prisma: {
    sale: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      update: (...a: unknown[]) => updateMock(...a),
    },
  },
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
}));
vi.mock("@/lib/delivery/create-ttn-for-sale", () => ({
  deleteNpTtnForSale: (...a: unknown[]) => deleteNpTtnMock(...a),
}));

import { POST } from "./route";

const WAREHOUSE = { id: "u1", role: "warehouse" as const };

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/np-registers/ttn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(WAREHOUSE);
  findUniqueMock.mockResolvedValue({
    ttnRef: "ttn-ref-1",
    expressWaybill: "20450000000000",
  });
  updateMock.mockResolvedValue({});
  deleteNpTtnMock.mockResolvedValue({ state: "deleted" });
});

describe("POST /api/v1/manager/np-registers/ttn", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ saleId: "s1" }));
    expect(res.status).toBe(401);
    expect(deleteNpTtnMock).not.toHaveBeenCalled();
  });

  it("returns 403 for wrong role", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "u2", role: "manager" });
    const res = await POST(postReq({ saleId: "s1" }));
    expect(res.status).toBe(403);
    expect(deleteNpTtnMock).not.toHaveBeenCalled();
  });

  it("returns 404 when sale missing", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ saleId: "nope" }));
    expect(res.status).toBe(404);
    expect(deleteNpTtnMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("deleted → clears TTN fields on the sale + ok", async () => {
    const res = await POST(postReq({ saleId: "s1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state).toBe("deleted");
    expect(deleteNpTtnMock).toHaveBeenCalledWith("ttn-ref-1", "20450000000000");
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { ttnRef: null, expressWaybill: null, ttnCreatedAt: null },
    });
  });

  it("in-transit → 409 and does not update the sale", async () => {
    deleteNpTtnMock.mockResolvedValueOnce({ state: "in-transit" });
    const res = await POST(postReq({ saleId: "s1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/в дорозі/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("error → 502 and does not update the sale", async () => {
    deleteNpTtnMock.mockResolvedValueOnce({
      state: "error",
      error: "НП відхилив видалення",
    });
    const res = await POST(postReq({ saleId: "s1" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("НП відхилив видалення");
    expect(updateMock).not.toHaveBeenCalled();
  });
});
