import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@ltex/db";

/**
 * Web customer auth (S73).
 *
 * Phone+name lead-capture login (no password, no OTP). Token is an
 * HMAC-signed payload stored in an HTTP-only cookie. Used to:
 *   - gate prices on /catalog, /lots, /product, /lot detail pages
 *   - enable /account (profile + orders)
 *
 * Mobile API uses a separate Bearer-token flow (lib/mobile-auth.ts).
 */

export const CUSTOMER_COOKIE_NAME = "ltex_customer";
export const CUSTOMER_COOKIE_TTL_DAYS = 30;
const CUSTOMER_COOKIE_TTL_SECONDS = CUSTOMER_COOKIE_TTL_DAYS * 86_400;

interface CustomerTokenPayload {
  customerId: string;
  iat: number; // issued-at, Unix seconds
}

export interface CurrentCustomer {
  id: string;
  phone: string;
  name: string;
}

function getSecret(): string | null {
  const secret = process.env.CUSTOMER_AUTH_SECRET;
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

export function signCustomerToken(customerId: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload: CustomerTokenPayload = {
    customerId,
    iat: Math.floor(Date.now() / 1000),
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = hmac(payloadB64, secret);
  return `${payloadB64}.${base64urlEncode(sig)}`;
}

export function verifyCustomerToken(
  token: string,
): CustomerTokenPayload | null {
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

  let payload: CustomerTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.customerId !== "string" ||
    !payload.customerId
  ) {
    return null;
  }
  if (typeof payload.iat !== "number") return null;

  const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
  if (ageSeconds < 0) return null;
  if (ageSeconds > CUSTOMER_COOKIE_TTL_SECONDS) return null;

  return payload;
}

/**
 * Read the current customer from the auth cookie. Returns null when the
 * cookie is missing, the token is invalid/expired, or the customer was
 * deleted. Safe to call from any Server Component or route handler.
 */
export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  const cookie = (await cookies()).get(CUSTOMER_COOKIE_NAME);
  if (!cookie?.value) return null;
  const payload = verifyCustomerToken(cookie.value);
  if (!payload) return null;

  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId },
    select: { id: true, phone: true, name: true },
  });
  if (!customer || !customer.phone) return null;
  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
  };
}

export async function setCustomerCookie(customerId: string): Promise<void> {
  const token = signCustomerToken(customerId);
  if (!token) {
    throw new Error("CUSTOMER_AUTH_SECRET is not configured");
  }
  (await cookies()).set(CUSTOMER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CUSTOMER_COOKIE_TTL_SECONDS,
  });
}

export async function clearCustomerCookie(): Promise<void> {
  (await cookies()).delete(CUSTOMER_COOKIE_NAME);
}

/**
 * Minimum price-like shape consumed by the price gate. Every Prisma `Price`
 * row satisfies this, as do the thin `{ priceType, amount }`-style selects
 * used in catalog/recommendations endpoints. The constraint replaces the
 * looser `unknown[]` to prevent shape drift (e.g. accidentally passing a
 * `string[]` of formatted prices).
 */
interface ProductWithPrices {
  prices: { priceType: string; amount: number }[];
}

/**
 * Server-side helper for the price gate (S73). Returns a shallow-cloned
 * array with `prices` set to `[]` on each product when the visitor is
 * unauthenticated. Returns the original array unchanged for authenticated
 * visitors.
 *
 * Non-mutating by design: callers commonly pass results from
 * `unstable_cache(...)`, which are shared across requests. Mutating those
 * objects would leak the guest view to subsequent authenticated readers.
 */
export async function stripPricesForGuests<T extends ProductWithPrices>(
  products: T[],
  isAuthenticated?: boolean,
): Promise<T[]> {
  let authed = isAuthenticated;
  if (authed === undefined) {
    authed = (await getCurrentCustomer()) !== null;
  }
  if (authed) return products;
  return products.map((p) => ({ ...p, prices: [] }));
}
