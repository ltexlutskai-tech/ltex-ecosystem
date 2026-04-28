import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@ltex/db", () => ({
  prisma: {
    chatMessage: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/mobile-auth", () => ({
  requireMobileSession: vi.fn(),
}));

import { GET } from "./route";
import { prisma } from "@ltex/db";
import { requireMobileSession } from "@/lib/mobile-auth";

const mockPrisma = prisma as unknown as {
  chatMessage: { count: ReturnType<typeof vi.fn> };
};
const mockRequireSession = requireMobileSession as ReturnType<typeof vi.fn>;

function buildRequest(): Request {
  return new Request("http://localhost/api/mobile/chat/unread", {
    method: "GET",
    headers: { authorization: "Bearer test-token" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mobile/chat/unread", () => {
  it("returns { count: 0 } when there are no unread manager messages", async () => {
    mockRequireSession.mockReturnValue({ customerId: "cust-1" });
    mockPrisma.chatMessage.count.mockResolvedValue(0);

    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
  });

  it("counts only unread messages from the manager for the current customer", async () => {
    mockRequireSession.mockReturnValue({ customerId: "cust-42" });
    mockPrisma.chatMessage.count.mockResolvedValue(3);

    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 3 });
    expect(mockPrisma.chatMessage.count).toHaveBeenCalledWith({
      where: { customerId: "cust-42", sender: "manager", isRead: false },
    });
  });

  it("returns 401 when the request is not authenticated", async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(401);
    expect(mockPrisma.chatMessage.count).not.toHaveBeenCalled();
  });
});
