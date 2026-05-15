import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { processSyncQueueMock } = vi.hoisted(() => ({
  processSyncQueueMock: vi.fn(),
}));

vi.mock("@/lib/sync/queue-processor", () => ({
  processSyncQueue: (...args: unknown[]) => processSyncQueueMock(...args),
}));

import { GET, POST } from "./route";

const ORIG_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "a".repeat(32);
});

afterEach(() => {
  process.env.CRON_SECRET = ORIG_SECRET;
});

describe("GET /api/cron/process-sync-queue", () => {
  it("401 без auth", async () => {
    const req = new NextRequest("http://localhost/api/cron/process-sync-queue");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(processSyncQueueMock).not.toHaveBeenCalled();
  });

  it("401 з неправильним cron secret", async () => {
    const req = new NextRequest(
      "http://localhost/api/cron/process-sync-queue",
      {
        headers: { "x-cron-secret": "wrong-value" },
      },
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("happy path: викликає processSyncQueue і повертає результат", async () => {
    processSyncQueueMock.mockResolvedValueOnce({
      processed: 3,
      sent: 2,
      retrying: 1,
      failed: 0,
    });
    const req = new NextRequest(
      "http://localhost/api/cron/process-sync-queue",
      {
        headers: { "x-cron-secret": "a".repeat(32) },
      },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      processed: 3,
      sent: 2,
      retrying: 1,
      failed: 0,
    });
    expect(processSyncQueueMock).toHaveBeenCalledOnce();
    expect(processSyncQueueMock).toHaveBeenCalledWith(20);
  });

  it("respects limit query param (within bounds)", async () => {
    processSyncQueueMock.mockResolvedValueOnce({
      processed: 0,
      sent: 0,
      retrying: 0,
      failed: 0,
    });
    const req = new NextRequest(
      "http://localhost/api/cron/process-sync-queue?limit=50",
      { headers: { "x-cron-secret": "a".repeat(32) } },
    );
    await GET(req);
    expect(processSyncQueueMock).toHaveBeenCalledWith(50);
  });

  it("Bearer token auth теж приймається", async () => {
    processSyncQueueMock.mockResolvedValueOnce({
      processed: 0,
      sent: 0,
      retrying: 0,
      failed: 0,
    });
    const req = new NextRequest(
      "http://localhost/api/cron/process-sync-queue",
      {
        headers: { authorization: `Bearer ${"a".repeat(32)}` },
      },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("POST дублює GET (для cron-runner-ів що шлють POST)", async () => {
    processSyncQueueMock.mockResolvedValueOnce({
      processed: 0,
      sent: 0,
      retrying: 0,
      failed: 0,
    });
    const req = new NextRequest(
      "http://localhost/api/cron/process-sync-queue",
      {
        method: "POST",
        headers: { "x-cron-secret": "a".repeat(32) },
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(processSyncQueueMock).toHaveBeenCalledOnce();
  });
});
