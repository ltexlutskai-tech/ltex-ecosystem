import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildSyncRealizationsRoute } from "./sync-realizations";
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
  await app.register(buildSyncRealizationsRoute({ config, cache }), {
    prefix: "/sync",
  });
  await app.ready();
  return app;
}

describe("POST /sync/realizations/:id (mock mode)", () => {
  let cache: IdempotencyStore;
  let app: FastifyInstance;

  beforeEach(async () => {
    cache = createIdempotencyStore();
    app = await buildApp(baseConfig, cache);
  });

  it("returns ok:true з realizationCode1C для valid request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/realizations/sale1",
      payload: {
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
        payload: {
          customerCode1C: "000001",
          totalEur: "150.00",
          totalUah: "6450.00",
          items: [],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      realizationCode1C: string;
      mockMode: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.mockMode).toBe(true);
    expect(body.realizationCode1C).toMatch(/^MOCK-RLZ-/);
    expect(res.headers["x-sync-cache"]).toBe("miss");
  });

  it("повторний request з тим самим idempotencyKey повертає cached result", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/sync/realizations/sale2",
      payload: {
        idempotencyKey: "stable-realization-key",
        payload: { customerCode1C: "000002" },
      },
    });
    const firstBody = first.json();

    const second = await app.inject({
      method: "POST",
      url: "/sync/realizations/sale2",
      payload: {
        idempotencyKey: "stable-realization-key",
        payload: { customerCode1C: "000002" },
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-sync-cache"]).toBe("hit");
    expect(second.json()).toEqual(firstBody);
  });

  it("returns 400 на invalid body (missing payload)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/realizations/sale3",
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
      url: "/sync/realizations/sale4",
      payload: { idempotencyKey: "", payload: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it("two different idempotencyKey-и не shared cache", async () => {
    const a = await app.inject({
      method: "POST",
      url: "/sync/realizations/x",
      payload: { idempotencyKey: "rlz-ka", payload: { customerCode1C: "A" } },
    });
    const b = await app.inject({
      method: "POST",
      url: "/sync/realizations/x",
      payload: { idempotencyKey: "rlz-kb", payload: { customerCode1C: "B" } },
    });
    expect(a.headers["x-sync-cache"]).toBe("miss");
    expect(b.headers["x-sync-cache"]).toBe("miss");
  });

  it("echoes existing code1C з payload (без MOCK-RLZ префіксу)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/realizations/sale5",
      payload: {
        idempotencyKey: "rlz-existing",
        payload: { code1C: "R-2026-0099", customerCode1C: "000003" },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; realizationCode1C: string };
    expect(body.realizationCode1C).toBe("R-2026-0099");
  });
});
