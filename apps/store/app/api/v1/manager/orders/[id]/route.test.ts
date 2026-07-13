import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  canViewOrderMock,
  updateOrderWithItemsMock,
  findOtherActiveOrderMock,
  removeSaleMovementsMock,
  recomputeDebtForClientsSafeMock,
  FakePrismaError,
} = vi.hoisted(() => {
  class FakePrismaError extends Error {
    code: string;
    constructor(code: string, message = "fake") {
      super(message);
      this.code = code;
    }
  }
  const orderUpdate = vi.fn();
  const orderDelete = vi.fn();
  const saleDeleteMany = vi.fn();
  const lotUpdateMany = vi.fn();
  const debtDeleteMany = vi.fn();
  return {
    mockPrisma: {
      order: {
        findUnique: vi.fn(),
        delete: orderDelete,
        update: orderUpdate,
      },
      sale: { deleteMany: saleDeleteMany },
      lot: { updateMany: lotUpdateMany },
      mgrDebtMovement: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          order: { update: orderUpdate, delete: orderDelete },
          sale: { deleteMany: saleDeleteMany },
          lot: { updateMany: lotUpdateMany },
          mgrDebtMovement: { deleteMany: debtDeleteMany },
        }),
      ),
    },
    getCurrentUserMock: vi.fn(),
    canViewOrderMock: vi.fn(),
    updateOrderWithItemsMock: vi.fn(),
    findOtherActiveOrderMock: vi.fn(),
    removeSaleMovementsMock: vi.fn(),
    recomputeDebtForClientsSafeMock: vi.fn(),
    FakePrismaError,
  };
});

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: FakePrismaError },
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/order-ownership", () => ({
  canViewOrder: (...args: unknown[]) => canViewOrderMock(...args),
}));
vi.mock("@/lib/manager/order-create", () => ({
  updateOrderWithItems: (...args: unknown[]) =>
    updateOrderWithItemsMock(...args),
}));
vi.mock("@/lib/manager/order-active-guard", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/manager/order-active-guard")
  >("@/lib/manager/order-active-guard");
  return {
    ...actual,
    findOtherActiveOrder: (...args: unknown[]) =>
      findOtherActiveOrderMock(...args),
  };
});
vi.mock("@/lib/manager/site-order-reminders", () => ({
  completeSiteOrderReminders: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/manager/sale-movement-hooks", () => ({
  removeSaleMovements: (...args: unknown[]) => removeSaleMovementsMock(...args),
}));
vi.mock("@/lib/manager/debt-register", () => ({
  recomputeDebtForClientsSafe: (...args: unknown[]) =>
    recomputeDebtForClientsSafeMock(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { GET, PATCH, DELETE } from "./route";

function delReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/orders/ord1", {
    method: "DELETE",
  });
}

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

function req(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/orders/ord1");
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/orders/ord1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_PATCH_BODY = {
  items: [{ productId: "p1", weight: 10, quantity: 1, priceEur: 50 }],
  overdueDays: 14,
  notes: "оновлено",
};

function fakeUpdatedOrder(status = "draft") {
  return {
    id: "ord1",
    code1C: null,
    status,
    totalEur: 50,
    totalUah: 2150,
    exchangeRate: 43,
    notes: "оновлено",
    priceTypeId: null,
    deliveryMethod: null,
    cashOnDelivery: false,
    assignedAgentUserId: "u1",
    exportTo1C: true,
    updatedAt: new Date("2026-05-21T10:00:00Z"),
    customer: { id: "c1", code1C: "000001", name: "X" },
    items: [
      {
        id: "i1",
        productId: "p1",
        lotId: null,
        priceEur: 50,
        weight: 10,
        quantity: 1,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  canViewOrderMock.mockResolvedValue(true);
});

describe("GET /api/v1/manager/orders/[id]", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "ord1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when manager has no permission", async () => {
    canViewOrderMock.mockResolvedValueOnce(false);
    const res = await GET(req(), { params: Promise.resolve({ id: "ord1" }) });
    expect(res.status).toBe(404);
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when order missing", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "ord1" }) });
    expect(res.status).toBe(404);
  });

  it("returns full order on success", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      code1C: "000000123",
      status: "approved",
      totalEur: 100,
      totalUah: 4300,
      exchangeRate: 43,
      notes: null,
      createdAt: new Date("2026-05-10T10:00:00Z"),
      updatedAt: new Date("2026-05-10T10:00:00Z"),
      customer: {
        id: "c1",
        name: "X",
        code1C: "000001",
        phone: null,
        city: null,
      },
      items: [
        {
          id: "i1",
          weight: 10,
          quantity: 1,
          priceEur: 5,
          product: { id: "p1", name: "Prod", slug: "prod" },
          lot: { id: "l1", barcode: "L0001" },
        },
      ],
      shipments: [],
      payments: [],
    });

    const res = await GET(req(), { params: Promise.resolve({ id: "ord1" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      order: { id: string; items: Array<{ id: string }> };
    };
    expect(json.order.id).toBe("ord1");
    expect(json.order.items).toHaveLength(1);
  });
});

describe("PATCH /api/v1/manager/orders/[id]", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when manager has no permission (ownership)", async () => {
    canViewOrderMock.mockResolvedValueOnce(false);
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(404);
    expect(updateOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when order missing", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 коли проведене замовлення НЕ актуальне (7.3)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "posted",
      isActual: false,
    });
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(409);
    expect(updateOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it("дозволяє редагувати проведене замовлення поки воно «Актуальне» (7.3)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "posted",
      isActual: true,
    });
    updateOrderWithItemsMock.mockResolvedValueOnce(fakeUpdatedOrder());
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(200);
    expect(updateOrderWithItemsMock).toHaveBeenCalledOnce();
  });

  it("returns 400 on invalid body (empty items)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "draft",
    });
    const res = await PATCH(patchReq({ items: [] }), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(400);
  });

  it("«Зберегти» чернетку → авто-перехід у not_posted (8.1)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "draft",
    });
    updateOrderWithItemsMock.mockResolvedValueOnce(
      fakeUpdatedOrder("not_posted"),
    );
    const res = await PATCH(
      patchReq({
        ...VALID_PATCH_BODY,
        priceTypeId: "pt-1",
        cashOnDelivery: true,
      }),
      { params: Promise.resolve({ id: "ord1" }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { totalEur: number };
    expect(json.totalEur).toBe(50);

    const callArgs = updateOrderWithItemsMock.mock.calls[0] as [
      string,
      { priceTypeId?: string },
      { userId: string },
      { nextStatus?: string },
    ];
    expect(callArgs[0]).toBe("ord1");
    expect(callArgs[1].priceTypeId).toBe("pt-1");
    expect(callArgs[2].userId).toBe("u1");
    // Чернетка при явному збереженні стає «Не проведено».
    expect(callArgs[3].nextStatus).toBe("not_posted");
  });

  it("applies allowed status transition draft → not_posted", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "draft",
    });
    updateOrderWithItemsMock.mockResolvedValueOnce(
      fakeUpdatedOrder("not_posted"),
    );
    const res = await PATCH(
      patchReq({ ...VALID_PATCH_BODY, status: "not_posted" }),
      { params: Promise.resolve({ id: "ord1" }) },
    );
    expect(res.status).toBe(200);
    const callArgs = updateOrderWithItemsMock.mock.calls[0] as [
      string,
      unknown,
      unknown,
      { nextStatus?: string },
    ];
    expect(callArgs[3].nextStatus).toBe("not_posted");
  });

  it("returns 409 on disallowed status transition (draft → pending)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "draft",
    });
    const res = await PATCH(
      patchReq({ ...VALID_PATCH_BODY, status: "pending" }),
      { params: Promise.resolve({ id: "ord1" }) },
    );
    expect(res.status).toBe(409);
    expect(updateOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it("post=true → провести: nextStatus=posted (draft → posted дозволено)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "draft",
    });
    updateOrderWithItemsMock.mockResolvedValueOnce(fakeUpdatedOrder("posted"));
    const res = await PATCH(patchReq({ ...VALID_PATCH_BODY, post: true }), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(200);
    const callArgs = updateOrderWithItemsMock.mock.calls[0] as [
      string,
      unknown,
      unknown,
      { nextStatus?: string },
    ];
    expect(callArgs[3].nextStatus).toBe("posted");
  });

  it("post=true на проведеному-неактуальному → 409 (редагування заборонено)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "posted",
      isActual: false,
    });
    const res = await PATCH(patchReq({ ...VALID_PATCH_BODY, post: true }), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(409);
    expect(updateOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it("ignores status when equal to current (no transition check)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "draft",
    });
    updateOrderWithItemsMock.mockResolvedValueOnce(fakeUpdatedOrder("draft"));
    const res = await PATCH(
      patchReq({ ...VALID_PATCH_BODY, status: "draft" }),
      {
        params: Promise.resolve({ id: "ord1" }),
      },
    );
    expect(res.status).toBe(200);
    const callArgs = updateOrderWithItemsMock.mock.calls[0] as [
      string,
      unknown,
      unknown,
      { nextStatus?: string },
    ];
    expect(callArgs[3].nextStatus).toBeUndefined();
  });

  it("passes isActual through to updateOrderWithItems + returns it", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "draft",
      archived: false,
      closedAt: null,
    });
    updateOrderWithItemsMock.mockResolvedValueOnce({
      ...fakeUpdatedOrder("draft"),
      isActual: false,
    });
    const res = await PATCH(
      patchReq({ ...VALID_PATCH_BODY, isActual: false }),
      { params: Promise.resolve({ id: "ord1" }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { isActual: boolean };
    expect(json.isActual).toBe(false);
    const callArgs = updateOrderWithItemsMock.mock.calls[0] as [
      string,
      { isActual?: boolean },
      unknown,
      unknown,
    ];
    expect(callArgs[1].isActual).toBe(false);
  });

  it("returns 400 when setting isActual=true on archived order", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "draft",
      archived: true,
      closedAt: null,
    });
    const res = await PATCH(patchReq({ ...VALID_PATCH_BODY, isActual: true }), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(400);
    expect(updateOrderWithItemsMock).not.toHaveBeenCalled();
  });

  // ─── Вузьке перемикання «Актуальне» (7.3) ────────────────────────────────
  it("toggle {isActual:true} → 200 коли у клієнта немає інших активних", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "posted",
      archived: false,
      closedAt: null,
      isActual: false,
      customerId: "cust1",
    });
    findOtherActiveOrderMock.mockResolvedValueOnce(null);
    mockPrisma.order.update.mockResolvedValueOnce({
      id: "ord1",
      status: "posted",
      isActual: true,
      version: 2,
    });
    const res = await PATCH(patchReq({ isActual: true }), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(200);
    expect(updateOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it("toggle {isActual:true} → 409 коли у клієнта вже є активне замовлення", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "posted",
      archived: false,
      closedAt: null,
      isActual: false,
      customerId: "cust1",
    });
    findOtherActiveOrderMock.mockResolvedValueOnce({
      id: "ord2",
      code1C: null,
      number1C: "L0000000777",
    });
    const res = await PATCH(patchReq({ isActual: true }), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("active_order_exists");
  });

  it("toggle {isActual:false} → 200 (зняти актуальність завжди можна)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "posted",
      archived: false,
      closedAt: null,
      isActual: true,
      customerId: "cust1",
    });
    mockPrisma.order.update.mockResolvedValueOnce({
      id: "ord1",
      status: "posted",
      isActual: false,
      version: 2,
    });
    const res = await PATCH(patchReq({ isActual: false }), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(200);
    expect(findOtherActiveOrderMock).not.toHaveBeenCalled();
  });

  it("returns 400 on FK violation (Prisma P2003)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "draft",
    });
    updateOrderWithItemsMock.mockRejectedValueOnce(
      new FakePrismaError("P2003"),
    );
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(400);
  });

  it("admin can edit any order (ownership bypassed)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    canViewOrderMock.mockResolvedValueOnce(true);
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      status: "not_posted",
    });
    updateOrderWithItemsMock.mockResolvedValueOnce(
      fakeUpdatedOrder("not_posted"),
    );
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/manager/orders/[id]", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role cannot delete (analyst)", async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      ...MANAGER,
      role: "analyst" as const,
    });
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.order.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when manager has no permission", async () => {
    canViewOrderMock.mockResolvedValueOnce(false);
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(404);
    expect(mockPrisma.order.delete).not.toHaveBeenCalled();
  });

  it("deletes order on success (no linked sales / lots)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      sales: [],
      items: [],
    });
    mockPrisma.order.delete.mockResolvedValueOnce({ id: "ord1" });
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(mockPrisma.order.delete).toHaveBeenCalledWith({
      where: { id: "ord1" },
    });
  });

  it("видаляє пов'язані реалізації + звільняє лоти + реверс рухів (8.1)", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      sales: [{ id: "sale1", code1C: null, customerId: "cust1" }],
      items: [{ lotId: "lot1" }, { lotId: null }],
    });
    mockPrisma.mgrDebtMovement.findMany.mockResolvedValueOnce([
      { clientId: "mgrc1" },
    ]);
    mockPrisma.order.delete.mockResolvedValueOnce({ id: "ord1" });
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(200);
    // Пов'язана реалізація видалена, лот звільнено, рухи реверснуто.
    expect(mockPrisma.sale.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["sale1"] } },
    });
    expect(mockPrisma.lot.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["lot1"] }, status: "reserved" },
      data: { status: "free" },
    });
    expect(removeSaleMovementsMock).toHaveBeenCalledWith("sale1");
    expect(recomputeDebtForClientsSafeMock).toHaveBeenCalledWith(["mgrc1"]);
  });

  it("returns 404 when order missing", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(404);
  });

  it("admin can delete any order (ownership bypassed)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    canViewOrderMock.mockResolvedValueOnce(true);
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: "ord1",
      sales: [],
      items: [],
    });
    mockPrisma.order.delete.mockResolvedValueOnce({ id: "ord1" });
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "ord1" }),
    });
    expect(res.status).toBe(200);
  });
});
