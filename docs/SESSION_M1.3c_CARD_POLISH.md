# Session M1.3c — Client card FULL parity з 1С + contacts links + reminders

**Type:** Worker session (~50 файлів)
**Branch:** `claude/manager-m1-3c-card-full-{XXXX}`
**Goal:** Доробити картку клієнта до **повної відповідності** 1С-формі `Catalog.Контрагенты.ФормаЭлемента` (видно на user-скрінах). M1.3a пропустив 7 полів MgrClient, 5 tabs і 3 окремі таблиці — закриваємо це. Робимо clickable contacts (tel:/viber/wa/maps), додаємо новий tab "Нагадування" (наша private model), bell у sidebar з real overdue count, всі інші tabs з 1С форми — placeholders або real read-only display.

**User скріни (2026-05-13):**

- Tab "Дані" має 25 полів + блок "Номери телефонів" + таблична частина "Маршрути" + кнопка "Повідомити про борг"
- Tabs повний набір: Дані / Асортимент / **Асортимент презентацій** / Історія / **Історія продаж** / Замовлення / Нагадування / **Viber** / **Банківські рахунки** / **Історія презентацій** / **Соц мережі** (жирним — те що пропустили у M1.3a)
- Header tabs: Головне / КатегорииОбъектов / Работа с клиентом / РегистрацияОбмена (це інший level — секції форми, не tabs)

**User decision (locked 2026-05-13):** "Додати всі поля з 1С + усі вкладки навіть як заглушки. У майбутньому — Viber/Telegram/Instagram чат-боти, переписку писати у timeline. Кнопки переходу у месенджери. Перечитай всю конфігурацію."

**Конфігурація 1С — MUST-READ перед першим commit:**

- `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты.xml` — повний список полів + tabular sections (40+ полів, 6 tabular: Телефоны / Маршруты / Асортимент / БанковскиеСчета / АсортиментПрезентацій / СоцМережі)
- `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты/Forms/ФормаЭлемента/Ext/Form.xml` — UI form з усіма tabs + control names (СторінкаІсторія, ГруппаВайбер, НагадуванняГруппа, ОтчетПоПродажамДерево, ОтчетПоПрезентациямДерево, БанковскиеСчета, СоцМережі)
- `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты/Forms/ФормаЭлемента/Ext/Form/Module.bsl` — server logic (SQL для timeline, для зведений Звіт по Продажах per клієнт)
- `docs/1c-export-mobile/MobileAgent/Catalogs/БанковскиеСчета.xml` — окремий каталог банк рахунків (Опис + НеВідображатиВДодатку), посилається через FK
- `docs/1c-export-mobile/MobileAgent/Catalogs/Нагадування.xml` — структура нагадувань (Активне / ДатаНапоминания / Нагадування body / Контрагент FK)
- `docs/1c-export-mobile/Central/CommonModules/ОбменАРМ/Ext/Module.bsl` — точний SQL що ЦБ передає мобільному (твоя best-reference для mapping)

---

## ⚠️ HARD RULES

1. **MUST READ** 6 файлів конфіги (вказані вище) перед першим commit. Без цього ризик пропустити поля знову.
2. **DO NOT touch** existing M1.3a `MgrClient*` fields — тільки **додавай** нові + **створюй** нові таблиці. Migration — additive only.
3. **DO NOT touch** auth / middleware / `/admin/*` web admin.
4. **DO NOT** робити CRUD для phones / messengers / bank accounts / assortment / presentations — вони read-only (заповнюються через 1С sync у M1.5+). **Тільки Reminders має CRUD** бо це наша private data.
5. **DO NOT** імплементувати реальні чат-боти Viber/Telegram/Instagram — це M1.8. Tab "Viber" робимо stub з кнопкою-deeplink-ом + опис "Чат-інтеграцію зробимо у M1.8".
6. **DO NOT** робити inline-редагування реквізитів — sync з 1С скине зміни (M1.5+ з SOAP write-back).
7. **DO NOT** видаляти existing `client-action-buttons.tsx` — extend його з реальними actions де можна.

---

## Big picture

### Schema gap analysis (що пропустили у M1.3a)

**MgrClient — 7 нових полів:**
| 1С name | Postgres name | Type | Notes |
|---|---|---|---|
| `НаименованиеТТ` | `tradePointName` | text | "Торгова точка" — окрема назва ТТ |
| `БоргТзОВ` | `tovDebt` | decimal(12,2) | Борг по ТОВ (юр.особа) |
| `ПросроченийБоргТзОВ` | `tovOverdueDebt` | decimal(12,2) | Просрочений по ТОВ |
| `ТорговыйАгент` | `agentUserId` | FK User | Окремий від ClientAssignment — це 1С-поняття "торговий агент" |
| `КонтактВайбер` | `viberContact` | text | Окремий handle (не з phones list) |
| `ОстатокСесия` | `sessionRemainder` | decimal(12,2) | Залишок на сесії |
| `ТипЦен` | `priceTypeId` | FK MgrPriceType | Новий dict (Оптові / Дрібний опт / Роздрібні) |

**Tables що пропустили:**
| 1С table | Postgres model | Status |
|---|---|---|
| `Catalog.ТипыЦенНоменклатуры` (FK target) | `MgrPriceType` (new dict) | NEW |
| `АсортиментПрезентацій` (tabular) | `MgrClientPresentationItem` | NEW |
| `БанковскиеСчета` (tabular + FK на `Catalog.БанковскиеСчета`) | `MgrClientBankAccount` | NEW |

**Extension to existing:**
| Table | New field | Type | Source 1С |
|---|---|---|---|
| `MgrClientAssortmentItem` | `notDirectInput` | bool | `НеРучнаяЗапись` |
| `MgrClientMessenger` | `browserUrl` | text | `ПосиланняВБраузері` |
| `MgrClientMessenger` | `comment` (вже є?) | text | `Коментар` |

**New private model (наша):**

- `MgrReminder` — нагадування про клієнта (id, clientId, ownerUserId, body, remindAt, completedAt, snoozedUntilAt)

### Tabs гap analysis

Tabs у 1С формі (з порядку рендеру на скріні):
| 1С Tab | M1.3a state | M1.3c target |
|---|---|---|
| Дані | ✓ Реквізити (часткова) | **Доповнити** усіма пропущеними полями |
| Асортимент | ✓ є | **Доповнити** notDirectInput chip |
| Асортимент презентацій | ✗ нема | **NEW real** read-only list |
| Історія | ✓ є | без змін |
| Історія продаж | ✗ нема | **NEW stub** `<UnderConstruction session="M1.4">` (це aggregated звіт) |
| Замовлення | ✓ stub M1.5 | без змін |
| Нагадування | ✗ нема | **NEW REAL** MgrReminder CRUD |
| Viber | ✗ нема | **NEW stub** з кнопкою "Перейти у Viber" + опис M1.8 |
| Банківські рахунки | ✗ нема | **NEW real** read-only list |
| Історія презентацій | ✗ нема | **NEW stub** `<UnderConstruction session="M1.6">` |
| Соц мережі | ✗ є у Реквізити секції | **NEW окремий tab** з clickable links per network |

### Contact actions

**Phones** — кожен номер як `<ContactRow>` з:

- Formatted `+380 50 123 45 67`
- 📞 dial (tel:)
- 💬 Viber (viber://chat?number=...)
- ✉ WhatsApp (https://wa.me/...)
- Telegram chip (нема phone-based deeplink — disabled з tooltip)
- Кнопка "Додати" — поки disabled з tooltip "Додавання через 1С (sync у M1.5)"

**Адреса** — clickable → Google Maps deeplink `https://www.google.com/maps/search/?api=1&query={url-encoded full address}`

**Відділення НП** — clickable → `https://www.google.com/maps/search/?api=1&query=Нова Пошта №{N} {city}`

**Геолокація** — якщо `"lat,lng"` формат → Maps з pin

**Сайт** — `target="_blank" rel="noopener"` + icon 🔗

**Контакт Viber** (новий поле) — viber:// deeplink

**Соц мережі** — кожен `<MessengerLink>` per network:

- `tiktok` → `https://tiktok.com/@{handle}`
- `instagram` → `https://instagram.com/{handle}`
- `facebook` → handle або URL якщо містить URL
- `telegram` → `https://t.me/{handle}`
- `viber` → `viber://chat?number={normalizedPhone(handle)}`
- `youtube` → URL направо
- Fallback: якщо є `browserUrl` (новий) — використати його напряму

### Bell sidebar

Поки empty. Тепер показує count overdue reminders для current user. Click → `<Popover>` (shadcn) з list (max 10). Click on item → `router.push("/manager/customers/{clientId}#reminders")` — deeplink на Tab Нагадування.

---

## Файли — повний перелік

### Migration + schema (~3 файли)

```
packages/db/prisma/schema.prisma                                      ← edit
packages/db/prisma/migrations/2026MMDD_mgr_clients_full/migration.sql ← NEW
scripts/seed-mgr-test-data.ts                                          ← edit (extend для нових полів і tables)
```

### Shared utils (~3 файли)

```
packages/shared/src/utils/phone.ts                                   ← NEW: formatters + deeplinks
packages/shared/src/utils/phone.test.ts                              ← NEW: ≥8 tests
packages/shared/src/utils/social-links.ts                            ← NEW: messenger URL builders
```

### API (~6 файлів)

```
apps/store/app/api/v1/manager/clients/[id]/reminders/route.ts          ← NEW GET+POST
apps/store/app/api/v1/manager/clients/[id]/reminders/route.test.ts     ← NEW ≥4 tests
apps/store/app/api/v1/manager/clients/[id]/reminders/[rid]/route.ts    ← NEW PATCH+DELETE
apps/store/app/api/v1/manager/clients/[id]/reminders/[rid]/route.test.ts ← NEW ≥4 tests
apps/store/app/api/v1/manager/notifications/route.ts                    ← NEW GET (bell)
apps/store/app/api/v1/manager/notifications/route.test.ts              ← NEW ≥2 tests
```

### UI new tabs (~10 файлів)

```
apps/store/app/manager/(workstation)/customers/[id]/_components/
  client-presentations-tab.tsx                                       ← NEW real list з MgrClientPresentationItem
  client-sales-history-tab.tsx                                       ← NEW stub UnderConstruction M1.4
  client-reminders-tab.tsx                                           ← NEW real з grouping
  client-reminders-form.tsx                                          ← NEW client modal create
  client-reminder-item.tsx                                           ← NEW client wrapper з actions
  client-reminders-grouping.ts                                       ← NEW pure helper
  client-viber-tab.tsx                                               ← NEW stub з buttons "Перейти у Viber"
  client-bank-accounts-tab.tsx                                       ← NEW real list з MgrClientBankAccount
  client-presentation-history-tab.tsx                                ← NEW stub UnderConstruction M1.6
  client-social-tab.tsx                                              ← NEW real з clickable per network
```

### UI updates existing (~8 файлів)

```
apps/store/app/manager/(workstation)/customers/[id]/_components/
  client-requisites-tab.tsx                                          ← OVERWRITE: всі 25 полів + contact actions
  client-contact-row.tsx                                             ← NEW: phone з 4 icon actions
  client-messenger-link.tsx                                          ← NEW: clickable network chip
  client-address-link.tsx                                            ← NEW: address → Maps
  client-tabs.tsx                                                    ← OVERWRITE: 11 tabs у правильному порядку
  client-action-buttons.tsx                                          ← extend: реальні toast-stub для "Повідомити про борг"
  client-header.tsx                                                  ← extend: agentUserId display + priceType
  types.ts                                                           ← extend ClientDetail з усіма новими полями + reminders[] + bankAccounts[] + presentations[]
```

### UI page wiring + bell (~3 файли)

```
apps/store/app/manager/(workstation)/customers/[id]/page.tsx          ← edit: load reminders + bank accounts + presentations parallel
apps/store/app/manager/(workstation)/customers/[id]/_lib/load-client.ts ← edit: include нові relations
apps/store/app/manager/(workstation)/_components/manager-header-bell.tsx ← NEW або OVERWRITE (depends якщо вже existed з M1.2)
```

### Tests other (~3 файли)

```
packages/shared/src/utils/social-links.test.ts                       ← ≥6 tests
apps/store/app/manager/(workstation)/customers/[id]/_components/client-reminders-grouping.test.ts ← ≥4 tests
apps/store/app/api/v1/manager/clients/[id]/route.test.ts             ← edit (додати tests для нових полів)
```

**Total ~36 нових + ~10 edit = ~46 files.**

---

## Detailed tasks

### Task 1 — Prisma schema (additive only)

```prisma
// ────── NEW dictionary ──────
model MgrPriceType {
  id        String @id @default(cuid())
  code      String @unique          // "wholesale" | "small_wholesale" | "retail"
  label     String
  sortOrder Int    @default(0)
  clients   MgrClient[]
  @@map("mgr_price_types")
}

// ────── MgrClient extension ──────
model MgrClient {
  // ... existing fields kept ...

  // NEW fields (all nullable for backward compat)
  tradePointName    String?
  tovDebt           Decimal? @db.Decimal(12,2)
  tovOverdueDebt    Decimal? @db.Decimal(12,2)
  agentUserId       String?
  viberContact      String?
  sessionRemainder  Decimal? @db.Decimal(12,2)
  priceTypeId       String?

  // NEW relations
  agent             User?         @relation("ClientAgent", fields: [agentUserId], references: [id], onDelete: SetNull)
  priceType         MgrPriceType? @relation(fields: [priceTypeId], references: [id], onDelete: SetNull)
  presentations     MgrClientPresentationItem[]
  bankAccounts      MgrClientBankAccount[]
  reminders         MgrReminder[]

  // existing M1.3a relations kept
}

// ────── NEW tabular: presentations ──────
model MgrClientPresentationItem {
  id              String   @id @default(cuid())
  clientId        String
  productCode     String
  productName     String?
  lastPresentedAt DateTime?
  notDirectInput  Boolean  @default(false)
  client          MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@index([clientId])
  @@map("mgr_client_presentations")
}

// ────── NEW tabular: bank accounts ──────
model MgrClientBankAccount {
  id            String  @id @default(cuid())
  clientId      String
  accountNumber String                       // IBAN UA...
  bankName      String?
  mfo           String?
  comment       String?
  isHidden      Boolean @default(false)      // НеВідображатиВДодатку у 1С
  client        MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@index([clientId])
  @@map("mgr_client_bank_accounts")
}

// ────── existing extensions ──────
model MgrClientAssortmentItem {
  // existing
  notDirectInput Boolean @default(false)
}

model MgrClientMessenger {
  // existing
  browserUrl String?
  // (comment вже є — keep)
}

// ────── User edit для agent relation ──────
model User {
  // existing
  agentForClients MgrClient[] @relation("ClientAgent")
}

// ────── NEW reminder ──────
model MgrReminder {
  id              String   @id @default(cuid())
  clientId        String
  ownerUserId     String
  body            String   @db.Text
  remindAt        DateTime
  completedAt     DateTime?
  snoozedUntilAt  DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  client          MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  owner           User      @relation("UserReminders", fields: [ownerUserId], references: [id], onDelete: Cascade)
  @@index([clientId, remindAt])
  @@index([ownerUserId, completedAt, remindAt])
  @@map("mgr_reminders")
}
model User {
  reminders MgrReminder[] @relation("UserReminders")
}
```

### Task 2 — Migration SQL

```sql
-- ──────── NEW dictionary mgr_price_types ────────
CREATE TABLE IF NOT EXISTS "mgr_price_types" (
  "id"         TEXT    NOT NULL,
  "code"       TEXT    NOT NULL,
  "label"      TEXT    NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_price_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_price_types_code_key" ON "mgr_price_types"("code");

-- ──────── MgrClient new columns ────────
ALTER TABLE "mgr_clients"
  ADD COLUMN IF NOT EXISTS "trade_point_name"   TEXT,
  ADD COLUMN IF NOT EXISTS "tov_debt"           DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "tov_overdue_debt"   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "agent_user_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "viber_contact"      TEXT,
  ADD COLUMN IF NOT EXISTS "session_remainder"  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "price_type_id"      TEXT;

DO $$ BEGIN
  ALTER TABLE "mgr_clients"
    ADD CONSTRAINT "mgr_clients_agent_fkey"
    FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "mgr_clients"
    ADD CONSTRAINT "mgr_clients_price_type_fkey"
    FOREIGN KEY ("price_type_id") REFERENCES "mgr_price_types"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────── extend MgrClientAssortmentItem ────────
ALTER TABLE "mgr_client_assortment"
  ADD COLUMN IF NOT EXISTS "not_direct_input" BOOLEAN NOT NULL DEFAULT false;

-- ──────── extend MgrClientMessenger ────────
ALTER TABLE "mgr_client_messengers"
  ADD COLUMN IF NOT EXISTS "browser_url" TEXT;

-- ──────── NEW presentations ────────
CREATE TABLE IF NOT EXISTS "mgr_client_presentations" (
  "id"                TEXT         NOT NULL,
  "client_id"         TEXT         NOT NULL,
  "product_code"      TEXT         NOT NULL,
  "product_name"      TEXT,
  "last_presented_at" TIMESTAMP(3),
  "not_direct_input"  BOOLEAN      NOT NULL DEFAULT false,
  CONSTRAINT "mgr_client_presentations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_client_presentations_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "mgr_client_presentations_client_idx"
  ON "mgr_client_presentations"("client_id");

-- ──────── NEW bank accounts ────────
CREATE TABLE IF NOT EXISTS "mgr_client_bank_accounts" (
  "id"             TEXT    NOT NULL,
  "client_id"      TEXT    NOT NULL,
  "account_number" TEXT    NOT NULL,
  "bank_name"      TEXT,
  "mfo"            TEXT,
  "comment"        TEXT,
  "is_hidden"      BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "mgr_client_bank_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_client_bank_accounts_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "mgr_client_bank_accounts_client_idx"
  ON "mgr_client_bank_accounts"("client_id");

-- ──────── NEW reminders ────────
CREATE TABLE IF NOT EXISTS "mgr_reminders" (
  "id"               TEXT         NOT NULL,
  "client_id"        TEXT         NOT NULL,
  "owner_user_id"    TEXT         NOT NULL,
  "body"             TEXT         NOT NULL,
  "remind_at"        TIMESTAMP(3) NOT NULL,
  "completed_at"     TIMESTAMP(3),
  "snoozed_until_at" TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mgr_reminders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_reminders_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE,
  CONSTRAINT "mgr_reminders_owner_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "mgr_reminders_client_remind_idx"
  ON "mgr_reminders"("client_id", "remind_at");
CREATE INDEX IF NOT EXISTS "mgr_reminders_owner_status_idx"
  ON "mgr_reminders"("owner_user_id", "completed_at", "remind_at");
```

### Task 3 — Phone utils

`packages/shared/src/utils/phone.ts` — як у попередньому spec версії:

- `normalizePhone(raw)` — to E.164 `+380...`
- `formatPhoneUkr(raw)` — display `+380 50 123 45 67`
- `phoneToTelUrl(raw)`, `phoneToViberUrl(raw)`, `phoneToWhatsAppUrl(raw)`

`packages/shared/src/utils/social-links.ts`:

```typescript
export type SocialNetwork =
  | "tiktok"
  | "instagram"
  | "facebook"
  | "telegram"
  | "viber"
  | "youtube"
  | "whatsapp"
  | "other";

export function buildSocialUrl(
  network: string,
  handle: string | null,
  browserUrl?: string | null,
): string | null {
  if (browserUrl) return browserUrl; // explicit override з 1С
  if (!handle) return null;
  const clean = handle.replace(/^@/, "").trim();
  switch (network.toLowerCase()) {
    case "tiktok":
      return `https://www.tiktok.com/@${clean}`;
    case "instagram":
      return `https://www.instagram.com/${clean}`;
    case "facebook":
      if (clean.startsWith("http")) return clean;
      return `https://www.facebook.com/${clean}`;
    case "telegram":
      return `https://t.me/${clean}`;
    case "viber": {
      const phone = clean.replace(/[\s+()-]/g, "");
      return `viber://chat?number=%2B${phone}`;
    }
    case "youtube":
      if (clean.startsWith("http")) return clean;
      return `https://www.youtube.com/@${clean}`;
    case "whatsapp": {
      const phone = clean.replace(/[\s+()-]/g, "");
      return `https://wa.me/${phone}`;
    }
    default:
      return null;
  }
}

export function socialNetworkIcon(network: string): string {
  // emoji fallback — replace з proper icons коли є time
  switch (network.toLowerCase()) {
    case "tiktok":
      return "🎵";
    case "instagram":
      return "📷";
    case "facebook":
      return "📘";
    case "telegram":
      return "✈️";
    case "viber":
      return "💬";
    case "youtube":
      return "🎥";
    case "whatsapp":
      return "✉️";
    default:
      return "🔗";
  }
}
```

### Task 4 — UI Реквізити tab full parity

Render у такому порядку (matching 1С форму з скріну):

```tsx
export function ClientRequisitesTab({ client, currentUserRole, currentUserId }: Props) {
  return (
    <div className="space-y-6">
      {/* Phones block (top, як у 1С) */}
      <PhonesBlock phones={[client.phonePrimary, ...client.phones]} viberContact={client.viberContact} />

      {/* Core grid 2-column (як у скріні) */}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-lg border bg-white p-5 shadow-sm sm:grid-cols-2">
        <Row label="Код" value={client.code1C ?? "—"} />
        <Row label="Створений" value={formatDate(client.createdAt)} />
        <Row label="Найменування" value={client.name} />
        <Row label="Торгова точка" value={client.tradePointName ?? "—"} />

        <Row label="Борг" value={<DebtWithButton debt={client.debt} clientId={client.id} />} />
        <Row label="Протерміновано" value={<DebtValue value={client.overdueDebt} muted />} />

        <Row label="Борг ТОВ" value={<DebtValue value={client.tovDebt} />} />
        <Row label="Просрочено ТОВ" value={<DebtValue value={client.tovOverdueDebt} muted />} />

        <Row label="Статус" value={<StatusBadge s={client.statusGeneral} />} />
        <Row label="Оперативний статус" value={<StatusBadge s={client.statusOperational} />} />

        <Row label="Тип цін" value={client.priceType?.label ?? "—"} />
        <Row label="Асортимент" value={client.primaryAssortment?.label ?? "—"} />
        <Row label="Спосіб доставки" value={client.deliveryMethod?.label ?? "—"} />
        <Row label="Категорія ТТ" value={client.categoryTT?.label ?? "—"} />

        <Row label="Область" value={client.region ?? "—"} />
        <Row label="Місто" value={client.city ?? "—"} />
        <Row label="Вулиця" value={client.street ?? "—"} />
        <Row label="Будинок" value={client.house ?? "—"} />

        <Row label="Відділення НП" value={client.novaPoshtaBranch ?? "—"} />
        <Row label="Сайт" value={<WebsiteLink url={client.websiteUrl} />} />
        <Row label="Геолокація" value={<GeoLink geo={client.geolocation} />} />
        <Row label="Обєм за місяць" value={client.monthlyVolume ? `${client.monthlyVolume} кг` : "—"} />

        <Row label="Канал пошуку" value={client.searchChannel?.label ?? "—"} />
        <Row label="Контакт Viber" value={<ViberContactLink contact={client.viberContact} />} />
        <Row label="Торговий агент" value={client.agent?.fullName ?? "—"} />
        <Row label="Залишок сесії" value={formatMoney(client.sessionRemainder)} />

        <Row label="Дата створення" value={formatDate(client.createdAt)} />
        <Row label="Оновлено з 1С" value={client.lastSyncedAt ? formatDateTime(client.lastSyncedAt) : "—"} />
      </dl>

      {/* Routes block (table-like, як у 1С) */}
      <RoutesBlock routes={client.routes} />

      {/* Address full на карті */}
      <AddressBlock client={client} />

      {/* Flag indicators */}
      <FlagsBlock hasNewMessage={client.hasNewMessage} isViberLinked={client.isViberLinked} dialogStatus={client.dialogStatus} />

      {/* Action buttons */}
      <ClientActionButtons clientId={client.id} canCreate={...} />
    </div>
  );
}
```

`<PhonesBlock>` — render `<ContactRow>` per phone, кожен з actions.

`<DebtWithButton>` — display value + кнопка "Повідомити про борг" поряд (toast stub "Чат-інтеграцію зробимо у M1.8").

### Task 5 — UI Tabs повний набір

`client-tabs.tsx` — переписати з 11 tabs у правильному порядку:

```tsx
const tabs = [
  { value: "requisites", label: "Реквізити" },
  { value: "assortment", label: "Асортимент" },
  { value: "presentations", label: "Презентації" },
  { value: "history", label: "Історія" },
  { value: "sales-history", label: "Історія продаж" },
  { value: "orders", label: "Замовлення" },
  {
    value: "reminders",
    label: <>Нагадування{overdueCount > 0 && <Badge>{overdueCount}</Badge>}</>,
  },
  { value: "viber", label: "Viber" },
  { value: "banks", label: "Банк. рахунки" },
  { value: "presentation-history", label: "Іст. презентацій" },
  { value: "social", label: "Соц мережі" },
];
```

Default tab = `requisites`. URL anchor `#tabname` — initial selection.

### Task 6 — New tabs implementations

**Tab Презентації** (`client-presentations-tab.tsx`) — server component:

- Load `client.presentations` через prisma include
- Render table: артикул / назва / остання презентація / "Не ручний запис" chip
- Empty state: "Презентацій ще не було"
- Read-only

**Tab Історія продаж** (`client-sales-history-tab.tsx`) — stub:

```tsx
<UnderConstruction
  session="M1.4"
  description="Звіт по продажах за період — буде разом з підключенням Documents.Реалізація з 1С."
/>
```

**Tab Замовлення** (`client-orders-tab.tsx`) — keep existing M1.3a stub.

**Tab Нагадування** (`client-reminders-tab.tsx`) — server, fetch + group:

- 4 sections: Прострочено / Сьогодні / Заплановано / Виконано
- Header: title + "+ Створити" button (відкриває modal)
- Each item — `<ReminderItem>` з actions

**Tab Viber** (`client-viber-tab.tsx`) — stub з real buttons:

```tsx
<div className="rounded-lg border bg-white p-6">
  <h3 className="text-lg font-semibold">Viber-чат</h3>
  <p className="mt-2 text-sm text-gray-600">
    Інтеграцію Viber-bot (читання + відповіді через картку) зробимо у M1.8.
    Зараз доступні зовнішні переходи:
  </p>
  <div className="mt-4 flex flex-wrap gap-2">
    {client.viberContact && (
      <a href={phoneToViberUrl(client.viberContact)} className="...">
        Відкрити Viber з {formatPhoneUkr(client.viberContact)}
      </a>
    )}
    {client.phonePrimary && (
      <a href={phoneToViberUrl(client.phonePrimary)} className="...">
        Viber на основний {formatPhoneUkr(client.phonePrimary)}
      </a>
    )}
  </div>
  {!client.viberContact && !client.phonePrimary && (
    <p className="mt-4 text-sm text-gray-500">Контактів для Viber нема.</p>
  )}
</div>
```

**Tab Банк. рахунки** (`client-bank-accounts-tab.tsx`) — server, list:

- Render `client.bankAccounts.filter(b => !b.isHidden)` — кожен рядок: account_number monospace + bank + mfo + comment
- Кнопка "Копіювати IBAN" на кожному рядку (client-side)
- Empty state: "Рахунків не вказано"

**Tab Іст. презентацій** — stub UnderConstruction M1.6.

**Tab Соц мережі** (`client-social-tab.tsx`) — server, grid:

- `client.messengers.map(m => <MessengerLink ... />)`
- `<MessengerLink>` — icon + network label + handle + opens URL з `buildSocialUrl(m.network, m.handle, m.browserUrl)`
- Окремий блок: "Сайт клієнта" якщо `client.websiteUrl`
- Empty state: "Соцмереж не вказано"

### Task 7 — Reminders CRUD (як у попередній версії spec)

GET+POST `/api/v1/manager/clients/[id]/reminders`:

- Auth required
- POST Zod: `{ body: 1-500, remindAt: ISO }`
- Save with `ownerUserId = currentUser.id`

PATCH+DELETE `/api/v1/manager/clients/[id]/reminders/[rid]`:

- Permission: owner OR admin (403 otherwise)
- PATCH actions: `complete` / `uncomplete` / `snooze` (з `snoozedUntil`)
- DELETE: hard delete

### Task 8 — Bell endpoint

GET `/api/v1/manager/notifications`:

- Returns `{ overdueCount: int, items: [...] }` для current user
- `items`: max 10, ordered by `remindAt ASC`
- Query: `WHERE ownerUserId = me AND completedAt IS NULL AND (snoozedUntilAt IS NULL OR snoozedUntilAt <= NOW()) AND remindAt <= NOW()`

### Task 9 — Bell UI

`manager-header-bell.tsx`:

- Client component (use shadcn `Popover`)
- Polling: useEffect з 60s interval (clear on unmount)
- Badge cap "9+"
- Click → fetch list → render
- Item click → `router.push("/manager/customers/{clientId}#reminders")`

### Task 10 — Seed update

`scripts/seed-mgr-test-data.ts` — extend:

- Додати MgrPriceType (3-4 типи: wholesale / small_wholesale / retail)
- На 3 з 10 клієнтів — set `priceTypeId`, `tradePointName`, `tovDebt`, `agentUserId = admin`, `viberContact`, `sessionRemainder`
- Додати на 2 клієнти приклади банк рахунків (IBAN UA + bank + comment)
- Додати на 2 клієнти приклади презентацій
- Додати на 1 клієнта browserUrl у messenger
- Додати на 2 клієнтів — 1-2 reminders (one overdue, one upcoming)
- Idempotency safeguard уже є — keep.

### Task 11 — Tests ≥ 18

- `phone.test.ts` ≥ 8
- `social-links.test.ts` ≥ 6
- `client-reminders-grouping.test.ts` ≥ 4
- `reminders route.test.ts` (GET+POST) ≥ 4
- `reminders [rid] route.test.ts` ≥ 4
- `notifications route.test.ts` ≥ 2
- Extend `clients/[id]/route.test.ts` для нових полів ≥ 1 додатковий test

---

## Acceptance criteria

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] Tests ≥ 18 нових passing (загалом ≥ 696 store + 57 shared)
- [ ] Реквізити tab показує **всі** 25 полів з 1С форми
- [ ] Phones як block з 4 icon-actions кожен
- [ ] Адреса/Геолокація/Сайт — clickable
- [ ] Tabs — 11 у точному порядку як 1С
- [ ] Tab Презентації — real list (поки empty/мінімум для seed клієнтів)
- [ ] Tab Банк. рахунки — real list + Копіювати IBAN
- [ ] Tab Соц мережі — clickable з icon per network, opens у новому tab/Viber deeplink
- [ ] Tab Viber — stub з real buttons на viber:// deeplinks
- [ ] Tab Нагадування — real CRUD: створити, complete, snooze, delete
- [ ] Sidebar bell — real count + dropdown з click → перехід
- [ ] Кнопка "Повідомити про борг" — toast stub (M1.8)
- [ ] **DO NOT push** на main. Тільки на feature branch.

---

## User-action post-merge

```powershell
cd E:\ltex-ecosystem
git fetch origin
git merge --ff-only origin/<worker-branch>
git push origin main
.\scripts\deploy.ps1
pnpm --filter @ltex/db exec prisma migrate deploy
# Re-seed з новими полями — safeguard у скрипті НЕ дасть пере-записати existing,
# тож якщо хочеш повне нове seed — спершу truncate:
# psql -d ltex_ecosystem -c "TRUNCATE mgr_clients, mgr_client_timeline, mgr_client_phones, mgr_client_messengers, mgr_client_warehouses, mgr_client_route_assignments, mgr_client_assortment, mgr_client_presentations, mgr_client_bank_accounts, mgr_reminders, client_assignments CASCADE;"
pnpm --filter @ltex/store exec tsx ../../scripts/seed-mgr-test-data.ts
```

⚠️ Truncate стирає **усі** mgr_clients — використовуй тільки коли впевнений (зараз — 10 seed клієнтів, без real data). Альтернатива: окремий скрипт `seed-mgr-extras.ts` що тільки додає bank accounts / presentations / reminders до existing клієнтів.

---

## Notes for worker

1. **Phasing** (worker — роби у такому порядку щоб build була green на кожному кроці):
   - Phase 1: Migration + Prisma schema → typecheck має проходити
   - Phase 2: phone.ts + social-links.ts + tests → unit tests pass
   - Phase 3: Реквізити tab full (+ contact components) → manual smoke
   - Phase 4: Усі tabs з placeholders (Презентації / Sales History / Viber / Banks / Presentation History / Social) → 11 tabs у UI
   - Phase 5: Reminders model + CRUD API + UI tab + form + actions → real tab works
   - Phase 6: Bell endpoint + UI → bell shows real count
   - Phase 7: Seed update → integration з UI
   - Phase 8: Tests + build → final green

2. **MUST-READ 6 файлів конфіги перед першим commit.** Якщо знайдеш ще пропущене поле — додай.

3. **DO NOT touch**:
   - `apps/store/app/api/v1/manager/clients/route.ts` (M1.3a list)
   - `lib/auth/*` (auth не змінюємо)
   - `next.config.js` / `middleware.ts` (config stable)
   - existing M1.3a tabs які працюють (Історія, Маршрути, Асортимент) — тільки extend де треба, не rewrite

4. **`<UnderConstruction>` компонент** уже є з M1.2 — reuse його, не створюй новий.

5. **Bell у sidebar** — перевір `apps/store/app/manager/(workstation)/_components/manager-header.tsx` (або як він зветься) — там empty bell з M1.2. Replace placeholder bell-icon на новий компонент.

6. **`scripts/seed-mgr-test-data.ts`** — НЕ переписуй з нуля, тільки додавай нові секції. Safeguard `if (await prisma.mgrClient.count() > 0) return;` уже є — це блокує re-run на existing data, тож worker не може test-run seed без truncate. Тестуй seed на dev DB або mock.

7. **Permission check для PATCH/DELETE reminders:** `if (reminder.ownerUserId !== currentUser.id && currentUser.role !== "admin") return 403`.

8. **Performance:** parallel load у `page.tsx` через `Promise.all` — client + reminders + bankAccounts + presentations. Не серіально.

9. **Якщо знайдеш конфлікт між M1.3a і цим M1.3c** (наприклад типи `ClientDetail` — Tasks 5/9 у M1.3a vs Task 4 тут) — переписуй типи на новій базі, не намагайся keep backwards compat.
