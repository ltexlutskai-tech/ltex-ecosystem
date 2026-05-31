import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildSyncClosuresRoute } from "./closures";
import { createIdempotencyStore, type IdempotencyStore } from "../idempotency";
import type { SyncConfig } from "../config";

const baseConfig: SyncConfig = {
  port: 0,
  sharedSecret: "x".repeat(32),
  mockMode: true,
  onecUrl: undefined,
  onecPassword: undefined,
  onecHttpUser: undefined,
  onecHttpPassword: undefined,
  onecTimeoutMs: 5000,
};

async function buildApp(
  config: SyncConfig,
  cache: IdempotencyStore,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(buildSyncClosuresRoute({ config, cache }), {
    prefix: "/sync",
  });
  await app.ready();
  return app;
}

describe("M3.4 Closures Fastify routes (mock mode)", () => {
  let cache: IdempotencyStore;
  let app: FastifyInstance;

  beforeEach(async () => {
    cache = createIdempotencyStore();
    app = await buildApp(baseConfig, cache);
  });

  it("GET /sync/closures/get-data/:clientCode1C — повертає synthetic items", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sync/closures/get-data/000001",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      items: Array<{ orderUid: string; sold: number; quantity: number }>;
      mockMode?: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.mockMode).toBe(true);
    expect(body.items).toHaveLength(3);
    // Один із 3 — sold >= quantity (для UI green check).
    expect(body.items.some((i) => i.sold >= i.quantity)).toBe(true);
  });

  it("GET кешує повторні запити (cache hit на 2-му виклику)", async () => {
    const first = await app.inject({
      method: "GET",
      url: "/sync/closures/get-data/000002",
    });
    const second = await app.inject({
      method: "GET",
      url: "/sync/closures/get-data/000002",
    });
    expect(first.headers["x-sync-cache"]).toBe("miss");
    expect(second.headers["x-sync-cache"]).toBe("hit");
    expect(second.json()).toEqual(first.json());
  });

  it("GET повертає 400 на порожній clientCode1C (через URL — Fastify підставить empty)", async () => {
    // Реалістично — URL /sync/closures/get-data/ не матчиться у Fastify
    // (404), а з пробілом — empty після trim → 400.
    const res = await app.inject({
      method: "GET",
      url: "/sync/closures/get-data/%20",
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /sync/closures/close — повертає closedCount=N + newOrderNumber", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/closures/close",
      payload: {
        idempotencyKey: "test-close-001",
        clientCode1C: "000001",
        items: [
          {
            orderUid: "mock-order-000001-001",
            productUid: "mock-product-001",
            quantity: 75,
            price: 50,
            addToNewOrder: true,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      closedCount: number;
      newOrderUid: string | null;
      newOrderNumber: string | null;
      alreadyProcessed: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.closedCount).toBe(1);
    expect(body.newOrderUid).toMatch(/^mock-new-order-/);
    expect(body.newOrderNumber).toMatch(/^L-MOCK-NEW-/);
    expect(body.alreadyProcessed).toBe(false);
  });

  it("POST повторний виклик з тим самим idempotencyKey → cache hit", async () => {
    const payload = {
      idempotencyKey: "test-close-stable-001",
      clientCode1C: "000003",
      items: [
        {
          orderUid: "mock-order-x",
          productUid: "mock-product-x",
          quantity: 10,
          price: 5,
          addToNewOrder: false,
        },
      ],
    };
    const first = await app.inject({
      method: "POST",
      url: "/sync/closures/close",
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/sync/closures/close",
      payload,
    });
    expect(first.headers["x-sync-cache"]).toBe("miss");
    expect(second.headers["x-sync-cache"]).toBe("hit");
    expect(second.json()).toEqual(first.json());
  });

  it("POST — 400 на empty items", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/closures/close",
      payload: {
        idempotencyKey: "test-empty",
        clientCode1C: "000001",
        items: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST — items без addToNewOrder=true → newOrderUid=null", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/closures/close",
      payload: {
        idempotencyKey: "test-close-no-new",
        clientCode1C: "000001",
        items: [
          {
            orderUid: "mo-1",
            productUid: "mp-1",
            quantity: 5,
            price: 10,
            addToNewOrder: false,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      newOrderUid: string | null;
      newOrderNumber: string | null;
    };
    expect(body.newOrderUid).toBeNull();
    expect(body.newOrderNumber).toBeNull();
  });
});

describe("M3.4 Closures — SOAP fail propagation (real mode)", () => {
  it("GET повертає 502 коли real-SOAP падає (no ONEC_SOAP_URL)", async () => {
    const cfg: SyncConfig = { ...baseConfig, mockMode: false };
    const app = await buildApp(cfg, createIdempotencyStore());
    const res = await app.inject({
      method: "GET",
      url: "/sync/closures/get-data/000099",
    });
    expect(res.statusCode).toBe(502);
    const body = res.json() as { ok: boolean; errorMessage: string };
    expect(body.ok).toBe(false);
    expect(body.errorMessage).toMatch(/ONEC_SOAP_URL/);
  });

  it("POST повертає 502 коли real-SOAP падає (no ONEC_SOAP_URL)", async () => {
    const cfg: SyncConfig = { ...baseConfig, mockMode: false };
    const app = await buildApp(cfg, createIdempotencyStore());
    const res = await app.inject({
      method: "POST",
      url: "/sync/closures/close",
      payload: {
        idempotencyKey: "test-real-fail",
        clientCode1C: "000099",
        items: [
          {
            orderUid: "x",
            productUid: "y",
            quantity: 1,
            price: 1,
            addToNewOrder: false,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(502);
  });
});
