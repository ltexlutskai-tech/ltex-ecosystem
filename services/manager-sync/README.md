# @ltex/manager-sync

HTTP-proxy між Next.js manager app і 1С SOAP сервісом `MobileExchange.1cws`.
Обслуговує outbound write-back черги `mgr_sync_jobs`.

**Status:** M1.5 — backbone shipped, mock-mode default. Real 1С SOAP
handshake — у M1.5b, після того як 1С-розробник реалізує BSL-модулі за
`docs/1C_SYNC_MODULES_SPEC.md`.

## Architecture overview

Див. `docs/M1.5_SYNC_ARCHITECTURE.md` — диаграма + lifecycle.

## Run locally

```bash
# З root монорепо:
pnpm --filter @ltex/manager-sync dev   # watch mode
pnpm --filter @ltex/manager-sync start # production-like (без watch)
```

Перед запуском — створи `services/manager-sync/.env` за зразком `.env.example`.

```bash
# Mock-режим (default, для розробки):
MANAGER_SYNC_PORT=3001
MANAGER_SYNC_SHARED_SECRET=$(openssl rand -base64 24)
SYNC_MOCK_MODE=true

# Production (коли 1С готовий):
# SYNC_MOCK_MODE=false
# ONEC_SOAP_URL=https://1c.local/ltex/ws/MobileExchange.1cws
# ONEC_SOAP_PASSWORD=<shared secret з 1С constant СинкПароль>
```

## Endpoints

| Method | Path                | Auth                 | Description                           |
| ------ | ------------------- | -------------------- | ------------------------------------- |
| GET    | `/health`           | none                 | Liveness probe + cacheSize + mockMode |
| POST   | `/sync/clients/:id` | X-Sync-Secret header | Update/create клієнта у 1С            |

### POST /sync/clients/:id

Headers:

- `Content-Type: application/json`
- `X-Sync-Secret: <MANAGER_SYNC_SHARED_SECRET>`

Body:

```json
{
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "code1C": "000005798",
    "name": "Магазин Соборна",
    "tradePointName": "ТТ-1",
    "...": "..."
  }
}
```

Response (mock):

```json
{
  "ok": true,
  "code1C": "000005798",
  "mockMode": true,
  "errors": []
}
```

Response (real 1С error):

```json
{
  "ok": false,
  "errorCode": 2,
  "errorMessage": "name is required"
}
```

## PM2 setup

Production runs через PM2 на Windows Server. Entry у root
`ecosystem.config.js`:

```
pm2 start ecosystem.config.js --only ltex-manager-sync
pm2 save
```

Logs:

- `E:\ltex-logs\manager-sync-out.log`
- `E:\ltex-logs\manager-sync-error.log`

PM2-logrotate уже сконфігурований у S68 (10MB / 14 day retention).

## Tests

```bash
pnpm --filter @ltex/manager-sync test
```

Покриває:

- `idempotency.test.ts` — in-memory TTL cache
- `soap/mock.test.ts` — mock SOAP responses
- `soap/client.test.ts` — envelope builder + parser + happy-path з faked fetch
- `routes/sync-clients.test.ts` — Fastify integration (mock-mode)

**NOT covered:** real SOAP handshake — це manual test після того як 1С-сторона
реалізує BSL-модулі. Smoke-приклад curl-команди — у `docs/1C_SYNC_MODULES_SPEC.md` §8.
