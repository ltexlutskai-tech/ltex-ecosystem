import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Mobile API authentication.
 *
 * Uses short-lived HMAC-signed tokens (JWT-like, no external deps).
 * Format: base64url(payload).base64url(signature)
 * Payload: { customerId, exp } (exp = Unix seconds)
 *
 * Token is issued by POST /api/mobile/auth after successful login,
 * and verified on every mobile API request via the `Authorization: Bearer <token>` header.
 */

export const MOBILE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

interface MobileTokenPayload {
  customerId: string;
  exp: number;
}

export interface MobileSession {
  customerId: string;
}

function getSecret(): string | null {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  const pad = 4 - (input.length % 4);
  const padded = input + (pad < 4 ? "=".repeat(pad) : "");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hmac(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/**
 * Sign a mobile session token for the given customer.
 * Returns null when MOBILE_JWT_SECRET is not configured.
 */
export function signMobileToken(
  customerId: string,
  ttlSeconds: number = MOBILE_TOKEN_TTL_SECONDS,
): string | null {
  const secret = getSecret();
  if (!secret) return null;

  const payload: MobileTokenPayload = {
    customerId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = hmac(payloadB64, secret);
  return `${payloadB64}.${base64urlEncode(sig)}`;
}

/**
 * Parse & verify a mobile token. Returns payload or null on any failure.
 */
export function verifyMobileTokenString(token: string): MobileSession | null {
  const secret = getSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let providedSig: Buffer;
  try {
    providedSig = base64urlDecode(sigB64);
  } catch {
    return null;
  }
  const expectedSig = hmac(payloadB64, secret);
  if (providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  let payload: MobileTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload.customerId !== "string" || !payload.customerId)
    return null;
  if (typeof payload.exp !== "number") return null;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

  return { customerId: payload.customerId };
}

/**
 * Extract and verify the mobile session from an incoming request.
 * Returns null if the Authorization header is missing/invalid/expired.
 */
export function verifyMobileToken(request: NextRequest): MobileSession | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return verifyMobileTokenString(token);
}

/**
 * Convenience helper: returns the session or a 401 NextResponse.
 * Usage:
 *   const session = requireMobileSession(request);
 *   if (session instanceof NextResponse) return session;
 */
export function requireMobileSession(
  request: NextRequest,
): MobileSession | NextResponse {
  const session = verifyMobileToken(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

/**
 * Optional-auth helper: returns the session when a valid Bearer token is
 * present, otherwise null. Used by endpoints that personalize for logged-in
 * users but still serve anonymous traffic (e.g. view tracking, recommendations).
 */
export function tryMobileSession(request: NextRequest): MobileSession | null {
  return verifyMobileToken(request);
}
