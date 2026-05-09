import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  signCustomerToken,
  verifyCustomerToken,
  CUSTOMER_COOKIE_TTL_DAYS,
} from "./customer-auth";

const TEST_SECRET = "a".repeat(64);

describe("customer-auth", () => {
  const original = process.env.CUSTOMER_AUTH_SECRET;

  beforeEach(() => {
    process.env.CUSTOMER_AUTH_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CUSTOMER_AUTH_SECRET;
    } else {
      process.env.CUSTOMER_AUTH_SECRET = original;
    }
  });

  it("signs and verifies a valid token round-trip", () => {
    const token = signCustomerToken("customer-123");
    expect(token).toBeTypeOf("string");
    const payload = verifyCustomerToken(token!);
    expect(payload?.customerId).toBe("customer-123");
    expect(payload?.iat).toBeTypeOf("number");
  });

  it("returns null for malformed tokens", () => {
    expect(verifyCustomerToken("garbage")).toBeNull();
    expect(verifyCustomerToken("only-one-part")).toBeNull();
    expect(verifyCustomerToken("a.b.c")).toBeNull();
    expect(verifyCustomerToken("")).toBeNull();
  });

  it("returns null when the token was signed with a different secret", () => {
    const token = signCustomerToken("customer-1")!;
    process.env.CUSTOMER_AUTH_SECRET = "b".repeat(64);
    expect(verifyCustomerToken(token)).toBeNull();
  });

  it("returns null when the secret is missing or too short", () => {
    delete process.env.CUSTOMER_AUTH_SECRET;
    expect(signCustomerToken("c1")).toBeNull();
    expect(verifyCustomerToken("anything")).toBeNull();

    process.env.CUSTOMER_AUTH_SECRET = "short";
    expect(signCustomerToken("c1")).toBeNull();
  });

  it("returns null for tampered payloads", () => {
    const token = signCustomerToken("customer-1")!;
    const [, sig] = token.split(".");
    const fakePayload = Buffer.from(
      JSON.stringify({ customerId: "attacker", iat: 1 }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyCustomerToken(`${fakePayload}.${sig}`)).toBeNull();
  });

  it("returns null for tokens older than the TTL window", async () => {
    const ttlSeconds = CUSTOMER_COOKIE_TTL_DAYS * 86_400;
    const expiredIat = Math.floor(Date.now() / 1000) - ttlSeconds - 60;
    const payload = Buffer.from(
      JSON.stringify({ customerId: "expired", iat: expiredIat }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", TEST_SECRET)
      .update(payload)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyCustomerToken(`${payload}.${sig}`)).toBeNull();
  });

  it("returns null when iat is in the future", async () => {
    const futureIat = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(
      JSON.stringify({ customerId: "future", iat: futureIat }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", TEST_SECRET)
      .update(payload)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyCustomerToken(`${payload}.${sig}`)).toBeNull();
  });
});
