# Session 73 — Customer auth + price gate + /account page

**Type:** Worker session
**Branch:** `claude/customer-auth-{XXXX}`
**Goal:** Web customer login (phone+name, без OTP), приховати ціни для гостей, особистий кабінет з профілем + замовленнями + вишлист sync + cart merge.

---

## ⚠️ HARD RULES

1. **Phone+Name auth БЕЗ OTP/паролю.** Просте wholesale lead-capture: ввів phone → знайшли/створили Customer → видали cookie. Цього достатньо для price gate. OTP — окрема follow-up задача.
2. **DO NOT change Customer schema.** `phone` залишається non-unique. Login через `findFirst({ where: { phone } })` + create-якщо-нема.
3. **Reuse mobile-auth pattern**. `lib/mobile-auth.ts` уже HMAC JWT — створюй `lib/customer-auth.ts` за тим самим паттерном (НЕ shared module — окрема utility, бо токени мають різні audiences).
4. **HTTP-only cookie**, `Secure` у production, `SameSite=Lax`, 30-day TTL. Назва: `ltex_customer`.
5. **Server-side price gate**: НЕ повертати ціни з server query якщо `getCustomer(cookies)` повертає null. На фронті — відсутній price → показуємо CTA. Anti-scraping за замовчуванням.
6. **DO NOT touch admin/mobile auth** — вони працюють як є.
7. **Existing cart logic** (`lib/cart.tsx`, sessionId у localStorage + `/api/cart`) **не ламати**. Тільки додати customerId merge на login.

---

## Поточний стан

- **Customer schema** (`packages/db/prisma/schema.prisma:147`) — є, з phone/name/email/telegram/city/notes. `phone` НЕ unique.
- **Cart schema** — `Cart.customerId @unique` АБО `Cart.sessionId @unique` (one or other). Patterns merge готові у DB.
- **mobile-auth.ts** — HMAC JWT, 30-day, no external deps. Reference pattern.
- **Header** — TBD де menu має бути. Подивись `apps/store/components/store/header.tsx` (або як voно називається).

---

## Tasks

### Phase 1: Customer auth foundation

#### 1.1 `apps/store/lib/customer-auth.ts` (нове)

```typescript
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@ltex/db";

const COOKIE_NAME = "ltex_customer";
const COOKIE_TTL_DAYS = 30;
const SECRET = process.env.CUSTOMER_AUTH_SECRET; // assert у instrumentation.ts

interface TokenPayload {
  customerId: string;
  iat: number; // issued-at (unix sec)
}

export function signCustomerToken(customerId: string): string {
  if (!SECRET) throw new Error("CUSTOMER_AUTH_SECRET missing");
  const payload: TokenPayload = {
    customerId,
    iat: Math.floor(Date.now() / 1000),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyCustomerToken(token: string): TokenPayload | null {
  if (!SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  // Expiry check (30 days)
  const ageDays = (Date.now() / 1000 - payload.iat) / 86400;
  if (ageDays > COOKIE_TTL_DAYS) return null;
  return payload;
}

export async function getCurrentCustomer(): Promise<{
  id: string;
  phone: string;
  name: string;
} | null> {
  const cookie = (await cookies()).get(COOKIE_NAME);
  if (!cookie?.value) return null;
  const payload = verifyCustomerToken(cookie.value);
  if (!payload) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId },
    select: { id: true, phone: true, name: true },
  });
  if (!customer || !customer.phone) return null;
  return customer as { id: string; phone: string; name: string };
}

export async function setCustomerCookie(customerId: string): Promise<void> {
  const token = signCustomerToken(customerId);
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_TTL_DAYS * 86400,
  });
}

export async function clearCustomerCookie(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
```

#### 1.2 `instrumentation.ts` — додати boot-check

У `validateProductionSecrets()` (S64) додай:

```typescript
if (
  process.env.NODE_ENV === "production" &&
  !process.env.CUSTOMER_AUTH_SECRET
) {
  throw new Error("CUSTOMER_AUTH_SECRET must be set in production");
}
if (
  process.env.CUSTOMER_AUTH_SECRET &&
  process.env.CUSTOMER_AUTH_SECRET.length < 32
) {
  throw new Error("CUSTOMER_AUTH_SECRET must be at least 32 characters");
}
```

#### 1.3 `.env.example` — додай рядок

```
CUSTOMER_AUTH_SECRET="generate with: openssl rand -hex 32"
```

#### 1.4 Login endpoint `apps/store/app/api/auth/customer/login/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { rateLimit } from "@/lib/rate-limit";
import { setCustomerCookie } from "@/lib/customer-auth";

const schema = z.object({
  phone: z.string().min(8).max(32),
  name: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  const limited = await rateLimit(request, "customer-login", {
    max: 5,
    window: 60_000,
  });
  if (limited) return limited; // 429

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    );
  }

  // Normalize phone: strip whitespace, ensure leading +
  const phone = parsed.data.phone
    .replace(/\s+/g, "")
    .replace(/^([0-9])/, "+$1");

  // Find existing or create
  let customer = await prisma.customer.findFirst({
    where: { phone },
    select: { id: true, name: true },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { phone, name: parsed.data.name },
      select: { id: true, name: true },
    });
  } else if (customer.name !== parsed.data.name && parsed.data.name) {
    // Update name if changed (user re-typed it differently)
    await prisma.customer.update({
      where: { id: customer.id },
      data: { name: parsed.data.name },
    });
  }

  await setCustomerCookie(customer.id);
  return NextResponse.json({
    ok: true,
    customer: { id: customer.id, name: parsed.data.name },
  });
}
```

#### 1.5 Logout endpoint `apps/store/app/api/auth/customer/logout/route.ts`

```typescript
import { NextResponse } from "next/server";
import { clearCustomerCookie } from "@/lib/customer-auth";

export async function POST() {
  await clearCustomerCookie();
  return NextResponse.json({ ok: true });
}
```

### Phase 2: Login UI

#### 2.1 `/login` page `apps/store/app/(store)/login/page.tsx`

Server-rendered shell + client form. Minimal Tailwind:

- Header "Увійти"
- Form: phone input (з placeholder "+380 XX XXX XX XX"), name input
- Submit button "Увійти"
- На submit → fetch POST /api/auth/customer/login → on success router.push("/account") OR back to ?returnTo=/catalog
- Error inline (rate-limited / invalid phone)
- Лінк "Перейти на головну"

UX nuances:

- accept Ukrainian phone formats: `+380...`, `380...`, `0...` → нормалізувати на client side у placeholder
- name autofill from `localStorage.getItem("ltex_customer_name_hint")` як зручність

#### 2.2 Header user menu

Знайди header component (likely `apps/store/components/store/header.tsx`). Додай:

```tsx
{
  customer ? (
    <div className="...dropdown...">
      <span>{customer.name}</span>
      <Link href="/account">Кабінет</Link>
      <form action="/api/auth/customer/logout" method="POST">
        <button>Вийти</button>
      </form>
    </div>
  ) : (
    <Link href="/login">Увійти</Link>
  );
}
```

`customer` дістати у server component header через `await getCurrentCustomer()`.

#### 2.3 i18n

Додати у `lib/i18n/uk.ts`:

- `dict.auth.login = "Увійти"`
- `dict.auth.logout = "Вийти"`
- `dict.auth.account = "Особистий кабінет"`
- `dict.auth.phoneLabel = "Номер телефону"`
- `dict.auth.nameLabel = "Імʼя"`
- `dict.auth.priceLoginPrompt = "Увійдіть щоб побачити ціну"`
- `dict.auth.welcomeBack = "Вітаємо знову"` (greeting)

### Phase 3: Price gate

#### 3.1 Server-side price stripping

У `apps/store/lib/catalog.ts::searchProducts()` додай:

```typescript
import { getCurrentCustomer } from "./customer-auth";
// ...всередині функції після query, перед return:
const customer = await getCurrentCustomer();
if (!customer) {
  // Strip prices for guests
  for (const p of products) {
    p.prices = []; // or remove entire .prices field if shape allows
  }
}
return { products, total };
```

Те саме у `app/(store)/lots/page.tsx` — server query Lot:

```typescript
const customer = await getCurrentCustomer();
const lots = await prisma.lot.findMany({...});
const sanitized = customer ? lots : lots.map(l => ({ ...l, priceEur: null }));
```

⚠️ **Mobile API лишається з цінами** — у `/api/mobile/*` endpoints НЕ застосовувати price gate (mobile має JWT auth).

#### 3.2 New component `apps/store/components/store/price-or-login.tsx`

```tsx
"use client";
import Link from "next/link";

interface Props {
  priceEur?: number | null;
  priceUah?: number | null;
  pricePerUnit?: string;
  className?: string;
}

export function PriceOrLogin({
  priceEur,
  priceUah,
  pricePerUnit,
  className,
}: Props) {
  if (priceEur != null || priceUah != null) {
    return (
      <PriceDisplay {...{ priceEur, priceUah, pricePerUnit, className }} />
    );
  }
  return (
    <Link href="/login" className="text-emerald-700 underline ...">
      Увійдіть щоб побачити ціну
    </Link>
  );
}
```

Replace ціни у:

- `ProductCard` (`components/store/product-card.tsx` — і grid layout, і list layout)
- Product page (`app/(store)/product/[slug]/page.tsx` + `product-page-client.tsx`)
- LotCard (`components/store/lot-card.tsx`)
- Lot detail (`app/(store)/lot/[barcode]/page.tsx`)
- Sale/Top/New pages — наслідують product-card, працюватиме автоматично

#### 3.3 Hide UAH conversions для гостей

`getCurrentRate()` cache може бути викликана server-side — це OK, але render UAH only коли price є. PriceOrLogin component автоматично hides обидва.

#### 3.4 Cart та add-to-cart

Якщо guest клікне "В кошик" — redirect на `/login?returnTo=...`. Або allow add (потім checkout вимагає login). Простіший варіант: **гість НЕ може додати у cart, redirect на login**. Це консистентно з "ціна прихована" (нема сенсу додавати без знання ціни).

Реалізація: у `<AddToCartButton>` (client) перевір `useCustomer()` hook — якщо null → redirect.

### Phase 4: /account page

#### 4.1 Layout + guard

`apps/store/app/(store)/account/layout.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customer-auth";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?returnTo=/account");
  return <div>{children}</div>;
}
```

#### 4.2 `apps/store/app/(store)/account/page.tsx`

Hero greeting + 4 sections (tabs OR sequential blocks — twoji выбор, sequential blocks простіше для server component):

**Section A: Профіль**

- Form: phone (read-only), name, email, telegram, city, notes
- Server action `updateProfileAction(formData)` (Next.js Server Action)
- Toast "Збережено" on success

**Section B: Мої замовлення**

- Server query `prisma.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 50, include: { items, customer } })`
- Card list: code (#XXX), date, status, total, expand → показати items
- Лінк на /order/[id]/status (existing) для деталей

**Section C: Вишлист (link)**

- Просто заголовок "Вишлист" + лінк на `/wishlist` (existing page) + count

**Section D: Cart (link)**

- Заголовок "Кошик" + лінк на `/cart`

#### 4.3 Update profile action

```typescript
// apps/store/app/(store)/account/actions.ts
"use server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { revalidatePath } from "next/cache";

const profileSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional().nullable(),
  telegram: z.string().max(50).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function updateProfileAction(formData: FormData) {
  const customer = await getCurrentCustomer();
  if (!customer) throw new Error("Not authenticated");

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || null,
    telegram: formData.get("telegram") || null,
    city: formData.get("city") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.customer.update({
    where: { id: customer.id },
    data: parsed.data,
  });
  revalidatePath("/account");
  return { ok: true };
}
```

### Phase 5: Wishlist sync на login

Існуючий localStorage wishlist має sync-нутись з DB Favorite table при login. Pattern з mobile S47.

`lib/use-wishlist.ts` (client) — на customer mount:

```typescript
const customer = useCustomer(); // hook що читає cookie через /api/auth/customer/me
useEffect(() => {
  if (!customer) return;
  let cancelled = false;
  (async () => {
    const res = await fetch("/api/customer/favorites/sync", {
      method: "POST",
      body: JSON.stringify({ items: localItems }),
    });
    const data = await res.json();
    if (!cancelled) setLocalItems(data.merged);
  })();
  return () => {
    cancelled = true;
  };
}, [customer?.id]);
```

Backend `/api/customer/favorites/sync` (POST):

- Auth: getCurrentCustomer
- Read DB favorites for customerId
- Union with body.items (server-win on conflict)
- Persist new items to DB
- Return merged array
- Cap 100 items

### Phase 6: Cart merge на login

Існуючий `Cart` має `customerId` OR `sessionId` (one of). На login:

1. Find guest cart by `sessionId` (з cookie/localStorage)
2. Якщо є — merge у customer cart:
   - Якщо у customer вже є cart → перенести items (skip duplicates by lotId/productId)
   - Якщо нема — встановити `customerId = customer.id`, `sessionId = null`
3. Запиши customer.cart back

Hook це у `/api/auth/customer/login` route.ts (після `setCustomerCookie`):

```typescript
const sessionId = request.headers.get("x-session-id");
if (sessionId) {
  const guestCart = await prisma.cart.findFirst({
    where: { sessionId },
    include: { items: true },
  });
  if (guestCart) {
    const customerCart = await prisma.cart.findFirst({
      where: { customerId: customer.id },
    });
    if (customerCart) {
      // merge items
      for (const item of guestCart.items) {
        await prisma.cartItem
          .create({
            data: { ...item, id: undefined, cartId: customerCart.id },
          })
          .catch(() => {}); // ignore unique conflict
      }
      await prisma.cart.delete({ where: { id: guestCart.id } });
    } else {
      await prisma.cart.update({
        where: { id: guestCart.id },
        data: { customerId: customer.id, sessionId: null },
      });
    }
  }
}
```

Client side в login form — read sessionId з localStorage перед POST і пас у header.

### Phase 7: Tests

- `lib/customer-auth.test.ts` — sign+verify roundtrip, expired token, malformed token
- `lib/catalog.test.ts` — додай case "guest sees no prices" / "logged-in customer sees prices"
- `app/api/auth/customer/login/route.test.ts` — invalid input 400, valid creates+sets cookie, repeated phone returns same customer

### Phase 8: Documentation

`docs/SESSION_73_AUTH_OPERATIONS.md`:

1. Як згенерити CUSTOMER_AUTH_SECRET (`openssl rand -hex 32`)
2. Як додати у `.env`
3. Як перевірити: cURL POST /api/auth/customer/login + verify cookie set
4. Що бачить guest на /catalog (price → CTA)
5. Як rollback price gate (env feature flag? — НЕ робити, simple is better — просто revert)

---

## Acceptance criteria

- [ ] `pnpm format:check` зелений
- [ ] `pnpm -r typecheck` зелений
- [ ] `pnpm -r test` зелений (з новими тестами)
- [ ] `pnpm -r build` зелений
- [ ] `lib/customer-auth.ts` створено + 3 unit tests
- [ ] `instrumentation.ts` валідує `CUSTOMER_AUTH_SECRET` у production
- [ ] `.env.example` додано `CUSTOMER_AUTH_SECRET`
- [ ] `POST /api/auth/customer/login` приймає phone+name, finds-or-creates Customer, sets cookie
- [ ] `POST /api/auth/customer/logout` clears cookie
- [ ] `/login` page з phone+name form
- [ ] Header показує "Увійти" / "Кабінет / {Name}" / "Вийти"
- [ ] Гість на `/catalog` бачить "Увійдіть щоб побачити ціну" замість цифр
- [ ] Гість на `/product/[slug]`, `/lots`, `/lot/[barcode]` те саме
- [ ] Авторизований customer бачить ціни нормально
- [ ] Mobile API endpoints (`/api/mobile/*`) лишилися з цінами (mobile JWT auth)
- [ ] `/account` page з guard (redirect на /login)
- [ ] `/account` показує greeting + 4 секції (профіль/замовлення/wishlist/cart)
- [ ] Update profile через Server Action працює
- [ ] Wishlist sync на login: localStorage union DB favorites
- [ ] Cart merge на login: guest sessionId cart → customer cart
- [ ] Push на `claude/customer-auth-{XXXX}` (НЕ merge!)

---

## User-action post-merge

1. Згенерити CUSTOMER_AUTH_SECRET: `openssl rand -hex 32`
2. Додати у `apps/store/.env`: `CUSTOMER_AUTH_SECRET=...`
3. Скопіювати у standalone: `Copy-Item apps\store\.env apps\store\.next\standalone\apps\store\.env -Force`
4. `.\scripts\deploy.ps1`

---

## Reference

- `apps/store/lib/mobile-auth.ts` — HMAC JWT pattern reference
- `apps/store/instrumentation.ts` — `validateProductionSecrets()` pattern (S64)
- `apps/store/lib/cart.tsx` — cart sessionId pattern
- `packages/db/prisma/schema.prisma` — Customer model (line ~147), Cart model (line ~190)
- `apps/store/app/api/mobile/auth/route.ts` — mobile login pattern
- `apps/store/components/store/header.tsx` (or similar) — куди додати user menu
- mobile S47 — wishlist sync pattern (union local + DB on login)
- mobile S39 — wishlist persistence pattern

---

## Out of scope (для S73)

- OTP via Telegram bot — окрема follow-up задача (S74?)
- Password / reset flow — не потрібно (no password)
- Email verification — не потрібно
- Customer profile у admin (admin вже має CRUD для Customer)
- Telegram bot login — окремо
- Social auth (Google/Apple) — не потрібно
