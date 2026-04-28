# CSP Hardening (S50)

Нова CSP конфігурація (з Session 50) використовує per-request nonce замість `unsafe-inline` для scripts.

## Що змінилось

- CSP header перенесений з `apps/store/next.config.js` (статичний) у `apps/store/middleware.ts` (per-request).
- Middleware генерує 16-байтний random nonce через `crypto.getRandomValues` + `btoa`.
- Nonce пробрасується у RSC через `x-nonce` request header — RSC компоненти читають його через `headers()` і передають у `<script nonce={...}>`.
- Production CSP: `script-src 'self' 'nonce-<random>' 'strict-dynamic'` — без `'unsafe-inline'` та `'unsafe-eval'`.
- Development CSP: `script-src 'self' 'unsafe-eval' 'nonce-<random>' 'strict-dynamic'` — `'unsafe-eval'` потрібний Next.js HMR.
- `style-src 'self' 'unsafe-inline'` залишається — Tailwind injecting inline styles (out-of-scope для S50).
- `unsafe-inline` для scripts тепер заблокований — будь-який inline `<script>` без nonce буде відхилений браузером.

## Якщо щось ламається після deploy

Симптоми: blank page, console errors `Refused to execute inline script because it violates CSP directive`, Stripe/analytics widget не вантажиться.

**Швидкий fix** — додати у `apps/store/.env`:

```
CSP_RELAXED=true
```

Restart PM2: `pm2 restart ltex-store --update-env`. Це повертає старий `unsafe-inline` поведінку до часу поки знайдемо джерело проблеми.

## Permanent fix

Знайти inline script що ламається (DevTools → Console → CSP error → точний source). Додати `nonce` attribute через `headers()` у RSC або через `<Script nonce={nonce}>` у client component.

Приклад для server component:

```typescript
import { headers } from "next/headers";

const nonce = (await headers()).get("x-nonce") ?? undefined;

<script
  type="application/ld+json"
  nonce={nonce}
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

Client component не має доступу до `headers()` — треба пробросити nonce пропсом з server-component-предка.

## Style-src

`style-src` залишається з `'unsafe-inline'` бо Tailwind injecting styles inline. Видалення це окрема велика задача (потрібен `'unsafe-hashes'` з SHA списком, або повний refactor) — окрема сесія.

## Out-of-scope (для майбутніх сесій)

- Style-src `'unsafe-inline'` removal (Tailwind compatibility)
- Subresource Integrity (SRI hashes на CDN scripts)
- CSP Reporting (`report-to` directive)
- Trusted Types
