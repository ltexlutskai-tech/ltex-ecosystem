import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrCashOrder: { updateMany: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
}));

import { POST } from "./route";

const OFFICE_USER = {
  id: "u-bk",
  fullName: "Бухгалтер Ольга",
  role: "bookkeeper" as const,
};

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/novapay-check/verify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(OFFICE_USER);
  mockPrisma.mgrCashOrder.updateMany.mockResolvedValue({ count: 2 });
});

describe("POST /api/v1/manager/novapay-check/verify", () => {
  it("returns 401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ ids: ["a"], verified: true }));
    expect(res.status).toBe(401);
    expect(mockPrisma.mgrCashOrder.updateMany).not.toHaveBeenCalled();
  });

  it("returns 403 for non-office role", async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      id: "u-m",
      fullName: "Менеджер",
      role: "manager",
    });
    const res = await POST(postReq({ ids: ["a"], verified: true }));
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrCashOrder.updateMany).not.toHaveBeenCalled();
  });

  it("returns 400 when ids empty", async () => {
    const res = await POST(postReq({ ids: [], verified: true }));
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrCashOrder.updateMany).not.toHaveBeenCalled();
  });

  it("verify happy path sets verifiedAt + source guard", async () => {
    const res = await POST(postReq({ ids: ["a", "b"], verified: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.updated).toBe(2);

    expect(mockPrisma.mgrCashOrder.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.mgrCashOrder.updateMany.mock.lastCall?.[0];
    expect(arg).toBeDefined();
    expect(arg.where).toEqual({
      id: { in: ["a", "b"] },
      source: "novapay_auto",
    });
    expect(arg.data.verifiedAt).toBeInstanceOf(Date);
    expect(arg.data.verifiedByUserId).toBe("u-bk");
    expect(arg.data.verifiedByName).toBe("Бухгалтер Ольга");
  });

  it("unverify sets the three fields back to null", async () => {
    const res = await POST(postReq({ ids: ["a"], verified: false }));
    expect(res.status).toBe(200);

    const arg = mockPrisma.mgrCashOrder.updateMany.mock.lastCall?.[0];
    expect(arg).toBeDefined();
    expect(arg.where.source).toBe("novapay_auto");
    expect(arg.data).toEqual({
      verifiedAt: null,
      verifiedByUserId: null,
      verifiedByName: null,
    });
  });
});
