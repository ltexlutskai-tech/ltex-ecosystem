import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.MANAGER_JWT_SECRET = "a".repeat(48);

const {
  mockPrisma,
  getCurrentUserMock,
  updateBagStateChangeMock,
  removeBagStateChangeMock,
  isBeforeTodayMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    bagStateChange: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
  getCurrentUserMock: vi.fn(),
  updateBagStateChangeMock: vi.fn(),
  removeBagStateChangeMock: vi.fn(),
  isBeforeTodayMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/bag-state", () => ({
  updateBagStateChange: (...a: unknown[]) => updateBagStateChangeMock(...a),
  BAG_STATE_WRITE_ROLES: ["warehouse", "admin", "owner"],
}));
vi.mock("@/lib/manager/bag-state-hooks", () => ({
  removeBagStateChange: (...a: unknown[]) => removeBagStateChangeMock(...a),
  isBeforeToday: (...a: unknown[]) => isBeforeTodayMock(...a),
}));

import { PATCH, DELETE } from "./route";

const WAREHOUSE = {
  id: "w1",
  email: "w@x.c",
  fullName: "Комірник",
  role: "warehouse" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};
const MANAGER = { ...WAREHOUSE, id: "m1", role: "manager" as const };
const ADMIN = { ...WAREHOUSE, id: "a1", role: "admin" as const };

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const validBody = { items: [{ barcode: "BC1" }] };

function patchReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/bag-state-changes/d1",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
function delReq(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/bag-state-changes/d1",
    {
      method: "DELETE",
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isBeforeTodayMock.mockReturnValue(false);
});

describe("PATCH /bag-state-changes/[id]", () => {
  it("403 для manager (нема права запису)", async () => {
    getCurrentUserMock.mockResolvedValue(MANAGER);
    const res = await PATCH(patchReq(validBody), params("d1"));
    expect(res.status).toBe(403);
  });

  it("409 якщо документ не чернетка", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({
      id: "d1",
      status: "posted",
      docDate: new Date(),
    });
    const res = await PATCH(patchReq(validBody), params("d1"));
    expect(res.status).toBe(409);
  });

  it("409 гард сьогоднішнього дня для warehouse (не admin/owner)", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({
      id: "d1",
      status: "draft",
      docDate: new Date("2020-01-01"),
    });
    isBeforeTodayMock.mockReturnValue(true);
    const res = await PATCH(patchReq(validBody), params("d1"));
    expect(res.status).toBe(409);
    expect(updateBagStateChangeMock).not.toHaveBeenCalled();
  });

  it("admin обходить гард сьогоднішнього дня", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({
      id: "d1",
      status: "draft",
      docDate: new Date("2020-01-01"),
    });
    isBeforeTodayMock.mockReturnValue(true);
    updateBagStateChangeMock.mockResolvedValue({
      id: "d1",
      docNumber: "LT-BSC-1",
    });
    const res = await PATCH(patchReq(validBody), params("d1"));
    expect(res.status).toBe(200);
    expect(updateBagStateChangeMock).toHaveBeenCalledOnce();
  });

  it("200 оновлює чернетку", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({
      id: "d1",
      status: "draft",
      docDate: new Date(),
    });
    updateBagStateChangeMock.mockResolvedValue({
      id: "d1",
      docNumber: "LT-BSC-1",
    });
    const res = await PATCH(patchReq(validBody), params("d1"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /bag-state-changes/[id]", () => {
  it("403 для manager", async () => {
    getCurrentUserMock.mockResolvedValue(MANAGER);
    const res = await DELETE(delReq(), params("d1"));
    expect(res.status).toBe(403);
  });

  it("реверсує історію і видаляє документ", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({ id: "d1" });
    removeBagStateChangeMock.mockResolvedValue(undefined);
    mockPrisma.bagStateChange.delete.mockResolvedValue({ id: "d1" });
    const res = await DELETE(delReq(), params("d1"));
    expect(res.status).toBe(200);
    expect(removeBagStateChangeMock).toHaveBeenCalledWith("d1");
    expect(mockPrisma.bagStateChange.delete).toHaveBeenCalledWith({
      where: { id: "d1" },
    });
  });

  it("404 коли документ не знайдено", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue(null);
    const res = await DELETE(delReq(), params("d1"));
    expect(res.status).toBe(404);
  });
});
