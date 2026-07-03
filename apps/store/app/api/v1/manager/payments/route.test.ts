import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, FakePrismaError } = vi.hoisted(() => {
  class FakePrismaError extends Error {
    code: string;
    constructor(code: string, message = "fake") {
      super(message);
      this.code = code;
    }
  }
  return {
    mockPrisma: {
      mgrClient: { findMany: vi.fn() },
      order: { findUnique: vi.fn() },
      payment: { create: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
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
import { POST } from "./route";

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

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
});

const validBody = {
  orderId: "ord1",
  method: "cash" as const,
  amount: 1500,
};

function fakeOrder() {
  return {
    id: "ord1",
    code1C: "L-2026-0123",
    customer: { code1C: "000001" },
  };
}

function fakePayment() {
  return {
    id: "pay1",
    orderId: "ord1",
    method: "cash",
    amount: 1500,
    currency: "UAH",
    status: "completed",
    externalId: null,
    paidAt: new Date("2026-05-15T10:00:00Z"),
    createdAt: new Date("2026-05-15T10:00:00Z"),
  };
}

describe("POST /api/v1/manager/payments", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 на invalid body", async () => {
    const res = await POST(req({ orderId: "", method: "x", amount: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 коли order не існує", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 403 коли manager не власник клієнта", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(fakeOrder());
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
      { code1C: "FOREIGN" },
    ]);
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(mockPrisma.payment.create).not.toHaveBeenCalled();
  });

  it("admin може створити для будь-якого замовлення", async () => {
    getCurrentUserMock.mockResolvedValueOnce(ADMIN);
    mockPrisma.order.findUnique.mockResolvedValueOnce(fakeOrder());
    mockPrisma.payment.create.mockResolvedValueOnce(fakePayment());
    const res = await POST(req(validBody));
    expect(res.status).toBe(201);
    expect(mockPrisma.mgrClient.findMany).not.toHaveBeenCalled();
  });

  it("manager успішно створює payment", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(fakeOrder());
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    mockPrisma.payment.create.mockResolvedValueOnce(fakePayment());
    const res = await POST(req(validBody));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string };
    expect(json.id).toBe("pay1");
  });

  it("returns 400 на Prisma FK error", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(fakeOrder());
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    mockPrisma.payment.create.mockRejectedValueOnce(
      new FakePrismaError("P2003"),
    );
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
  });
});
