# Session M1.1 — Self-hosted Manager Auth

**Type:** Worker session (велика, ~25-30 файлів)
**Branch:** `claude/manager-m1-1-auth-{XXXX}` (генерується кліком)
**Goal:** Власна authorization-система для менеджерів **без Supabase**. Таблиця `users`, bcrypt пароль, HMAC JWT, password-reset через email-link, admin invite-flow з UI, seed-скрипт першого admin.

**Parent spec:** [`docs/MANAGER_APP_STRATEGY.md`](MANAGER_APP_STRATEGY.md). **Backlog ref:** [`docs/M1_BACKLOG.md`](M1_BACKLOG.md) → M1.1 entry.

---

## ⚠️ HARD RULES

1. **DO NOT touch** `apps/store/middleware.ts` Supabase-протекту для `/admin/:path*`. Існуючий admin login лишається на Supabase до S88. Manager app — окремий matcher.
2. **DO NOT touch** `apps/store/lib/supabase/*` файли. Не імпортуй `@supabase/*` у нових файлах.
3. **DO NOT touch** `apps/mobile-client/` (customer Expo app — окремий продукт).
4. **DO NOT touch** customer auth endpoints `/api/mobile/auth/*` чи `lib/customer-auth.ts`.
5. **DO NOT** додавати нові route у `/admin/*`. Усе manager — під `/manager/*` + `/api/v1/manager/*`.
6. **DO NOT** видавати plaintext passwords у logs, email body, JSON responses, або зберігати у БД.
7. **DO NOT** використовувати JWT для refresh tokens — refresh = випадкове 32-байтове значення, у БД зберігається SHA-256.
8. **Reuse** `lib/email.ts::enqueueEmail()` для всіх email-сендів (S70 EmailJob queue). Не дзвонити Resend напряму.
9. **Reuse** `lib/rate-limit.ts::checkRateLimit()` для всіх auth-endpoints.
10. **Reuse** `@ltex/ui` components (`Button`, `Input`, `Card`, `Dialog`, `Toaster`, `useToast`).

---

## Big picture

Що менеджер бачить:

1. Відкриває `https://new.ltex.com.ua/manager` у браузері → редирект на `/manager/login`.
2. Вводить email + пароль → потрапляє у dashboard.
3. Якщо забув пароль → клік "Забули пароль?" → вводить email → перевіряє пошту → клік по посиланню → задає новий пароль → редирект на login.
4. Якщо адмін вперше додав менеджера → менеджеру приходить лист "Вас запросили в L-TEX Manager" → клік по посиланню → задає пароль (перший раз) → логіниться.

Що адмін додатково бачить:

5. У sidebar — пункт "Користувачі" (тільки якщо role=admin).
6. Сторінка `/manager/admin/users` — таблиця менеджерів з кнопкою "+ Запросити".
7. У формі invite — email + ПІБ + роль → submit → менеджеру летить email.
8. На тій самій сторінці можна вимкнути менеджера (toggle `isActive`), змінити роль, force-reset пароль.

---

## Файли — повний перелік

### Нові файли

```
packages/db/prisma/migrations/2026MMDD_users_auth/migration.sql
packages/db/prisma/schema.prisma                              ← edit (додати моделі)

apps/store/lib/auth/password.ts                               ← hashPassword, verifyPassword, generateRandomPassword
apps/store/lib/auth/jwt.ts                                    ← signAccessToken, verifyAccessToken, signRefreshToken, sha256
apps/store/lib/auth/lockout.ts                                ← recordFailedLogin, clearFailedLogins, isLocked
apps/store/lib/auth/manager-auth.ts                           ← getCurrentUser(req) helper
apps/store/lib/auth/manager-auth.test.ts
apps/store/lib/auth/password.test.ts
apps/store/lib/auth/jwt.test.ts
apps/store/lib/auth/lockout.test.ts

apps/store/lib/email/templates/manager-invite.ts              ← HTML + text invite letter
apps/store/lib/email/templates/manager-password-reset.ts     ← HTML + text reset letter

apps/store/middleware-manager.ts                              ← окремий guard логічно (експорт використовується у root middleware)

apps/store/app/api/v1/manager/auth/login/route.ts
apps/store/app/api/v1/manager/auth/login/route.test.ts
apps/store/app/api/v1/manager/auth/refresh/route.ts
apps/store/app/api/v1/manager/auth/refresh/route.test.ts
apps/store/app/api/v1/manager/auth/logout/route.ts
apps/store/app/api/v1/manager/auth/me/route.ts
apps/store/app/api/v1/manager/auth/password-reset/request/route.ts
apps/store/app/api/v1/manager/auth/password-reset/request/route.test.ts
apps/store/app/api/v1/manager/auth/password-reset/confirm/route.ts
apps/store/app/api/v1/manager/auth/password-reset/confirm/route.test.ts
apps/store/app/api/v1/manager/admin/users/route.ts            ← GET list + POST invite
apps/store/app/api/v1/manager/admin/users/[id]/route.ts       ← PATCH (toggle active, change role, force reset)
apps/store/app/api/v1/manager/admin/users/route.test.ts

apps/store/app/manager/(auth)/layout.tsx                      ← простий centered layout без sidebar
apps/store/app/manager/(auth)/login/page.tsx
apps/store/app/manager/(auth)/forgot/page.tsx
apps/store/app/manager/(auth)/reset/page.tsx                  ← reads ?token=XXX&invite=true|false
apps/store/app/manager/(auth)/login/login-form.tsx            ← client component
apps/store/app/manager/(auth)/forgot/forgot-form.tsx
apps/store/app/manager/(auth)/reset/reset-form.tsx

apps/store/app/manager/(workstation)/admin/users/page.tsx     ← admin only, list users
apps/store/app/manager/(workstation)/admin/users/invite-modal.tsx
apps/store/app/manager/(workstation)/admin/users/users-table.tsx
apps/store/app/manager/(workstation)/admin/users/user-row-actions.tsx

apps/store/lib/validations/manager-auth.ts                    ← Zod schemas

scripts/seed-admin-user.ts
```

### Edit існуючих

```
apps/store/middleware.ts                                       ← розширити matcher додавши /manager/:path*
packages/db/prisma/schema.prisma                              ← додати User, UserRefreshToken, PasswordResetToken, ClientAssignment, enum UserRole
apps/store/package.json                                       ← + bcryptjs, @types/bcryptjs
.env.example                                                  ← + MANAGER_JWT_SECRET, MOBILE_EXCHANGE_SOAP_* stubs, SEED_ADMIN_* (комент only)
apps/store/instrumentation.ts                                 ← + validateProductionSecrets: MANAGER_JWT_SECRET ≥32 bytes
```

---

## Detailed tasks

### Task 1 — Prisma schema + migration

Додати у `packages/db/prisma/schema.prisma`:

```prisma
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  passwordHash    String                          // bcryptjs $2b$ hash, cost=12
  fullName        String
  role            UserRole @default(manager)
  isActive        Boolean  @default(true)

  // 1C-bridge (manager-specific, null для non-manager)
  code1C          String?  @unique
  warehouseId1C   String?

  // Telegram bot bridge
  telegramChatId    String? @unique
  telegramLinkToken String? @unique
  notifyChannels    String[] @default(["push","telegram"])

  // Audit
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lastSeenAt      DateTime?
  lastLoginIp     String?

  // Lockout
  failedLoginCount Int      @default(0)
  lockedUntil      DateTime?

  // relations
  refreshTokens   UserRefreshToken[]
  passwordResets  PasswordResetToken[]
  assignedClients ClientAssignment[]

  @@map("users")
}

enum UserRole {
  manager
  senior_manager
  admin
}

model UserRefreshToken {
  id          String   @id @default(cuid())
  userId      String
  tokenHash   String   @unique
  expiresAt   DateTime
  revokedAt   DateTime?
  userAgent   String?
  ipAddress   String?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@map("user_refresh_tokens")
}

model PasswordResetToken {
  id          String   @id @default(cuid())
  userId      String
  tokenHash   String   @unique
  expiresAt   DateTime
  usedAt      DateTime?
  isInvite    Boolean  @default(false)   // true → довша expiry (7 днів), показує "Welcome" текст у UI
  requestedIp String?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, usedAt])
  @@map("password_reset_tokens")
}

model ClientAssignment {
  id          String   @id @default(cuid())
  userId      String
  customerId  String
  assignedAt  DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, customerId])
  @@map("client_assignments")
}
```

Запустити локально (sandbox **немає** PostgreSQL — `prisma migrate dev` впаде; це нормально, **спочатку запиши міграцію руками** як SQL у `migrations/2026MMDD_users_auth/migration.sql`, потім лиш `prisma generate`):

```sql
-- packages/db/prisma/migrations/2026MMDD_users_auth/migration.sql
CREATE TYPE "UserRole" AS ENUM ('manager', 'senior_manager', 'admin');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'manager',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "code1C" TEXT,
  "warehouseId1C" TEXT,
  "telegramChatId" TEXT,
  "telegramLinkToken" TEXT,
  "notifyChannels" TEXT[] DEFAULT ARRAY['push','telegram']::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3),
  "lastLoginIp" TEXT,
  "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_code1C_key" ON "users"("code1C");
CREATE UNIQUE INDEX "users_telegramChatId_key" ON "users"("telegramChatId");
CREATE UNIQUE INDEX "users_telegramLinkToken_key" ON "users"("telegramLinkToken");

CREATE TABLE "user_refresh_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_refresh_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_refresh_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "user_refresh_tokens_tokenHash_key" ON "user_refresh_tokens"("tokenHash");
CREATE INDEX "user_refresh_tokens_userId_revokedAt_idx" ON "user_refresh_tokens"("userId","revokedAt");

CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "isInvite" BOOLEAN NOT NULL DEFAULT false,
  "requestedIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_usedAt_idx" ON "password_reset_tokens"("userId","usedAt");

CREATE TABLE "client_assignments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_assignments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "client_assignments_userId_customerId_key" ON "client_assignments"("userId","customerId");
```

### Task 2 — `lib/auth/password.ts`

```typescript
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateRandomPassword(length = 16): string {
  // base64url, без +/=, легко скопіювати
  return randomBytes(length).toString("base64url").slice(0, length);
}

export function validatePasswordStrength(plain: string): { ok: boolean; reason?: string } {
  if (plain.length < 12) return { ok: false, reason: "Мінімум 12 символів" };
  if (!/[0-9]/.test(plain)) return { ok: false, reason: "Хоча б одна цифра" };
  if (!/[A-Za-zА-Яа-яҐІЇЄ]/.test(plain)) return { ok: false, reason: "Хоча б одна буква" };
  return { ok: true };
}
```

### Task 3 — `lib/auth/jwt.ts`

```typescript
import { createHmac, randomBytes, createHash } from "crypto";

const ALG = "HS256";
const ACCESS_TTL_SEC = 15 * 60;          // 15 хв
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60; // 30 днів

export interface AccessTokenPayload {
  sub: string;       // userId
  role: "manager" | "senior_manager" | "admin";
  iat: number;
  exp: number;
}

function getSecret(): string {
  const s = process.env.MANAGER_JWT_SECRET;
  if (!s || s.length < 32) throw new Error("MANAGER_JWT_SECRET must be at least 32 chars");
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

export function signAccessToken(userId: string, role: AccessTokenPayload["role"]): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: ALG, typ: "JWT" };
  const payload: AccessTokenPayload = { sub: userId, role, iat: now, exp: now + ACCESS_TTL_SEC };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = createHmac("sha256", getSecret()).update(`${h}.${p}`).digest();
  if (!timingSafeEqual(fromB64url(s), expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(p).toString("utf8")) as AccessTokenPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): { plain: string; hash: string; expiresAt: Date } {
  const plain = randomBytes(32).toString("base64url");
  const hash = sha256(plain);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000);
  return { plain, hash, expiresAt };
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

import { timingSafeEqual as _timingSafeEqual } from "crypto";
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return _timingSafeEqual(a, b);
}
```

### Task 4 — `lib/auth/lockout.ts`

```typescript
import { prisma } from "@ltex/db";

const MAX_FAILS = 5;
const LOCKOUT_MIN = 15;

export async function isLocked(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { lockedUntil: true },
  });
  if (!u?.lockedUntil) return false;
  return u.lockedUntil > new Date();
}

export async function recordFailedLogin(userId: string): Promise<void> {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (u.failedLoginCount >= MAX_FAILS) {
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_MIN * 60 * 1000) },
    });
  }
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}
```

### Task 5 — `lib/auth/manager-auth.ts`

```typescript
import { prisma } from "@ltex/db";
import { verifyAccessToken } from "./jwt";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

export async function getCurrentUser(req?: NextRequest) {
  const token = await readToken(req);
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true, email: true, fullName: true, role: true, isActive: true,
      code1C: true, telegramChatId: true, notifyChannels: true, lastSeenAt: true,
    },
  });
  if (!user || !user.isActive) return null;
  return { ...user, telegramLinked: user.telegramChatId !== null };
}

async function readToken(req?: NextRequest): Promise<string | null> {
  // 1) Authorization: Bearer
  const auth = req?.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];

  // 2) httpOnly cookie (для browser SSR)
  const cookieStore = await cookies();
  const c = cookieStore.get("ltex_mgr_access");
  return c?.value ?? null;
}

export async function requireRole(roles: ("manager" | "senior_manager" | "admin")[]) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!roles.includes(user.role)) return null;
  return user;
}
```

### Task 6 — Zod schemas `lib/validations/manager-auth.ts`

```typescript
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Невірний email").max(120),
  password: z.string().min(1).max(200),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email().max(120),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(120),
  newPassword: z.string()
    .min(12, "Мінімум 12 символів")
    .max(200)
    .refine((v) => /[0-9]/.test(v), "Хоча б одна цифра")
    .refine((v) => /[A-Za-zА-Яа-яҐІЇЄ]/.test(v), "Хоча б одна буква"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const inviteUserSchema = z.object({
  email: z.string().email().max(120),
  fullName: z.string().min(2).max(120),
  role: z.enum(["manager", "senior_manager", "admin"]).default("manager"),
});

export const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["manager", "senior_manager", "admin"]).optional(),
  fullName: z.string().min(2).max(120).optional(),
  forcePasswordReset: z.boolean().optional(),  // якщо true → revoke all refresh + email link
});
```

### Task 7 — POST `/api/v1/manager/auth/login`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { loginSchema } from "@/lib/validations/manager-auth";
import { verifyPassword } from "@/lib/auth/password";
import { signAccessToken, generateRefreshToken } from "@/lib/auth/jwt";
import { isLocked, recordFailedLogin, clearFailedLogins } from "@/lib/auth/lockout";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`mgr-login:${ip}`, { window: 60_000, max: 10 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Забагато спроб. Спробуйте за хвилину." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані", details: parsed.error.issues.slice(0, 3) }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Anti-enumeration — same response for "no user" + "wrong password"
  if (!user) {
    return NextResponse.json({ error: "Невірний email або пароль" }, { status: 401 });
  }

  if (!user.isActive) {
    return NextResponse.json({ error: "Обліковий запис вимкнено" }, { status: 403 });
  }

  if (await isLocked(user.id)) {
    return NextResponse.json({ error: "Обліковий запис тимчасово заблоковано. Спробуйте через 15 хвилин." }, { status: 423 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await recordFailedLogin(user.id);
    return NextResponse.json({ error: "Невірний email або пароль" }, { status: 401 });
  }

  // success
  await clearFailedLogins(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date(), lastLoginIp: ip },
  });

  const accessToken = signAccessToken(user.id, user.role);
  const refresh = generateRefreshToken();
  await prisma.userRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      ipAddress: ip,
    },
  });

  const res = NextResponse.json({
    accessToken,
    refreshToken: refresh.plain,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      telegramLinked: user.telegramChatId !== null,
    },
  });
  // Mirror у cookies для SSR-страніц
  res.cookies.set("ltex_mgr_access", accessToken, {
    httpOnly: true, sameSite: "lax", secure: true, maxAge: 15 * 60, path: "/manager",
  });
  res.cookies.set("ltex_mgr_refresh", refresh.plain, {
    httpOnly: true, sameSite: "lax", secure: true, maxAge: 30 * 24 * 60 * 60, path: "/api/v1/manager/auth",
  });
  return res;
}
```

### Task 8 — refresh / logout / me endpoints

(Аналогічна структура. Refresh: lookup tokenHash, revoke old, issue new. Logout: revoke single (з `?everywhere=true` — revoke all для user). Me: повертає user shape.)

Окремо для **refresh**:
- Body `{ refreshToken }` АБО з cookie `ltex_mgr_refresh`
- Знайти `UserRefreshToken` by `tokenHash = sha256(refreshToken)`, `revokedAt IS NULL`, `expiresAt > now`
- Mark old revoked + create new + issue new access
- Set both cookies

### Task 9 — password-reset endpoints

**`/request`:** 
- Завжди return 202 (anti-enumeration)
- Якщо user знайдено + isActive — згенерувати `randomBytes(32)`, store sha256 з `expiresAt = now + 1h`, `isInvite=false`
- Запустити `enqueueEmail()` з template `manager-password-reset.ts`
- Rate limit 3/hour/email

**`/confirm`:**
- Знайти `PasswordResetToken` by `tokenHash`, validate `usedAt IS NULL`, `expiresAt > now`
- bcrypt-hash newPassword → save у User.passwordHash
- Revoke ALL `UserRefreshToken` для user-а
- Clear failed login counters + lockedUntil
- Mark token `usedAt = now`

### Task 10 — admin invite endpoints

**POST `/api/v1/manager/admin/users`:**
- Auth required, role === "admin"
- Body `{ email, fullName, role }` (Zod)
- Check email unique
- Generate randomPassword + hash → User row (isActive=true, role)
- Generate PasswordResetToken з `isInvite=true`, `expiresAt = now + 7 days`
- Send email через template `manager-invite.ts` з link `https://new.ltex.com.ua/manager/reset?token=XXX&invite=true`
- Return `{ id, email, fullName, role, inviteSent: true }`

**GET `/api/v1/manager/admin/users`:**
- Admin only, list з pagination

**PATCH `/api/v1/manager/admin/users/{id}`:**
- Admin only, Body `{ isActive?, role?, fullName?, forcePasswordReset? }`
- If `forcePasswordReset=true` → revoke all refresh + create PasswordResetToken (isInvite=false) + send email

### Task 11 — Email templates

**`lib/email/templates/manager-invite.ts`:**

```typescript
export function buildManagerInviteEmail({ fullName, resetUrl }: { fullName: string; resetUrl: string }) {
  return {
    subject: "Вас запросили в L-TEX Manager",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Вітаємо, ${escapeHtml(fullName)}!</h2>
        <p>Вас запросили до робочого додатку L-TEX Manager. Щоб почати — задайте свій пароль:</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:white;text-decoration:none;border-radius:6px">
            Задати пароль
          </a>
        </p>
        <p style="color:#666;font-size:14px">Якщо кнопка не працює — скопіюйте посилання: <br/><code>${resetUrl}</code></p>
        <p style="color:#999;font-size:12px">Посилання дійсне 7 днів. Якщо ви не очікували цього листа — просто проігноруйте його.</p>
      </div>
    `,
    text: `Вітаємо, ${fullName}!\n\nВас запросили до L-TEX Manager. Задайте свій пароль:\n${resetUrl}\n\nПосилання дійсне 7 днів.`,
  };
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
```

**`manager-password-reset.ts`:** аналогічно, subject "Скидання пароля L-TEX Manager", expiry "1 година".

Обидва викликаються через `lib/email.ts::enqueueEmail({ to, subject, htmlBody, textBody }, source: "manager-auth", referenceId: userId)`.

### Task 12 — UI pages

**`/manager/(auth)/login/page.tsx`:**
- Server component, redirect on `/manager` якщо вже залогінений (через `getCurrentUser()`)
- Render `<LoginForm />` client component

**`<LoginForm />` (client):**
- Fields: email, password, "Забули пароль?" link
- POST `/api/v1/manager/auth/login`
- On 200 → `router.push("/manager")`
- On 401 → toast "Невірний email або пароль"
- On 423 → "Обліковий запис тимчасово заблоковано на 15 хв"
- On 429 → "Забагато спроб. Спробуйте за хвилину."
- Loading state на submit

**`/manager/(auth)/forgot/page.tsx` + `<ForgotForm />`:**
- Email field, POST `/password-reset/request`
- On 202 → success screen "Перевірте пошту"

**`/manager/(auth)/reset/page.tsx` + `<ResetForm />`:**
- Read `?token=XXX&invite=true|false` (через `useSearchParams`)
- Якщо `invite=true` — show "Ласкаво просимо! Задайте свій пароль", інакше "Скидання пароля"
- 2 password fields (new + confirm), validate strength inline
- POST `/password-reset/confirm`
- On 200 → toast "Готово, увійдіть з новим паролем" + redirect `/manager/login`

### Task 13 — Admin users page

**`/manager/admin/users/page.tsx`** (server):
- `requireRole(["admin"])` → 404 if not admin
- Fetch users list
- Render `<UsersTable users={...} />` + `<InviteModal />` (trigger button)

**`<InviteModal />`** (client, shadcn Dialog):
- Form: email + fullName + role select
- POST `/api/v1/manager/admin/users`
- On 200 → toast "Запрошення відправлено на email", close modal, revalidate list

**`<UsersTable />`:**
- Columns: ПІБ / Email / Роль / Статус (Active toggle) / Last seen / Actions
- Action: dropdown з "Змінити роль", "Скинути пароль", "Вимкнути"
- Кожна дія → PATCH `/api/v1/manager/admin/users/{id}`

### Task 14 — Middleware update

Розширити `apps/store/middleware.ts`:

```typescript
import { updateSession } from "@/lib/supabase/middleware";       // existing (admin only)
import { managerGuard } from "@/middleware-manager";              // new
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/manager")) {
    return managerGuard(request);
  }
  if (path.startsWith("/admin")) {
    return updateSession(request);
  }
  return undefined;
}

export const config = {
  matcher: ["/admin/:path*", "/manager/:path*"],
};
```

`middleware-manager.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const PUBLIC = ["/manager/login", "/manager/forgot", "/manager/reset"];

export async function managerGuard(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const cookie = req.cookies.get("ltex_mgr_access")?.value;
  const payload = cookie ? verifyAccessToken(cookie) : null;

  if (PUBLIC.some((p) => path.startsWith(p))) {
    // Якщо вже залогінений — на dashboard
    if (payload) {
      const url = req.nextUrl.clone();
      url.pathname = "/manager";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = "/manager/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
```

### Task 15 — Seed script

**`scripts/seed-admin-user.ts`:**

```typescript
#!/usr/bin/env tsx
import { prisma } from "@ltex/db";
import { hashPassword } from "@/lib/auth/password";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Адміністратор L-TEX";

  if (!email || !password) {
    console.error("Set SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD env vars");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 chars");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists. Skip.`);
    return;
  }

  const hash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: hash,
      fullName: name,
      role: "admin",
      isActive: true,
    },
  });
  console.log(`✓ Created admin: ${user.email} (id=${user.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

### Task 16 — Env vars

Додати у `apps/store/.env.example`:

```env
# Manager Workstation (M1.x)
MANAGER_JWT_SECRET=                 # required, ≥32 bytes (openssl rand -base64 48)
MOBILE_EXCHANGE_SOAP_URL=           # TBD у M1.5
MOBILE_EXCHANGE_SOAP_USER=          # TBD у M1.5
MOBILE_EXCHANGE_SOAP_PASSWORD=      # TBD у M1.5

# Seed first admin (одноразово при першому deploy, потім видалити)
# SEED_ADMIN_EMAIL=ltex.lutsk.ai@gmail.com
# SEED_ADMIN_PASSWORD=<тимчасовий 12+ chars>
# SEED_ADMIN_NAME=Адміністратор L-TEX
```

Update `apps/store/instrumentation.ts::validateProductionSecrets()`:

```typescript
if (!process.env.MANAGER_JWT_SECRET || process.env.MANAGER_JWT_SECRET.length < 32) {
  throw new Error("MANAGER_JWT_SECRET must be at least 32 characters");
}
```

### Task 17 — Tests (≥18 unit)

Кожен test-файл живе поряд з кодом (`*.test.ts`).

**`password.test.ts`:**
- `hashPassword + verifyPassword` round-trip
- Wrong password → false
- `generateRandomPassword(16)` length === 16, base64url chars only
- `validatePasswordStrength` happy + each rule

**`jwt.test.ts`:**
- `signAccessToken` → `verifyAccessToken` round-trip
- Tampered signature → null
- Expired (mock Date.now) → null
- Missing secret throws

**`lockout.test.ts`** (with prisma mock or real test DB):
- 5 fails → locked
- After window passes → unlocked
- Clear resets counter

**`login/route.test.ts`** (≥5):
- Happy login → 200 + accessToken
- Wrong password → 401 + counter++
- Non-existent email → 401 (same response — anti-enum)
- Locked user → 423
- Inactive user → 403
- Rate-limit 11/min → 429

**`refresh/route.test.ts`** (≥3):
- Happy rotate → 200, old revoked
- Already revoked → 401
- Expired → 401

**`password-reset/request/route.test.ts`** (≥2):
- Happy → 202, EmailJob enqueued
- Non-existent email → 202 (no job enqueued)
- Rate-limit 4/hour → 429

**`password-reset/confirm/route.test.ts`** (≥3):
- Happy → 200, password changed, all refresh revoked
- Expired token → 401
- Already used → 401

**`admin/users/route.test.ts`** (≥3):
- POST happy → user created + invite email queued
- POST non-admin → 403
- POST duplicate email → 409

**`manager-auth.test.ts`** (≥2):
- `getCurrentUser` happy via Bearer
- Inactive user → null
- Invalid token → null

---

## Acceptance criteria

- [ ] Усе під `apps/store/app/api/v1/manager/auth/*` працює локально через `pnpm dev`
- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] Уся нова auth-логіка БЕЗ імпорту з `@supabase/*`
- [ ] `MANAGER_JWT_SECRET` додано у `.env.example` + `instrumentation.ts` validates
- [ ] Tests ≥ 18, усі passing
- [ ] У production-build (`NODE_ENV=production pnpm build`) `output:standalone` усе ще працює
- [ ] **DO NOT** push на `main`. Push **тільки** на `claude/manager-m1-1-auth-{XXXX}` feature branch.

---

## User-action post-merge

1. **Згенерувати JWT-секрет** на Windows-сервері:
   ```powershell
   openssl rand -base64 48
   ```
   Скопіюй output → додай в `E:\ltex-ecosystem\apps\store\.env`:
   ```
   MANAGER_JWT_SECRET=<вставлений output>
   ```

2. **Запустити міграцію DB:**
   ```powershell
   cd E:\ltex-ecosystem
   pnpm --filter @ltex/db exec prisma migrate deploy
   ```

3. **Seed першого admin** (одноразово):
   ```powershell
   $env:SEED_ADMIN_EMAIL = "ltex.lutsk.ai@gmail.com"
   $env:SEED_ADMIN_PASSWORD = "<придумай 12+ chars>"
   $env:SEED_ADMIN_NAME = "Адміністратор L-TEX"
   cd E:\ltex-ecosystem
   pnpm --filter @ltex/store exec tsx scripts/seed-admin-user.ts
   ```
   Після успіху — видали ці env vars з PowerShell (`Remove-Item Env:SEED_ADMIN_*`).

4. **Рестарт PM2:** `pm2 restart ltex-store --update-env`.

5. **Перевірка:**
   - Відкрий `https://new.ltex.com.ua/manager` → має redirect на `/manager/login`.
   - Залогінься з email `ltex.lutsk.ai@gmail.com` + seed-паролем.
   - Має відкритись `/manager` (заглушка з 404 поки що — Dashboard буде у M1.2).
   - Зайди в `/manager/admin/users` → має показати список з одним user-ом (ти).

6. **Запросити першого менеджера:**
   - У `/manager/admin/users` клік "+ Запросити" → email + ПІБ → submit.
   - На пошту менеджера прийде лист "Вас запросили в L-TEX Manager".
   - Менеджер клікає → задає свій пароль → логіниться.

---

## Reference

- `MANAGER_APP_STRATEGY.md §4` — full auth design
- `M1_BACKLOG.md` → M1.1 entry
- `lib/email.ts` (S70) — `enqueueEmail()` pattern для async-send
- `lib/rate-limit.ts` (S64) — `getClientIp()` cf-connecting-ip priority
- `apps/store/instrumentation.ts` — fail-fast secrets validation
- Existing customer auth `apps/store/app/api/mobile/auth/route.ts` — JWT pattern reference (НЕ копіюй, бо там HMAC inline; у manager-auth винеси у lib/auth/jwt.ts окремо)

---

## Out of scope для M1.1

- Workstation dashboard UI (заглушка page що нічого не показує — Dashboard у M1.2)
- Sync worker (нічого не sync-ить — M1.3+)
- Telegram pairing (Settings page має заглушку UI — реальне binding у M1.10)
- 1С SOAP calls (env vars додаються як stub, реальні calls — M1.3+)
- Existing `/admin/login` (Supabase) — не торкаємо
