import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const VALID_SECRET = "a".repeat(48);

beforeEach(() => {
  process.env.MANAGER_JWT_SECRET = VALID_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("jwt", () => {
  it("signAccessToken + verifyAccessToken round-trips", async () => {
    const { signAccessToken, verifyAccessToken } = await import("./jwt");
    const token = signAccessToken("user_123", "admin");
    expect(token.split(".")).toHaveLength(3);
    const payload = verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user_123");
    expect(payload?.role).toBe("admin");
  });

  it("verifyAccessToken returns null on tampered signature", async () => {
    const { signAccessToken, verifyAccessToken } = await import("./jwt");
    const token = signAccessToken("user_123", "manager");
    const tampered = token.slice(0, -3) + "xxx";
    expect(verifyAccessToken(tampered)).toBeNull();
  });

  it("verifyAccessToken returns null when format is wrong", async () => {
    const { verifyAccessToken } = await import("./jwt");
    expect(verifyAccessToken("not-a-jwt")).toBeNull();
    expect(verifyAccessToken("a.b")).toBeNull();
    expect(verifyAccessToken("")).toBeNull();
  });

  it("verifyAccessToken returns null on expired token", async () => {
    const { signAccessToken, verifyAccessToken } = await import("./jwt");
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow - 60 * 60 * 1000);
    const token = signAccessToken("user_123", "manager");
    vi.spyOn(Date, "now").mockReturnValue(realNow);
    expect(verifyAccessToken(token)).toBeNull();
  });

  it("signAccessToken throws when secret is missing", async () => {
    process.env.MANAGER_JWT_SECRET = "";
    vi.resetModules();
    const { signAccessToken } = await import("./jwt");
    expect(() => signAccessToken("user_123", "manager")).toThrow(
      /MANAGER_JWT_SECRET/,
    );
  });

  it("signAccessToken throws when secret too short", async () => {
    process.env.MANAGER_JWT_SECRET = "short";
    vi.resetModules();
    const { signAccessToken } = await import("./jwt");
    expect(() => signAccessToken("user_123", "manager")).toThrow(
      /MANAGER_JWT_SECRET/,
    );
  });

  it("generateRefreshToken returns plain + hash pair with future expiry", async () => {
    const { generateRefreshToken, sha256 } = await import("./jwt");
    const pair = generateRefreshToken();
    expect(pair.plain).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(pair.hash).toBe(sha256(pair.plain));
    expect(pair.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // 30 days TTL
    expect(pair.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      29 * 24 * 60 * 60 * 1000,
    );
  });

  it("sha256 is deterministic and 64 hex chars", async () => {
    const { sha256 } = await import("./jwt");
    expect(sha256("hello")).toBe(sha256("hello"));
    expect(sha256("hello")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("verifyAccessToken rejects token signed with different secret", async () => {
    const { signAccessToken } = await import("./jwt");
    const token = signAccessToken("user_x", "manager");
    process.env.MANAGER_JWT_SECRET = "b".repeat(48);
    vi.resetModules();
    const { verifyAccessToken } = await import("./jwt");
    expect(verifyAccessToken(token)).toBeNull();
  });
});
