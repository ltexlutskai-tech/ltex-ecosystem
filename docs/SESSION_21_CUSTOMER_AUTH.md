# Session 21 — Worker Task: Customer Auth + Quick Registration

**Створено orchestrator-ом:** 2026-04-24
**Пріоритет:** P2 (marketplace UX — customer accounts)
**Очікуваний ефорт:** 6-8 годин
**Тип:** worker session

---

## Контекст

L-TEX поки не має customer auth для веб-сайту. Mobile API має `/api/mobile/auth` з phone+JWT (Session 16). Треба перенести цю auth-стратегію на веб + додати швидку реєстрацію нових клієнтів які потім потрапляють у 1С.

**Бізнес-flow (підтверджений user-ом):**

1. **Існуючий клієнт 1С** (вже у `customers` таблиці): вводить телефон → отримує OTP → залогінений
2. **Новий клієнт**: швидка форма (ім'я, телефон, область, місто) → створюється запис у `customers` → OTP → залогінений → при наступному 1С sync `/api/sync/customers` потрапляє до менеджера, який дозаповнює інфо у 1С (карта клієнта містить ще ~15 полів які заповнює менеджер)
3. **Logged-in користувач** бачить: профіль, історію замовлень, wishlist (вже є), saved addresses

---

## Branch

`claude/session-21-customer-auth` від main.

---

## Hard rules

1. **НЕ ламати CI** — `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` мають бути green
2. **НЕ дублювати auth-логіку** — переюзати `apps/store/lib/mobile-auth.ts` JWT helpers (signToken, verifyToken)
3. **НЕ зберігати password-и** — auth тільки через OTP (одноразовий код)
4. **НЕ ламати mobile API** — `/api/mobile/auth` залишається як є, нові ендпоінти у `/api/auth/*`
5. **НЕ створювати online payment UI** — це permanent business decision
6. **JWT-cookie має бути httpOnly + secure + sameSite=lax** для веба (на відміну від mobile, де JWT у localStorage клієнта)
7. **Session 17 startup validation** — `MOBILE_JWT_SECRET` вже валідується ≥32 chars, його ж переюзаємо
8. **Phone normalization** — обов'язково через `apps/store/lib/phone.ts` (existing helper)
9. **Тести обов'язкові** — мінімум 10 нових unit для auth flow

---

## SMS Provider (підтверджено user-ом 2026-04-24)

**SMS provider:** [SMSClub](https://smsclub.mobi/) — український provider, REST API.

**Інтеграція:**

1. Зареєструватись на smsclub.mobi (user робить — або вже є акаунт)
2. Отримати API token + sender alpha-name (зазвичай "L-TEX" або "LTEX")
3. Додати env vars:
   - `SMSCLUB_TOKEN` — Bearer token з smsclub dashboard
   - `SMSCLUB_FROM` — alpha-name відправника (e.g. "L-TEX")
4. Worker має дослідити поточний SMSClub API (https://smsclub.mobi/uk/instructions/api-rest) і написати `apps/store/lib/sms-client.ts` з функцією `sendSms(phone: string, text: string)`
5. Endpoint: SMSClub HTTP API (REST POST з JSON body)
6. У `apps/store/lib/otp.ts` після Session 21 task 2 — використовувати SMS як **primary** delivery, Telegram bot OTP як fallback (якщо у Customer вже є telegramChatId), mock тільки для dev/test environment

**Startup validation:** додати у `apps/store/instrumentation.ts` перевірку що `SMSCLUB_TOKEN` присутній у production. Якщо ні — warning, але не throw (дозволити mock-режим для staging).

**Rate limit & cost guard:** SMS платний (~$0.03/SMS). Жорсткий rate limit: 1 SMS / phone / 60sec, 5 / phone / годину, 50 / phone / день — щоб уникнути abuse.

**Тести:** mock SMSClub HTTP виклики через `vi.fn()` — НЕ дзвонити реальний API у CI.

---

## Other Open questions (BLOCK — питати orchestrator перед стартом)

1. **OTP TTL** — рекомендую 5 хвилин, 6 цифр (підтвердити з orchestrator або прийняти default).
2. **Rate limit на OTP запити** — 1 OTP / phone / 60 секунд, 5 OTP / phone / годину.
3. **Telegram OTP fallback** — якщо у Customer.telegramChatId немає — одразу SMS через SMSClub (без mock-fallback у production).

---

## Task 1: DB schema — extend Customer + add OtpCode

**Файл:** `packages/db/prisma/schema.prisma`

```prisma
model Customer {
  // ... existing fields ...
  region          String?    // Область (нове)
  city            String?    // Місто (нове, якщо ще немає)
  registeredAt    DateTime   @default(now())
  lastLoginAt     DateTime?
  source          String?    // "web-self-register" | "1c-sync" | "mobile" — для analytics
  // saved addresses (Session 21 deferred to later sub-task)
}

model OtpCode {
  id          String   @id @default(uuid())
  phone       String
  codeHash    String   // bcrypt(code) — НЕ plain text
  channel     String   // "telegram" | "sms" | "mock"
  expiresAt   DateTime
  attempts    Int      @default(0)
  consumedAt  DateTime?
  createdAt   DateTime @default(now())

  @@index([phone, createdAt])
  @@index([expiresAt])  // for cleanup cron
}
```

Migration: `pnpm db:migrate -- --name customer-auth-otp`.

**ВАЖЛИВО:** `region` / `city` можуть вже бути у Customer — перевірити перед міграцією. Якщо є — просто додати `source`, `lastLoginAt`, `registeredAt`.

---

## Task 2: OTP generation + delivery

**Новий файл:** `apps/store/lib/otp.ts`

```ts
export async function requestOtp(
  phone: string,
): Promise<{ channel: string; ttlSec: number }>;
export async function verifyOtp(phone: string, code: string): Promise<boolean>;
```

**Реалізація:**

1. `requestOtp(phone)`:
   - Check rate limit (1/min/phone, 5/hour/phone, 50/day/phone)
   - Generate 6-digit code
   - bcrypt-hash, save до `OtpCode` з TTL 5min
   - Delivery priority:
     1. **SMS через SMSClub** (primary) — `lib/sms-client.ts` `sendSms(phone, "L-TEX код: ${code}. Дійсний 5 хв.")`
     2. **Telegram bot fallback** — якщо SMS API недоступний АБО якщо у Customer.telegramChatId є (швидше) — посилаємо через `services/telegram-bot/` (нове endpoint у bot service: `POST /send-otp`)
     3. **Mock** — тільки якщо `NODE_ENV !== 'production'`: log у консоль + admin notification bell
   - Set OtpCode.channel залежно від реального delivery
2. `verifyOtp(phone, code)`:
   - Знайти найновіший unused OtpCode для phone
   - Перевірити expiresAt
   - Inc attempts; якщо >=5 — invalidate
   - bcrypt.compare → mark consumedAt; повернути true

**Тести:** `apps/store/lib/otp.test.ts` — 10+ tests (rate limit, expiry, max attempts, success, SMS mock, Telegram fallback, channel selection).

---

## Task 3: Auth API routes

**Нові файли:**

- `apps/store/app/api/auth/request-otp/route.ts` — POST `{ phone }` → `{ channel, ttlSec }`
- `apps/store/app/api/auth/verify-otp/route.ts` — POST `{ phone, code }` → set httpOnly cookie `ltex_session`, return `{ ok, customerId, isNewUser }`
- `apps/store/app/api/auth/register/route.ts` — POST `{ name, phone, region, city }` → create Customer + auto-trigger OTP
- `apps/store/app/api/auth/logout/route.ts` — DELETE cookie
- `apps/store/app/api/auth/me/route.ts` — GET → `{ customer }` або 401

**Spec:**

- Zod validation на payload
- Rate limit: 5 requests / IP / minute (existing rate-limit.ts)
- JWT signed via `lib/mobile-auth.ts` `signToken` (пере-юз)
- TTL 30 days (як mobile), refresh on /me
- Cookie: `httpOnly`, `secure` (prod), `sameSite=lax`, `path=/`

**Тести:** integration tests у `apps/store/lib/__tests__/auth-routes.test.ts` — 12+ tests.

---

## Task 4: Login + Register pages

**Нові файли:**

- `apps/store/app/(store)/login/page.tsx` — 2-step form
  - Step 1: phone input → "Надіслати код"
  - Step 2: code input → submit → redirect до `/account` (або `?redirect=` query)
  - Linker до `/register` "Немає акаунту? Зареєструйтесь"

- `apps/store/app/(store)/register/page.tsx` — 1-form: ім'я, телефон, область (`<select>` з 24 областей UA), місто (text)
  - Submit → POST /api/auth/register → step 2 OTP як у login
  - Disclaimer: "Менеджер зв'яжеться з вами після реєстрації для уточнення деталей"

**i18n keys у `uk.ts`:** auth.login, auth.register, auth.phone, auth.code, auth.errors.\*, auth.regions[], auth.disclaimer.

**Тести:** `e2e/auth.spec.ts` — happy path login + register (3 tests).

---

## Task 5: Profile / Account dashboard

**Нові файли:**

- `apps/store/app/(store)/account/page.tsx` — dashboard
  - Welcome "Привіт, {name}"
  - Cards: Замовлення (link), Wishlist (link), Налаштування, Виход
- `apps/store/app/(store)/account/orders/page.tsx` — order list з фільтром (active / completed)
- `apps/store/app/(store)/account/orders/[id]/page.tsx` — детальний order page (переюз існуючий `/order/[id]/status`)
- `apps/store/app/(store)/account/settings/page.tsx` — edit name/region/city + change phone (потребує OTP confirmation на новому)
- `apps/store/middleware.ts` — extend existing для check auth on `/account/*` paths; redirect to `/login?redirect=` якщо нема cookie

**Header:** додати profile dropdown біля cart-badge:

- Якщо logged in: показ `<UserCircle />` icon з dropdown (Профіль / Замовлення / Виход)
- Якщо не logged in: link "Увійти"

**Тести:** оновити `e2e/auth.spec.ts` — додати account flow.

---

## Task 6: Quick Reorder

**Файл:** `apps/store/app/(store)/account/orders/[id]/page.tsx` — додати кнопку "Замовити повторно"

**Реалізація:**

- Server action `reorderToCart(orderId)`:
  - Дістає orderItems
  - Перевіряє що lots все ще доступні (status free/on_sale)
  - Додає в cart (existing CartProvider)
  - Redirect на `/cart`

**Тест:** unit для `apps/store/lib/reorder.ts` (4 tests: full reorder, partial — деякі лоти sold out, empty cart, double reorder).

---

## Task 7: 1C sync extension

**Файл:** `apps/store/app/api/sync/customers/route.ts` — **новий**

Аналог existing `/api/sync/products` `/api/sync/lots` `/api/sync/rates`:

- POST з Bearer `SYNC_API_KEY`
- Pull новостворених customers з `source: 'web-self-register'`
- Mark як sent (нове поле `Customer.syncedTo1cAt: DateTime?`)
- Response: array of new customers since last sync

Або зворотній flow: 1С опитує `/api/sync/customers?since=<date>` і отримує список → у 1С створює "Контрагентів" (Клієнтів) для кожного → менеджер бачить новачків.

**ВАЖЛИВО:** перед написанням — підтвердити з orchestrator що 1С готовий приймати customers через sync API. Якщо ні — зробити endpoint, але документувати як "TODO 1С налаштування".

---

## Verification checklist

- [ ] `pnpm db:migrate` apply migration без помилок
- [ ] `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm build` — all PASS
- [ ] `/login` → ввести phone → отримати OTP (через Telegram або mock) → ввести код → redirect /account
- [ ] `/register` → новий phone → ввести name/region/city → OTP → /account з зареєстрованим customer
- [ ] `/account` redirects to `/login?redirect=/account` якщо не залоговано
- [ ] `/account/orders` показує тільки orders залогінованого customer (по `customerPhone`)
- [ ] Quick reorder створює cart з тими ж лотами
- [ ] Logout видаляє cookie + redirect на homepage
- [ ] Mobile API `/api/mobile/auth` НЕ зламаний (переюз helpers)
- [ ] 220+10 unit + новий e2e auth.spec.ts → green

---

## Out of scope

- Saved multiple addresses (deferred — окремий under-task)
- Password-based login
- Email-based login
- Social OAuth (Google / Facebook)
- Two-factor 2FA через TOTP
- Account deletion / GDPR
- 1С sync inbound (1С → web) для existing customers — це окрема задача
- SMS provider integration — використовуємо mock + Telegram OTP до окремої сесії

---

## Commit strategy

Розбити на 5 коміти:

1. `feat(db): customer auth schema + OTP code model`
2. `feat(auth): OTP generation + Telegram delivery + mock fallback`
3. `feat(auth): request-otp + verify-otp + register API routes`
4. `feat(auth): login/register pages + middleware redirect`
5. `feat(account): profile dashboard + orders + quick reorder + sync API`

Або об'єднати у 3 коміти (db + auth backend + UI).

---

## Push

```bash
git push -u origin claude/session-21-customer-auth
```

Powiadomити orchestrator → review + merge.
