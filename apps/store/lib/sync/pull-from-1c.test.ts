import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUniqueMock, upsertMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: {
    mgrSyncState: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      upsert: (...args: unknown[]) => upsertMock(...args),
    },
  },
}));

import { runPullFromOnec } from "./pull-from-1c";

const baseOptions = {
  proxyUrl: "http://proxy.invalid",
  sharedSecret: "shared-secret-16+chars",
  storeBaseUrl: "http://store.invalid",
  syncApiKey: "sync-api-key-test",
};

beforeEach(() => {
  vi.clearAllMocks();
});

function snapshotResponse(
  body: unknown,
  init: ResponseInit = { status: 200 },
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("runPullFromOnec", () => {
  it("повертає exception коли MANAGER_SYNC_SHARED_SECRET порожній", async () => {
    const res = await runPullFromOnec({ ...baseOptions, sharedSecret: "" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.status).toBe("exception");
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("повертає exception коли SYNC_API_KEY порожній", async () => {
    const res = await runPullFromOnec({ ...baseOptions, syncApiKey: "" });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.status).toBe("exception");
  });

  it("повертає soap_failed коли proxy throw-ить", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED proxy"));

    const res = await runPullFromOnec({ ...baseOptions, fetchImpl });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.status).toBe("soap_failed");
    expect(res.errorMessage).toContain("ECONNREFUSED");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("повертає bsl_error коли BSL віддав ok:false", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      snapshotResponse({
        ok: false,
        syncCursor: null,
        data: null,
        error: { code: "auth_failed", message: "Невірний пароль" },
      }),
    );

    const res = await runPullFromOnec({ ...baseOptions, fetchImpl });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.status).toBe("bsl_error");
    expect(res.errorCode).toBe("auth_failed");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("happy path (порожній snapshot): advance-ить cursor", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    upsertMock.mockResolvedValueOnce({
      key: "last_sync_cursor",
      value: "2026-06-02T15:34:21Z",
    });
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      snapshotResponse({
        ok: true,
        syncCursor: "2026-06-02T15:34:21Z",
        data: { categories: [], products: [], prices: [], orders: [] },
        error: null,
      }),
    );

    const res = await runPullFromOnec({ ...baseOptions, fetchImpl });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.cursorAdvanced).toBe(true);
    expect(res.newCursor).toBe("2026-06-02T15:34:21Z");
    expect(res.totals.categories.received).toBe(0);
    expect(res.errors).toEqual([]);
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it("передає cursor у proxy body коли збережений", async () => {
    findUniqueMock.mockResolvedValueOnce({
      key: "last_sync_cursor",
      value: "2026-06-01T10:00:00Z",
    });
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      snapshotResponse({
        ok: true,
        syncCursor: "2026-06-02T15:34:21Z",
        data: { categories: [], products: [], prices: [], orders: [] },
        error: null,
      }),
    );

    await runPullFromOnec({ ...baseOptions, fetchImpl });
    const callArg = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(typeof callArg.body).toBe("string");
    const body = JSON.parse(callArg.body as string) as { cursor?: string };
    expect(body.cursor).toBe("2026-06-01T10:00:00Z");
  });

  it("батчить items по 50 і форвардить у inbound endpoints", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    upsertMock.mockResolvedValueOnce({ key: "last_sync_cursor", value: "x" });

    // 125 категорій → 3 батчі по 50/50/25.
    const categories = Array.from({ length: 125 }, (_, i) => ({
      slug: `cat-${i}`,
      name: `Cat ${i}`,
    }));

    const fetchImpl = vi.fn();
    // 1. proxy response
    fetchImpl.mockResolvedValueOnce(
      snapshotResponse({
        ok: true,
        syncCursor: "2026-06-02T15:34:21Z",
        data: { categories, products: [], prices: [], orders: [] },
        error: null,
      }),
    );
    // 2. 3x categories batches
    fetchImpl.mockResolvedValueOnce(snapshotResponse({ created: 50 }));
    fetchImpl.mockResolvedValueOnce(snapshotResponse({ created: 50 }));
    fetchImpl.mockResolvedValueOnce(snapshotResponse({ created: 25 }));

    const res = await runPullFromOnec({ ...baseOptions, fetchImpl });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.totals.categories.received).toBe(125);
    expect(res.totals.categories.sent).toBe(125);
    expect(res.cursorAdvanced).toBe(true);

    // 1 proxy + 3 categories batches = 4 calls
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    // Перевірити що 2-й виклик (1-й batch) пішов на /api/sync/categories з 50 items
    const firstBatchCall = fetchImpl.mock.calls[1];
    expect(firstBatchCall?.[0]).toBe(
      "http://store.invalid/api/sync/categories",
    );
    const firstBatchBody = JSON.parse(
      (firstBatchCall?.[1] as RequestInit).body as string,
    ) as unknown[];
    expect(firstBatchBody).toHaveLength(50);
  });

  it("частковий failure на одному endpoint НЕ зсуває cursor", async () => {
    findUniqueMock.mockResolvedValueOnce({
      key: "last_sync_cursor",
      value: "2026-06-01T10:00:00Z",
    });

    const fetchImpl = vi.fn();
    // 1. proxy
    fetchImpl.mockResolvedValueOnce(
      snapshotResponse({
        ok: true,
        syncCursor: "2026-06-02T15:34:21Z",
        data: {
          categories: [{ slug: "x", name: "X" }],
          products: [{ code1C: "P-1", name: "P" }],
          prices: [],
          orders: [],
        },
        error: null,
      }),
    );
    // 2. categories OK
    fetchImpl.mockResolvedValueOnce(snapshotResponse({ created: 1 }));
    // 3. products FAIL (HTTP 400)
    fetchImpl.mockResolvedValueOnce(
      snapshotResponse({ error: "Validation" }, { status: 400 }),
    );
    // (prices/orders skip — items empty)

    const res = await runPullFromOnec({ ...baseOptions, fetchImpl });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.cursorAdvanced).toBe(false); // cursor НЕ зсувається
    expect(upsertMock).not.toHaveBeenCalled();
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.totals.categories.sent).toBe(1);
    expect(res.totals.products.sent).toBe(0);
  });

  it("orders endpoint URL правильний (/api/sync/orders/import)", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    upsertMock.mockResolvedValueOnce({ key: "last_sync_cursor", value: "x" });

    const fetchImpl = vi.fn();
    fetchImpl.mockResolvedValueOnce(
      snapshotResponse({
        ok: true,
        syncCursor: "2026-06-02T15:34:21Z",
        data: {
          categories: [],
          products: [],
          prices: [],
          orders: [
            {
              code1C: "ORD-1",
              customer: { name: "Test" },
              items: [
                { productCode1C: "P-1", priceEur: 1, weight: 1, quantity: 1 },
              ],
            },
          ],
        },
        error: null,
      }),
    );
    fetchImpl.mockResolvedValueOnce(snapshotResponse({ created: 1 }));

    await runPullFromOnec({ ...baseOptions, fetchImpl });
    const ordersCall = fetchImpl.mock.calls[1];
    expect(ordersCall?.[0]).toBe("http://store.invalid/api/sync/orders/import");
  });
});
