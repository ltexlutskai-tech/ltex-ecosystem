import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, logAuditEventMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      product: { updateMany: vi.fn() },
      mgrClient: { updateMany: vi.fn() },
      order: { updateMany: vi.fn() },
      sale: { updateMany: vi.fn() },
      category: { findUnique: vi.fn() },
      mgrClientStatus: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      mgrCategoryTT: { findUnique: vi.fn() },
      mgrDeliveryMethod: { findUnique: vi.fn() },
      mgrSearchChannel: { findUnique: vi.fn() },
      mgrRoute: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
    getCurrentUserMock: vi.fn(),
    logAuditEventMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

vi.mock("@/lib/audit/audit-log", () => ({
  logAuditEvent: (...a: unknown[]) => logAuditEventMock(...a),
}));

import { POST } from "./route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/bulk-edit", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const ADMIN = {
  id: "admin1",
  email: "admin@example.com",
  fullName: "Admin",
  role: "admin" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

const MANAGER = { ...ADMIN, id: "m1", role: "manager" as const };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(ADMIN);
  // $transaction(cb) → run the callback with the mock tx (same prisma mock).
  mockPrisma.$transaction.mockImplementation(async (cb: unknown) => {
    if (typeof cb === "function") {
      return (cb as (tx: typeof mockPrisma) => unknown)(mockPrisma);
    }
    return undefined;
  });
  mockPrisma.product.updateMany.mockResolvedValue({ count: 3 });
  mockPrisma.mgrClient.updateMany.mockResolvedValue({ count: 2 });
  mockPrisma.order.updateMany.mockResolvedValue({ count: 4 });
  mockPrisma.sale.updateMany.mockResolvedValue({ count: 5 });
  mockPrisma.category.findUnique.mockResolvedValue({ id: "cat1" });
  mockPrisma.mgrClientStatus.findUnique.mockResolvedValue({ id: "st1" });
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" });
  mockPrisma.mgrCategoryTT.findUnique.mockResolvedValue({ id: "ctt1" });
  mockPrisma.mgrDeliveryMethod.findUnique.mockResolvedValue({ id: "dm1" });
  mockPrisma.mgrSearchChannel.findUnique.mockResolvedValue({ id: "sc1" });
  mockPrisma.mgrRoute.findUnique.mockResolvedValue({ id: "rt1" });
});

const OWNER = { ...ADMIN, id: "o1", role: "owner" as const };

describe("POST /api/v1/manager/bulk-edit", () => {
  it("401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({
        entity: "product",
        fieldKey: "packaging",
        value: "box",
        ids: ["a"],
      }),
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("403 when role may not manage the field", async () => {
    getCurrentUserMock.mockResolvedValueOnce(MANAGER);
    const res = await POST(
      makeReq({
        entity: "product",
        fieldKey: "packaging",
        value: "box",
        ids: ["a"],
      }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("400 for unknown entity / field", async () => {
    const r1 = await POST(
      makeReq({
        entity: "orders",
        fieldKey: "packaging",
        value: "box",
        ids: ["a"],
      }),
    );
    expect(r1.status).toBe(400);
    const r2 = await POST(
      makeReq({
        entity: "product",
        fieldKey: "priceEur",
        value: 5,
        ids: ["a"],
      }),
    );
    expect(r2.status).toBe(400);
  });

  it("400 for invalid enum value", async () => {
    const res = await POST(
      makeReq({
        entity: "product",
        fieldKey: "packaging",
        value: "sack",
        ids: ["a"],
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("400 when no ids", async () => {
    const res = await POST(
      makeReq({
        entity: "product",
        fieldKey: "packaging",
        value: "box",
        ids: [],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("updates mapped column with ids and fires audit", async () => {
    const res = await POST(
      makeReq({
        entity: "product",
        fieldKey: "packaging",
        value: "box",
        ids: ["a", "b", "a"], // duplicate is deduped
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; updated: number };
    expect(json).toEqual({ ok: true, updated: 3 });
    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
      data: { packaging: "box" }, // fieldKey → real column
    });
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    const auditArg = logAuditEventMock.mock.calls[0]?.[0] as {
      resource: string;
      action: string;
    };
    expect(auditArg.resource).toBe("bulk:product.packaging");
    expect(auditArg.action).toBe("update");
  });

  it("clears a nullable field when value=null", async () => {
    const res = await POST(
      makeReq({
        entity: "product",
        fieldKey: "packaging",
        value: null,
        ids: ["a"],
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a"] } },
      data: { packaging: null },
    });
  });

  it("validates category existence before update", async () => {
    mockPrisma.category.findUnique.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({
        entity: "product",
        fieldKey: "categoryId",
        value: "missing",
        ids: ["a"],
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("updates client select field (checks reference, maps model)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(OWNER);
    const res = await POST(
      makeReq({
        entity: "client",
        fieldKey: "agentUserId",
        value: "u1",
        ids: ["c1", "c2"],
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; updated: number };
    expect(json).toEqual({ ok: true, updated: 2 });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { id: true },
    });
    expect(mockPrisma.mgrClient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1", "c2"] } },
      data: { agentUserId: "u1" },
    });
    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("clears a nullable client select field when value=null", async () => {
    getCurrentUserMock.mockResolvedValueOnce(OWNER);
    const res = await POST(
      makeReq({
        entity: "client",
        fieldKey: "statusGeneralId",
        value: null,
        ids: ["c1"],
      }),
    );
    expect(res.status).toBe(200);
    // null → no reference check.
    expect(mockPrisma.mgrClientStatus.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.mgrClient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1"] } },
      data: { statusGeneralId: null },
    });
  });

  it("400 when client reference id is missing", async () => {
    getCurrentUserMock.mockResolvedValueOnce(OWNER);
    mockPrisma.mgrRoute.findUnique.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({
        entity: "client",
        fieldKey: "primaryRouteId",
        value: "ghost",
        ids: ["c1"],
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("Значення не знайдено");
    expect(mockPrisma.mgrClient.updateMany).not.toHaveBeenCalled();
  });

  it("updates order boolean flag via order model", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    const res = await POST(
      makeReq({
        entity: "order",
        fieldKey: "archived",
        value: true,
        ids: ["o1", "o2"],
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; updated: number };
    expect(json).toEqual({ ok: true, updated: 4 });
    expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["o1", "o2"] } },
      data: { archived: true },
    });
  });

  it("updates sale boolean flag via sale model", async () => {
    getCurrentUserMock.mockResolvedValueOnce(OWNER);
    const res = await POST(
      makeReq({
        entity: "sale",
        fieldKey: "isActual",
        value: false,
        ids: ["s1"],
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; updated: number };
    expect(json).toEqual({ ok: true, updated: 5 });
    expect(mockPrisma.sale.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["s1"] } },
      data: { isActual: false },
    });
  });

  it("403 for manager on client/order/sale fields", async () => {
    getCurrentUserMock.mockResolvedValue(MANAGER);
    const rClient = await POST(
      makeReq({
        entity: "client",
        fieldKey: "agentUserId",
        value: "u1",
        ids: ["c1"],
      }),
    );
    expect(rClient.status).toBe(403);
    const rOrder = await POST(
      makeReq({
        entity: "order",
        fieldKey: "archived",
        value: true,
        ids: ["o1"],
      }),
    );
    expect(rOrder.status).toBe(403);
    expect(mockPrisma.mgrClient.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
  });
});
