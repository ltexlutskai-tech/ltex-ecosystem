# Session M1.3c — Client card polish: quick actions, links, reminders

**Type:** Worker session (~30 файлів)
**Branch:** `claude/manager-m1-3c-card-polish-{XXXX}`
**Goal:** Доробити картку клієнта що вже є з M1.3a. Зробити contacts dial-able (`tel:`, Viber, WhatsApp, Telegram), адресу → Google Maps deeplink, соцмережі — clickable, додати окремий **Tab Нагадування** (своя Postgres model — це private данні менеджера, не з 1С) + заповнити пустий **🔔 bell у sidebar** реальним лічильником overdue reminders.

**Parent spec:** [`docs/MANAGER_APP_STRATEGY.md`](MANAGER_APP_STRATEGY.md) §6. **Builds on:** M1.3a (clients schema + read-only картка).

**Конфігурація 1С:** `docs/1c-export-mobile/MobileAgent/Catalogs/Нагадування.xml` + `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты/Ext/ObjectModule.bsl` (там форма `ФормаЭлемента` має tab Нагадування з SQL запитом — використати як reference).

**User decision (locked 2026-05-13):** "No preference" — orchestrator обирає сам. Скоп: НЕ робити inline-редагування реквізитів (без SOAP write-back ризиковано — sync скине зміни). НЕ робити Tab Замовлення (це M1.4, окрема велика робота). НЕ робити Tab Презентації (sync з 1С потрібен — M1.6+).

**Out of scope:**
- Inline-редагування реквізитів → M1.5 (одночасно з SOAP write-back)
- Tab Замовлення → M1.4
- Tab Презентації → M1.6+
- "Запис дзвінка" → V2 (callback logging — окрема integration)
- Push нотифікації reminders → M1.10 (Telegram bot)

---

## ⚠️ HARD RULES

1. **DO NOT touch** M1.3a clients API endpoints / Prisma `MgrClient*` моделі — тільки додавай `MgrReminder` як нову окрему модель.
2. **DO NOT touch** existing `mgr_clients` schema — `MgrReminder` має свою таблицю з FK на `mgr_clients.id`.
3. **DO NOT touch** auth / middleware / `/admin/*` web admin.
4. **DO NOT** додавати "Створити замовлення" як real button — лишається toast stub до M1.5.
5. **READ** перед першим commit:
   - `docs/1c-export-mobile/MobileAgent/Catalogs/Нагадування.xml` — реквізити моделі нагадувань (`Активне`, `ДатаНапоминания`, `Нагадування`, `Контрагент`, `КонтрагентДляДействий`, `КонтрагентВидео` — три FK на клієнтів, нас цікавить тільки головний `Контрагент`)
   - `docs/1c-export-mobile/MobileAgent/Catalogs/Контрагенты/Forms/ФормаЭлемента/Ext/Form/Module.bsl` — SQL який 1С використовує для відображення reminders у картці (як ми будемо це робити теж — фільтр по clientId, ORDER BY date DESC)
6. **DO NOT** імплементувати sync для reminders зараз — це чисто наш Postgres. Reminders створюються тільки у нашій UI; sync з 1С — V2.

---

## Big picture

### Реквізити tab — доробляємо contacts

**Зараз (M1.3a):**
- Phones як plain text список
- Messengers як chip без лінку
- Адреса — рядок
- Відділення НП — рядок

**Після M1.3c:**
- Phones → 4 icon-buttons поряд з кожним номером: 📞 dial (tel:), 💬 Viber, ✉ Telegram, 📞 WhatsApp
- Messengers → clickable chip → переход на handle (TikTok URL / Instagram / Facebook etc.)
- Адреса → 📍 button → Google Maps deeplink
- Відділення НП → 📦 button → Nova Poshta search URL
- Геолокація (lat,lng) → 🗺 button → Google Maps з pin
- Сайт клієнта (`websiteUrl`) → click → новий tab

### Новий Tab "Нагадування"

```
┌─────────────────────────────────────────────────┐
│ [Реквізити] [Історія] [Маршрути] [Асортимент] [Нагадування ⏰3] [Замовлення] │
└─────────────────────────────────────────────────┘

⏰ Нагадування про клієнта                  + Створити

▸ ⚠ ПРОСТРОЧЕНО (3 днів тому)
  Зателефонувати щодо боргу 17 387 грн                [✓ Виконано] [⏰ Відкласти]
  Створив: Тарас · 2026-05-10

▸ 🔵 Сьогодні
  Уточнити нову адресу доставки                       [✓ Виконано] [⏰ Відкласти]
  Створив: Тарас · 2026-05-13

▸ ⚪ Заплановано (за 5 днів)
  Передзвонити після поставки                         [✓ Виконано] [⏰ Відкласти]
  Створив: Тарас · 2026-05-18

▸ ✅ Виконано
  Узгодити новий маршрут (виконано 2026-05-08)        [↺ Відновити]
```

Create form — modal з полями:
- Текст (textarea, required, max 500)
- Дата нагадування (date+time picker, required, default = завтра 10:00)

### Bell у sidebar

Поточно — empty dropdown. Тепер показує count overdue reminders для current user. Click → dropdown з list (max 10 items) → click на item → перехід на `/manager/customers/{clientId}#reminders`.

---

## Файли — повний перелік

### Нові файли (~25)

```
packages/shared/src/utils/phone.ts                                   ← formatters + deeplinks
packages/shared/src/utils/phone.test.ts                              ← 8+ tests

packages/db/prisma/migrations/2026MMDD_mgr_reminders/migration.sql
packages/db/prisma/schema.prisma                                     ← edit (додати MgrReminder)

# API
apps/store/app/api/v1/manager/clients/[id]/reminders/route.ts       ← GET list + POST create
apps/store/app/api/v1/manager/clients/[id]/reminders/route.test.ts
apps/store/app/api/v1/manager/clients/[id]/reminders/[rid]/route.ts ← PATCH complete/snooze, DELETE
apps/store/app/api/v1/manager/clients/[id]/reminders/[rid]/route.test.ts
apps/store/app/api/v1/manager/notifications/route.ts                 ← GET overdue list + count (for bell)
apps/store/app/api/v1/manager/notifications/route.test.ts

# UI — нові компоненти
apps/store/app/manager/(workstation)/customers/[id]/_components/
  client-reminders-tab.tsx                                          ← server, fetches reminders + groups
  client-reminders-form.tsx                                         ← client, modal з create
  client-reminder-item.tsx                                          ← single item з actions
  client-reminders-grouping.ts                                      ← pure helper (overdue/today/upcoming/done)

# UI — оновлення існуючих
apps/store/app/manager/(workstation)/customers/[id]/_components/
  client-requisites-tab.tsx                                         ← OVERWRITE з contacts links
  client-tabs.tsx                                                   ← додати 5-й tab Нагадування (між Асортимент і Замовлення)
  types.ts                                                          ← extend ClientDetail з reminders[]
  client-contact-actions.tsx                                        ← NEW: shared contact action buttons (phone, viber, etc)
  client-messenger-link.tsx                                         ← NEW: clickable messenger chip

# UI — sidebar bell
apps/store/app/manager/(workstation)/_components/
  manager-header-bell.tsx                                           ← OVERWRITE — fetch count + dropdown з list
  manager-header-bell-item.tsx                                      ← single bell item
```

### Edit існуючих

```
apps/store/app/manager/(workstation)/customers/[id]/page.tsx        ← load reminders в parallel з client
apps/store/app/manager/(workstation)/customers/[id]/_lib/load-client.ts  ← extend load з reminders
packages/db/prisma/schema.prisma                                     ← MgrReminder + User.reminders[] + MgrClient.reminders[]
```

---

## Detailed tasks

### Task 1 — Prisma schema

```prisma
model MgrReminder {
  id              String   @id @default(cuid())
  clientId        String
  ownerUserId     String                     // who створив (filter "мої")
  body            String   @db.Text
  remindAt        DateTime                   // коли спрацьовує
  completedAt     DateTime?
  snoozedUntilAt  DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  client          MgrClient @relation(fields: [clientId], references: [id], onDelete: Cascade)
  owner           User      @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)

  @@index([clientId, remindAt])
  @@index([ownerUserId, completedAt, remindAt])    // for bell counter query
  @@map("mgr_reminders")
}

// edit
model MgrClient {
  // ...existing
  reminders MgrReminder[]
}
model User {
  // ...existing
  reminders MgrReminder[]
}
```

### Task 2 — Migration

```sql
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

### Task 3 — `packages/shared/src/utils/phone.ts`

```typescript
/**
 * Phone formatters + deeplinks для українських номерів.
 *
 * Accept any raw format (0501234567 / +380501234567 / 380501234567 / 50 123 45 67)
 * Normalize to international E.164: +380501234567
 * Display format: "+380 50 123 45 67"
 */

const UKR_PREFIX = "+380";

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("380")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return UKR_PREFIX + digits.slice(1);
  if (digits.length === 9) return UKR_PREFIX + digits;
  return null;
}

export function formatPhoneUkr(raw: string | null | undefined): string {
  const e164 = normalizePhone(raw);
  if (!e164) return raw ?? "";
  // +380 50 123 45 67
  const d = e164.slice(4);
  return `+380 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

export function phoneToTelUrl(raw: string): string | null {
  const e = normalizePhone(raw);
  return e ? `tel:${e}` : null;
}

export function phoneToViberUrl(raw: string): string | null {
  const e = normalizePhone(raw);
  return e ? `viber://chat?number=${encodeURIComponent(e)}` : null;
}

export function phoneToWhatsAppUrl(raw: string): string | null {
  const e = normalizePhone(raw);
  return e ? `https://wa.me/${e.replace("+", "")}` : null;
}

export function phoneToTelegramUrl(raw: string): string | null {
  // Telegram не підтримує phone-based deeplink. Це placeholder — клік буде disabled.
  return null;
}
```

### Task 4 — Tests phone

`packages/shared/src/utils/phone.test.ts` — ≥ 8 тестів:
- `normalizePhone("0501234567") === "+380501234567"`
- `normalizePhone("+380 50 123 45 67") === "+380501234567"`
- `normalizePhone("380501234567") === "+380501234567"`
- `normalizePhone("501234567") === "+380501234567"`
- `normalizePhone(null) === null`
- `normalizePhone("invalid") === null`
- `formatPhoneUkr("0501234567") === "+380 50 123 45 67"`
- `phoneToViberUrl("0501234567") === "viber://chat?number=%2B380501234567"`

### Task 5 — `GET+POST /api/v1/manager/clients/[id]/reminders`

**GET:**
- Auth required (`getCurrentUser`)
- Verify client exists (404)
- Return list ordered by `remindAt ASC`, with computed status `overdue|today|upcoming|completed`
- Include `owner.fullName` для display

**POST:**
- Zod body: `{ body: string (1-500), remindAt: string ISO }`
- Save with `ownerUserId = currentUser.id`
- Return new reminder

### Task 6 — `PATCH+DELETE /api/v1/manager/clients/[id]/reminders/[rid]`

**PATCH:**
- Zod body: `{ action: "complete" | "uncomplete" | "snooze", snoozedUntil?: string ISO }`
- Permission: тільки owner OR admin може змінити
- Update + return

**DELETE:**
- Permission: owner OR admin
- Hard delete

### Task 7 — `GET /api/v1/manager/notifications`

Bell endpoint. Returns:
```json
{
  "overdueCount": 3,
  "items": [
    {
      "id": "...",
      "type": "reminder_overdue",
      "title": "Зателефонувати щодо боргу",
      "clientId": "...",
      "clientName": "Амер",
      "remindAt": "2026-05-10T10:00:00Z",
      "daysOverdue": 3
    }
  ]
}
```

Query:
```sql
WHERE ownerUserId = currentUser.id
  AND completedAt IS NULL
  AND (snoozedUntilAt IS NULL OR snoozedUntilAt <= NOW())
  AND remindAt <= NOW()
ORDER BY remindAt ASC
LIMIT 10
```

Count окремою query (без LIMIT).

### Task 8 — UI Реквізити tab — contacts links

`client-contact-actions.tsx`:
```tsx
import { phoneToTelUrl, phoneToViberUrl, phoneToWhatsAppUrl, formatPhoneUkr } from "@ltex/shared/utils/phone";

export function ContactActions({ phone, messenger }: { phone: string; messenger?: string | null }) {
  const tel = phoneToTelUrl(phone);
  const viber = phoneToViberUrl(phone);
  const wa = phoneToWhatsAppUrl(phone);
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{formatPhoneUkr(phone)}</span>
      {tel && <a href={tel} className="rounded p-1 text-gray-500 hover:bg-blue-50 hover:text-blue-700" title="Подзвонити">📞</a>}
      {viber && <a href={viber} className="rounded p-1 text-gray-500 hover:bg-purple-50 hover:text-purple-700" title="Viber">💬</a>}
      {wa && <a href={wa} target="_blank" rel="noopener" className="rounded p-1 text-gray-500 hover:bg-green-50 hover:text-green-700" title="WhatsApp">✉</a>}
      {messenger && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{messenger}</span>}
    </div>
  );
}
```

`client-messenger-link.tsx`:
- Map network → URL builder:
  - `tiktok` → `https://tiktok.com/@{handle.replace("@","")}`
  - `instagram` → `https://instagram.com/{handle.replace("@","")}`
  - `facebook` → handle вже містить URL або username
  - `telegram` → `https://t.me/{handle.replace("@","")}`
  - `viber` → `viber://chat?number={normalizePhone(handle)}`
- Fallback: якщо є `url` поле — використати його напряму
- Icon + label, link target="_blank"

Адреса як кнопка з Maps deeplink:
```tsx
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
<a href={mapsUrl} target="_blank" rel="noopener" className="...">{fullAddress} 📍</a>
```

Відділення НП — те саме але query = `Нова Пошта Відділення №X м. {city}`.

Геолокація (lat,lng):
```tsx
const [lat, lng] = client.geolocation.split(",");
const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
```

### Task 9 — UI Tab Нагадування

`client-reminders-tab.tsx` (server):
- Fetch reminders via prisma direct (не через API — server component може використати prisma напряму, як `load-client.ts` робить)
- Group через `client-reminders-grouping.ts`:
  - **overdue**: `remindAt < now AND completedAt IS NULL AND (snoozedUntilAt IS NULL OR snoozedUntilAt < now)`
  - **today**: `remindAt within today AND not completed`
  - **upcoming**: `remindAt > today AND not completed`
  - **completed**: `completedAt IS NOT NULL`
- Render 4 секції (collapsible — completed default collapsed)
- Each item — `<ReminderItem>` з actions

`client-reminders-form.tsx` (client, Dialog from `@ltex/ui`):
- Trigger button "+ Створити" у tab header
- Form: textarea + date+time picker (native `<input type="datetime-local">`)
- Default remindAt = tomorrow 10:00
- POST → `router.refresh()`

`client-reminder-item.tsx` (client wrapper з actions):
- Body text + "Створив: X · {createdAt}"
- Actions: [✓ Виконано] [⏰ Відкласти на 1 день] [🗑 Видалити]
- Permission: visible тільки якщо `ownerUserId === currentUser.id` AND admin

### Task 10 — UI sidebar bell

`manager-header-bell.tsx`:
- Client component (бо потрібен interactive dropdown)
- `useEffect` — fetch `/api/v1/manager/notifications` mount + every 60s
- Display: bell icon + badge з `overdueCount` (cap "9+")
- Click → dropdown (shadcn `Popover` from `@ltex/ui`)
- Dropdown — list of items, click → `router.push("/manager/customers/{clientId}#reminders")`
- Empty state: "Без нагадувань"

⚠️ ВАЖЛИВО — НЕ replace існуючу `<UnderConstruction>` для bell — там empty dropdown зараз. Шукай поточну реалізацію (`apps/store/app/manager/(workstation)/_components/manager-header.tsx`?) і replace empty content на реальний.

### Task 11 — Tabs intogration

`client-tabs.tsx` — додати 5-й tab між Асортимент і Замовлення:
- Tab label: `Нагадування` + badge з count overdue коли > 0
- Anchor `#reminders` для deeplink з bell

### Task 12 — `load-client.ts` — додати reminders

Extend `ClientDetail` type з `reminders: ReminderListItem[]`. Завантажити з prisma `include`.

Або краще — окремий fetch у page для performance (Suspense boundary з skeleton).

### Task 13 — Tests ≥ 12

- `phone.test.ts` ≥ 8
- `reminders POST+GET route.test.ts` ≥ 4 (happy GET, validation POST, 404 client, auth)
- `reminders [rid] route.test.ts` ≥ 4 (complete, snooze, delete, non-owner 403)
- `notifications route.test.ts` ≥ 2 (count + items)
- `client-reminders-grouping.test.ts` ≥ 4 (overdue/today/upcoming/completed bucket)

---

## Acceptance criteria

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] Phone лінки працюють — click на 📞 відкриває tel:, на Viber-icon — viber://, etc.
- [ ] Адреса — clickable, відкриває Google Maps у новому tab
- [ ] Геолокація (якщо є) — pin на Maps
- [ ] Соцмережі — clickable з правильним URL per network
- [ ] Сайт клієнта (`websiteUrl`) — opens новий tab з `rel="noopener"`
- [ ] Tab "Нагадування" присутній з 4 секціями (overdue / today / upcoming / completed)
- [ ] "Створити нагадування" відкриває modal, save → router.refresh, новий item з'являється
- [ ] Complete / Snooze / Delete працюють з permission gating
- [ ] Bell у sidebar показує count overdue reminders (тільки `ownerUserId = currentUser.id`)
- [ ] Click на bell item → перехід на customer card з open Tab "Нагадування"
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
```

Жодного seed update не потрібно — reminders створюються через UI.

---

## Notes for worker

1. **MUST-READ перед першим commit:** `docs/1c-export-mobile/MobileAgent/Catalogs/Нагадування.xml` + `Catalogs/Контрагенты/Forms/ФормаЭлемента/Ext/Form/Module.bsl` (там SQL `НагадуванняСпр` query — паттерн для reference).
2. **Bell endpoint** має кешуватись агресивно — 60s revalidate на client-side polling. Server response — `Cache-Control: private, max-age=0` (бо per-user).
3. **Permission check у PATCH/DELETE:** owner OR admin. Завжди приймай payload але reject 403 якщо не дозволено.
4. **datetime-local** input — native HTML5, повертає string `"2026-05-13T10:00"`. Конвертуй у Date через `new Date(value)` (працює бо local timezone).
5. **Phone formatter** — є tests, не зломай їх при оптимізаціях. Особливо edge cases з international format і spaces у raw input.
6. **НЕ додавай** "Запис дзвінка" — це окрема integration з PBX, V2.
7. **`scripts/seed-mgr-test-data.ts`** — НЕ оновлюй. Reminders створюються через UI.
