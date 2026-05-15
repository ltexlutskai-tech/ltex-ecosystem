import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildSyncClientsRoute } from "./sync-clients";
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
  await app.register(buildSyncClientsRoute({ config, cache }), {
    prefix: "/sync",
  });
  await app.ready();
  return app;
}

describe("POST /sync/clients/:id (mock mode)", () => {
  let cache: IdempotencyStore;
  let app: FastifyInstance;

  beforeEach(async () => {
    cache = createIdempotencyStore();
    app = await buildApp(baseConfig, cache);
  });

  it("returns ok:true mockMode:true для valid request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/clients/abc",
      payload: {
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
        payload: { code1C: "000001", name: "Test client" },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      mockMode?: boolean;
      code1C?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.mockMode).toBe(true);
    expect(body.code1C).toBe("000001");
    expect(res.headers["x-sync-cache"]).toBe("miss");
  });

  it("повторний request з тим самим idempotencyKey повертає cached result", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/sync/clients/abc",
      payload: {
        idempotencyKey: "stable-key-001",
        payload: { code1C: "000002", name: "Cached" },
      },
    });
    const firstBody = first.json();

    const second = await app.inject({
      method: "POST",
      url: "/sync/clients/abc",
      payload: {
        idempotencyKey: "stable-key-001",
        payload: { code1C: "000002", name: "Cached" },
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-sync-cache"]).toBe("hit");
    expect(second.json()).toEqual(firstBody);
  });

  it("returns 400 на invalid body (missing payload)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/clients/abc",
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
      url: "/sync/clients/abc",
      payload: { idempotencyKey: "", payload: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it("two different idempotencyKey-и не shared cache", async () => {
    const a = await app.inject({
      method: "POST",
      url: "/sync/clients/abc",
      payload: { idempotencyKey: "ka", payload: { code1C: "000A" } },
    });
    const b = await app.inject({
      method: "POST",
      url: "/sync/clients/abc",
      payload: { idempotencyKey: "kb", payload: { code1C: "000B" } },
    });
    expect(a.headers["x-sync-cache"]).toBe("miss");
    expect(b.headers["x-sync-cache"]).toBe("miss");
    expect((a.json() as { code1C: string }).code1C).toBe("000A");
    expect((b.json() as { code1C: string }).code1C).toBe("000B");
  });
});
