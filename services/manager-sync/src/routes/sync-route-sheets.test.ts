import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildSyncRouteSheetsRoute } from "./sync-route-sheets";
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
  await app.register(buildSyncRouteSheetsRoute({ config, cache }), {
    prefix: "/sync",
  });
  await app.ready();
  return app;
}

describe("POST /sync/route-sheets/:id (mock mode)", () => {
  let cache: IdempotencyStore;
  let app: FastifyInstance;

  beforeEach(async () => {
    cache = createIdempotencyStore();
    app = await buildApp(baseConfig, cache);
  });

  it("returns ok:true з routeSheetCode1C для valid request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/route-sheets/rs1",
      payload: {
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
        payload: {
          docNumber: 7,
          status: "dispatched",
          routeCode1C: "RT-1",
          expeditorCode1C: "U0001",
          orders: [{ orderCode1C: "ORD-7", customerCode1C: "000001" }],
          items: [],
          loading: [],
          sales: [],
          payments: [],
          tasks: [],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      routeSheetCode1C: string;
      routeSheetNumber: string;
      mockMode: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.mockMode).toBe(true);
    expect(body.routeSheetCode1C).toMatch(/^MOCK-RSH-/);
    expect(body.routeSheetNumber).toMatch(/^ML-MOCK-/);
    expect(res.headers["x-sync-cache"]).toBe("miss");
  });

  it("повторний request з тим самим idempotencyKey повертає cached result", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/sync/route-sheets/rs2",
      payload: {
        idempotencyKey: "stable-route-sheet-key",
        payload: { docNumber: 2, status: "completed" },
      },
    });
    const firstBody = first.json();

    const second = await app.inject({
      method: "POST",
      url: "/sync/route-sheets/rs2",
      payload: {
        idempotencyKey: "stable-route-sheet-key",
        payload: { docNumber: 2, status: "completed" },
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-sync-cache"]).toBe("hit");
    expect(second.json()).toEqual(firstBody);
  });

  it("returns 400 на invalid body (missing payload)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/route-sheets/rs3",
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
      url: "/sync/route-sheets/rs4",
      payload: { idempotencyKey: "", payload: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it("echoes existing code1C з payload (без MOCK-RSH префіксу)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/route-sheets/rs5",
      payload: {
        idempotencyKey: "route-sheet-existing",
        payload: { code1C: "ML-2026-0099", status: "completed" },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; routeSheetCode1C: string };
    expect(body.routeSheetCode1C).toBe("ML-2026-0099");
  });
});
