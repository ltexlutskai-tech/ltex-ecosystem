import {
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual as nodeTimingSafeEqual,
} from "crypto";

const ALG = "HS256";
// Access-токен живе стільки ж, скільки й сесія в браузері (кукі — сесійні,
// path "/", тож прибираються при закритті браузера). Раніше було 15 хв, і
// користувача викидало на екран входу серед робочого дня, бо тихе поновлення
// через refresh-токен не було підключене. Довгий токен + сесійна кука = вхід
// «памʼятається» під час роботи й очищується лише при закритті браузера.
// Безпека: getCurrentUser на кожному запиті звіряє user.isActive у БД —
// вимкнення користувача блокує його миттєво, незалежно від строку токена.
const ACCESS_TTL_SEC = 30 * 24 * 60 * 60; // 30 днів
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60; // 30 днів

export type ManagerRole =
  | "manager"
  | "senior_manager"
  | "admin"
  // Розширення (Тиждень 1 блоку Ролі, 2026-06-03)
  | "owner"
  | "supervisor"
  | "analyst"
  | "warehouse"
  // Експедитор — водій маршрутних листів (доставка/завантаження)
  | "expeditor"
  | "bookkeeper";

// Усі валідні ролі токена. Раніше verifyAccessToken приймав лише
// manager/senior_manager/admin — токени owner/warehouse/… не проходили
// верифікацію (латентний баг після розширення ролей 2026-06-03).
export const VALID_ROLES: ReadonlySet<ManagerRole> = new Set<ManagerRole>([
  "manager",
  "senior_manager",
  "admin",
  "owner",
  "supervisor",
  "analyst",
  "warehouse",
  "expeditor",
  "bookkeeper",
]);

// Ролі з доступом до адмін-панелі (/admin/*).
export const ADMIN_ROLES: ReadonlySet<ManagerRole> = new Set<ManagerRole>([
  "admin",
  "owner",
]);

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
    if (!VALID_ROLES.has(payload.role)) {
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
