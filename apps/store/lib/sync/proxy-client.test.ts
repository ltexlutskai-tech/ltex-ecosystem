import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendToProxy } from "./proxy-client";

const ORIGINAL_URL = process.env.MANAGER_SYNC_URL;
const ORIGINAL_SECRET = process.env.MANAGER_SYNC_SHARED_SECRET;

beforeEach(() => {
  process.env.MANAGER_SYNC_URL = "http://proxy.test";
  process.env.MANAGER_SYNC_SHARED_SECRET = "x".repeat(32);
});

afterEach(() => {
  process.env.MANAGER_SYNC_URL = ORIGINAL_URL;
  process.env.MANAGER_SYNC_SHARED_SECRET = ORIGINAL_SECRET;
  vi.restoreAllMocks();
});

describe("sendToProxy", () => {
  it("POST-ить на /sync/clients/:id з X-Sync-Secret header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, code1C: "000001" }), {
        status: 200,
      }),
    );
    const result = await sendToProxy(
      {
        entityType: "client",
        entityId: "c1",
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
        payload: { code1C: "000001", name: "Test" },
      },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://proxy.test/sync/clients/c1");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Sync-Secret"]).toBe("x".repeat(32));
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string) as {
      idempotencyKey: string;
      payload: { code1C: string };
    };
    expect(body.idempotencyKey).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(body.payload.code1C).toBe("000001");
  });

  it("кидає на non-2xx з body у message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("upstream down", { status: 502 }));
    await expect(
      sendToProxy(
        {
          entityType: "client",
          entityId: "c1",
          idempotencyKey: "k1",
          payload: {},
        },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/Proxy 502/);
  });

  it("кидає на network/abort error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      sendToProxy(
        {
          entityType: "client",
          entityId: "c1",
          idempotencyKey: "k1",
          payload: {},
        },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it("кидає коли SHARED_SECRET не задана", async () => {
    process.env.MANAGER_SYNC_SHARED_SECRET = "";
    await expect(
      sendToProxy({
        entityType: "client",
        entityId: "c1",
        idempotencyKey: "k1",
        payload: {},
      }),
    ).rejects.toThrow(/MANAGER_SYNC_SHARED_SECRET/);
  });

  it("кидає на unsupported entityType (M1.5b orders/payments)", async () => {
    const fetchMock = vi.fn();
    await expect(
      sendToProxy(
        {
          entityType: "order" as unknown as "client",
          entityId: "o1",
          idempotencyKey: "k1",
          payload: {},
        },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/unsupported entityType/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
