import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrSyncJob: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { processSyncQueue } from "./queue-processor";

function makeJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "j1",
    entityType: "client" as const,
    entityId: "c1",
    action: "update",
    payload: { code1C: "000001", name: "X" },
    status: "pending" as const,
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: new Date(),
    lastError: null,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const FIXED_NOW = new Date("2026-05-15T12:00:00.000Z");
const nowFn = () => FIXED_NOW;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("processSyncQueue", () => {
  it("happy: job → sent з sentAt + attempts++", async () => {
    mockPrisma.mgrSyncJob.findMany.mockResolvedValueOnce([makeJob()]);
    mockPrisma.mgrSyncJob.update.mockResolvedValueOnce({});
    const send = vi.fn().mockResolvedValue({ ok: true });

    const result = await processSyncQueue(20, { now: nowFn, send });

    expect(result).toEqual({ processed: 1, sent: 1, retrying: 0, failed: 0 });
    expect(send).toHaveBeenCalledOnce();
    const updateCall = mockPrisma.mgrSyncJob.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string; sentAt: Date; attempts: number; lastError: null };
    };
    expect(updateCall.where.id).toBe("j1");
    expect(updateCall.data.status).toBe("sent");
    expect(updateCall.data.sentAt).toEqual(FIXED_NOW);
    expect(updateCall.data.attempts).toBe(1);
    expect(updateCall.data.lastError).toBeNull();
  });

  it("transient failure: attempts < max → retrying з 1m backoff", async () => {
    mockPrisma.mgrSyncJob.findMany.mockResolvedValueOnce([
      makeJob({ attempts: 0, maxAttempts: 5 }),
    ]);
    mockPrisma.mgrSyncJob.update.mockResolvedValueOnce({});
    const send = vi.fn().mockRejectedValue(new Error("Proxy 502: down"));

    const result = await processSyncQueue(20, { now: nowFn, send });

    expect(result).toEqual({ processed: 1, sent: 0, retrying: 1, failed: 0 });
    const updateCall = mockPrisma.mgrSyncJob.update.mock.calls[0]?.[0] as {
      data: {
        status: string;
        attempts: number;
        nextAttemptAt: Date;
        lastError: string;
      };
    };
    expect(updateCall.data.status).toBe("retrying");
    expect(updateCall.data.attempts).toBe(1);
    // 1m backoff
    const expected = FIXED_NOW.getTime() + 60_000;
    expect(updateCall.data.nextAttemptAt.getTime()).toBe(expected);
    expect(updateCall.data.lastError).toContain("Proxy 502");
  });

  it("attempts >= maxAttempts → failed з lastError", async () => {
    mockPrisma.mgrSyncJob.findMany.mockResolvedValueOnce([
      makeJob({ attempts: 4, maxAttempts: 5 }),
    ]);
    mockPrisma.mgrSyncJob.update.mockResolvedValueOnce({});
    const send = vi.fn().mockRejectedValue(new Error("Auth failed"));

    const result = await processSyncQueue(20, { now: nowFn, send });

    expect(result).toEqual({ processed: 1, sent: 0, retrying: 0, failed: 1 });
    const updateCall = mockPrisma.mgrSyncJob.update.mock.calls[0]?.[0] as {
      data: { status: string; attempts: number; lastError: string };
    };
    expect(updateCall.data.status).toBe("failed");
    expect(updateCall.data.attempts).toBe(5);
    expect(updateCall.data.lastError).toContain("Auth failed");
    expect(console.error).toHaveBeenCalled();
  });

  it("empty queue → noop", async () => {
    mockPrisma.mgrSyncJob.findMany.mockResolvedValueOnce([]);
    const send = vi.fn();

    const result = await processSyncQueue(20, { now: nowFn, send });

    expect(result).toEqual({ processed: 0, sent: 0, retrying: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(mockPrisma.mgrSyncJob.update).not.toHaveBeenCalled();
  });

  it("backoff progression: 1m / 5m / 30m / 2h / 6h", async () => {
    // attempt 1→2: 5m
    mockPrisma.mgrSyncJob.findMany.mockResolvedValueOnce([
      makeJob({ id: "j2", attempts: 1, maxAttempts: 5 }),
    ]);
    mockPrisma.mgrSyncJob.update.mockResolvedValueOnce({});
    const send = vi.fn().mockRejectedValue(new Error("transient"));

    await processSyncQueue(20, { now: nowFn, send });

    const updateCall = mockPrisma.mgrSyncJob.update.mock.calls[0]?.[0] as {
      data: { nextAttemptAt: Date };
    };
    // attempts=1, so nextAttemptIndex=1 → 5m
    expect(updateCall.data.nextAttemptAt.getTime() - FIXED_NOW.getTime()).toBe(
      5 * 60_000,
    );
  });

  it("aggregates counts на mixed batch (success + retrying + failed)", async () => {
    mockPrisma.mgrSyncJob.findMany.mockResolvedValueOnce([
      makeJob({ id: "a", attempts: 0 }),
      makeJob({ id: "b", attempts: 1, maxAttempts: 5 }),
      makeJob({ id: "c", attempts: 4, maxAttempts: 5 }),
    ]);
    mockPrisma.mgrSyncJob.update.mockResolvedValue({});

    let call = 0;
    const send = vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve({ ok: true });
      return Promise.reject(new Error("transient"));
    });

    const result = await processSyncQueue(20, { now: nowFn, send });

    expect(result).toEqual({ processed: 3, sent: 1, retrying: 1, failed: 1 });
  });

  it("query filter: тільки pending+retrying з nextAttemptAt <= now", async () => {
    mockPrisma.mgrSyncJob.findMany.mockResolvedValueOnce([]);
    await processSyncQueue(20, { now: nowFn });
    const findCall = mockPrisma.mgrSyncJob.findMany.mock.calls[0]?.[0] as {
      where: { status: { in: string[] }; nextAttemptAt: { lte: Date } };
      orderBy: { nextAttemptAt: string };
      take: number;
    };
    expect(findCall.where.status.in).toEqual(["pending", "retrying"]);
    expect(findCall.where.nextAttemptAt.lte).toEqual(FIXED_NOW);
    expect(findCall.orderBy.nextAttemptAt).toBe("asc");
    expect(findCall.take).toBe(20);
  });
});
