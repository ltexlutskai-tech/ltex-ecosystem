# Email Persistent DLQ (Session 70)

Цей документ описує черга для outbound email-ів з персистентністю у
PostgreSQL і окремим cron-job-ом який ретраїть transient помилки.

## Чому потрібен DLQ

До S64 `lib/email.ts` робив 3 синхронних спроби (exp backoff 0/2/6 с) і
на final failure тільки логував `console.error` + кидав exception. Якщо
Resend або SMTP лежав довше ~10 секунд, лист був **назавжди втрачений** —
а замовлення-confirmation для клієнта втрачати не можна.

S70 розв'язує це через:

1. **Persistent queue (`email_jobs` table)** — `enqueueEmail()` пише row
   замість того, щоб слати синхронно. Request path не блокується ніколи.
2. **Cron-driven drain** — `/api/cron/process-email-queue` тягне
   `pending`/`retrying` rows і робить рівно одну спробу send на кожен,
   потім оновлює row.
3. **DB-backed attempt counter + backoff** — `attempts` / `maxAttempts`
   зберігаються у row-і, тому restart процесу не губить стан.
4. **Terminal `failed` стан + admin UI** — `/admin/emails` показує всі
   jobs з фільтром по статусу і кнопкою "Повторити".

## Архітектура

```
┌──────────────────────┐                        ┌──────────────────────┐
│ POST /api/orders     │  enqueueEmail(...)     │ email_jobs (Postgres)│
│ POST /api/quick-order│ ────────────────────→ │  status=pending      │
│ admin/orders actions │                        │  attempts=0          │
│ POST /api/newsletter │                        │  nextAttemptAt=now   │
└──────────────────────┘                        └──────────┬───────────┘
                                                            │
   Windows Task Scheduler (every 1-5 min)                   │
   └─→ GET /api/cron/process-email-queue                    │
        └─→ processEmailQueue() ─→ findMany WHERE           │
              status IN ('pending','retrying')              │
              AND nextAttemptAt <= now LIMIT 50  ←──────────┘
              for each: send via Resend/SMTP
                ├─ ok → status='sent', sentAt=now
                ├─ fail (attempts < max) → status='retrying',
                │                          attempts++,
                │                          nextAttemptAt=now+backoff
                └─ fail (attempts >= max) → status='failed',
                                            console.error alert
```

### Backoff schedule

| Attempt # після failure | Delay до наступної спроби |
| ----------------------- | ------------------------- |
| 1                       | 1 хвилина                 |
| 2                       | 5 хвилин                  |
| 3                       | 30 хвилин                 |
| 4                       | 2 години                  |
| 5                       | 6 годин                   |
| 6+                      | 12 годин (clamped)        |

Дефолт `maxAttempts=5`. Повний failure лист = 1м + 5м + 30м + 2год + 6год
≈ 8.5 годин (більш ніж достатньо для будь-якого Resend/SMTP outage).

### Що НЕ ретраїться

`processEmailQueue` ретраїть **усі** failures однаково — і transient
(5xx, network), і non-transient (4xx, validation). Логіка така: навіть
4xx можуть бути transient (наприклад, SPF cache invalidation, або
тимчасовий ban на recipient domain). Якщо лист реально невалідний —
`maxAttempts` все одно зупинить ретраї за ~8 годин.

`isTransientError` лишається у коді для legacy `sendWithRetry`
(використовується у backward-compat сценаріях / тестах).

## Налаштування на сервері

### 1. Apply migration (один раз)

```powershell
cd E:\ltex-ecosystem
pnpm --filter @ltex/db exec prisma migrate deploy
```

Migration `20260506_email_job` створює `email_jobs` table + 2 індекси.
Безпечна (additive only, не міняє existing schema).

### 2. Set CRON_SECRET (якщо ще не задано)

У `apps/store/.env` додати:

```env
CRON_SECRET="<openssl rand -hex 32>"
```

`CRON_SECRET` уже використовується `/api/cron/cleanup-viewlog`, можна
переюзати той самий ключ. Мінімум 16 символів.

Після змін — рестарт PM2:

```powershell
pm2 restart ltex-store --update-env
```

### 3. Windows Scheduled Task для cron

Створити Task який кожні **5 хвилин** робить GET до queue-drain endpoint:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "curl.exe" `
    -Argument '-s -o NUL -H "x-cron-secret: YOUR_CRON_SECRET" https://new.ltex.com.ua/api/cron/process-email-queue'

$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5)

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2)

Register-ScheduledTask `
    -TaskName "LTEX Email Queue Drain" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User "SYSTEM" `
    -RunLevel Highest
```

Замінити `YOUR_CRON_SECRET` на реальне значення з `.env`.

> **Чому 5 хвилин?** Перший backoff — 1 хвилина, тому навіть transient
> failure ретраїться у наступному циклі. Якщо хочете швидший recovery —
> можна 1 хвилина (більше навантаження на DB поки нема listener-а на
> NOTIFY).

Перевірити що Task запущено:

```powershell
Get-ScheduledTaskInfo -TaskName "LTEX Email Queue Drain"
```

### 4. Manually trigger (debug)

```powershell
curl -H "x-cron-secret: YOUR_CRON_SECRET" `
     https://new.ltex.com.ua/api/cron/process-email-queue
# → {"processed":3,"sent":3,"failed":0,"retrying":0}
```

Опціонально `?limit=N` (default 50, max 200) для регулювання batch size.

## Як подивитись стан черги

### Admin UI

`/admin/emails` — фільтр-pills (Всі / Очікує / Повтор / Надіслано /
Помилка), 50 latest rows, кнопка "Повторити" біля failed/retrying
(reset attempts=0, status=pending).

Бейдж "Черга email" у sidebar показує `pending + retrying + failed`
count (poll кожні 30 секунд).

### Direct SQL

```sql
-- Усі failed jobs з останніми помилками
SELECT id, source, reference_id, attempts, last_error, created_at
FROM email_jobs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 50;

-- Counts по статусах
SELECT status, COUNT(*) FROM email_jobs GROUP BY status;

-- Pending у поточному циклі (наступні 5 хв)
SELECT id, source, attempts, next_attempt_at
FROM email_jobs
WHERE status IN ('pending','retrying')
  AND next_attempt_at <= NOW() + INTERVAL '5 minutes'
ORDER BY next_attempt_at;
```

### Manually retry failed job

З admin UI — кнопка "Повторити" (server action `retryEmailJob`).

З SQL:

```sql
UPDATE email_jobs
SET status = 'pending',
    attempts = 0,
    next_attempt_at = NOW(),
    last_error = NULL,
    updated_at = NOW()
WHERE id = '<job_id>';
```

Наступний cron-run підбере row.

## Disk envelope

Один EmailJob row ≈ 1-3 KB (HTML body основний consumer). При ~50 замовленнях/день:

- 50 × 3 KB = ~150 KB/день
- 150 KB × 365 = ~55 MB/рік

Дрібниця у порівнянні з PostgreSQL data directory. **Ніякого periodic
cleanup НЕ налаштовано** на S70 — додаткова cron job може чистити
`status='sent' AND sentAt < now - 30d` як майбутній enhancement (по
аналогії з `/api/cron/cleanup-viewlog`).

## PII handling

- `to` зберігається повним (потрібен для retry).
- `lastError` маскує email/phone substrings через `maskPii()` перед
  persist (S64-style). Error message truncated до 500 chars.
- Admin UI показує `to` як `al***@example.com` (maskEmail), повний
  адрес з DB **не render-иться у HTML**.
- Cron endpoint structured-logs масковані email-и тільки на final
  exhaustion (`[L-TEX] EmailJob exhausted retries`).

## Зворотна сумісність

Public API стара:

- `sendOrderConfirmationEmail(data)` — fire-and-forget, ніколи не throw,
  всередині викликає `enqueueEmail`.
- `sendOrderStatusEmail(data)` — те саме.
- `sendWelcomeNewsletterEmail(email)` — те саме.

Усі callsite-и (`/api/orders`, `/api/quick-order`, admin order actions,
`/api/newsletter`) **не змінювались**. Стара `.catch(() => {})` /
`.catch((e) => console.error(...))` обгортка лишається — тепер вона
ловить тільки persist-failures (DB down), а не send failures.

## Re-enabling synchronous sends (rollback)

Якщо потрібно тимчасово відкатитись на синхронний send (наприклад, поки
debug-ить cron):

1. У `lib/email.ts` замінити `enqueueEmail({ ... })` всередині
   `sendOrderConfirmationEmail` (та інших) назад на
   `sendEmail(to, subject, html)` із попередньої версії.
2. **НЕ робити drop table `email_jobs`** — лишити для будь-яких
   pending rows (admin може retry-нути вручну).

Code reference: коміт `923435b` (S70b "lib/email.ts -- enqueueEmail +
processEmailQueue").
