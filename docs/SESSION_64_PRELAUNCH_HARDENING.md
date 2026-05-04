# Session 64 — Pre-Launch Hardening Batch (Worker Spec)

**Дата:** 2026-05-04
**Тип:** worker
**Ефорт:** ~3-4 год
**Branch:** `claude/s64-prelaunch-hardening`
**Контекст:** Перед production go-live є 4 P2/P3 security/reliability items, які не залежать від user-actions і не конфліктують з UI-сесіями. Усі ізольовані у `lib/rate-limit.ts`, `instrumentation.ts`, `lib/email.ts` + один cross-file audit.

## Issues

### 1. X-Forwarded-For trust (Cloudflare context)

**Файл:** `apps/store/lib/rate-limit.ts:80` — функція `getClientIp(request)`.

**Поточна логіка:**

```ts
request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  request.headers.get("x-real-ip") ??
  ...
```

**Проблема:** `x-forwarded-for` атакер може підмінити сам, бо Cloudflare Tunnel **не стрипає** клієнтський заголовок. Зловмисник пише `X-Forwarded-For: 1.2.3.4` і обходить rate limit (бо кожен fake IP — окрема корзина).

**Фікс:** Cloudflare ставить власний trusted header `cf-connecting-ip` з реальною client IP. Він і має бути primary. Порядок:

```ts
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ?? // ← Cloudflare trusted
    request.headers.get("x-real-ip") ?? // ← Caddy/nginx fallback
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? // ← last resort
    "unknown"
  );
}
```

Додай unit test у `lib/rate-limit.test.ts` (якщо є) — або створи його — на 4 сценарії:

- Тільки `cf-connecting-ip` → returns it
- `cf-connecting-ip` + `x-forwarded-for` → returns CF (priority)
- Тільки `x-forwarded-for` → returns first IP
- Жодного → `"unknown"`

### 2. Telegram webhook secret startup validation

**Файл:** `apps/store/instrumentation.ts` — функція `validateProductionSecrets()`.

**Поточно** валідується `MOBILE_JWT_SECRET` + `SYNC_API_KEY`. Додай `TELEGRAM_WEBHOOK_SECRET` — але тільки коли `TELEGRAM_BOT_TOKEN` присутній (бо без бота secret не потрібен).

```ts
const tgToken = env.TELEGRAM_BOT_TOKEN;
if (tgToken) {
  const tgSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!tgSecret || tgSecret.length < 16) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET must be at least 16 characters when TELEGRAM_BOT_TOKEN is set. " +
        "Generate with: openssl rand -hex 24",
    );
  }
}
```

`apps/store/app/api/telegram/webhook/route.ts:358-360` уже перевіряє наявність secret runtime-логом — тепер це fail-fast at boot.

Додай тест у `instrumentation.test.ts` (якщо існує — перевір розташування) на сценарії: bot+secret OK / bot без secret throws / без bot — no validation.

### 3. Console logging audit (PII redaction)

**Мета:** знайти `console.error(\`...${var}\`)` де var — рядок з PII (phone, email, customer name, payment data) і замінити на structured logging.

**Кроки:**

1. Grep репозиторій: `grep -rn "console\." apps/store/lib apps/store/app | grep -v ".next" | grep -v ".test" | grep -E "(\\\${|backtick)"`. Перерахуй усі hits з template strings.
2. Для кожного hit оціни чи є у template PII вар (customer.phone, customer.email, customer.name, ip, body що містить customer payload). Безпечні: `orderId`, `productId`, `error.message`, числа.
3. Для unsafe — refactor:
   - **До:** `console.error(\`Order failed for ${customer.phone}: ${err}\`)`
   - **Після:** `console.error("Order failed", { orderId, error: err instanceof Error ? err.message : String(err) })` — НЕ логуй phone/email повністю.
4. Якщо PII потрібна для debug — використай маскування: `phone.slice(0,4)+"***"`.

**Файли точно перевір** (вірогідно мають PII у логах):

- `apps/store/lib/email.ts` (catch-логи)
- `apps/store/app/api/orders/route.ts`
- `apps/store/app/api/quick-order/route.ts`
- `apps/store/lib/notifications.ts`
- `apps/store/app/api/telegram/webhook/route.ts`
- `apps/store/app/api/viber/webhook/route.ts`
- `apps/store/app/api/sync/orders/export/route.ts`

Випиши у звіт **список усіх змінених рядків** (file:line: was → now) щоб orchestrator міг переглянути.

### 4. Nodemailer retry on transient failures

**Файл:** `apps/store/lib/email.ts` — функція яка викликає `transporter.sendMail`.

**Проблема:** Зараз single attempt. Якщо SMTP/Resend timeout — лист втрачено. Для order confirmation це неприйнятно.

**Фікс:** обгорни `sendMail` у retry-helper. 3 спроби з exp backoff (0s, 2s, 6s). Retry **тільки** на transient errors:

- timeout (`AbortError`, `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`)
- 5xx HTTP від Resend (якщо використовується)
- Network errors

НЕ retry на:

- 4xx (bad credentials, invalid recipient — постійні)
- Validation errors

```ts
async function sendWithRetry(
  payload: SendMailPayload,
  attempts = 3,
): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await transporter.sendMail(payload);
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err)) throw err;
      if (i < attempts - 1) {
        const delay = i === 0 ? 2000 : 6000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  // All retries exhausted — log full payload for manual replay (without PII in template strings — use structured)
  console.error("Email send failed after retries", {
    to: maskEmail(payload.to),
    subject: payload.subject,
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
  });
  throw lastErr;
}

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === "AbortError" ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    /\b5\d\d\b/.test(msg) // 5xx in error message
  );
}

function maskEmail(email: string | undefined): string {
  if (!email) return "(unknown)";
  const [local, domain] = email.split("@");
  if (!domain) return "(invalid)";
  return `${local.slice(0, 2)}***@${domain}`;
}
```

Викликай `sendWithRetry(payload)` замість `transporter.sendMail(payload)` у `sendOrderConfirmationEmail()` та інших місцях.

Out-of-scope: persistent DLQ (Dead Letter Queue) у БД — окрема велика задача (потребує `EmailJob` model + worker process). Для зараз retry + structured log = **достатньо** щоб сильно знизити втрату листів.

Додай unit-тести у `lib/email.test.ts` (або створи): retries 3 times on timeout, doesn't retry on 4xx, masks email in log.

## Out of scope

- Persistent DLQ для email — окрема задача.
- Sentry / Grafana setup — окрема задача (P1 monitoring).
- CSP nonce hardening — закрито у S50.
- Rate-limit Redis backing — окрема задача.
- Mobile app — paused.

## Verification

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test` зелено
- [ ] `cd apps/store && pnpm build` standalone build success
- [ ] Unit tests для `getClientIp` (4 сценарії) pass
- [ ] Unit tests для `validateProductionSecrets` (Telegram cases) pass
- [ ] Unit tests для `sendWithRetry` (transient retry, 4xx no-retry, mask) pass
- [ ] Звіт: список усіх console.\* PII fixes (file:line was→now)
- [ ] Manual: запуск `NODE_ENV=production TELEGRAM_BOT_TOKEN=test pnpm --filter @ltex/store start` без `TELEGRAM_WEBHOOK_SECRET` → throws on startup

## Commit strategy

1. `fix(s64a): rate-limit — prefer cf-connecting-ip (Cloudflare trusted) over x-forwarded-for`
2. `fix(s64b): instrumentation — validate TELEGRAM_WEBHOOK_SECRET when bot token present`
3. `refactor(s64c): console logging — redact PII from template strings (audit + structured)`
4. `feat(s64d): email — sendWithRetry helper (3 attempts, exp backoff, transient-only)`
5. `test(s64): unit tests for IP extraction, prod secrets, email retry`

Push `claude/s64-prelaunch-hardening`. NOT merge to main, NOT create PR.

## Hard rules (CLAUDE.md)

- Не чіпати `output: 'standalone'`.
- TypeScript strict, 0 `any`.
- Pre-commit hook auto-prettier — НЕ bypass.
- Не редагуй CLAUDE.md / HISTORY.md / SESSION_TASKS.md.
- НЕ запускай pm2.
- НЕ міняй DB schema.
- Усі user-facing strings українською (тут їх практично немає — це backend).
- НЕ додавай нові env vars без додавання до `.env.example`.
