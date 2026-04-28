import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(),
}));

import { middleware, buildCsp } from "./middleware";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("middleware CSP", () => {
  it("sets nonce-based script-src in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const req = new NextRequest("http://test.local/");
    const res = await middleware(req);
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
    );
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    const nonce = res.headers.get("x-nonce");
    expect(nonce).toBeTruthy();
    expect(nonce!.length).toBeGreaterThanOrEqual(16);
  });

  it("respects CSP_RELAXED env override", async () => {
    vi.stubEnv("CSP_RELAXED", "true");
    const req = new NextRequest("http://test.local/");
    const res = await middleware(req);
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("buildCsp keeps style-src 'unsafe-inline' (Tailwind compat)", () => {
    const csp = buildCsp("test-nonce");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });
});
