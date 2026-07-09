import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.MANAGER_JWT_SECRET = "a".repeat(48);

const {
  mockPrisma,
  getCurrentUserMock,
  applyBagStateChangeMock,
  isBeforeTodayMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    bagStateChange: { findUnique: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
  applyBagStateChangeMock: vi.fn(),
  isBeforeTodayMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/bag-state-hooks", () => ({
  applyBagStateChange: (...a: unknown[]) => applyBagStateChangeMock(...a),
  isBeforeToday: (...a: unknown[]) => isBeforeTodayMock(...a),
}));

import { POST } from "./route";

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
const OWNER = { ...WAREHOUSE, id: "o1", role: "owner" as const };

const params = (id: string) => ({ params: Promise.resolve({ id }) });
function postReq(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/bag-state-changes/d1/post",
    { method: "POST" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isBeforeTodayMock.mockReturnValue(false);
});

describe("POST /bag-state-changes/[id]/post", () => {
  it("403 для manager", async () => {
    getCurrentUserMock.mockResolvedValue(MANAGER);
    const res = await POST(postReq(), params("d1"));
    expect(res.status).toBe(403);
  });

  it("404 коли документ не знайдено", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue(null);
    const res = await POST(postReq(), params("d1"));
    expect(res.status).toBe(404);
  });

  it("409 якщо вже проведено", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({
      id: "d1",
      status: "posted",
      docDate: new Date(),
    });
    const res = await POST(postReq(), params("d1"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("already_posted");
  });

  it("409 гард сьогоднішнього дня для warehouse", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({
      id: "d1",
      status: "draft",
      docDate: new Date("2020-01-01"),
    });
    isBeforeTodayMock.mockReturnValue(true);
    const res = await POST(postReq(), params("d1"));
    expect(res.status).toBe(409);
    expect(applyBagStateChangeMock).not.toHaveBeenCalled();
  });

  it("owner обходить гард сьогоднішнього дня і проводить", async () => {
    getCurrentUserMock.mockResolvedValue(OWNER);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({
      id: "d1",
      status: "draft",
      docDate: new Date("2020-01-01"),
    });
    isBeforeTodayMock.mockReturnValue(true);
    applyBagStateChangeMock.mockResolvedValue({
      itemsUpdated: 2,
      videoRemindersCreated: 1,
    });
    const res = await POST(postReq(), params("d1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.itemsUpdated).toBe(2);
  });

  it("200 проводить успішно", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({
      id: "d1",
      status: "draft",
      docDate: new Date(),
    });
    applyBagStateChangeMock.mockResolvedValue({
      itemsUpdated: 1,
      videoRemindersCreated: 0,
    });
    const res = await POST(postReq(), params("d1"));
    expect(res.status).toBe(200);
  });

  it("409 з переліком ненайдених ШК", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    mockPrisma.bagStateChange.findUnique.mockResolvedValue({
      id: "d1",
      status: "draft",
      docDate: new Date(),
    });
    applyBagStateChangeMock.mockRejectedValue(
      new Error("bag_not_found:BC1,BC2"),
    );
    const res = await POST(postReq(), params("d1"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.missingBarcodes).toEqual(["BC1", "BC2"]);
  });
});
