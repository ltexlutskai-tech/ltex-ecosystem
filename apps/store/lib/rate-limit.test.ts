import { describe, it, expect, beforeEach, vi } from "vitest";
import { rateLimit, getClientIp } from "./rate-limit";

// We need to reset the internal store between tests.
// Since the store is module-scoped, we re-import for isolation.
// Alternatively, we test behavior across calls within each test.

describe("rateLimit", () => {
  // Use unique keys per test to avoid cross-test pollution
  let keyCounter = 0;
  function uniqueKey() {
    return `test-key-${keyCounter++}-${Date.now()}`;
  }

  it("allows requests within the limit", () => {
    const key = uniqueKey();
    const config = { windowMs: 60_000, max: 3 };

    const r1 = rateLimit(key, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = rateLimit(key, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = rateLimit(key, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests exceeding the limit", () => {
    const key = uniqueKey();
    const config = { windowMs: 60_000, max: 2 };

    rateLimit(key, config);
    rateLimit(key, config);
    const r3 = rateLimit(key, config);

    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("returns resetAt in the future", () => {
    const key = uniqueKey();
    const config = { windowMs: 60_000, max: 1 };
    const now = Date.now();

    const r1 = rateLimit(key, config);
    expect(r1.resetAt).toBeGreaterThanOrEqual(now);
  });

  it("treats different keys independently", () => {
    const key1 = uniqueKey();
    const key2 = uniqueKey();
    const config = { windowMs: 60_000, max: 1 };

    rateLimit(key1, config);
    const r1 = rateLimit(key1, config);
    expect(r1.allowed).toBe(false);

    const r2 = rateLimit(key2, config);
    expect(r2.allowed).toBe(true);
  });

  it("allows requests again after window expires", () => {
    const key = uniqueKey();
    const config = { windowMs: 100, max: 1 };

    rateLimit(key, config);
    const blocked = rateLimit(key, config);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const r = rateLimit(key, config);
        expect(r.allowed).toBe(true);
        resolve();
      }, 150);
    });
  });

  it("handles max=0 (always blocked)", () => {
    const key = uniqueKey();
    const config = { windowMs: 60_000, max: 0 };

    const r = rateLimit(key, config);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("remaining count decreases correctly", () => {
    const key = uniqueKey();
    const config = { windowMs: 60_000, max: 5 };

    for (let i = 4; i >= 0; i--) {
      const r = rateLimit(key, config);
      expect(r.remaining).toBe(i);
    }
  });
});

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("extracts IP from x-real-ip header", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "10.0.0.1",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from forwarded IP", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
});
