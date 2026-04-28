import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@ltex/db", () => ({
  prisma: {
    pushToken: { findMany: vi.fn() },
    videoSubscription: { findMany: vi.fn() },
    notification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/mobile-auth", () => ({
  requireMobileSession: vi.fn(),
}));

import { GET, PUT } from "./route";
import { prisma } from "@ltex/db";
import { requireMobileSession } from "@/lib/mobile-auth";

const mockPrisma = prisma as unknown as {
  pushToken: { findMany: ReturnType<typeof vi.fn> };
  videoSubscription: { findMany: ReturnType<typeof vi.fn> };
  notification: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};
const mockRequireSession = requireMobileSession as ReturnType<typeof vi.fn>;

function buildRequest(method: "GET" | "PUT", body?: unknown): Request {
  return new Request("http://localhost/api/mobile/notifications", {
    method,
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mobile/notifications", () => {
  it("returns push tokens, video subscriptions, and the in-app notification feed", async () => {
    mockRequireSession.mockReturnValue({ customerId: "cust-1" });
    mockPrisma.pushToken.findMany.mockResolvedValue([]);
    mockPrisma.videoSubscription.findMany.mockResolvedValue([]);
    mockPrisma.notification.findMany.mockResolvedValue([
      {
        id: "n-1",
        type: "order_status",
        title: "Замовлення відправлено",
        body: "Ваше замовлення №42 у дорозі",
        payload: { orderId: "ord-42", orderCode: "42" },
        readAt: null,
        createdAt: new Date("2026-04-28T10:00:00Z"),
      },
    ]);

    const res = await GET(buildRequest("GET") as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.notifications).toHaveLength(1);
    expect(data.notifications[0]).toMatchObject({
      id: "n-1",
      type: "order_status",
      readAt: null,
    });
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
      where: { customerId: "cust-1" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    });
  });

  it("returns 401 when the request is not authenticated", async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await GET(buildRequest("GET") as never);
    expect(res.status).toBe(401);
    expect(mockPrisma.notification.findMany).not.toHaveBeenCalled();
  });
});

describe("PUT /api/mobile/notifications", () => {
  it("marks a single notification as read when notificationId is provided", async () => {
    mockRequireSession.mockReturnValue({ customerId: "cust-1" });
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

    const res = await PUT(
      buildRequest("PUT", { notificationId: "n-42" }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.notification.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: { readAt: unknown };
    };
    expect(call.where).toEqual({
      id: "n-42",
      customerId: "cust-1",
      readAt: null,
    });
    expect(call.data.readAt).toBeInstanceOf(Date);
  });

  it("marks all unread notifications as read when no notificationId is provided", async () => {
    mockRequireSession.mockReturnValue({ customerId: "cust-1" });
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

    const res = await PUT(buildRequest("PUT", {}) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.notification.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: { readAt: unknown };
    };
    expect(call.where).toEqual({ customerId: "cust-1", readAt: null });
    expect(call.data.readAt).toBeInstanceOf(Date);
  });

  it("falls back to mark-all when the body is missing or invalid JSON", async () => {
    mockRequireSession.mockReturnValue({ customerId: "cust-1" });
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

    // No body
    const req = new Request("http://localhost/api/mobile/notifications", {
      method: "PUT",
      headers: { authorization: "Bearer test-token" },
    });
    const res = await PUT(req as never);
    expect(res.status).toBe(200);
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { customerId: "cust-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("returns 401 when the request is not authenticated", async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await PUT(buildRequest("PUT", {}) as never);
    expect(res.status).toBe(401);
    expect(mockPrisma.notification.updateMany).not.toHaveBeenCalled();
  });
});
