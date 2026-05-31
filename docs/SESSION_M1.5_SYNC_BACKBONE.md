# Session M1.5 — Backbone двостороннього sync з 1С (outbound proxy + queue + 1С modules spec)

**Type:** Worker session (~35 файлів)
**Branch:** `claude/manager-m1-5-sync-backbone-{XXXX}`
**Goal:** Створити інфраструктуру для двостороннього обміну з 1С: (1) новий сервіс `services/manager-sync/` як HTTP-proxy між Next.js і 1С SOAP; (2) queue таблиця `mgr_sync_jobs` для outbound write-back; (3) cron worker що процесить queue з retry/backoff; (4) PATCH `/clients/[id]` тепер enqueue зміни у чергу; (5) **детальна специфікація 1С BSL-модулів** які потрібно написати на стороні 1С; (6) mock mode щоб worker міг розробляти без живого 1С.

**Parent spec:** [`docs/MANAGER_APP_STRATEGY.md`](MANAGER_APP_STRATEGY.md) §3 (architecture row "1C integration") + §2 (hybrid model). **Builds on:** M1.3a-f (clients), M1.4 (orders).

**User decisions (locked 2026-05-15):**

- **Канал до 1С:** ще не налаштований. Робимо все на mock + production-ready підключення коли URL буде готовий.
- **Scope:** M1.5 = backbone тільки (proxy + queue + cron + client edit enqueue + 1С spec doc). M1.5b = POST /orders + UI form + POST /payments + real-connection wire-up.

---

## ⚠️ HARD RULES

1. **DO NOT** робити реальний SOAP-call без mock fallback. Worker не має доступу до живого 1С — все має працювати у mock mode (`SYNC_MOCK_MODE=true` дефолт).
2. **DO NOT** змінювати схему 1С — тільки **специфікувати** що треба написати у `docs/1C_SYNC_MODULES_SPEC.md` для майбутнього 1С-розробника (або наступної worker сесії що пише BSL).
3. **DO NOT touch** `services/telegram-bot/` чи `services/viber-bot/` — використай їх як reference для service pattern.
4. **DO NOT** додавати POST `/orders` чи POST `/payments` — це M1.5b. M1.5 фокус на client edit як перший use case.
5. **DO NOT** видаляти "+ Створити замовлення" stub з M1.4 — він лишиться до M1.5b.
6. **READ** перед першим commit:
   - `docs/1c-export-mobile/Central/WebServices/MobileExchange.xml` — наявні SOAP операції (reference!)
   - `docs/1c-export-mobile/MobileAgent/CommonModules/Обмен_УправлениеОбменом/Ext/Module.bsl` — приклад existing обмен logic
   - `services/telegram-bot/` — pattern для services/
   - `apps/store/lib/email.ts` + `app/api/cron/process-email-queue/` — pattern для queue з S70
   - `apps/store/app/api/v1/manager/clients/[id]/route.ts` — M1.3d PATCH endpoint

---

## Big picture

### Архітектура

```
┌─────────────────────────────┐
│  Next.js Manager App        │
│  (apps/store)               │
│                             │
│  PATCH /clients/[id]        │
│    ↓                        │
│  prisma.mgrClient.update    │
│    ↓                        │
│  enqueue SyncJob ──────────┐│
└─────────────────────────────┘
                              │
              ┌───────────────┘
              │ Cron every 1m
              ↓
┌─────────────────────────────┐
│ /api/cron/process-sync-queue│  ← Next.js cron route
│                             │
│ For each pending SyncJob:   │
│   POST http://manager-sync/ │
│        sync/clients/:id     │
└─────────────────────────────┘
              │
              ↓ HTTP
┌─────────────────────────────┐
│  services/manager-sync/     │  ← новий Node service
│  (PM2 instance, port 3001)  │
│                             │
│  POST /sync/clients/:id     │
│    ↓                        │
│  if SYNC_MOCK_MODE=true:    │
│    return { ok: true,       │
│             mockMode: true }│
│                             │
│  else:                      │
│    SOAP call →              │
│    MobileExchange.1cws      │
│    .ОбновитиКлієнта(...)    │
└─────────────────────────────┘
              │
              ↓ SOAP
┌─────────────────────────────┐
│   1С                        │
│   MobileExchange.1cws       │
│                             │
│   Web service operations    │
│   (треба написати у BSL —   │
│   spec у docs/1C_SYNC_      │
│   MODULES_SPEC.md)          │
└─────────────────────────────┘
```

### Why proxy (services/manager-sync), not direct from Next.js?

Strategy doc lock у M1.0:

- Next.js — short-running serverless-style HTTP handlers, не підходять для long-running SOAP sessions
- Proxy може mantain connection pool, handle SOAP retries, mock fallback
- Окремий PM2 instance — restart-able без впливу на main app
- Майбутнє inbound polling (M1.6) теж буде у тому ж proxy

### SyncJob lifecycle

```
pending → retrying ⇄ pending → sent
                            ↘
                              failed (after maxAttempts)
```

- `attempts`: 0 на enqueue, ++ кожна спроба
- `nextAttemptAt`: now + backoff (1м / 5м / 30м / 2г / 6г) — як email queue з S70
- `maxAttempts`: 5
- On `attempts >= maxAttempts`: status='failed', логуємо `lastError`, admin alert (через /admin/sync-jobs UI у M1.5b)

### Mock mode

`SYNC_MOCK_MODE=true` у `.env.example` — manager-sync приймає request, симулює delay 100-500ms (random), повертає `{ ok: true, idempotencyKey, mockMode: true, sentAt: ISO }`. Тести використовують mock.

`SYNC_MOCK_MODE=false` (production) — manager-sync робить real SOAP call. У M1.5 цей шлях coded але не tested (не маємо живого 1С). У M1.5b чи окремій follow-up — реальне тестування.

### 1С спецификація — що треба написати у BSL

Файл `docs/1C_SYNC_MODULES_SPEC.md` (детальна 200+ рядкова спека) — повний контракт для 1С-розробника. Контент:

- Які SOAP operations exposes (наприклад `ОбновитиКлієнта(ПарольВхода, ПакетДанних, IdempotencyKey)`)
- Структура `ПакетДанних` як JSON-string з полями
- Auth: `ПарольВхода` env var (shared secret)
- Idempotency: `IdempotencyKey` UUID-string — 1С зберігає у власному реєстрі `СинкЛог` 7 днів, повертає cached result для duplicate
- Error codes (XML response): 0=OK, 1=AuthFailed, 2=ValidationError, 3=DBError, 4=Other
- Examples request/response XML
- 1С BSL module signatures (functions + типи)

Цей doc — артефакт що передається 1С-розробнику. У майбутній worker сесії можливо буде "M1.5c — implement 1С BSL modules" що генерує сам код. Поки що — спека.

---

## Файли — повний перелік (~35)

### Documentation (~2)

```
docs/1C_SYNC_MODULES_SPEC.md                                       ← NEW: повний контракт 1С BSL (200+ рядків)
docs/M1.5_SYNC_ARCHITECTURE.md                                      ← NEW: architecture overview (proxy / queue / cron / mock)
```

### services/manager-sync/ — новий Node service (~15)

```
services/manager-sync/package.json                                  ← NEW
services/manager-sync/tsconfig.json                                 ← NEW
services/manager-sync/.env.example                                  ← NEW

services/manager-sync/src/index.ts                                  ← NEW: HTTP server entry (Fastify)
services/manager-sync/src/config.ts                                 ← NEW: env vars + validation

services/manager-sync/src/auth.ts                                   ← NEW: middleware для shared-secret між Next.js і proxy

services/manager-sync/src/soap/client.ts                            ← NEW: real SOAP wrapper (using strong-soap)
services/manager-sync/src/soap/client.test.ts                       ← NEW ≥3 tests (smoke з mock SOAP server)
services/manager-sync/src/soap/mock.ts                              ← NEW: mock implementation для SYNC_MOCK_MODE=true
services/manager-sync/src/soap/mock.test.ts                         ← NEW ≥3 tests

services/manager-sync/src/routes/sync-clients.ts                    ← NEW: POST /sync/clients/:id
services/manager-sync/src/routes/sync-clients.test.ts               ← NEW ≥4 tests

services/manager-sync/src/idempotency.ts                            ← NEW: in-memory cache (TTL 5min) для dedup при retry
services/manager-sync/src/idempotency.test.ts                       ← NEW ≥3 tests

services/manager-sync/README.md                                      ← NEW: how to run, env vars, PM2 setup
ecosystem.config.js (root)                                           ← edit: додати manager-sync entry для PM2
```

### DB schema + migration (~3)

```
packages/db/prisma/migrations/2026MMDD_sync_jobs/migration.sql      ← NEW idempotent
packages/db/prisma/schema.prisma                                     ← edit: add MgrSyncJob model + enum SyncJobStatus
scripts/seed-mgr-test-data.ts                                        ← edit (опційно): додати 1-2 фейкові SyncJobs для testing UI у M1.5b
```

### Next.js — backbone integration (~10)

```
apps/store/lib/sync/enqueue.ts                                      ← NEW: enqueueClientUpdate() helper
apps/store/lib/sync/enqueue.test.ts                                 ← NEW ≥4 tests

apps/store/lib/sync/queue-processor.ts                              ← NEW: process pending jobs з backoff
apps/store/lib/sync/queue-processor.test.ts                         ← NEW ≥5 tests

apps/store/app/api/cron/process-sync-queue/route.ts                 ← NEW: cron endpoint (CRON_SECRET auth)
apps/store/app/api/cron/process-sync-queue/route.test.ts            ← NEW ≥3 tests

apps/store/app/api/v1/manager/clients/[id]/route.ts                 ← edit: PATCH — на success enqueue SyncJob
apps/store/app/api/v1/manager/clients/[id]/route.test.ts            ← edit: ≥2 нових tests (enqueue happens)

apps/store/lib/sync/proxy-client.ts                                 ← NEW: HTTP client до services/manager-sync
apps/store/lib/sync/proxy-client.test.ts                            ← NEW ≥3 tests (mock fetch)
```

### Validation (~2)

```
apps/store/lib/validations/sync-job.ts                              ← NEW: Zod schemas для SyncJob payloads
apps/store/lib/validations/sync-job.test.ts                         ← NEW ≥3 tests
```

### UI — header sync indicator (~2)

```
apps/store/app/manager/(workstation)/_components/sync-indicator.tsx ← edit: real status замість hardcode
apps/store/app/api/v1/manager/sync/status/route.ts                  ← NEW: GET sync status (counts pending / last sent)
```

### Env vars + deploy (~1)

```
apps/store/.env.example                                              ← edit: додати SYNC_*_  vars
```

**Total ~35 файлів, +2500-3000 lines estimate.**

---

## Detailed tasks

### Task 1 — `docs/1C_SYNC_MODULES_SPEC.md`

200+ рядковий контракт. Структура:

````markdown
# 1С Sync Modules Specification

Цей документ описує SOAP-операції які треба реалізувати у 1С Web Service
`MobileExchange.1cws` (або новий `ManagerSync.1cws`) для двостороннього
обміну з програмою менеджерів L-TEX.

## 1. Auth

Усі операції приймають параметр `ПарольВхода` — shared secret.
Production value у env var `1C_SYNC_SHARED_SECRET` на стороні нашого
сервера; ідентичний у 1С constant `СинкПароль`.

## 2. Idempotency

Operations що змінюють стан (Update/Create) приймають `IdempotencyKey`
(UUID string). 1С підтримує реєстр `СинкЛог`:

- Поля: ID (UUID), DateCreated, OperationType, ResultJSON
- Retention 7 days
- На повторний call з тим самим key → return cached ResultJSON, не виконуй operation
- Implementation у BSL — таблиця регістру або catalog `СинкЛог`

## 3. Operations

### 3.1 ОбновитиКлієнта

Update or create клієнта у 1С на основі data з нашої програми.

**Параметри:**
| Name | Type | In/Out | Description |
|---|---|---|---|
| `ПарольВхода` | xs:string | In | Shared secret |
| `IdempotencyKey` | xs:string | In | UUID для dedup |
| `ПакетДанних` | xs:string (JSON) | In | Дані клієнта |

**ПакетДанних JSON структура:**

```json
{
  "code1C": "000005798",            // null якщо нового створюємо
  "name": "Магазин Соборна",
  "tradePointName": "ТТ-1",
  "region": "Київська",
  "city": "Київ",
  ...
}
```
````

**Return value:** `xs:string` — JSON:

```json
{
  "ok": true,
  "code1C": "000005798",
  "errors": []
}
```

**Error response:**

```json
{
  "ok": false,
  "errorCode": 2,
  "errorMessage": "Validation: missing tradePointName"
}
```

**Error codes:**

- 0 = OK (но return ok:true замість)
- 1 = AuthFailed (wrong ПарольВхода)
- 2 = ValidationError (invalid payload)
- 3 = DBError (1С DB write failed)
- 4 = Other

**BSL module signature:**

```bsl
// CommonModule "СинкВхідний"
Функция ОбновитиКлієнта(ПарольВхода, IdempotencyKey, ПакетДанних) Експорт
    Если Не ПеревіритиПароль(ПарольВхода) Тоді
        Возврат СтворитиВідповідьПомилки(1, "Auth failed");
    КонецЕсли;

    // Idempotency check
    ЗбережениОтвет = ОтриматиСинкЛогЗапис(IdempotencyKey);
    Якщо ЗбережениОтвет <> Неопределено Тоді
        Возврат ЗбережениОтвет;
    КонецЕсли;

    // Парсинг
    Спробувати
        Дані = JSON.Десеріалізувати(ПакетДанних);
    Інакше
        Возврат СтворитиВідповідьПомилки(2, "Invalid JSON");
    КонецСпробувати;

    // Validation
    ...

    // Update/Create
    Спробувати
        Клієнт = ЗнайтиАбоСтворитиКлієнта(Дані.code1C);
        Клієнт.Найменування = Дані.name;
        Клієнт.НаименованиеТТ = Дані.tradePointName;
        ...
        Клієнт.Записать();

        Результат = СтворитиВідповідьУспіх(Клієнт.Код);
        ЗберегтиСинкЛогЗапис(IdempotencyKey, Результат);
        Возврат Результат;
    Інакше
        Возврат СтворитиВідповідьПомилки(3, ОписаниеОшибки());
    КонецСпробувати;
КонецФункции
```

### 3.2 СтворитиЗамовлення (M1.5b, заплановано)

### 3.3 СтворитиОплату (M1.5b, заплановано)

### 3.4 ОтриматиСнапшот (M1.6, заплановано — inbound)

### 3.5 ЗберегтиСинкЛогЗапис, ОтриматиСинкЛогЗапис (helpers, internal)

## 4. Examples (XML)

### Request `ОбновитиКлієнта`

```xml
<soap:Envelope ...>
  <soap:Body>
    <ms:ОбновитиКлієнта xmlns:ms="http://arm_mobile">
      <ms:ПарольВхода>shared-secret-value</ms:ПарольВхода>
      <ms:IdempotencyKey>550e8400-e29b-41d4-a716-446655440000</ms:IdempotencyKey>
      <ms:ПакетДанних>{"code1C":"000005798","name":"...","tradePointName":"ТТ-1"}</ms:ПакетДанних>
    </ms:ОбновитиКлієнта>
  </soap:Body>
</soap:Envelope>
```

### Response

```xml
<soap:Envelope ...>
  <soap:Body>
    <ms:ОбновитиКлієнтаResponse xmlns:ms="http://arm_mobile">
      <ms:return>{"ok":true,"code1C":"000005798","errors":[]}</ms:return>
    </ms:ОбновитиКлієнтаResponse>
  </soap:Body>
</soap:Envelope>
```

## 5. Implementation у 1С

1. Створи новий `CommonModule "СинкВхідний"` (server-side, External access disabled, Reusable)
2. Створи Catalog (chosen for простоту) `СинкЛог` з полями `IdempotencyKey` (UUID), `DateCreated`, `OperationType`, `ResultJSON`
3. Add scheduled task "ЧисткаСинкЛогу" — щодня видаляє СинкЛог записи старші 7 днів
4. Додай operations у `WebService MobileExchange.1cws` за signatures вище
5. Реєстрація WebService через web-platform на IIS / Apache (стандартно для 1С)
6. URL endpoint: `https://your-1c-server/ltex/ws/MobileExchange.1cws`

## 6. Майбутні розширення (M1.5b+ / M1.6)

Operations що додамо пізніше:

- `СтворитиЗамовлення` — M1.5b
- `СтворитиОплату` — M1.5b
- `СтворитиРеалізацію` — M1.5b (опційно — реалізації по факту)
- `ОтриматиСнапшот` — M1.6 (inbound polling для оновлення наших mgr\_\* tables)

````

### Task 2 — `services/manager-sync/` setup

`package.json`:
```json
{
  "name": "@ltex/manager-sync",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@ltex/db": "workspace:*",
    "@ltex/shared": "workspace:*",
    "fastify": "^5.1.0",
    "strong-soap": "^5.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.0"
  }
}
````

`src/index.ts`:

```typescript
import Fastify from "fastify";
import { config } from "./config";
import { authMiddleware } from "./auth";
import { syncClientsRoute } from "./routes/sync-clients";

const app = Fastify({ logger: true });

app.addHook("preHandler", authMiddleware);
app.register(syncClientsRoute, { prefix: "/sync" });

app.get("/health", async () => ({ ok: true, mockMode: config.mockMode }));

await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(
  `[manager-sync] listening on :${config.port} mockMode=${config.mockMode}`,
);
```

`src/config.ts`:

```typescript
import { z } from "zod";

const envSchema = z.object({
  MANAGER_SYNC_PORT: z.string().default("3001").transform(Number),
  MANAGER_SYNC_SHARED_SECRET: z.string().min(16),
  SYNC_MOCK_MODE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  ONEC_SOAP_URL: z.string().url().optional(),
  ONEC_SOAP_PASSWORD: z.string().optional(),
});

export const config = (() => {
  const parsed = envSchema.parse(process.env);
  return {
    port: parsed.MANAGER_SYNC_PORT,
    sharedSecret: parsed.MANAGER_SYNC_SHARED_SECRET,
    mockMode: parsed.SYNC_MOCK_MODE,
    onecUrl: parsed.ONEC_SOAP_URL,
    onecPassword: parsed.ONEC_SOAP_PASSWORD,
  };
})();
```

`src/auth.ts`:

```typescript
import { FastifyRequest, FastifyReply } from "fastify";
import { config } from "./config";

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
  if (req.url === "/health") return;

  const header = req.headers["x-sync-secret"];
  if (header !== config.sharedSecret) {
    reply.code(401).send({ error: "Unauthorized" });
  }
}
```

### Task 3 — Real SOAP client

`src/soap/client.ts`:

```typescript
import { soap } from "strong-soap";
import { config } from "../config";

let cachedClient: any = null;

export async function getOnecClient() {
  if (cachedClient) return cachedClient;
  if (!config.onecUrl) {
    throw new Error(
      "ONEC_SOAP_URL not configured (set SYNC_MOCK_MODE=true для dev)",
    );
  }
  const wsdlUrl = `${config.onecUrl}?wsdl`;
  cachedClient = await new Promise<any>((resolve, reject) => {
    soap.createClient(wsdlUrl, {}, (err: any, client: any) => {
      if (err) reject(err);
      else resolve(client);
    });
  });
  return cachedClient;
}

export async function updateClientViaSoap(payload: {
  idempotencyKey: string;
  data: Record<string, any>;
}): Promise<{ ok: boolean; code1C?: string; errorMessage?: string }> {
  const client = await getOnecClient();
  // ... call ОбновитиКлієнта operation
  return new Promise((resolve, reject) => {
    client.ОбновитиКлієнта(
      {
        ПарольВхода: config.onecPassword,
        IdempotencyKey: payload.idempotencyKey,
        ПакетДанних: JSON.stringify(payload.data),
      },
      (err: any, result: any) => {
        if (err) reject(err);
        else {
          try {
            const parsed = JSON.parse(result.return);
            resolve(parsed);
          } catch (e) {
            reject(new Error("Invalid SOAP response: " + result.return));
          }
        }
      },
    );
  });
}
```

### Task 4 — Mock SOAP

`src/soap/mock.ts`:

```typescript
export async function updateClientMock(payload: {
  idempotencyKey: string;
  data: Record<string, any>;
}): Promise<{ ok: boolean; code1C: string; mockMode: true }> {
  const delay = 100 + Math.random() * 400;
  await new Promise((r) => setTimeout(r, delay));
  return {
    ok: true,
    code1C: payload.data.code1C ?? `MOCK-${Date.now()}`,
    mockMode: true,
  };
}
```

### Task 5 — Sync clients route

`src/routes/sync-clients.ts`:

```typescript
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config";
import { updateClientMock } from "../soap/mock";
import { updateClientViaSoap } from "../soap/client";
import { checkAndStoreIdempotencyKey } from "../idempotency";

const bodySchema = z.object({
  idempotencyKey: z.string().uuid(),
  payload: z.record(z.unknown()),
});

export async function syncClientsRoute(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/clients/:id", async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body" });

    const { idempotencyKey, payload } = parsed.data;

    // Idempotency dedup
    const cached = checkAndStoreIdempotencyKey(idempotencyKey);
    if (cached !== null) return cached;

    try {
      const result = config.mockMode
        ? await updateClientMock({ idempotencyKey, data: payload as any })
        : await updateClientViaSoap({ idempotencyKey, data: payload as any });
      checkAndStoreIdempotencyKey(idempotencyKey, result);
      return result;
    } catch (e: any) {
      reply.code(502).send({ ok: false, error: String(e?.message ?? e) });
    }
  });
}
```

### Task 6 — Idempotency (in-memory)

`src/idempotency.ts`:

```typescript
type CachedResult = unknown;
const store = new Map<string, { result: CachedResult; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export function checkAndStoreIdempotencyKey(
  key: string,
  result?: CachedResult,
): CachedResult | null {
  // Cleanup expired
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }

  if (result === undefined) {
    return store.get(key)?.result ?? null;
  }
  store.set(key, { result, expiresAt: now + TTL_MS });
  return result;
}
```

Tests: dedup works / expires after TTL / multiple keys.

### Task 7 — DB schema MgrSyncJob

`schema.prisma`:

```prisma
enum SyncJobStatus {
  pending
  retrying
  sent
  failed
}

enum SyncEntityType {
  client
  order      // M1.5b
  payment    // M1.5b
}

model MgrSyncJob {
  id              String          @id @default(cuid())
  entityType      SyncEntityType
  entityId        String                              // MgrClient.id or Order.id
  action          String                              // "update" / "create"
  payload         Json
  status          SyncJobStatus   @default(pending)
  attempts        Int             @default(0)
  maxAttempts     Int             @default(5)
  nextAttemptAt   DateTime        @default(now())
  lastError       String?         @db.Text
  idempotencyKey  String          @unique             // UUID generated на enqueue
  sentAt          DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([status, nextAttemptAt])
  @@index([entityType, entityId])
  @@map("mgr_sync_jobs")
}
```

Migration (idempotent з IF NOT EXISTS + enum створення обернути у DO).

### Task 8 — enqueue helper

`apps/store/lib/sync/enqueue.ts`:

```typescript
import crypto from "node:crypto";
import { prisma } from "@ltex/db";
import type { MgrClient } from "@prisma/client";

export async function enqueueClientUpdate(
  client: MgrClient,
  action: "update" | "create" = "update",
) {
  const payload = {
    code1C: client.code1C,
    name: client.name,
    tradePointName: client.tradePointName,
    region: client.region,
    city: client.city,
    street: client.street,
    house: client.house,
    novaPoshtaBranch: client.novaPoshtaBranch,
    websiteUrl: client.websiteUrl,
    geolocation: client.geolocation,
    monthlyVolume: client.monthlyVolume?.toString(),
    // ... всі editable scalar fields з M1.3d
  };

  return prisma.mgrSyncJob.create({
    data: {
      entityType: "client",
      entityId: client.id,
      action,
      payload,
      idempotencyKey: crypto.randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}
```

Tests ≥ 4: enqueue creates row / unique idempotencyKey / payload shape.

### Task 9 — Queue processor

`apps/store/lib/sync/queue-processor.ts`:

```typescript
import { prisma } from "@ltex/db";
import { sendToProxy } from "./proxy-client";

const BACKOFF_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
];

export async function processSyncQueue(
  batchSize = 20,
): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date();
  const jobs = await prisma.mgrSyncJob.findMany({
    where: {
      status: { in: ["pending", "retrying"] },
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: batchSize,
  });

  let sent = 0,
    failed = 0;

  for (const job of jobs) {
    try {
      await sendToProxy(job);
      await prisma.mgrSyncJob.update({
        where: { id: job.id },
        data: { status: "sent", sentAt: new Date(), lastError: null },
      });
      sent++;
    } catch (e: any) {
      const nextAttempts = job.attempts + 1;
      if (nextAttempts >= job.maxAttempts) {
        await prisma.mgrSyncJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            attempts: nextAttempts,
            lastError: String(e?.message ?? e),
          },
        });
        failed++;
      } else {
        const backoff =
          BACKOFF_MS[Math.min(nextAttempts - 1, BACKOFF_MS.length - 1)];
        await prisma.mgrSyncJob.update({
          where: { id: job.id },
          data: {
            status: "retrying",
            attempts: nextAttempts,
            nextAttemptAt: new Date(Date.now() + backoff),
            lastError: String(e?.message ?? e),
          },
        });
      }
    }
  }

  return { processed: jobs.length, sent, failed };
}
```

Tests ≥ 5: happy / retry / max attempts → failed / empty queue / backoff progression.

### Task 10 — Proxy client (Next.js → manager-sync)

`apps/store/lib/sync/proxy-client.ts`:

```typescript
import type { MgrSyncJob } from "@prisma/client";

const PROXY_URL = process.env.MANAGER_SYNC_URL || "http://localhost:3001";
const SHARED_SECRET = process.env.MANAGER_SYNC_SHARED_SECRET || "";

export async function sendToProxy(job: MgrSyncJob): Promise<unknown> {
  let path: string;
  switch (job.entityType) {
    case "client":
      path = `/sync/clients/${job.entityId}`;
      break;
    default:
      throw new Error(
        `Unsupported entityType ${job.entityType} (M1.5b добавить orders/payments)`,
      );
  }

  const res = await fetch(`${PROXY_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sync-Secret": SHARED_SECRET,
    },
    body: JSON.stringify({
      idempotencyKey: job.idempotencyKey,
      payload: job.payload,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Proxy ${res.status}: ${text}`);
  }
  return res.json();
}
```

Tests ≥ 3: mock fetch success / mock fetch 502 / network error.

### Task 11 — Cron endpoint

`apps/store/app/api/cron/process-sync-queue/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { processSyncQueue } from "@/lib/sync/queue-processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processSyncQueue();
  return NextResponse.json(result);
}
```

Tests ≥ 3: auth check / process happy / empty queue.

### Task 12 — PATCH /clients/[id] enqueue

`apps/store/app/api/v1/manager/clients/[id]/route.ts` — на success після `prisma.mgrClient.update(...)`:

```typescript
const updated = await prisma.mgrClient.update({ ... });
// NEW M1.5: enqueue для 1С sync
try {
  await enqueueClientUpdate(updated, "update");
} catch (e) {
  console.warn("[L-TEX] Failed to enqueue client sync", { clientId: updated.id, error: String(e) });
  // Do NOT fail the request — sync is best-effort
}
return NextResponse.json(updated);
```

Tests ≥ 2: PATCH creates SyncJob / PATCH failure не блокує enqueue error.

### Task 13 — UI sync indicator

`sync-indicator.tsx`:

```tsx
"use client";
export function SyncIndicator() {
  const [status, setStatus] = useState<{
    lastSentAt?: string;
    pendingCount: number;
  } | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      const res = await fetch("/api/v1/manager/sync/status");
      if (res.ok) setStatus(await res.json());
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!status) return <span>Завантаження…</span>;

  if (status.pendingCount > 0) {
    return (
      <span className="text-amber-600">⏳ {status.pendingCount} у черзі</span>
    );
  }
  if (status.lastSentAt) {
    const seconds = Math.floor(
      (Date.now() - new Date(status.lastSentAt).getTime()) / 1000,
    );
    return <span className="text-green-600">✓ {seconds}с тому</span>;
  }
  return <span className="text-gray-500">Без даних</span>;
}
```

GET `/api/v1/manager/sync/status` повертає `{ pendingCount, lastSentAt }`.

### Task 14 — Env vars

`.env.example` additions:

```
# Manager sync (M1.5)
MANAGER_SYNC_URL=http://localhost:3001
MANAGER_SYNC_SHARED_SECRET=<openssl rand -base64 24>
CRON_SECRET=<same as for cleanup-viewlog>
# Production only:
# ONEC_SOAP_URL=https://your-1c-server/ltex/ws/MobileExchange.1cws
# ONEC_SOAP_PASSWORD=<1c password>
# SYNC_MOCK_MODE=false
```

### Task 15 — PM2 ecosystem

`ecosystem.config.js` (root) — додати entry:

```javascript
{
  name: "ltex-manager-sync",
  cwd: "./services/manager-sync",
  script: "tsx",
  args: "src/index.ts",
  watch: false,
  autorestart: true,
  env: { NODE_ENV: "production" },
}
```

### Task 16 — Tests final

Total ≥ 30:

- 1С spec doc — no tests
- manager-sync: soap mock (3) + soap client smoke (3) + sync-clients route (4) + idempotency (3) = 13
- Next.js: enqueue (4) + queue-processor (5) + proxy-client (3) + cron route (3) + PATCH integration (2) + validation (3) = 20

---

## Acceptance criteria

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green у всьому monorepo
- [ ] `services/manager-sync` builds, тести passing
- [ ] Manager-sync `/health` повертає `{ ok: true, mockMode: true }` коли `SYNC_MOCK_MODE=true`
- [ ] POST `/sync/clients/:id` у mock-mode симулює delay 100-500ms + повертає `{ ok: true, mockMode: true }`
- [ ] Idempotency: повторний request з тим самим key — без дублювання
- [ ] Migration `2026MMDD_sync_jobs` — idempotent, additive
- [ ] PATCH `/clients/[id]` на success створює `MgrSyncJob` row
- [ ] Cron endpoint процесить jobs з backoff
- [ ] Failed jobs (5+ attempts) — status="failed", lastError stored
- [ ] UI header sync indicator — real polling 30s
- [ ] Documentation `docs/1C_SYNC_MODULES_SPEC.md` complete з прикладами
- [ ] **DO NOT push** на main. Тільки на feature branch.

---

## User-action post-merge

```powershell
cd E:\ltex-ecosystem
git pull origin main
pnpm install                                              # для services/manager-sync deps
.\scripts\deploy.ps1
pnpm --filter @ltex/db exec prisma migrate deploy
```

Додати у `apps/store/.env`:

```
MANAGER_SYNC_URL=http://localhost:3001
MANAGER_SYNC_SHARED_SECRET=<згенеруй: openssl rand -base64 24>
# CRON_SECRET — уже є з S70 email queue
```

Додати у `services/manager-sync/.env`:

```
MANAGER_SYNC_PORT=3001
MANAGER_SYNC_SHARED_SECRET=<те ж що у apps/store>
SYNC_MOCK_MODE=true
# Коли 1С буде готова:
# SYNC_MOCK_MODE=false
# ONEC_SOAP_URL=https://...
# ONEC_SOAP_PASSWORD=...
```

Запустити PM2:

```powershell
pm2 start ecosystem.config.js
pm2 save
```

Налаштувати Windows Task Scheduler для cron (analog email-queue з S70):

- Task name: "L-TEX Sync Queue"
- Trigger: every 1 minute
- Action: `powershell -Command "curl -X POST http://localhost:3000/api/cron/process-sync-queue -H 'x-cron-secret: <CRON_SECRET>'"`

---

## Notes for worker

1. **Phasing:**
   - Phase 1: Documentation `docs/1C_SYNC_MODULES_SPEC.md` + `docs/M1.5_SYNC_ARCHITECTURE.md`
   - Phase 2: `services/manager-sync` skeleton (package + config + auth + health)
   - Phase 3: SOAP client real + mock + tests
   - Phase 4: Idempotency cache + tests
   - Phase 5: sync-clients route + tests
   - Phase 6: DB migration + schema
   - Phase 7: Next.js enqueue + proxy-client + tests
   - Phase 8: Queue processor + tests
   - Phase 9: Cron endpoint + tests
   - Phase 10: PATCH /clients/[id] enqueue integration
   - Phase 11: UI sync indicator + status endpoint
   - Phase 12: Final tests + build + env docs

2. **`strong-soap` library** — у case вона не working/maintained, можна replace на `soap` (popular alternative). Worker — обери стабільніший. Mock mode default → real SOAP не тестується, тому compatibility issues не блокують CI.

3. **Idempotency у proxy** — in-memory Map з TTL. Pero PROD буде redis або DB-backed. Поки що Map OK для single-instance proxy.

4. **enqueue payload schema** — повний scalar fields snapshot з MgrClient. Decimal fields — `.toString()` перед serialize.

5. **DO NOT** додавати real SOAP integration test що hits live 1С. Все mock.

6. **`strong-soap` callbacks** — старий API, обгорни Promise-ами.

7. **`fastify` vs Express** — fastify швидший і має built-in TS support. Краще.

8. **Failed job retry by admin** — UI кнопка "Retry" у /admin/sync-jobs — це **M1.5b**. У M1.5 — admin може через psql `UPDATE mgr_sync_jobs SET status='pending', attempts=0 WHERE id=...`.

9. **DO NOT** покривати tests SOAP-real-call mock — це integration, не unit. Smoke test з faked SOAP server (using `nock` or similar) — OK.

10. **Conflict у migration з email_jobs (S70)** — нема, окрема таблиця.
