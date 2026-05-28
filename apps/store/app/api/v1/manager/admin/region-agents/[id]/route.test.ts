import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, requireRoleMock, FakePrismaError } = vi.hoisted(() => {
  class FakePrismaError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    mockPrisma: {
      mgrRegionAgent: { update: vi.fn(), delete: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    requireRoleMock: vi.fn(),
    FakePrismaError,
  };
});

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: FakePrismaError },
}));
vi.mock("@/lib/auth/manager-auth", () => ({
  requireRole: (...a: unknown[]) => requireRoleMock(...a),
}));

import { PATCH, DELETE } from "./route";

const ADMIN = { id: "admin1", role: "admin" as const };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/admin/region-agents/ra1",
    {
      method,
      ...(body !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    },
  );
}

const params = Promise.resolve({ id: "ra1" });

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN);
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", isActive: true });
});

describe("PATCH /admin/region-agents/[id]", () => {
  it("returns 403 for non-admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await PATCH(req("PATCH", { userId: "u2" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 on empty body", async () => {
    const res = await PATCH(req("PATCH", {}), { params });
    expect(res.status).toBe(400);
  });

  it("updates userId", async () => {
    mockPrisma.mgrRegionAgent.update.mockResolvedValueOnce({
      id: "ra1",
      region: "volynska",
      userId: "u2",
    });
    const res = await PATCH(req("PATCH", { userId: "u2" }), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrRegionAgent.update).toHaveBeenCalledWith({
      where: { id: "ra1" },
      data: { userId: "u2" },
      select: { id: true, region: true, userId: true },
    });
  });

  it("returns 400 when target user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(req("PATCH", { userId: "ghost" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 on P2025", async () => {
    mockPrisma.mgrRegionAgent.update.mockRejectedValueOnce(
      new FakePrismaError("P2025"),
    );
    const res = await PATCH(req("PATCH", { userId: "u1" }), { params });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /admin/region-agents/[id]", () => {
  it("returns 403 for non-admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await DELETE(req("DELETE"), { params });
    expect(res.status).toBe(403);
  });

  it("deletes successfully", async () => {
    mockPrisma.mgrRegionAgent.delete.mockResolvedValueOnce({ id: "ra1" });
    const res = await DELETE(req("DELETE"), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrRegionAgent.delete).toHaveBeenCalledWith({
      where: { id: "ra1" },
    });
  });

  it("returns 404 on P2025", async () => {
    mockPrisma.mgrRegionAgent.delete.mockRejectedValueOnce(
      new FakePrismaError("P2025"),
    );
    const res = await DELETE(req("DELETE"), { params });
    expect(res.status).toBe(404);
  });
});
