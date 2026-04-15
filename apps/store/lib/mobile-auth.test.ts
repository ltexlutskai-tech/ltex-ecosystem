import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  signMobileToken,
  verifyMobileToken,
  verifyMobileTokenString,
  requireMobileSession,
} from "./mobile-auth";

const TEST_SECRET = "a".repeat(64);

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest("http://localhost/test", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("mobile-auth", () => {
  const originalSecret = process.env.MOBILE_JWT_SECRET;

  beforeEach(() => {
    process.env.MOBILE_JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.MOBILE_JWT_SECRET;
    } else {
      process.env.MOBILE_JWT_SECRET = originalSecret;
    }
  });

  it("signs and verifies a valid token round-trip", () => {
    const token = signMobileToken("customer-123");
    expect(token).toBeTypeOf("string");
    const session = verifyMobileTokenString(token!);
    expect(session).toEqual({ customerId: "customer-123" });
  });

  it("returns null for a tampered payload", () => {
    const token = signMobileToken("customer-123")!;
    const [, sig] = token.split(".");
    // Craft a new payload with a different customerId but keep original signature
    const fakePayload = Buffer.from(
      JSON.stringify({ customerId: "attacker", exp: 9999999999 }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const tampered = `${fakePayload}.${sig}`;
    expect(verifyMobileTokenString(tampered)).toBeNull();
  });

  it("returns null for an expired token", () => {
    const token = signMobileToken("customer-123", -10);
    expect(verifyMobileTokenString(token!)).toBeNull();
  });

  it("returns null for malformed tokens", () => {
    expect(verifyMobileTokenString("garbage")).toBeNull();
    expect(verifyMobileTokenString("a.b.c")).toBeNull();
    expect(verifyMobileTokenString("")).toBeNull();
  });

  it("returns null when MOBILE_JWT_SECRET is not configured", () => {
    delete process.env.MOBILE_JWT_SECRET;
    expect(signMobileToken("customer-123")).toBeNull();
    expect(verifyMobileTokenString("anything")).toBeNull();
  });

  it("returns null when MOBILE_JWT_SECRET is too short", () => {
    process.env.MOBILE_JWT_SECRET = "short";
    expect(signMobileToken("customer-123")).toBeNull();
  });

  it("returns null when a token was signed with a different secret", () => {
    const token = signMobileToken("customer-123")!;
    process.env.MOBILE_JWT_SECRET = "b".repeat(64);
    expect(verifyMobileTokenString(token)).toBeNull();
  });

  it("verifyMobileToken extracts Bearer token from request", () => {
    const token = signMobileToken("customer-7")!;
    const req = makeRequest(`Bearer ${token}`);
    expect(verifyMobileToken(req)).toEqual({ customerId: "customer-7" });
  });

  it("verifyMobileToken returns null when header is missing", () => {
    expect(verifyMobileToken(makeRequest())).toBeNull();
  });

  it("verifyMobileToken rejects non-bearer schemes", () => {
    const token = signMobileToken("customer-7")!;
    expect(verifyMobileToken(makeRequest(`Basic ${token}`))).toBeNull();
  });

  it("requireMobileSession returns 401 when unauthorized", async () => {
    const result = requireMobileSession(makeRequest());
    expect(result).toBeInstanceOf(Response);
    // @ts-expect-error NextResponse is Response
    expect(result.status).toBe(401);
  });

  it("requireMobileSession returns the session when authorized", () => {
    const token = signMobileToken("customer-42")!;
    const result = requireMobileSession(makeRequest(`Bearer ${token}`));
    expect(result).toEqual({ customerId: "customer-42" });
  });
});
