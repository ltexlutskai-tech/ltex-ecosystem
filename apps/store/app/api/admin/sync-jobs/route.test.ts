import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, requireAdminMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrSyncJob: { findMany: vi.fn(), count: vi.fn() },
  },
  requireAdminMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockResolvedValue("admin-id");
  mockPrisma.mgrSyncJob.findMany.mockResolvedValue([]);
  mockPrisma.mgrSyncJob.count.mockResolvedValue(0);
});

function req(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/admin/sync-jobs${qs}`);
}

describe("GET /api/admin/sync-jobs", () => {
  it("returns 401 коли requireAdmin throws", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("nope"));
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("без filter повертає все", async () => {
    await GET(req());
    const args = mockPrisma.mgrSyncJob.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({});
  });

  it("фільтрує по single status", async () => {
    await GET(req("?status=failed"));
    const args = mockPrisma.mgrSyncJob.findMany.mock.calls[0]?.[0] as {
      where: { status?: { in: string[] } };
    };
    expect(args.where.status?.in).toEqual(["failed"]);
  });

  it("фільтрує по multi-status CSV", async () => {
    await GET(req("?status=pending,retrying"));
    const args = mockPrisma.mgrSyncJob.findMany.mock.calls[0]?.[0] as {
      where: { status?: { in: string[] } };
    };
    expect(args.where.status?.in).toEqual(["pending", "retrying"]);
  });

  it("ігнорує invalid status values", async () => {
    await GET(req("?status=hacker,failed"));
    const args = mockPrisma.mgrSyncJob.findMany.mock.calls[0]?.[0] as {
      where: { status?: { in: string[] } };
    };
    expect(args.where.status?.in).toEqual(["failed"]);
  });

  it("clamp pageSize до [10..200]", async () => {
    await GET(req("?pageSize=500"));
    const args = mockPrisma.mgrSyncJob.findMany.mock.calls[0]?.[0] as {
      take: number;
    };
    expect(args.take).toBe(200);
  });
});
