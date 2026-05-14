import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, requireRoleMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    clientAssignment: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  requireRoleMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/auth/manager-auth", () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { PATCH } from "./route";

const ADMIN_USER = {
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

function makeReq(id: string, body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/manager/clients/${id}/assign`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(ADMIN_USER);
  mockPrisma.mgrClient.findUnique.mockResolvedValue({ id: "c1" });
  mockPrisma.clientAssignment.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.clientAssignment.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("PATCH /api/v1/manager/clients/[id]/assign", () => {
  it("returns 403 when non-admin tries to assign", async () => {
    requireRoleMock.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq("c1", { userId: "u2" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(403);
  });

  it("assigns manager on happy path (admin role)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u2",
      fullName: "Bob",
      role: "manager",
      isActive: true,
    });
    const res = await PATCH(makeReq("c1", { userId: "u2" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const json = (await res.json()) as {
      assignedManager: { id: string; fullName: string };
    };
    expect(json.assignedManager.fullName).toBe("Bob");
  });

  it("unassigns when userId is null", async () => {
    const res = await PATCH(makeReq("c1", { userId: null }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.clientAssignment.deleteMany).toHaveBeenCalledWith({
      where: { customerId: "c1" },
    });
    const json = (await res.json()) as {
      assignedManager: { id: string; fullName: string } | null;
    };
    expect(json.assignedManager).toBeNull();
  });

  it("returns 404 when target user inactive or missing", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq("c1", { userId: "u999" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(404);
  });
});
