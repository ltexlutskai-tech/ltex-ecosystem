# Session M1.3a — Manager Clients (read-only, base view + detail card)

**Type:** Worker session (~45-50 файлів)
**Branch:** `claude/manager-m1-3a-clients-{XXXX}`
**Goal:** Розділ **Клієнти** для менеджера: список з фільтрами (базовий 7-колонковий вигляд) + детальна картка з 5 табами (Реквізити / Історія / Маршрути / Асортимент / Замовлення-stub). Прив'язка клієнтів до менеджерів через admin UI. Manual comments у timeline. Дані — поки **seed-скрипт** (10 фейкових клієнтів + довідники); реальний SOAP-sync з 1С — наступних сесій.

**Parent spec:** [`docs/MANAGER_APP_STRATEGY.md`](MANAGER_APP_STRATEGY.md) §4–5. **Backlog ref:** [`docs/M1_BACKLOG.md`](M1_BACKLOG.md) → M1.3.

**Конфігурація 1С для reference:** `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты/` + `Central/Catalogs/Контрагенты/` + `Central/CommonModules/ОбменАРМ/`. Тут визначені реальні поля, типи і ім'я полів які треба мапити у Postgres-schema.

**User decisions (locked 2026-05-13):**

- 7 базових колонок: Клієнт / Борг / Статус / Канал / Днів від останнього / Останній запис / Менеджер
- Статус = автоматично з 1С (Активний/Малоактивний/Неактивний/Потенційний/Новий — формула на сервері 1С, не реалізуємо)
- ОПСтатус = окреме поле, теж приходить з 1С (за поточний місяць замість попереднього)
- Timeline записи = **обоє** auto (з 1С обмін: Оплата, Реалізація, Нагадування) + manual коментарі менеджера
- Сміттєві контрагенти (порожні поля, name = "1111111" / "777777") — приховуємо у нашому UI через фільтр `name regex not all-digits AND hasValidContact`

**Out of scope (відкладено):**

- Toggle 7↔20 колонок + звіт "Аналіз клієнтської бази" → **M1.3b**
- Створення / редагування клієнта → V2
- Закриття старих замовлень → M2.1
- Viber-чат / надсилання повідомлень → M1.8
- Реальний SOAP-sync → M1.5+
- "Створити замовлення з картки" клік → M1.5 (поки toast "Скоро")

---

## ⚠️ HARD RULES

1. **DO NOT touch** existing M1.1 auth endpoints або `lib/auth/*`.
2. **DO NOT touch** `/admin/*` web admin (Supabase auth).
3. **DO NOT touch** `apps/mobile-client/` (customer Expo app).
4. **DO NOT** імплементувати реальний SOAP-sync — тільки seed-скрипт з фейковими даними.
5. **DO NOT** додавати нові auth-логіку — reuse `getCurrentUser` / `requireRole`.
6. **READ ME** перед першим commit:
   - `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты.xml` — реквізити (всі поля з типами)
   - `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты/Forms/ФормаЭлемента/Ext/Form.xml` — структура картки + таби
   - `docs/1c-export-mobile/Central/Catalogs/Контрагенты.xml` — як ЦБ передає клієнтів через обмін
   - `docs/1c-export-mobile/Central/CommonModules/ОбменАРМ/Ext/Module.bsl` — SQL-запит що формує payload для мобільного (твоя best-reference для mapping полів!)
7. **Reuse** `@ltex/ui` (Card, Badge, Button, Input, Select, Tabs, Dialog, Sheet, Skeleton, Toast).
8. **NO** інших sidebar links редагувати — тільки видалити `<UnderConstruction>` з `/manager/customers/page.tsx` і замінити на реальну сторінку.

---

## Big picture

### Список клієнтів (`/manager/customers`)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  Клієнти                                                       🔍 Знайти за телефоном │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  [🔍 Пошук...]   [Всі • Переплата • Борг]  [Статус▼] [Канал▼] [Тільки мої] [↺ Фільтри]│
├──────────────────────────────────────────────────────────────────────────────────────┤
│  Клієнт                       │ Борг      │ Статус       │ Канал   │ Днів│ Запис    │ Менеджер   │
│ ─────────────────────────────│───────────│─────────────│─────────│─────│──────────│──────────  │
│  Амер (0633669359)            │ 17 387,74 │ 🟡 Неактивн.│ База    │ 146 │ Оплата...│ Кузенко Т. │
│  Рівне                        │           │              │         │     │          │            │
│ ─────────────────────────────│───────────│─────────────│─────────│─────│──────────│──────────  │
│  Бєлоус Альона (0505319881)   │   −8,23   │ 🟢 Активн.  │ Google  │  5  │ Оплата...│ Кузенко Т. │
│  Дмитрівка                    │ переплата │              │         │     │          │            │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                                          [< 1 2 3 ... 12 >]
```

Червоне підсвічування рядка коли `statusGeneral = "Неактивний"`. Hover — лекко затемнює. Click рядка → перехід на детальну картку.

### Картка клієнта (`/manager/customers/[id]`)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← Назад до списку                                                                     │
│                                                                                       │
│ Амер (0633669359)            🟡 Неактивний  📞 Активн. (по поточному міс.)            │
│ Рівненська · Рівне                                                                    │
│                                                                                       │
│ Борг: 17 387,74 грн                                          [+ Прив'язати менеджера] │
│ Менеджер: Кузенко Тарас                                       (admin only)             │
│                                                                                       │
│ [Реквізити] [Історія] [Маршрути] [Асортимент] [Замовлення]                            │
│                                                                                       │
│ ─ Реквізити ──────────────────────────────────────────────────────────────────────    │
│  Категорія ТТ:        Магазин                                                          │
│  Канал пошуку:        База                                                             │
│  Спосіб доставки:     —                                                                │
│  Тип цін:             Оптові                                                           │
│  Асортимент:          Секонд / сток                                                    │
│  Адреса:              Рівненська обл., м. Рівне                                        │
│  Відділення НП:       —                                                                │
│  Соцмережі:           [TikTok @amer_rivne]  [Viber +380633669359]                      │
│  Дата створення:      2024-03-15                                                       │
│                                                                                       │
│  Дії: [Створити замовлення] [Відправити повідомлення про борг]   ← всі заглушки       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Tab **Історія**: timeline записів з типом (🛒 Оплата / 📦 Реалізація / ⏰ Нагадування / 💬 Коментар) + дата + текст. Внизу — поле "Додати коментар" + кнопка "Записати".

Tab **Маршрути**: simple list з маршрутами на які клієнт прив'язаний.

Tab **Асортимент**: simple list (артикул + назва товару + останній раз куплено).

Tab **Замовлення**: `<UnderConstruction session="M1.5">` — реальні замовлення у наступних сесіях.

---

## Файли — повний перелік

### Нові файли (40+)

```
packages/db/prisma/migrations/2026MMDD_mgr_clients/migration.sql
packages/db/prisma/schema.prisma                                 ← edit (додати моделі)

scripts/seed-mgr-test-data.ts                                    ← seed 10 фейкових клієнтів + 6 довідників

apps/store/lib/validations/manager-clients.ts                    ← Zod schemas

# API
apps/store/app/api/v1/manager/clients/route.ts                              ← GET list
apps/store/app/api/v1/manager/clients/route.test.ts
apps/store/app/api/v1/manager/clients/[id]/route.ts                         ← GET single
apps/store/app/api/v1/manager/clients/[id]/route.test.ts
apps/store/app/api/v1/manager/clients/[id]/timeline/route.ts                ← GET timeline + POST manual comment
apps/store/app/api/v1/manager/clients/[id]/timeline/route.test.ts
apps/store/app/api/v1/manager/clients/[id]/assign/route.ts                  ← PATCH (admin only)
apps/store/app/api/v1/manager/clients/[id]/assign/route.test.ts
apps/store/app/api/v1/manager/dictionaries/route.ts                         ← GET all dicts (cached)
apps/store/app/api/v1/manager/dictionaries/route.test.ts

# UI list
apps/store/app/manager/(workstation)/customers/page.tsx          ← OVERWRITE existing UnderConstruction
apps/store/app/manager/(workstation)/customers/_components/
  client-list-toolbar.tsx                                        ← search + chips + filter button
  client-list-filter-sheet.tsx                                   ← advanced filters drawer
  client-list-table.tsx                                          ← server component, 7 columns
  client-list-row.tsx                                            ← single row з click → detail
  client-status-badge.tsx                                        ← color-coded chip
  debt-cell.tsx                                                  ← red/green coloring + UAH formatter
  days-since-cell.tsx                                            ← number з підсвічуванням
  list-pagination.tsx                                            ← reuse pattern з admin

# UI detail
apps/store/app/manager/(workstation)/customers/[id]/page.tsx
apps/store/app/manager/(workstation)/customers/[id]/_components/
  client-header.tsx                                              ← Назва + телефон + статуси + борг
  client-tabs.tsx                                                ← Tabs wrapper (server + client islands)
  client-requisites-tab.tsx                                      ← поля реквізити (server)
  client-history-tab.tsx                                         ← timeline (server) + comment-form (client)
  client-history-comment-form.tsx                                ← textarea + submit (client)
  client-timeline-item.tsx                                       ← single entry з іконкою + текстом
  client-routes-tab.tsx                                          ← list маршрутів
  client-assortment-tab.tsx                                      ← list асортименту
  client-orders-tab.tsx                                          ← <UnderConstruction session="M1.5">
  client-assign-dialog.tsx                                       ← admin only, select manager + save
  client-action-buttons.tsx                                      ← "Створити замовлення" + "Повідомлення про борг" (toast stubs)
```

### Edit існуючих

```
apps/store/app/manager/(workstation)/customers/page.tsx          ← з UnderConstruction → реальний список
apps/store/app/manager/(workstation)/_components/dashboard-stats-row.tsx  ← використати real `clientCount` з prisma.clientAssignment.count()
```

---

## Detailed tasks

### Task 1 — Prisma schema

Додати моделі (всі з `@@map` snake_case):

```prisma
// ────── Dictionaries ──────

model MgrClientStatus {
  id          String @id @default(cuid())
  code        String @unique   // "active" | "low_active" | "inactive" | "potential" | "new"
  label       String           // "Активний" тощо
  colorHex    String           // "#16a34a" "#eab308" "#dc2626" "#3b82f6" "#a855f7"
  sortOrder   Int    @default(0)
  @@map("mgr_client_statuses")
}

model MgrSearchChannel {
  id        String @id @default(cuid())
  code      String @unique   // "tiktok" | "google" | "olx" | "viber_group" | "base" | "other"
  label     String
  sortOrder Int    @default(0)
  @@map("mgr_search_channels")
}

model MgrCategoryTT {
  id        String @id @default(cuid())
  code      String @unique   // "shop" | "internet" | "tiktok"
  label     String
  sortOrder Int    @default(0)
  @@map("mgr_categories_tt")
}

model MgrDeliveryMethod {
  id        String @id @default(cuid())
  code      String @unique   // "nova_poshta" | "delivery" | "pickup"
  label     String
  sortOrder Int    @default(0)
  @@map("mgr_delivery_methods")
}

model MgrAssortmentCode {
  id        String @id @default(cuid())
  code      String @unique   // "second" | "stock" | "second_stock" | "toys" | "bric_a_brac"
  label     String
  sortOrder Int    @default(0)
  @@map("mgr_assortment_codes")
}

model MgrRoute {
  id          String  @id @default(cuid())
  code1C      String? @unique
  name        String
  isActive    Boolean @default(true)
  createdAt   DateTime @default(now())
  @@map("mgr_routes")
}

// ────── Clients ──────

model MgrClient {
  id            String  @id @default(cuid())
  code1C        String? @unique               // 9-char код контрагента з 1С (CodeLength=9)
  uid1C         String? @unique               // GUID з 1С
  name          String                        // "Амер" — Description у 1С
  phonePrimary  String?                       // основний телефон (НомерТелефона)
  city          String?
  region        String?                       // Область
  street        String?
  house         String?
  novaPoshtaBranch String?                    // НомерВідділенняНП
  geolocation   String?                       // "lat,lng" (опціонально)
  websiteUrl    String?                       // СсылкаНаСайт
  monthlyVolume Decimal? @db.Decimal(10,2)    // ОбъмЗаМесяц
  licenseExpiresAt DateTime?                  // СтрокДіїЛіцензії
  isOwn         Boolean @default(false)       // Власний (наш) клієнт
  notDirectInput Boolean @default(false)      // НеРучнаяЗапись — приходить з обміну

  debt          Decimal @default(0) @db.Decimal(12,2)   // Борг (UAH)
  overdueDebt   Decimal @default(0) @db.Decimal(12,2)   // ПросроченийБорг
  daysSinceLastPurchase Int?                            // КоличествоДнейОтПоследнейПокупки
  lastPurchaseAt DateTime?

  // FK на довідники (nullable бо при першому imporцi даних може ще не бути)
  statusGeneralId    String?
  statusOperationalId String?
  searchChannelId    String?
  categoryTTId       String?
  deliveryMethodId   String?
  primaryRouteId     String?
  primaryAssortmentId String?

  statusGeneral     MgrClientStatus?  @relation("StatusGeneral", fields: [statusGeneralId], references: [id])
  statusOperational MgrClientStatus?  @relation("StatusOperational", fields: [statusOperationalId], references: [id])
  searchChannel     MgrSearchChannel? @relation(fields: [searchChannelId], references: [id])
  categoryTT        MgrCategoryTT?    @relation(fields: [categoryTTId], references: [id])
  deliveryMethod    MgrDeliveryMethod? @relation(fields: [deliveryMethodId], references: [id])
  primaryRoute      MgrRoute?         @relation(fields: [primaryRouteId], references: [id])
  primaryAssortment MgrAssortmentCode? @relation(fields: [primaryAssortmentId], references: [id])

  // Manager-specific notifications/flags
  hasNewMessage  Boolean @default(false)
  isViberLinked  Boolean @default(false)
  dialogStatus   String?                       // free-text from 1C

  createdAt     DateTime @default(now())       // ДатаСоздания
  updatedAt     DateTime @updatedAt
  lastSyncedAt  DateTime?

  // Relations
  phones         MgrClientPhone[]
  warehouses     MgrClientWarehouse[]
  routes         MgrClientRouteAssignment[]
  messengers     MgrClientMessenger[]
  assortmentItems MgrClientAssortmentItem[]
  timeline       MgrClientTimelineEntry[]
  assignments    ClientAssignment[]            // existing з M1.1 (link до User)

  @@index([statusGeneralId])
  @@index([searchChannelId])
  @@index([region])
  @@index([phonePrimary])
  @@index([name])
  @@map("mgr_clients")
}

model MgrClientPhone {
  id        String @id @default(cuid())
  clientId  String
  phone     String                        // "+380501234567" or "0501234567"
  label     String?                        // optional ("Особистий", "Робочий")
  messenger String?                        // "viber" | "telegram" | "whatsapp" | null
  sortOrder Int @default(0)
  client    MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@index([phone])
  @@map("mgr_client_phones")
}

model MgrClientMessenger {
  id        String @id @default(cuid())
  clientId  String
  network   String                        // "tiktok" | "instagram" | "facebook" | "viber" | "telegram"
  handle    String                        // "@amer_rivne" or phone
  url       String?                       // повний URL якщо є
  comment   String?
  client    MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@map("mgr_client_messengers")
}

model MgrClientWarehouse {
  id              String @id @default(cuid())
  clientId        String
  code1C          String?
  name            String
  city            String?
  region          String?
  novaPoshtaBranch String?
  licenseExpiresAt DateTime?
  comment         String?
  client          MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@index([clientId])
  @@map("mgr_client_warehouses")
}

model MgrClientRouteAssignment {
  id        String @id @default(cuid())
  clientId  String
  routeId   String
  sortOrder Int    @default(0)
  client    MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  route     MgrRoute  @relation(fields: [routeId], references: [id], onDelete: Cascade)
  @@unique([clientId, routeId])
  @@map("mgr_client_route_assignments")
}

model MgrClientAssortmentItem {
  id           String @id @default(cuid())
  clientId     String
  productCode  String                       // артикул з 1С
  productName  String?
  lastOrderedAt DateTime?
  client       MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@index([clientId])
  @@map("mgr_client_assortment")
}

model MgrClientTimelineEntry {
  id        String @id @default(cuid())
  clientId  String
  kind      String                        // "payment" | "sale" | "reminder" | "comment" | "viber" | "sync"
  body      String  @db.Text
  occurredAt DateTime
  authorUserId String?                    // null для auto, FK на User для manual
  metadata  Json?                          // {orderId, amount, currency, ...} для auto-events
  createdAt DateTime @default(now())
  client    MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  author    User? @relation(fields: [authorUserId], references: [id], onDelete: SetNull)
  @@index([clientId, occurredAt(sort: Desc)])
  @@map("mgr_client_timeline")
}
```

⚠️ **Edit ClientAssignment** з M1.1 — додати relation до MgrClient:

```prisma
model ClientAssignment {
  // ... existing
  customerId  String                       // КЕРЕМО — це FK на MgrClient.id, не на existing customers table.
                                           // У M1.1 spec було "FK на existing customers" — це було помилкою, тут правимо.
                                           // existing customers — для retail-flow, не для манагерського.
  client      MgrClient @relation(fields: [customerId], references: [id], onDelete: Cascade)
  // ...
}
```

⚠️ Якщо M1.1 уже мав FK на existing `customers` table — переробити (DROP + recreate). Перевір `M1.1` migration перед тим. У наявності — `customerId` був без FK constraint, можна додати FK на mgr_clients зараз.

### Task 2 — Migration SQL

`packages/db/prisma/migrations/2026MMDD_mgr_clients/migration.sql`:

```sql
-- Dictionaries
CREATE TABLE IF NOT EXISTS "mgr_client_statuses" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT UNIQUE NOT NULL,
  "label" TEXT NOT NULL,
  "colorHex" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "mgr_search_channels" (...);
CREATE TABLE IF NOT EXISTS "mgr_categories_tt" (...);
CREATE TABLE IF NOT EXISTS "mgr_delivery_methods" (...);
CREATE TABLE IF NOT EXISTS "mgr_assortment_codes" (...);
CREATE TABLE IF NOT EXISTS "mgr_routes" (...);

-- Main clients
CREATE TABLE IF NOT EXISTS "mgr_clients" (
  -- ... (за схемою вище)
);

CREATE INDEX IF NOT EXISTS "mgr_clients_statusGeneralId_idx" ON "mgr_clients"("statusGeneralId");
CREATE INDEX IF NOT EXISTS "mgr_clients_searchChannelId_idx" ON "mgr_clients"("searchChannelId");
CREATE INDEX IF NOT EXISTS "mgr_clients_region_idx" ON "mgr_clients"("region");
CREATE INDEX IF NOT EXISTS "mgr_clients_phonePrimary_idx" ON "mgr_clients"("phonePrimary");
CREATE INDEX IF NOT EXISTS "mgr_clients_name_idx" ON "mgr_clients"("name");

-- Children
CREATE TABLE IF NOT EXISTS "mgr_client_phones" (...);
CREATE TABLE IF NOT EXISTS "mgr_client_messengers" (...);
CREATE TABLE IF NOT EXISTS "mgr_client_warehouses" (...);
CREATE TABLE IF NOT EXISTS "mgr_client_route_assignments" (...);
CREATE TABLE IF NOT EXISTS "mgr_client_assortment" (...);
CREATE TABLE IF NOT EXISTS "mgr_client_timeline" (
  -- ...
);
CREATE INDEX IF NOT EXISTS "mgr_client_timeline_clientId_occurredAt_idx"
  ON "mgr_client_timeline"("clientId", "occurredAt" DESC);

-- ClientAssignment FK upgrade (existing з M1.1)
ALTER TABLE "client_assignments"
  ADD CONSTRAINT "client_assignments_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "mgr_clients"("id") ON DELETE CASCADE;
```

Idempotent через `IF NOT EXISTS` + `DO $$ BEGIN ... EXCEPTION` для constraint.

### Task 3 — Seed script

`scripts/seed-mgr-test-data.ts`:

```typescript
#!/usr/bin/env tsx
import { prisma } from "@ltex/db";

async function seedDictionaries() {
  // 5 statuses, 6 channels, 3 categories, 3 deliveries, 5 assortment codes, 3 routes
  const statuses = [
    { code: "active", label: "Активний", colorHex: "#16a34a", sortOrder: 1 },
    {
      code: "low_active",
      label: "Малоактивний",
      colorHex: "#eab308",
      sortOrder: 2,
    },
    {
      code: "inactive",
      label: "Неактивний",
      colorHex: "#dc2626",
      sortOrder: 3,
    },
    {
      code: "potential",
      label: "Потенційний",
      colorHex: "#3b82f6",
      sortOrder: 4,
    },
    { code: "new", label: "Новий", colorHex: "#a855f7", sortOrder: 5 },
  ];
  for (const s of statuses) {
    await prisma.mgrClientStatus.upsert({
      where: { code: s.code },
      create: s,
      update: s,
    });
  }
  // similar для других довідників
}

async function seedClients() {
  // 10 фейкових клієнтів з різними статусами / каналами / регіонами
  // 3 з debt > 0, 1 з overdueDebt > 0, 2 з негативним debt (переплата), 4 з debt = 0
  // різні daysSinceLastPurchase (5, 30, 90, 200, null)
  // деякі прив'язані до admin, деякі без assignment
}

async function seedTimelineEvents() {
  // По 3-5 timeline записів на кожного клієнта (mix payment/sale/reminder/comment)
}

async function main() {
  await seedDictionaries();
  await seedClients();
  await seedTimelineEvents();
  console.log("✓ Seeded mgr test data");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

⚠️ Idempotent — `upsert` всюди.
⚠️ Run command: `pnpm --filter @ltex/store exec tsx scripts/seed-mgr-test-data.ts`

### Task 4 — Zod schemas `lib/validations/manager-clients.ts`

```typescript
import { z } from "zod";

export const listQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z.string().optional(), // mgr_client_statuses.code
  channel: z.string().optional(),
  deliveryMethod: z.string().optional(),
  hasDebt: z.coerce.boolean().optional(),
  hasOverpayment: z.coerce.boolean().optional(),
  onlyMine: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
  hideTrash: z.coerce.boolean().default(true), // приховати "1111111 ()" sміттєвки
});

export const timelineCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const assignSchema = z.object({
  userId: z.string().cuid().nullable(), // null = unassign
});
```

### Task 5 — `GET /api/v1/manager/clients`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { listQuerySchema } from "@/lib/validations/manager-clients";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad query", details: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    );
  }
  const q = parsed.data;

  // Build where
  const where: any = {};
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { phonePrimary: { contains: q.search } },
      { phones: { some: { phone: { contains: q.search } } } },
    ];
  }
  if (q.status) where.statusGeneral = { code: q.status };
  if (q.channel) where.searchChannel = { code: q.channel };
  if (q.deliveryMethod) where.deliveryMethod = { code: q.deliveryMethod };
  if (q.hasDebt) where.debt = { gt: 0 };
  if (q.hasOverpayment) where.debt = { lt: 0 };
  if (q.onlyMine) where.assignments = { some: { userId: user.id } };
  if (q.hideTrash) {
    // Виключити "1111111 ()", "777777 ()", "8888888 ()" тощо — імена з цифр-онлі + порожні phonePrimary
    where.AND = [
      { name: { not: { matches: "^\\s*\\d+\\s*\\(\\)?\\s*$" } } },
      { OR: [{ phonePrimary: { not: null } }, { city: { not: null } }] },
    ];
  }

  // ⚠️ Prisma не підтримує regex matches на string — використати raw SQL якщо треба.
  // Простіше: WHERE name NOT SIMILAR TO '[0-9 ]+( \(\))?'
  // Або зробити фільтр на сервер-боку у JS після fetch.
  // Спрощено: where.AND = [{ NOT: { name: { startsWith: "1111" } } }, { NOT: { name: { startsWith: "7777" } } }, { NOT: { name: { startsWith: "8888" } } }, { NOT: { name: { startsWith: "9999" } } }]

  const [total, items] = await Promise.all([
    prisma.mgrClient.count({ where }),
    prisma.mgrClient.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        statusGeneral: true,
        searchChannel: true,
        deliveryMethod: true,
        assignments: {
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    }),
  ]);

  return NextResponse.json({
    items: items.map((c) => ({
      id: c.id,
      code1C: c.code1C,
      name: c.name,
      phonePrimary: c.phonePrimary,
      city: c.city,
      region: c.region,
      debt: c.debt.toString(),
      daysSinceLastPurchase: c.daysSinceLastPurchase,
      statusGeneral: c.statusGeneral
        ? {
            code: c.statusGeneral.code,
            label: c.statusGeneral.label,
            colorHex: c.statusGeneral.colorHex,
          }
        : null,
      searchChannel: c.searchChannel
        ? { code: c.searchChannel.code, label: c.searchChannel.label }
        : null,
      assignedManager: c.assignments[0]?.user
        ? {
            id: c.assignments[0].user.id,
            fullName: c.assignments[0].user.fullName,
          }
        : null,
      lastTimelineSnippet: null, // буде в next iteration
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.ceil(total / q.pageSize),
  });
}
```

### Task 6 — `GET /api/v1/manager/clients/[id]`

Повертає **повну картку**: всі relations завантажені, timeline (з останніми 20 записів), warehouses, messengers, routes, assortment.

### Task 7 — `GET/POST /api/v1/manager/clients/[id]/timeline`

- GET: paginated timeline (50/page)
- POST: manual comment — Zod-validate body, save `kind: "comment"`, `authorUserId: currentUser.id`, `occurredAt: now()`, return new entry

### Task 8 — `PATCH /api/v1/manager/clients/[id]/assign`

- Auth required, **role === "admin"** (`requireRole(["admin"])`)
- Body: `{ userId: string | null }`
- Delete existing assignments for this clientId, create new (якщо userId не null)
- Return updated assignment

### Task 9 — `GET /api/v1/manager/dictionaries`

Cache 60s. Return single JSON з 6 arrays: statuses, channels, categories, deliveries, assortmentCodes, routes.

### Task 10 — UI list (`/manager/customers/page.tsx`)

Server component. Fetch params з searchParams, hit API через `fetch` (internal call OK через `cookies()` + base URL).

```tsx
import { CustomersListToolbar } from "./_components/client-list-toolbar";
import { CustomersListTable } from "./_components/client-list-table";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<URLSearchParams> }) {
  const user = (await getCurrentUser())!;
  const params = await searchParams;
  // ... fetch data + render
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Клієнти</h1>
        <Button variant="outline">🔍 Знайти за телефоном</Button>
      </header>
      <CustomersListToolbar />
      <CustomersListTable items={...} userId={user.id} userRole={user.role} />
      <ListPagination total={...} page={...} />
    </div>
  );
}
```

### Task 11 — UI list components

- `client-list-toolbar.tsx` (client) — search + chips + filter button
- `client-list-filter-sheet.tsx` (client, Sheet) — advanced filters (status, channel, delivery, route, onlyMine)
- `client-list-table.tsx` (server) — 7-колонкова таблиця
- `client-list-row.tsx` (client wrapper, бо click handler) — single row, `bg-red-50` коли inactive
- `client-status-badge.tsx` — color-coded chip з `colorHex` довідника
- `debt-cell.tsx` — formatter `formatUah(value)`, red коли > 0, green коли < 0
- `days-since-cell.tsx` — число, red коли > 30

### Task 12 — UI detail page

`/manager/customers/[id]/page.tsx` (server). Підвантажує client + dictionaries.

Header — `<ClientHeader client={...} canAssign={user.role === "admin"} />`.

Tabs — `<ClientTabs>` (shadcn Tabs from `@ltex/ui`). Кожен tab — окремий компонент:

- `client-requisites-tab.tsx`
- `client-history-tab.tsx`
- `client-routes-tab.tsx`
- `client-assortment-tab.tsx`
- `client-orders-tab.tsx` — `<UnderConstruction session="M1.5" />`

### Task 13 — Comment form

`client-history-comment-form.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button, Textarea, useToast } from "@ltex/ui";

export function ClientHistoryCommentForm({
  clientId,
  onPosted,
}: {
  clientId: string;
  onPosted?: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/v1/manager/clients/${clientId}/timeline`, {
      method: "POST",
      body: JSON.stringify({ body }),
      headers: { "Content-Type": "application/json" },
    });
    setBusy(false);
    if (res.ok) {
      setBody("");
      toast({ description: "Коментар додано" });
      onPosted?.();
    } else {
      toast({ description: "Помилка збереження", variant: "destructive" });
    }
  };
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Додати коментар про клієнта…"
        rows={3}
      />
      <Button
        onClick={submit}
        disabled={busy || !body.trim()}
        className="self-end"
      >
        {busy ? "Записую…" : "Записати"}
      </Button>
    </div>
  );
}
```

Після submit — `onPosted` тригерить `router.refresh()` у parent (Server Component re-fetch).

### Task 14 — Admin assign dialog

`client-assign-dialog.tsx` (client, shadcn Dialog):

- Trigger: button "+ Прив'язати менеджера" (видно тільки admin role)
- Fetches list of users `role IN (manager, senior_manager, admin)` через `fetch('/api/v1/manager/admin/users')` (вже existing з M1.1)
- Select з ними + "Зняти прив'язку"
- PATCH `/api/v1/manager/clients/[id]/assign`

### Task 15 — Action buttons (stubs)

`client-action-buttons.tsx`:

- "Створити замовлення" → toast `"Створення замовлення буде у M1.5"`
- "Відправити повідомлення про борг" → toast `"Виber-повідомлення буде у M1.8"`

### Task 16 — Tests ≥ 15

- `clients/route.test.ts` ≥ 5: happy + filter by status + onlyMine + search + pagination
- `clients/[id]/route.test.ts` ≥ 3: happy + 404 + full relations
- `clients/[id]/timeline/route.test.ts` ≥ 3: GET pagination + POST manual comment + POST validation
- `clients/[id]/assign/route.test.ts` ≥ 3: admin happy + non-admin 403 + unassign
- `dictionaries/route.test.ts` ≥ 1: returns all 6 arrays

### Task 17 — Dashboard tile counts update

У `apps/store/app/api/v1/manager/dashboard/stats/route.ts` додати real counts:

```typescript
const clientCount = await prisma.clientAssignment.count({
  where: { userId: user.id },
});
const totalDebt = await prisma.mgrClient.aggregate({
  where: { assignments: { some: { userId: user.id } } },
  _sum: { debt: true },
});
```

---

## Acceptance criteria

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] Tests ≥ 15 нових passing
- [ ] `/manager/customers` показує таблицю з 10 фейкових клієнтів (після seed)
- [ ] Червоне підсвічування для Неактивний статусу
- [ ] Фільтри (search, status, channel, hasDebt, hasOverpayment, onlyMine) працюють — URL-state driven
- [ ] Pagination працює (10 клієнтів за seed → 1 сторінка з 10 рядками)
- [ ] Click на рядок → `/manager/customers/[id]` детальна картка
- [ ] 5 табів у картці, перші 4 показують реальні дані, 5-й (Замовлення) — UnderConstruction
- [ ] Manual comment додається у timeline, відображається одразу
- [ ] Admin role бачить "Прив'язати менеджера" + може assign-ити
- [ ] Manager (non-admin) не бачить ту кнопку
- [ ] Action buttons "Створити замовлення" / "Повідомлення про борг" — toast "Скоро у M1.X"
- [ ] Сміттєві контрагенти ("1111111 ()", "777777 ()") приховані з default view (`hideTrash=true`)
- [ ] Dashboard tile "Замовлення" показує fake count з seed, dashboard stats row показує real `clientCount` для admin (бо seed assign-ить деяких клієнтів до admin)
- [ ] **DO NOT push** на main. Тільки на `claude/manager-m1-3a-clients-{XXXX}`.

---

## User-action post-merge

```powershell
cd E:\ltex-ecosystem
git fetch origin
git checkout main
git merge --ff-only origin/claude/m1-orch-merge
.\scripts\deploy.ps1

# Один раз — seed фейкових даних
pnpm --filter @ltex/store exec tsx scripts/seed-mgr-test-data.ts
```

Після цього `/manager/customers` має показати 10 клієнтів з різними статусами.

⚠️ **Не запускати seed на production як тільки буде реальний SOAP-sync** — це reset-нути ОР clients. Тоді seed run-ить тільки якщо table порожня. Add safeguard у скрипті: `if (await prisma.mgrClient.count() > 0) { console.log("Skip — already has data"); return; }`.

---

## Reference

- `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты.xml` — реквізити каталогу (всі 30+ полів з типами + обмеженнями довжини). **MUST-READ** перед першим commit.
- `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты/Forms/ФормаЭлемента/Ext/Form.xml` — структура UI картки у 1С (для розуміння як 1С менеджер бачить клієнта).
- `docs/1c-export-mobile/Central/Catalogs/Контрагенты.xml` — еталон полів у ЦБ (наш Postgres-schema відображає це).
- `docs/1c-export-mobile/Central/CommonModules/ОбменАРМ/Ext/Module.bsl` — SQL-запит `СкладиТоргового` що формує payload для мобільного. **MUST-READ** для розуміння mapping fields → JSON.
- `docs/MANAGER_APP_STRATEGY.md` §4-5 — auth + data flow contracts.
- M1.1 `lib/auth/manager-auth.ts` для `getCurrentUser` / `requireRole`.
- `apps/store/components/admin/AdminPagination.tsx` (якщо існує) — pattern для pagination component.

---

## Notes for worker

1. **Перед першим commit прочитай 2 файли з конфігурацією 1С** (вказані у Hard Rules #6) — це дасть точне mapping для Prisma schema.
2. **Якщо знайдеш поле що не у моєму schema — додай.** Я not exhaustive — конфіг 1С є правдою.
3. **Якщо знайдеш конфлікт із M1.1 ClientAssignment.customerId** (referencing wrong table) — виправ у тому ж migration. Не залишай як TODO.
4. Файли треба тримати у `apps/store/app/manager/(workstation)/customers/_components/`, не у `app/_components/` (це private).
5. Усі дати — `formatRelative` з `date-fns/locale/uk` (як у admin notifications).
6. Числа — `Intl.NumberFormat("uk-UA")` для UAH formatting.
