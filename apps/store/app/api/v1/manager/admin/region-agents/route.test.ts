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
      mgrRegionAgent: { findMany: vi.fn(), create: vi.fn() },
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

import { GET, POST } from "./route";

const ADMIN = { id: "admin1", role: "admin" as const };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/admin/region-agents",
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

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN);
  mockPrisma.mgrRegionAgent.findMany.mockResolvedValue([]);
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", isActive: true });
});

describe("GET /admin/region-agents", () => {
  it("returns 403 for non-admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
  });

  it("lists items with regionLabel", async () => {
    mockPrisma.mgrRegionAgent.findMany.mockResolvedValueOnce([
      {
        id: "ra1",
        region: "volynska",
        userId: "u1",
        createdAt: new Date(),
        user: {
          id: "u1",
          fullName: "Олена",
          email: "o@x",
          role: "manager",
        },
      },
    ]);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: { regionLabel: string }[] };
    expect(json.items[0]?.regionLabel).toBe("Волинська");
    expect(json.items[0]).toMatchObject({
      region: "volynska",
      userId: "u1",
      userFullName: "Олена",
    });
  });
});

describe("POST /admin/region-agents", () => {
  it("returns 403 for non-admin", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await POST(req("POST", { region: "volynska", userId: "u1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid region slug", async () => {
    const res = await POST(req("POST", { region: "atlantida", userId: "u1" }));
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrRegionAgent.create).not.toHaveBeenCalled();
  });

  it("returns 400 on missing userId", async () => {
    const res = await POST(req("POST", { region: "volynska" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const res = await POST(
      req("POST", { region: "volynska", userId: "ghost" }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrRegionAgent.create).not.toHaveBeenCalled();
  });

  it("returns 400 when user is inactive", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u-off",
      isActive: false,
    });
    const res = await POST(
      req("POST", { region: "volynska", userId: "u-off" }),
    );
    expect(res.status).toBe(400);
  });

  it("creates record (201) with regionLabel", async () => {
    mockPrisma.mgrRegionAgent.create.mockResolvedValueOnce({
      id: "ra1",
      region: "volynska",
      userId: "u1",
    });
    const res = await POST(req("POST", { region: "volynska", userId: "u1" }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { regionLabel: string; id: string };
    expect(json.regionLabel).toBe("Волинська");
    expect(json.id).toBe("ra1");
  });

  it("returns 409 on duplicate region (P2002)", async () => {
    mockPrisma.mgrRegionAgent.create.mockRejectedValueOnce(
      new FakePrismaError("P2002"),
    );
    const res = await POST(req("POST", { region: "volynska", userId: "u1" }));
    expect(res.status).toBe(409);
  });
});
