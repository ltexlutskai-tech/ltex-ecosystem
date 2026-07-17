import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.MANAGER_JWT_SECRET = "a".repeat(48);

const {
  mockPrisma,
  getCurrentUserMock,
  getMyClientCodes1CMock,
  logAuditEventMock,
  orderUpdate,
  reminderUpdateMany,
} = vi.hoisted(() => {
  const orderUpdate = vi.fn();
  const reminderUpdateMany = vi.fn();
  return {
    orderUpdate,
    reminderUpdateMany,
    mockPrisma: {
      order: { findUnique: vi.fn() },
      orderCloseReason: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          order: { update: orderUpdate },
          mgrReminder: { updateMany: reminderUpdateMany },
        }),
      ),
    },
    getCurrentUserMock: vi.fn(),
    getMyClientCodes1CMock: vi.fn(),
    logAuditEventMock: vi.fn(),
  };
});

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
}));
vi.mock("@/lib/audit/audit-log", () => ({
  logAuditEvent: (...a: unknown[]) => logAuditEventMock(...a),
}));
vi.mock("@/lib/manager/order-ownership", () => ({
  getMyClientCodes1C: (...a: unknown[]) => getMyClientCodes1CMock(...a),
}));

import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/orders/o1/close", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const ctx = { params: Promise.resolve({ id: "o1" }) };

describe("POST /orders/[id]/close", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      role: "admin",
    });
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "o1",
      status: "not_posted",
      closedAt: null,
      customerId: "c1",
      customer: { code1C: "K-1" },
      assignedAgentUserId: null,
      version: 3,
    });
    mockPrisma.orderCloseReason.findUnique.mockResolvedValue({
      id: "r1",
      label: "Клієнт відмовився",
    });
    orderUpdate.mockResolvedValue({ id: "o1" });
    reminderUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("sets status=closed + isActual=false + archived on close", async () => {
    const res = await POST(makeRequest({ reasonId: "r1" }), ctx);
    expect(res.status).toBe(200);
    expect(orderUpdate).toHaveBeenCalledTimes(1);
    const data = orderUpdate.mock.calls[0]![0].data;
    expect(data.status).toBe("closed");
    expect(data.isActual).toBe(false);
    expect(data.archived).toBe(true);
    expect(data.closeReasonId).toBe("r1");
    expect(data.closedByUserId).toBe("u1");
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(data.version).toEqual({ increment: 1 });
  });

  it("rejects when the order is already closed (409)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "o1",
      status: "closed",
      closedAt: new Date(),
      customerId: "c1",
      customer: { code1C: "K-1" },
      assignedAgentUserId: null,
      version: 4,
    });
    const res = await POST(makeRequest({ reasonId: "r1" }), ctx);
    expect(res.status).toBe(409);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("rejects when reason is missing (400)", async () => {
    const res = await POST(makeRequest({}), ctx);
    expect(res.status).toBe(400);
  });

  it("rejects unknown reason (400)", async () => {
    mockPrisma.orderCloseReason.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ reasonId: "nope" }), ctx);
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ reasonId: "r1" }), ctx);
    expect(res.status).toBe(401);
  });
});
