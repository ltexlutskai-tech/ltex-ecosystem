import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@ltex/db", () => ({
  prisma: { viewLog: { deleteMany: vi.fn() } },
}));

import { POST } from "./route";
import { prisma } from "@ltex/db";

const mockPrisma = prisma as unknown as {
  viewLog: { deleteMany: ReturnType<typeof vi.fn> };
};

const SECRET = "test_secret_must_be_long_enough";

describe("POST /api/cron/cleanup-viewlog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
  });

  it("returns 401 without secret", async () => {
    const req = new NextRequest("http://test.local/api/cron/cleanup-viewlog", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockPrisma.viewLog.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes with default 90 days when authorized via Bearer header", async () => {
    mockPrisma.viewLog.deleteMany.mockResolvedValue({ count: 42 });

    const req = new NextRequest("http://test.local/api/cron/cleanup-viewlog", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deleted).toBe(42);
    expect(body.days).toBe(90);
    expect(typeof body.cutoff).toBe("string");
  });

  it("respects custom days param", async () => {
    mockPrisma.viewLog.deleteMany.mockResolvedValue({ count: 5 });

    const req = new NextRequest(
      "http://test.local/api/cron/cleanup-viewlog?days=60",
      {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      },
    );
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.days).toBe(60);
    expect(body.deleted).toBe(5);
  });
});
