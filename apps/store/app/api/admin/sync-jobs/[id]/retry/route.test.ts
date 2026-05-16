import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, requireAdminMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrSyncJob: { findUnique: vi.fn(), update: vi.fn() },
  },
  requireAdminMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockResolvedValue("admin-id");
});

function req(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/sync-jobs/${id}/retry`, {
    method: "POST",
  });
}

describe("POST /api/admin/sync-jobs/[id]/retry", () => {
  it("returns 401 коли not admin", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("nope"));
    const res = await POST(req("j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 коли job not found", async () => {
    mockPrisma.mgrSyncJob.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req("j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 коли status ≠ failed", async () => {
    mockPrisma.mgrSyncJob.findUnique.mockResolvedValueOnce({ status: "sent" });
    const res = await POST(req("j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrSyncJob.update).not.toHaveBeenCalled();
  });

  it("resets failed job до pending з attempts=0", async () => {
    mockPrisma.mgrSyncJob.findUnique.mockResolvedValueOnce({
      status: "failed",
    });
    mockPrisma.mgrSyncJob.update.mockResolvedValueOnce({});
    const res = await POST(req("j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(200);
    const call = mockPrisma.mgrSyncJob.update.mock.calls[0]?.[0] as {
      data: {
        status: string;
        attempts: number;
        lastError: null;
        nextAttemptAt: Date;
      };
    };
    expect(call.data.status).toBe("pending");
    expect(call.data.attempts).toBe(0);
    expect(call.data.lastError).toBeNull();
    expect(call.data.nextAttemptAt).toBeInstanceOf(Date);
  });
});
