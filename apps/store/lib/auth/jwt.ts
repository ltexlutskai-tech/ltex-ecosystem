import {
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual as nodeTimingSafeEqual,
} from "crypto";

const ALG = "HS256";
const ACCESS_TTL_SEC = 15 * 60; // 15 хв
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60; // 30 днів

export type ManagerRole = "manager" | "senior_manager" | "admin";

export interface AccessTokenPayload {
  sub: string; // userId
  role: ManagerRole;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const s = process.env.MANAGER_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("MANAGER_JWT_SECRET must be at least 32 characters");
  }
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return nodeTimingSafeEqual(a, b);
}

export function signAccessToken(userId: string, role: ManagerRole): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: ALG, typ: "JWT" };
  const payload: AccessTokenPayload = {
    sub: userId,
    role,
    iat: now,
    exp: now + ACCESS_TTL_SEC,
  };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!h || !p || !s) return null;

  let providedSig: Buffer;
  try {
    providedSig = fromB64url(s);
  } catch {
    return null;
  }
  let expectedSig: Buffer;
  try {
    expectedSig = createHmac("sha256", getSecret())
      .update(`${h}.${p}`)
      .digest();
  } catch {
    return null;
  }
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  try {
    const payload = JSON.parse(
      fromB64url(p).toString("utf8"),
    ) as AccessTokenPayload;
    if (typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (
      payload.role !== "manager" &&
      payload.role !== "senior_manager" &&
      payload.role !== "admin"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export interface RefreshTokenPair {
  plain: string;
  hash: string;
  expiresAt: Date;
}

export function generateRefreshToken(): RefreshTokenPair {
  const plain = randomBytes(32).toString("base64url");
  const hash = sha256(plain);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000);
  return { plain, hash, expiresAt };
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export const ACCESS_TOKEN_TTL_SEC = ACCESS_TTL_SEC;
export const REFRESH_TOKEN_TTL_SEC = REFRESH_TTL_SEC;
