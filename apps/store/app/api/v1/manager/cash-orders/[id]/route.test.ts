import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  getMyClientCodesMock,
  recomputeDebtMock,
  resolveClientIdMock,
} = vi.hoisted(() => ({
  mockPrisma: {
    mgrCashOrder: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    mgrDebtMovement: { findMany: vi.fn(), deleteMany: vi.fn() },
    customer: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  getCurrentUserMock: vi.fn(),
  getMyClientCodesMock: vi.fn(),
  recomputeDebtMock: vi.fn(),
  resolveClientIdMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/sale-ownership", () => ({
  getMyClientCodes1C: (...args: unknown[]) => getMyClientCodesMock(...args),
}));
vi.mock("@/lib/manager/debt-register", () => ({
  recomputeDebtForClients: (...args: unknown[]) => recomputeDebtMock(...args),
  resolveClientIdByCustomer: (...args: unknown[]) =>
    resolveClientIdMock(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { DELETE } from "./route";

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

function delReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/cash-orders/co1", {
    method: "DELETE",
  });
}

function wireTx() {
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  getMyClientCodesMock.mockResolvedValue(null); // admin-like scope by default
  mockPrisma.mgrDebtMovement.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.mgrCashOrder.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.mgrCashOrder.delete.mockResolvedValue({ id: "co1" });
  recomputeDebtMock.mockResolvedValue(1);
});

describe("DELETE /api/v1/manager/cash-orders/[id]", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "co1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role cannot delete (bookkeeper)", async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      ...MANAGER,
      role: "bookkeeper" as const,
    });
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "co1" }),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrCashOrder.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when cash order missing", async () => {
    mockPrisma.mgrCashOrder.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "co1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when manager scope excludes the payer", async () => {
    getMyClientCodesMock.mockResolvedValueOnce(["999"]); // not the payer code
    mockPrisma.mgrCashOrder.findUnique.mockResolvedValueOnce({
      id: "co1",
      customerId: "c1",
      sale: null,
      customer: { code1C: "000001" },
    });
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "co1" }),
    });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrCashOrder.delete).not.toHaveBeenCalled();
  });

  it("deletes income order + reverses debt movement + drops paired change order", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.mgrCashOrder.findUnique.mockResolvedValueOnce({
      id: "co1",
      customerId: "c1",
      sale: null,
      customer: { code1C: "000001" },
    });
    mockPrisma.mgrDebtMovement.findMany.mockResolvedValueOnce([
      { clientId: "client1" },
    ]);
    wireTx();

    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "co1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(mockPrisma.mgrDebtMovement.deleteMany).toHaveBeenCalledWith({
      where: { sourceType: "cash_order", sourceId: "co1" },
    });
    // Парний ордер-здача (changeForId === co1) видаляється.
    expect(mockPrisma.mgrCashOrder.deleteMany).toHaveBeenCalledWith({
      where: { changeForId: "co1" },
    });
    expect(mockPrisma.mgrCashOrder.delete).toHaveBeenCalledWith({
      where: { id: "co1" },
    });
    expect(recomputeDebtMock).toHaveBeenCalledWith(mockPrisma, ["client1"]);
  });

  it("deletes order with no debt movement + recomputes payer via resolver", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.mgrCashOrder.findUnique.mockResolvedValueOnce({
      id: "co1",
      customerId: "c1",
      sale: null,
      customer: { code1C: "000001" },
    });
    mockPrisma.mgrDebtMovement.findMany.mockResolvedValueOnce([]);
    resolveClientIdMock.mockResolvedValueOnce("client1");
    wireTx();

    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "co1" }),
    });
    expect(res.status).toBe(200);
    expect(resolveClientIdMock).toHaveBeenCalledWith(mockPrisma, "c1");
    expect(recomputeDebtMock).toHaveBeenCalledWith(mockPrisma, ["client1"]);
  });
});
