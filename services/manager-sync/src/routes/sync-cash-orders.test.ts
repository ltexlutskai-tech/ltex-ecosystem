import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildSyncCashOrdersRoute } from "./sync-cash-orders";
import { createIdempotencyStore, type IdempotencyStore } from "../idempotency";
import type { SyncConfig } from "../config";

const baseConfig: SyncConfig = {
  port: 0,
  sharedSecret: "x".repeat(32),
  mockMode: true,
  onecUrl: undefined,
  onecPassword: undefined,
  onecTimeoutMs: 5000,
};

async function buildApp(
  config: SyncConfig,
  cache: IdempotencyStore,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(buildSyncCashOrdersRoute({ config, cache }), {
    prefix: "/sync",
  });
  await app.ready();
  return app;
}

describe("POST /sync/cash-orders/:id (mock mode)", () => {
  let cache: IdempotencyStore;
  let app: FastifyInstance;

  beforeEach(async () => {
    cache = createIdempotencyStore();
    app = await buildApp(baseConfig, cache);
  });

  it("returns ok:true з cashOrderCode1C для valid request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/cash-orders/co1",
      payload: {
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
        payload: {
          type: "income",
          customerCode1C: "000001",
          documentSumEur: "150.00",
          uidUah: "uuid-uah",
          uidEur: "uuid-eur",
          uidUsd: "uuid-usd",
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      cashOrderCode1C: string;
      mockMode: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.mockMode).toBe(true);
    expect(body.cashOrderCode1C).toMatch(/^MOCK-PKO-/);
    expect(res.headers["x-sync-cache"]).toBe("miss");
  });

  it("повторний request з тим самим idempotencyKey повертає cached result", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/sync/cash-orders/co2",
      payload: {
        idempotencyKey: "stable-cash-order-key",
        payload: { type: "income", customerCode1C: "000002" },
      },
    });
    const firstBody = first.json();

    const second = await app.inject({
      method: "POST",
      url: "/sync/cash-orders/co2",
      payload: {
        idempotencyKey: "stable-cash-order-key",
        payload: { type: "income", customerCode1C: "000002" },
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-sync-cache"]).toBe("hit");
    expect(second.json()).toEqual(firstBody);
  });

  it("returns 400 на invalid body (missing payload)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/cash-orders/co3",
      payload: { idempotencyKey: "k1" },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid body");
  });

  it("returns 400 на empty idempotencyKey", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/cash-orders/co4",
      payload: { idempotencyKey: "", payload: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it("echoes existing code1C з payload (без MOCK-PKO префіксу)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/cash-orders/co5",
      payload: {
        idempotencyKey: "cash-order-existing",
        payload: { code1C: "PKO-2026-0099", type: "income" },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; cashOrderCode1C: string };
    expect(body.cashOrderCode1C).toBe("PKO-2026-0099");
  });
});
