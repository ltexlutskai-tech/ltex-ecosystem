import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, deleteAbandonedDraftsMock } = vi.hoisted(() => ({
  mockPrisma: {},
  deleteAbandonedDraftsMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/autosave/cleanup-drafts", () => ({
  deleteAbandonedDrafts: (...args: unknown[]) =>
    deleteAbandonedDraftsMock(...args),
}));

import { GET } from "./route";

const SECRET = "cron_secret_long_enough_value";

function req(headers: Record<string, string> = {}, qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/cron/cleanup-drafts${qs}`, {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/cleanup-drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    deleteAbandonedDraftsMock.mockResolvedValue({ total: 3, sale: 3 });
  });

  it("returns 401 without a valid secret", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(deleteAbandonedDraftsMock).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong secret", async () => {
    const res = await GET(req({ "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("authorizes via x-cron-secret and returns counts", async () => {
    const res = await GET(req({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      olderThanDays: number;
      counts: { total: number };
    };
    expect(body.ok).toBe(true);
    expect(body.olderThanDays).toBe(14);
    expect(body.counts.total).toBe(3);
    // Дефолтний поріг 14 днів переданий у core.
    expect(deleteAbandonedDraftsMock).toHaveBeenCalledWith(mockPrisma, 14);
  });

  it("authorizes via Authorization: Bearer", async () => {
    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
  });

  it("?days= перевизначає поріг", async () => {
    const res = await GET(req({ "x-cron-secret": SECRET }, "?days=30"));
    expect(res.status).toBe(200);
    expect(deleteAbandonedDraftsMock).toHaveBeenCalledWith(mockPrisma, 30);
  });

  it("невалідний ?days= падає на дефолт 14", async () => {
    await GET(req({ "x-cron-secret": SECRET }, "?days=abc"));
    expect(deleteAbandonedDraftsMock).toHaveBeenCalledWith(mockPrisma, 14);
  });

  it("повертає 500 коли cleanup кидає", async () => {
    deleteAbandonedDraftsMock.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });
});
