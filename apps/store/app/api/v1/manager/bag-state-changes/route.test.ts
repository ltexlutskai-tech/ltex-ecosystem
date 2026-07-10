import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.MANAGER_JWT_SECRET = "a".repeat(48);

const { mockPrisma, getCurrentUserMock, createBagStateChangeMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      bagStateChange: { findMany: vi.fn(), count: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
    createBagStateChangeMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/bag-state", () => ({
  createBagStateChange: (...a: unknown[]) => createBagStateChangeMock(...a),
  BAG_STATE_WRITE_ROLES: ["warehouse", "admin", "owner"],
}));

import { GET, POST } from "./route";

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

function getReq(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/bag-state-changes${qs}`,
  );
}
function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/bag-state-changes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  items: [{ barcode: "BC1", isOpen: true }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /bag-state-changes", () => {
  it("401 без авторизації", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  it("повертає список для авторизованого", async () => {
    getCurrentUserMock.mockResolvedValue(MANAGER);
    mockPrisma.bagStateChange.findMany.mockResolvedValue([
      {
        id: "d1",
        docNumber: "LT-BSC-202607-0001",
        number1C: null,
        docDate: new Date("2026-07-14T00:00:00Z"),
        status: "draft",
        notes: null,
        _count: { items: 3 },
      },
    ]);
    mockPrisma.bagStateChange.count.mockResolvedValue(1);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(1);
    expect(json.items[0].itemsCount).toBe(3);
  });
});

describe("POST /bag-state-changes", () => {
  it("403 для ролі без права запису (manager)", async () => {
    getCurrentUserMock.mockResolvedValue(MANAGER);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(403);
    expect(createBagStateChangeMock).not.toHaveBeenCalled();
  });

  it("400 на невалідних даних (порожні items)", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    const res = await POST(postReq({ items: [] }));
    expect(res.status).toBe(400);
  });

  it("201 створює документ для warehouse", async () => {
    getCurrentUserMock.mockResolvedValue(WAREHOUSE);
    createBagStateChangeMock.mockResolvedValue({
      id: "new1",
      docNumber: "LT-BSC-202607-0002",
    });
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("new1");
    expect(createBagStateChangeMock).toHaveBeenCalledOnce();
  });
});
