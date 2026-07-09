import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const {
  mockPrisma,
  getCurrentUserMock,
  canViewSaleMock,
  updateSaleWithItemsMock,
  updateSaleDraftMock,
  FakePrismaError,
} = vi.hoisted(() => {
  class FakePrismaError extends Error {
    code: string;
    constructor(code: string, message = "fake") {
      super(message);
      this.code = code;
    }
  }
  return {
    mockPrisma: {
      sale: { findUnique: vi.fn(), delete: vi.fn() },
      mgrDebtMovement: { findMany: vi.fn(), deleteMany: vi.fn() },
      $transaction: vi.fn(),
    },
    getCurrentUserMock: vi.fn(),
    canViewSaleMock: vi.fn(),
    updateSaleWithItemsMock: vi.fn(),
    updateSaleDraftMock: vi.fn(),
    recomputeDebtMock: vi.fn(),
    resolveClientIdMock: vi.fn(),
    FakePrismaError,
  };
});

const { recomputeDebtMock, resolveClientIdMock } = vi.hoisted(() => ({
  recomputeDebtMock: vi.fn(),
  resolveClientIdMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: FakePrismaError },
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));
vi.mock("@/lib/manager/sale-ownership", () => ({
  canViewSale: (...args: unknown[]) => canViewSaleMock(...args),
}));
vi.mock("@/lib/manager/sale-create", () => ({
  updateSaleWithItems: (...args: unknown[]) => updateSaleWithItemsMock(...args),
  updateSaleDraft: (...args: unknown[]) => updateSaleDraftMock(...args),
}));
vi.mock("@/lib/manager/debt-register", () => ({
  recomputeDebtForClients: (...args: unknown[]) => recomputeDebtMock(...args),
  resolveClientIdByCustomer: (...args: unknown[]) =>
    resolveClientIdMock(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { GET, PATCH, DELETE } from "./route";

function delReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/sales/sale1", {
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
  return new NextRequest("http://localhost/api/v1/manager/sales/sale1");
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/sales/sale1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_PATCH_BODY = {
  items: [
    { productId: "p1", pricePerKg: 4, weight: 10, quantity: 1, priceEur: 40 },
  ],
  notes: "оновлено",
};

function fakeUpdatedSale(status = "draft") {
  return {
    id: "sale1",
    code1C: null,
    docNumber: 7,
    status,
    totalEur: 40,
    totalUah: 1720,
    exchangeRateEur: 43,
    exchangeRateUsd: 0,
    notes: "оновлено",
    priceTypeId: null,
    deliveryMethod: null,
    novaPoshtaBranch: null,
    cashOnDelivery: false,
    codAmountUah: null,
    assignedAgentUserId: null,
    onTradeAgent: true,
    exportTo1C: true,
    expressWaybill: null,
    updatedAt: new Date("2026-05-21T10:00:00Z"),
    customer: { id: "c1", code1C: "000001", name: "X" },
    items: [
      {
        id: "i1",
        productId: "p1",
        lotId: null,
        barcode: null,
        pricePerKg: 4,
        priceEur: 40,
        weight: 10,
        quantity: 1,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  canViewSaleMock.mockResolvedValue(true);
});

describe("GET /api/v1/manager/sales/[id]", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "sale1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when manager has no permission", async () => {
    canViewSaleMock.mockResolvedValueOnce(false);
    const res = await GET(req(), { params: Promise.resolve({ id: "sale1" }) });
    expect(res.status).toBe(404);
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when sale missing", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "sale1" }) });
    expect(res.status).toBe(404);
  });

  it("returns full sale on success", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      code1C: null,
      docNumber: 7,
      status: "draft",
      totalEur: 40,
      totalUah: 1720,
      exchangeRateEur: 43,
      exchangeRateUsd: 0,
      priceTypeId: null,
      deliveryMethod: null,
      novaPoshtaBranch: null,
      cashOnDelivery: false,
      codAmountUah: null,
      assignedAgentUserId: null,
      onTradeAgent: true,
      exportTo1C: true,
      expressWaybill: null,
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
          pricePerKg: 4,
          priceEur: 40,
          barcode: "B1",
          product: { id: "p1", name: "Prod", slug: "prod" },
          lot: { id: "l1", barcode: "B1" },
        },
      ],
    });

    const res = await GET(req(), { params: Promise.resolve({ id: "sale1" }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      sale: { id: string; docNumber: number; items: Array<{ id: string }> };
    };
    expect(json.sale.id).toBe("sale1");
    expect(json.sale.docNumber).toBe(7);
    expect(json.sale.items).toHaveLength(1);
  });
});

describe("PATCH /api/v1/manager/sales/[id]", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when manager has no permission", async () => {
    canViewSaleMock.mockResolvedValueOnce(false);
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(404);
    expect(updateSaleWithItemsMock).not.toHaveBeenCalled();
  });

  it("returns 409 when sale is posted (locked in 1C)", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "posted",
    });
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(409);
    expect(updateSaleWithItemsMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body (empty items)", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "draft",
    });
    const res = await PATCH(patchReq({ items: [] }), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(400);
  });

  it("updates header + items (no status change)", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "draft",
    });
    updateSaleWithItemsMock.mockResolvedValueOnce(fakeUpdatedSale("draft"));
    const res = await PATCH(
      patchReq({
        ...VALID_PATCH_BODY,
        priceTypeId: "pt-1",
        deliveryMethod: "post",
        cashOnDelivery: true,
      }),
      { params: Promise.resolve({ id: "sale1" }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { totalEur: number; status: string };
    expect(json.totalEur).toBe(40);
    expect(json.status).toBe("draft");

    const callArgs = updateSaleWithItemsMock.mock.calls[0] as [
      string,
      { priceTypeId?: string; deliveryMethod?: string },
      { userId: string },
      { nextStatus?: string },
    ];
    expect(callArgs[0]).toBe("sale1");
    expect(callArgs[1].priceTypeId).toBe("pt-1");
    expect(callArgs[2].userId).toBe("u1");
    expect(callArgs[3].nextStatus).toBeUndefined();
  });

  it("applies allowed status transition draft → sent", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "draft",
    });
    updateSaleWithItemsMock.mockResolvedValueOnce(fakeUpdatedSale("sent"));
    const res = await PATCH(patchReq({ ...VALID_PATCH_BODY, status: "sent" }), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(200);
    const callArgs = updateSaleWithItemsMock.mock.calls[0] as [
      string,
      unknown,
      unknown,
      { nextStatus?: string },
    ];
    expect(callArgs[3].nextStatus).toBe("sent");
  });

  it("returns 409 on disallowed status transition (cancelled → posted)", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "cancelled",
    });
    const res = await PATCH(
      patchReq({ ...VALID_PATCH_BODY, status: "posted" }),
      { params: Promise.resolve({ id: "sale1" }) },
    );
    expect(res.status).toBe(409);
    expect(updateSaleWithItemsMock).not.toHaveBeenCalled();
  });

  it("post=true → провести: nextStatus=posted (draft → posted дозволено)", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "draft",
    });
    updateSaleWithItemsMock.mockResolvedValueOnce(fakeUpdatedSale("posted"));
    const res = await PATCH(patchReq({ ...VALID_PATCH_BODY, post: true }), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(200);
    const callArgs = updateSaleWithItemsMock.mock.calls[0] as [
      string,
      unknown,
      unknown,
      { nextStatus?: string },
    ];
    expect(callArgs[3].nextStatus).toBe("posted");
  });

  it("returns 400 on FK violation (Prisma P2003)", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "draft",
    });
    updateSaleWithItemsMock.mockRejectedValueOnce(new FakePrismaError("P2003"));
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(400);
  });

  it("admin can edit any sale (ownership bypassed)", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    canViewSaleMock.mockResolvedValueOnce(true);
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "sent",
    });
    updateSaleWithItemsMock.mockResolvedValueOnce(fakeUpdatedSale("sent"));
    const res = await PATCH(patchReq(VALID_PATCH_BODY), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/manager/sales/[id] (draft mode)", () => {
  it("draft із порожніми items оновлює чернетку без ефектів проведення", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "draft",
    });
    updateSaleDraftMock.mockResolvedValueOnce({
      id: "sale1",
      status: "draft",
    });
    const res = await PATCH(patchReq({ draft: true, items: [] }), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; status: string };
    expect(json.id).toBe("sale1");
    // Draft-шлях — strict update НЕ викликається.
    expect(updateSaleWithItemsMock).not.toHaveBeenCalled();
    expect(updateSaleDraftMock).toHaveBeenCalledTimes(1);
  });

  it("draft на проведеній реалізації → 409 (locked) без запису", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      status: "posted",
    });
    const res = await PATCH(patchReq({ draft: true, items: [] }), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(409);
    expect(updateSaleDraftMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/manager/sales/[id]", () => {
  // $transaction отримує callback → виконуємо його з mockPrisma як tx.
  function wireTx() {
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
  }

  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role cannot delete (warehouse)", async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      ...MANAGER,
      role: "warehouse" as const,
    });
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(403);
    expect(mockPrisma.sale.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when manager has no permission", async () => {
    canViewSaleMock.mockResolvedValueOnce(false);
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(404);
    expect(mockPrisma.sale.delete).not.toHaveBeenCalled();
  });

  it("deletes a draft sale (no debt movements) + recomputes owner debt", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      customerId: "c1",
    });
    mockPrisma.mgrDebtMovement.findMany.mockResolvedValueOnce([]); // чернетка — рухів нема
    mockPrisma.mgrDebtMovement.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.sale.delete.mockResolvedValue({ id: "sale1" });
    resolveClientIdMock.mockResolvedValueOnce("client1");
    recomputeDebtMock.mockResolvedValue(1);
    wireTx();

    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(mockPrisma.sale.delete).toHaveBeenCalledWith({
      where: { id: "sale1" },
    });
    expect(recomputeDebtMock).toHaveBeenCalledWith(mockPrisma, ["client1"]);
  });

  it("deletes a posted sale + removes its debt movement + recomputes", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      id: "sale1",
      customerId: "c1",
    });
    // Проведена реалізація має рух боргу.
    mockPrisma.mgrDebtMovement.findMany.mockResolvedValueOnce([
      { clientId: "client1" },
    ]);
    mockPrisma.mgrDebtMovement.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.sale.delete.mockResolvedValue({ id: "sale1" });
    recomputeDebtMock.mockResolvedValue(1);
    wireTx();

    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrDebtMovement.deleteMany).toHaveBeenCalledWith({
      where: { sourceType: "sale", sourceId: "sale1" },
    });
    expect(mockPrisma.sale.delete).toHaveBeenCalledWith({
      where: { id: "sale1" },
    });
    expect(recomputeDebtMock).toHaveBeenCalledWith(mockPrisma, ["client1"]);
    // resolveClientIdByCustomer не потрібен, бо рух уже дав клієнта.
    expect(resolveClientIdMock).not.toHaveBeenCalled();
  });

  it("returns 404 when sale missing", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(delReq(), {
      params: Promise.resolve({ id: "sale1" }),
    });
    expect(res.status).toBe(404);
  });
});
