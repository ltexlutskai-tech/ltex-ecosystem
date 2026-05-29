# INBOUND Polling Cron (`pull-from-1c`) — Windows Scheduled Task

Цей документ описує налаштування Windows Scheduled Task на сервері L-TEX,
яка викликає `GET /api/cron/pull-from-1c` кожні 5 хвилин. Це **Етап 3**
master-плану `docs/1C_INTEGRATION_PLAN.md` — INBOUND pull-mode синхронізація
1С → сайт.

## Що робить cron

1. Читає збережений курсор `last_sync_cursor` з `mgr_sync_state`.
2. Викликає `POST manager-sync/pull/snapshot` з `{cursor}` → SOAP до
   `1С.СформуватиПакетДаннихJSON` → JSON snapshot.
3. Форвардить отримані arrays у наявні `/api/sync/categories`,
   `/api/sync/products`, `/api/sync/prices`, `/api/sync/orders/import`
   батчами по 50.
4. Якщо ВСІ батчі успішні → зсуває курсор. Інакше — лишає попередній
   (наступний cron спробує знову з того ж часу). Idempotent через
   upsert-by-code1C на endpoint-ах.

## Передумови

- **Міграція застосована:** `pnpm --filter @ltex/db exec prisma migrate deploy`
  (нова таблиця `mgr_sync_state`).
- **Env vars присутні у `apps/store/.env`:**
  - `CRON_SECRET` (уже є з S70 + M1.5 — той самий ключ що для
    `process-email-queue` / `process-sync-queue` / `generate-reminders`).
  - `MANAGER_SYNC_URL` (зазвичай `http://localhost:3001`) — уже є з M1.5.
  - `MANAGER_SYNC_SHARED_SECRET` — уже є з M1.5.
  - `SYNC_API_KEY` — уже є (використовується нашими `/api/sync/*` endpoints).
  - **Опційно:** `STORE_INTERNAL_URL=http://localhost:3000` — куди cron
    стукає за inbound endpoints (default `localhost:3000`).
- **PM2 ltex-store і ltex-manager-sync працюють.**
- **1С-сторона** — додано Етап 3 BSL (`docs/1c-bsl/inbound/`), web-сервіс
  перепубліковано. Поки stub повертає порожні масиви, але cron все одно
  можна вмикати — він просто прохолонеться (всі totals = 0).

## Налаштування Windows Scheduled Task

Створити Task який кожні **5 хвилин** робить GET до cron-endpoint:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "curl.exe" `
    -Argument '-s -o NUL -H "x-cron-secret: YOUR_CRON_SECRET" https://new.ltex.com.ua/api/cron/pull-from-1c'

$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5)

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName "LTEX Pull From 1C" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User "SYSTEM" `
    -RunLevel Highest
```

Замінити `YOUR_CRON_SECRET` на реальне значення з `apps/store/.env`
(той самий що в інших cron-задачах — Email Queue, Sync Queue, Reminders).

> **Чому 5 хвилин?** Достатньо часто щоб «нові телефонні замовлення» з 1С
> потрапляли на сайт у межах робочого ритму, але не настільки часто щоб
> створювати непотрібне навантаження. Якщо 1С даних мало (повний snapshot
> < 100 KB) — без проблем збільшити до 1-2 хв.

> **`ExecutionTimeLimit 5min`:** перший запуск з порожнім курсором →
> повний дамп → може зайняти десятки секунд. Подальші виклики —
> диференційні, мс. 5хв з запасом.

Перевірити що Task запущено:

```powershell
Get-ScheduledTaskInfo -TaskName "LTEX Pull From 1C"
```

## Manually trigger (debug)

```powershell
curl -H "x-cron-secret: YOUR_CRON_SECRET" https://new.ltex.com.ua/api/cron/pull-from-1c
# Очікувано (приклад при першому запуску з порожнім BSL stub):
# {
#   "ok": true,
#   "cursorAdvanced": true,
#   "oldCursor": null,
#   "newCursor": "2026-06-02T15:34:21",
#   "totals": {
#     "categories": { "received": 0, "sent": 0 },
#     "products":   { "received": 0, "sent": 0 },
#     "prices":     { "received": 0, "sent": 0 },
#     "orders":     { "received": 0, "sent": 0 }
#   },
#   "errors": []
# }
```

## Status codes

| Status | Що означає                                                            |
| ------ | --------------------------------------------------------------------- |
| 200    | Виклик завершився. Дивись `ok` у body (true = OK, false = bsl_error). |
| 401    | Невірний / відсутній `x-cron-secret`.                                 |
| 500    | Неочікуваний exception (наприклад, DB недоступна).                    |
| 502    | Помилка SOAP-зв'язку з 1С (timeout / network).                        |

## Стан курсора (debugging)

```bash
# Дивитись поточний збережений курсор через psql:
psql -d ltex -c "SELECT key, value, updated_at FROM mgr_sync_state WHERE key='last_sync_cursor';"

# Скинути курсор (наступний cron зробить повний дамп):
psql -d ltex -c "DELETE FROM mgr_sync_state WHERE key='last_sync_cursor';"
```

## Що не робить

- **Не ретраїть** окремий запит — cron сам викликається кожні 5хв. Якщо batch
  впав — `cursorAdvanced=false` і наступний cron повторить **усе** з того ж
  курсора.
- **Не валідує** JSON shapes — це робить кожен inbound endpoint (їх Zod-схеми).
  Cron просто збирає `errors[]` із HTTP-помилок.
- **Не пише в 1С** — це pull-only. Outbound (наша DB → 1С) живе в окремому
  cron `process-sync-queue` (M1.5).

## Документація — суміжні файли

- `docs/1C_INTEGRATION_PLAN.md` — master-план усіх 5 етапів.
- `docs/1c-bsl/inbound/` — STUB BSL для 1С-сторони.
- `docs/EMAIL_QUEUE.md` — патерн Windows Scheduled Task (на основі цього).
- `docs/M1.5_SYNC_ARCHITECTURE.md` — інший напрямок (outbound).
