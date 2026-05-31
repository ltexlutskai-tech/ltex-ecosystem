import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildSyncPaymentsRoute } from "./sync-payments";
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
  await app.register(buildSyncPaymentsRoute({ config, cache }), {
    prefix: "/sync",
  });
  await app.ready();
  return app;
}

describe("POST /sync/payments/:id (mock mode)", () => {
  let cache: IdempotencyStore;
  let app: FastifyInstance;

  beforeEach(async () => {
    cache = createIdempotencyStore();
    app = await buildApp(baseConfig, cache);
  });

  it("returns ok:true з paymentCode1C для valid request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/payments/pay1",
      payload: {
        idempotencyKey: "pay-key-1",
        payload: {
          orderCode1C: "L-2026-0123",
          method: "cash",
          amount: "1500.00",
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      paymentCode1C: string;
      mockMode: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.mockMode).toBe(true);
    expect(body.paymentCode1C).toMatch(/^MOCK-PMT-/);
    expect(res.headers["x-sync-cache"]).toBe("miss");
  });

  it("повторний request з тим самим idempotencyKey повертає cached result", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/sync/payments/pay2",
      payload: {
        idempotencyKey: "stable-pay-key",
        payload: { orderCode1C: "L-2026-0124" },
      },
    });
    const firstBody = first.json();

    const second = await app.inject({
      method: "POST",
      url: "/sync/payments/pay2",
      payload: {
        idempotencyKey: "stable-pay-key",
        payload: { orderCode1C: "L-2026-0124" },
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-sync-cache"]).toBe("hit");
    expect(second.json()).toEqual(firstBody);
  });

  it("returns 400 на invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/payments/pay3",
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
      url: "/sync/payments/pay4",
      payload: { idempotencyKey: "", payload: {} },
    });
    expect(res.statusCode).toBe(400);
  });
});
