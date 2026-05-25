import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    routeSheet: { findUnique: vi.fn() },
    routeSheetTask: { create: vi.fn(), deleteMany: vi.fn() },
    mgrClient: { findUnique: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { POST, DELETE } from "./route";

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

const params = Promise.resolve({ id: "rs1" });

function postReq(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/route-sheets/rs1/tasks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
function deleteReq(taskId?: string): NextRequest {
  const qs = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
  return new NextRequest(
    `http://localhost/api/v1/manager/route-sheets/rs1/tasks${qs}`,
    { method: "DELETE" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER);
  mockPrisma.routeSheet.findUnique.mockResolvedValue({
    id: "rs1",
    status: "draft",
  });
  mockPrisma.mgrClient.findUnique.mockResolvedValue(null);
});

describe("POST /route-sheets/[id]/tasks", () => {
  it("401 when not authed", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ comment: "x" }), { params });
    expect(res.status).toBe(401);
  });

  it("404 when sheet not found", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ comment: "x" }), { params });
    expect(res.status).toBe(404);
  });

  it("409 when sheet completed (lock)", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    const res = await POST(postReq({ comment: "не можна" }), { params });
    expect(res.status).toBe(409);
    expect(mockPrisma.routeSheetTask.create).not.toHaveBeenCalled();
  });

  it("400 when comment empty", async () => {
    const res = await POST(postReq({ comment: "  " }), { params });
    expect(res.status).toBe(400);
  });

  it("creates task with resolved client name (200)", async () => {
    mockPrisma.routeSheetTask.create.mockResolvedValueOnce({
      id: "t1",
      customerId: "mc1",
      comment: "Подзвонити",
    });
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({ name: "Клієнт А" });
    const res = await POST(
      postReq({ customerId: "mc1", comment: "Подзвонити" }),
      {
        params,
      },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      task: { id: string; customerName: string | null; comment: string };
    };
    expect(json.task.id).toBe("t1");
    expect(json.task.customerName).toBe("Клієнт А");
    expect(json.task.comment).toBe("Подзвонити");
  });

  it("creates task without client", async () => {
    mockPrisma.routeSheetTask.create.mockResolvedValueOnce({
      id: "t2",
      customerId: null,
      comment: "Загальна нотатка",
    });
    const res = await POST(postReq({ comment: "Загальна нотатка" }), {
      params,
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrClient.findUnique).not.toHaveBeenCalled();
    const json = (await res.json()) as {
      task: { customerName: string | null };
    };
    expect(json.task.customerName).toBeNull();
  });
});

describe("DELETE /route-sheets/[id]/tasks", () => {
  it("404 when sheet not found", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(deleteReq("t1"), { params });
    expect(res.status).toBe(404);
  });

  it("409 when sheet completed (lock)", async () => {
    mockPrisma.routeSheet.findUnique.mockResolvedValueOnce({
      id: "rs1",
      status: "completed",
    });
    const res = await DELETE(deleteReq("t1"), { params });
    expect(res.status).toBe(409);
    expect(mockPrisma.routeSheetTask.deleteMany).not.toHaveBeenCalled();
  });

  it("400 when taskId missing", async () => {
    const res = await DELETE(deleteReq(), { params });
    expect(res.status).toBe(400);
  });

  it("deletes task scoped to the sheet (200)", async () => {
    mockPrisma.routeSheetTask.deleteMany.mockResolvedValueOnce({ count: 1 });
    const res = await DELETE(deleteReq("t1"), { params });
    expect(res.status).toBe(200);
    const where = mockPrisma.routeSheetTask.deleteMany.mock.calls[0]?.[0].where;
    expect(where).toEqual({ id: "t1", routeSheetId: "rs1" });
  });
});
