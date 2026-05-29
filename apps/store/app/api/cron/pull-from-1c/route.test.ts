import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { runPullFromOnecMock } = vi.hoisted(() => ({
  runPullFromOnecMock: vi.fn(),
}));

vi.mock("@/lib/sync/pull-from-1c", () => ({
  runPullFromOnec: (...args: unknown[]) => runPullFromOnecMock(...args),
}));

import { GET, POST } from "./route";

const ORIG_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "a".repeat(32);
});

afterEach(() => {
  process.env.CRON_SECRET = ORIG_SECRET;
});

describe("GET /api/cron/pull-from-1c", () => {
  it("401 без auth", async () => {
    const req = new NextRequest("http://localhost/api/cron/pull-from-1c");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(runPullFromOnecMock).not.toHaveBeenCalled();
  });

  it("401 з неправильним cron secret", async () => {
    const req = new NextRequest("http://localhost/api/cron/pull-from-1c", {
      headers: { "x-cron-secret": "wrong-value" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("happy path: викликає runPullFromOnec і повертає JSON", async () => {
    runPullFromOnecMock.mockResolvedValueOnce({
      ok: true,
      cursorAdvanced: true,
      oldCursor: null,
      newCursor: "2026-06-02T15:34:21.000Z",
      totals: {
        categories: { received: 0, sent: 0 },
        products: { received: 0, sent: 0 },
        prices: { received: 0, sent: 0 },
        orders: { received: 0, sent: 0 },
      },
      errors: [],
    });
    const req = new NextRequest("http://localhost/api/cron/pull-from-1c", {
      headers: { "x-cron-secret": "a".repeat(32) },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; newCursor: string };
    expect(body.ok).toBe(true);
    expect(body.newCursor).toBe("2026-06-02T15:34:21.000Z");
    expect(runPullFromOnecMock).toHaveBeenCalledOnce();
  });

  it("Bearer token auth теж приймається", async () => {
    runPullFromOnecMock.mockResolvedValueOnce({
      ok: true,
      cursorAdvanced: true,
      oldCursor: null,
      newCursor: "2026-06-02T15:34:21.000Z",
      totals: {
        categories: { received: 0, sent: 0 },
        products: { received: 0, sent: 0 },
        prices: { received: 0, sent: 0 },
        orders: { received: 0, sent: 0 },
      },
      errors: [],
    });
    const req = new NextRequest("http://localhost/api/cron/pull-from-1c", {
      headers: { authorization: `Bearer ${"a".repeat(32)}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("?token=... query auth теж приймається", async () => {
    runPullFromOnecMock.mockResolvedValueOnce({
      ok: true,
      cursorAdvanced: true,
      oldCursor: null,
      newCursor: "2026-06-02T15:34:21.000Z",
      totals: {
        categories: { received: 0, sent: 0 },
        products: { received: 0, sent: 0 },
        prices: { received: 0, sent: 0 },
        orders: { received: 0, sent: 0 },
      },
      errors: [],
    });
    const req = new NextRequest(
      `http://localhost/api/cron/pull-from-1c?token=${"a".repeat(32)}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("502 коли pull повертає soap_failed", async () => {
    runPullFromOnecMock.mockResolvedValueOnce({
      ok: false,
      status: "soap_failed",
      errorMessage: "ECONNREFUSED",
      oldCursor: null,
    });
    const req = new NextRequest("http://localhost/api/cron/pull-from-1c", {
      headers: { "x-cron-secret": "a".repeat(32) },
    });
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok: boolean; status: string };
    expect(body.ok).toBe(false);
    expect(body.status).toBe("soap_failed");
  });

  it("200 коли pull повертає bsl_error (не SOAP-failure)", async () => {
    runPullFromOnecMock.mockResolvedValueOnce({
      ok: false,
      status: "bsl_error",
      errorCode: "auth_failed",
      errorMessage: "Невірний пароль",
      oldCursor: null,
    });
    const req = new NextRequest("http://localhost/api/cron/pull-from-1c", {
      headers: { "x-cron-secret": "a".repeat(32) },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string };
    expect(body.ok).toBe(false);
    expect(body.status).toBe("bsl_error");
  });

  it("500 коли pull throw-ить unexpected exception", async () => {
    runPullFromOnecMock.mockRejectedValueOnce(new Error("boom"));
    const req = new NextRequest("http://localhost/api/cron/pull-from-1c", {
      headers: { "x-cron-secret": "a".repeat(32) },
    });
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; errorMessage: string };
    expect(body.ok).toBe(false);
    expect(body.errorMessage).toBe("boom");
  });

  it("POST дублює GET", async () => {
    runPullFromOnecMock.mockResolvedValueOnce({
      ok: true,
      cursorAdvanced: true,
      oldCursor: null,
      newCursor: "2026-06-02T15:34:21.000Z",
      totals: {
        categories: { received: 0, sent: 0 },
        products: { received: 0, sent: 0 },
        prices: { received: 0, sent: 0 },
        orders: { received: 0, sent: 0 },
      },
      errors: [],
    });
    const req = new NextRequest("http://localhost/api/cron/pull-from-1c", {
      method: "POST",
      headers: { "x-cron-secret": "a".repeat(32) },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(runPullFromOnecMock).toHaveBeenCalledOnce();
  });
});
