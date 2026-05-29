import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildSyncPullRoute } from "./pull";
import type { SyncConfig } from "../config";
import type { PullSnapshotResult } from "../soap/pull-types";

const mockConfig: SyncConfig = {
  port: 0,
  sharedSecret: "x".repeat(32),
  mockMode: true,
  onecUrl: undefined,
  onecPassword: undefined,
  onecTimeoutMs: 5000,
};

const realConfig: SyncConfig = {
  ...mockConfig,
  mockMode: false,
  onecUrl: "https://example.invalid/ws/MobileExchange.1cws",
  onecPassword: "test-password",
};

async function buildApp(config: SyncConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(buildSyncPullRoute({ config }));
  await app.ready();
  return app;
}

describe("POST /pull/snapshot (mock mode)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp(mockConfig);
  });

  it("returns ok:true з порожнім snapshot + новим syncCursor (без body)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PullSnapshotResult;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected ok");
    expect(typeof body.syncCursor).toBe("string");
    expect(Date.parse(body.syncCursor)).not.toBeNaN();
    expect(body.data).toEqual({
      categories: [],
      products: [],
      prices: [],
      orders: [],
    });
    expect(body.mockMode).toBe(true);
  });

  it("приймає cursor у body (передається у mock без crash)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: { cursor: "2026-06-01T10:00:00.000Z" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PullSnapshotResult;
    expect(body.ok).toBe(true);
  });

  it("повертає 400 при невалідному типі cursor (число замість рядка)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: { cursor: 12345 },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid body");
  });

  it("повертає 400 при cursor > 64 chars", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: { cursor: "x".repeat(65) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("повертає 400 при cursor = empty string (z.string().min(1))", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: { cursor: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("обидва послідовні запити стабільні, mock не throw-ить", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: {},
    });
    const second = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });
});

describe("POST /pull/snapshot (real mode, mocked fetch)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("502 коли SOAP-call падає (мережа throw)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("ECONNREFUSED"),
    );
    const app = await buildApp(realConfig);
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: {},
    });
    expect(res.statusCode).toBe(502);
    const body = res.json() as { ok: boolean; errorMessage: string };
    expect(body.ok).toBe(false);
    expect(body.errorMessage).toContain("ECONNREFUSED");
  });

  it("502 коли SOAP повертає HTTP 500", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Internal Server Error", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );
    const app = await buildApp(realConfig);
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: {},
    });
    expect(res.statusCode).toBe(502);
  });

  it("happy path: парсить SOAP-відповідь з даними, передає cursor у XML", async () => {
    const fakeReturn = JSON.stringify({
      ok: true,
      syncCursor: "2026-06-02T15:34:21",
      data: {
        categories: [{ slug: "odyag", name: "Одяг" }],
        products: [],
        prices: [],
        orders: [],
      },
      error: null,
    });
    const soapBody =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body><ms:Response xmlns:ms="http://arm_mobile">` +
      `<ms:return>${fakeReturn
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")}</ms:return>` +
      `</ms:Response></soap:Body></soap:Envelope>`;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(soapBody, { status: 200 }));

    const app = await buildApp(realConfig);
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: { cursor: "2026-06-01T10:00:00Z" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PullSnapshotResult;
    expect(body.ok).toBe(true);
    if (!body.ok) throw new Error("expected ok");
    expect(body.syncCursor).toBe("2026-06-02T15:34:21");
    expect(body.data.categories).toHaveLength(1);

    // Перевіряємо що cursor дійсно передався у XML envelope
    expect(fetchSpy).toHaveBeenCalledOnce();
    const callArg = fetchSpy.mock.calls[0]?.[1];
    expect(callArg).toBeDefined();
    const xmlBody = (callArg as RequestInit).body;
    expect(typeof xmlBody).toBe("string");
    expect(xmlBody).toContain(
      "<ms:ОстаннійКодСинхронізації>2026-06-01T10:00:00Z</ms:ОстаннійКодСинхронізації>",
    );
  });

  it("повертає error-shape коли BSL віддав ok:false", async () => {
    const fakeReturn = JSON.stringify({
      ok: false,
      syncCursor: null,
      data: null,
      error: { code: "auth_failed", message: "Невірний пароль" },
    });
    const soapBody =
      `<?xml version="1.0"?>` +
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body><ms:Response xmlns:ms="http://arm_mobile">` +
      `<ms:return>${fakeReturn
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")}</ms:return>` +
      `</ms:Response></soap:Body></soap:Envelope>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(soapBody, { status: 200 }),
    );

    const app = await buildApp(realConfig);
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: {},
    });
    // Route повертає 200 — SOAP не впав, просто BSL віддав error-структуру.
    // Caller (Cron) сам розрізнить ok:true/false.
    expect(res.statusCode).toBe(200);
    const body = res.json() as PullSnapshotResult;
    expect(body.ok).toBe(false);
    if (body.ok) throw new Error("expected error");
    expect(body.error.code).toBe("auth_failed");
  });

  it("502 коли <return> містить невалідний JSON", async () => {
    const soapBody =
      `<?xml version="1.0"?>` +
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body><ms:Response xmlns:ms="http://arm_mobile">` +
      `<ms:return>not json at all</ms:return>` +
      `</ms:Response></soap:Body></soap:Envelope>`;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(soapBody, { status: 200 }),
    );
    const app = await buildApp(realConfig);
    const res = await app.inject({
      method: "POST",
      url: "/pull/snapshot",
      payload: {},
    });
    expect(res.statusCode).toBe(502);
  });
});
