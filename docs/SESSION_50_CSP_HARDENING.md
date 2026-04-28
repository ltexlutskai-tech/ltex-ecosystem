# Session 50 — Worker Task: CSP Hardening (script-src nonce)

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P2 (security debt — XSS attack surface)
**Очікуваний ефорт:** 2-3 години
**Тип:** worker session

---

## Контекст

Поточний CSP у `apps/store/next.config.js:80-81`:

```
script-src 'self' 'unsafe-inline' 'unsafe-eval'
style-src 'self' 'unsafe-inline'
```

`unsafe-inline` у `script-src` дозволяє виконання будь-якого inline `<script>` — XSS-вразливість. Це найбільший security debt що залишився після S17/S18. `unsafe-eval` потрібний Next.js у dev mode (HMR), у production не потрібний.

S50 переходить на **nonce-based CSP** для script-src:

1. Middleware генерує random nonce per request.
2. Передає nonce через header `x-nonce` (читається у RSC layout).
3. CSP header стає `script-src 'self' 'nonce-<random>' 'strict-dynamic'`.
4. Next.js автоматично injecting nonce у власні `<script>` tags коли middleware set-нув nonce header (App Router behavior з 14.x).
5. У production видаляємо `unsafe-eval` (dev mode залишаємо — HMR ламається без нього).

**Style-src 'unsafe-inline' лишається** — Tailwind injecting inline styles, видалення це окрема велика задача (треба `'unsafe-hashes'` з SHA списком, або повний refactor). Out-of-scope.

---

## Branch

`claude/session-50-csp-hardening` від main.

---

## Hard rules

1. Production CSP: `script-src 'self' 'nonce-<random>' 'strict-dynamic'` (без `unsafe-inline`, без `unsafe-eval`).
2. Development CSP: `script-src 'self' 'unsafe-eval' 'nonce-<random>'` (HMR потребує `unsafe-eval`; `unsafe-inline` не треба).
3. Nonce — мінімум 16 байт base64. Генерація через `crypto.randomBytes(16).toString("base64")` або Web Crypto `crypto.getRandomValues`.
4. Перенести CSP з `next.config.js` (статичний header) у `middleware.ts` (per-request dynamic).
5. **НЕ ламати existing supabase auth middleware** — `updateSession(request)` має продовжувати викликатись на `/admin/:path*`. CSP додається до response що повертається.
6. **Тестування на реальному сайті критичне** — worker не має runtime, тому перевіряти через build (`pnpm build` має пройти без warnings про CSP) + ручний QA на сайті після deploy (проблеми появляться тільки коли user відкриє сторінку).
7. Якщо щось ламається — fallback strategy: re-enable `'unsafe-inline'` через env `CSP_RELAXED=true`.
8. CI: 280 unit baseline + format + typecheck + build green. +2 тести (nonce generation, CSP header shape).

---

## Файли

### 1. Move CSP from next.config.js to middleware

**`apps/store/next.config.js`** — видалити CSP block з `headers()` (рядки 77-91). Лишити інші headers (X-Frame-Options, Permissions-Policy etc).

**`apps/store/middleware.ts`** — extend для генерації nonce + CSP header:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const isDev = process.env.NODE_ENV === "development";
const isRelaxed = process.env.CSP_RELAXED === "true";

function generateNonce(): string {
  // Edge runtime supports globalThis.crypto
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonce: string): string {
  const scriptSrc = isRelaxed
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : isDev
      ? `script-src 'self' 'unsafe-eval' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'", // unchanged — Tailwind compat
    "img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com https://i.ytimg.com",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "frame-src https://www.youtube.com https://youtube.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = generateNonce();

  // Pass nonce to React Server Components via request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Run existing supabase auth flow для /admin/*
  const isAdmin = request.nextUrl.pathname.startsWith("/admin");
  let response = isAdmin
    ? await updateSession(request)
    : NextResponse.next({ request: { headers: requestHeaders } });

  // Add CSP + nonce headers to response
  response.headers.set("x-nonce", nonce);
  response.headers.set("Content-Security-Policy", buildCsp(nonce));

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static assets / Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

### 2. Read nonce у layout

**`apps/store/app/layout.tsx`** — читати nonce через `next/headers` і пробросити у `<Script>` що мають inline content (якщо такі є). Next.js App Router автоматично applies nonce до власних bootstrap scripts коли header `x-nonce` set-нутий через middleware (так само як CSP nonce attribute).

Не потребує явного коду — Next.js сам читає `x-nonce` і додає `nonce` attribute до згенерованих script tags.

**Якщо** є custom inline scripts (наприклад Umami analytics або third-party JSON-LD як `product-json-ld.tsx`) — додати `nonce` prop:

```typescript
import { headers } from "next/headers";

const nonce = (await headers()).get("x-nonce") ?? undefined;

<Script
  id="json-ld"
  type="application/ld+json"
  nonce={nonce}
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

Worker grep-ить `dangerouslySetInnerHTML` + `<Script>` через codebase і додає nonce.

### 3. Tests

**`apps/store/middleware.test.ts`** (new) — 2 cases:

```typescript
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("middleware CSP", () => {
  it("sets nonce-based script-src in production", async () => {
    process.env.NODE_ENV = "production";
    const req = new NextRequest("http://test.local/");
    const res = await middleware(req);
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
    );
    expect(csp).not.toContain("'unsafe-inline'"); // for script-src specifically
    const nonce = res.headers.get("x-nonce");
    expect(nonce).toBeTruthy();
    expect(nonce!.length).toBeGreaterThanOrEqual(16);
  });

  it("respects CSP_RELAXED env override", async () => {
    process.env.CSP_RELAXED = "true";
    const req = new NextRequest("http://test.local/");
    const res = await middleware(req);
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toContain("'unsafe-inline'");
    delete process.env.CSP_RELAXED;
  });
});
```

### 4. Documentation

**`docs/CSP_HARDENING.md`** (new):

```markdown
# CSP Hardening (S50)

Нова CSP конфігурація (з Session 50) використовує per-request nonce замість `unsafe-inline` для scripts.

## Якщо щось ламається

Симптоми: blank page, console errors `Refused to execute inline script because it violates CSP directive`, Stripe/analytics widget не вантажиться.

**Швидкий fix** — додати у `apps/store/.env`:
```

CSP_RELAXED=true

```
Restart PM2: `pm2 restart ltex-store --update-env`. Це повертає старий `unsafe-inline` поведінку.

## Permanent fix

Знайти inline script що ламається (DevTools → Console → CSP error → точний source). Додати `nonce` attribute через `headers()` у RSC або через `<Script nonce={nonce}>` у client component.

## Style-src

`style-src` залишається з `'unsafe-inline'` бо Tailwind injecting styles inline. Видалення це окрема велика задача (S+1).
```

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` ✅ ≥282 (280 + 2)
4. `pnpm build` (apps/store) — має пройти без CSP warnings
5. `deploy.ps1` ASCII-only ✅

**Критично:** Worker не може runtime-перевірити що сайт працює. Реальна валідація — після deploy на сервер. Якщо bork-нулось — `CSP_RELAXED=true` env fallback.

---

## Out-of-scope

- Style-src `'unsafe-inline'` removal (Tailwind compatibility — окрема задача)
- Mobile API endpoints CSP (Bearer auth, не браузерні — irrelevant)
- Subresource Integrity (SRI hashes на CDN scripts) — окремо
- CSP Reporting (`report-to` directive) — окремо
- Trusted Types — окремо

---

## Branch + commit + push

Branch: `claude/session-50-csp-hardening`
Commit: `feat(s50): csp nonce-based script-src (remove unsafe-inline + unsafe-eval in prod)`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

Без DB migration. Прямий `deploy.ps1`. **Після deploy** — обов'язковий manual smoke test:

1. Відкрити https://new.ltex.com.ua/ у DevTools → Console.
2. Якщо CSP errors — set `CSP_RELAXED=true` у `.env` + `pm2 restart ltex-store --update-env` як emergency rollback.
3. Якщо ОК — fix джерело inline script, видалити CSP_RELAXED.

Якщо у docs/SESSION_TASKS.md є user-checkout flow — пройти його теж (Stripe widget може ламатись).
