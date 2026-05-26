import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, canEditClientMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrClient: { findUnique: vi.fn() },
      mgrRoute: { findUnique: vi.fn() },
      mgrClientRouteAssignment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        aggregate: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    getCurrentUserMock: vi.fn(),
    canEditClientMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: class {} },
}));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

vi.mock("@/lib/permissions/mgr-client-edit", () => ({
  canEditClient: (...args: unknown[]) => canEditClientMock(...args),
}));

import { POST } from "./route";
import { PATCH, DELETE } from "./[assignmentId]/route";

const MANAGER_USER = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/clients/c1/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/routes/a9",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function deleteReq(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/clients/c1/routes/a9",
    { method: "DELETE" },
  );
}

const idParams = (): Promise<{ id: string }> => Promise.resolve({ id: "c1" });
const asgParams = (
  assignmentId: string,
): Promise<{ id: string; assignmentId: string }> =>
  Promise.resolve({ id: "c1", assignmentId });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
  canEditClientMock.mockResolvedValue(true);
  mockPrisma.mgrClient.findUnique.mockResolvedValue({ id: "c1" });
  mockPrisma.mgrRoute.findUnique.mockResolvedValue({ id: "r1" });
  mockPrisma.mgrClientRouteAssignment.findUnique.mockResolvedValue(null);
  mockPrisma.mgrClientRouteAssignment.aggregate.mockResolvedValue({
    _max: { sortOrder: 2 },
  });
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe("POST /clients/[id]/routes", () => {
  it("401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ routeId: "r1" }), { params: idParams() });
    expect(res.status).toBe(401);
  });

  it("403 when manager has no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await POST(postReq({ routeId: "r1" }), { params: idParams() });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrClientRouteAssignment.create).not.toHaveBeenCalled();
  });

  it("400 on empty routeId", async () => {
    const res = await POST(postReq({ routeId: "" }), { params: idParams() });
    expect(res.status).toBe(400);
  });

  it("404 when client not found", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ routeId: "r1" }), { params: idParams() });
    expect(res.status).toBe(404);
  });

  it("404 when route not found in MgrRoute dictionary", async () => {
    mockPrisma.mgrRoute.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ routeId: "rX" }), { params: idParams() });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrClientRouteAssignment.create).not.toHaveBeenCalled();
  });

  it("409 when route already assigned (dedup)", async () => {
    mockPrisma.mgrClientRouteAssignment.findUnique.mockResolvedValueOnce({
      id: "a1",
    });
    const res = await POST(postReq({ routeId: "r1" }), { params: idParams() });
    expect(res.status).toBe(409);
    expect(mockPrisma.mgrClientRouteAssignment.create).not.toHaveBeenCalled();
  });

  it("creates assignment with sortOrder = max+1", async () => {
    mockPrisma.mgrClientRouteAssignment.create.mockResolvedValueOnce({
      id: "a10",
      routeId: "r1",
      sortOrder: 3,
      route: { name: "Луцьк", isActive: true },
    });
    const res = await POST(postReq({ routeId: "r1" }), { params: idParams() });
    expect(res.status).toBe(201);
    const call = (mockPrisma.mgrClientRouteAssignment.create.mock.calls[0] ??
      [])[0] as { data: { sortOrder: number; routeId: string } };
    expect(call.data.sortOrder).toBe(3);
    expect(call.data.routeId).toBe("r1");
    const json = (await res.json()) as {
      route: { id: string; name: string };
    };
    expect(json.route.id).toBe("a10");
    expect(json.route.name).toBe("Луцьк");
  });
});

describe("PATCH /clients/[id]/routes/[assignmentId] — reorder", () => {
  beforeEach(() => {
    mockPrisma.mgrClientRouteAssignment.findUnique.mockResolvedValue({
      id: "a9",
      clientId: "c1",
      sortOrder: 2,
    });
  });

  it("403 when no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await PATCH(patchReq({ direction: "up" }), {
      params: asgParams("a9"),
    });
    expect(res.status).toBe(403);
  });

  it("400 on invalid direction", async () => {
    const res = await PATCH(patchReq({ direction: "sideways" }), {
      params: asgParams("a9"),
    });
    expect(res.status).toBe(400);
  });

  it("404 when assignment belongs to another client", async () => {
    mockPrisma.mgrClientRouteAssignment.findUnique.mockResolvedValueOnce({
      id: "a9",
      clientId: "OTHER",
      sortOrder: 2,
    });
    const res = await PATCH(patchReq({ direction: "up" }), {
      params: asgParams("a9"),
    });
    expect(res.status).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("no-op (moved=false) when already at the edge", async () => {
    mockPrisma.mgrClientRouteAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ direction: "up" }), {
      params: asgParams("a9"),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { moved: boolean };
    expect(json.moved).toBe(false);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("swaps sortOrder with the neighbour", async () => {
    mockPrisma.mgrClientRouteAssignment.findFirst.mockResolvedValueOnce({
      id: "a8",
      sortOrder: 1,
    });
    const res = await PATCH(patchReq({ direction: "up" }), {
      params: asgParams("a9"),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { moved: boolean };
    expect(json.moved).toBe(true);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /clients/[id]/routes/[assignmentId]", () => {
  beforeEach(() => {
    mockPrisma.mgrClientRouteAssignment.findUnique.mockResolvedValue({
      id: "a9",
      clientId: "c1",
    });
  });

  it("403 when no permission", async () => {
    canEditClientMock.mockResolvedValueOnce(false);
    const res = await DELETE(deleteReq(), { params: asgParams("a9") });
    expect(res.status).toBe(403);
    expect(mockPrisma.mgrClientRouteAssignment.delete).not.toHaveBeenCalled();
  });

  it("404 when assignment belongs to another client", async () => {
    mockPrisma.mgrClientRouteAssignment.findUnique.mockResolvedValueOnce({
      id: "a9",
      clientId: "OTHER",
    });
    const res = await DELETE(deleteReq(), { params: asgParams("a9") });
    expect(res.status).toBe(404);
    expect(mockPrisma.mgrClientRouteAssignment.delete).not.toHaveBeenCalled();
  });

  it("deletes the assignment on happy path", async () => {
    mockPrisma.mgrClientRouteAssignment.delete.mockResolvedValueOnce({
      id: "a9",
    });
    const res = await DELETE(deleteReq(), { params: asgParams("a9") });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrClientRouteAssignment.delete).toHaveBeenCalledWith({
      where: { id: "a9" },
    });
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
