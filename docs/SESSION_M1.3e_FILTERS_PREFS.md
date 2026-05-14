# Session M1.3e — Розширені фільтри клієнтів + налаштування колонок/фільтрів

**Type:** Worker session (~30 файлів)
**Branch:** `claude/manager-m1-3e-filters-prefs-{XXXX}`
**Goal:** (1) Розширити фільтри списку клієнтів до повного покриття полів (крім контактів); (2) Додати персональні налаштування колонок таблиці і панелі фільтрів — кожен менеджер обирає видимість + порядок під себе.

**Parent spec:** [`docs/MANAGER_APP_STRATEGY.md`](MANAGER_APP_STRATEGY.md) §6. **Builds on:** M1.3a (clients list + GET filter params), M1.3c (full schema), M1.3d (editing).

**User decision (locked 2026-05-14):**
- "Фільтри клієнтів повинні містити всі поля крім контактів"
- "Налаштовувати колонки на сторінці та у фільтрах — переставляти місцями, відображати/невідображати"

---

## ⚠️ HARD RULES

1. **DO NOT touch** M1.3d edit logic / Реквізити tab — це окрема feature.
2. **DO NOT touch** `MgrClient*` schema — тільки додавати нову `MgrUserViewPrefs` модель.
3. **DO NOT touch** auth / middleware / `/admin/*` web admin.
4. **DO NOT** видаляти existing filter params з GET `/clients` — тільки **додавати** нові. URL backward-compat (старі bookmarks мають працювати).
5. **DO NOT** використовувати drag-and-drop library — простий up/down arrows + checkbox. Менше залежностей.
6. **DO NOT** робити filter shortcuts pinned на toolbar — усі фільтри у sheet, на toolbar лише search + "Фільтри (N active)" button + "⚙️ Налаштувати".
7. **READ** перед першим commit:
   - `apps/store/app/api/v1/manager/clients/route.ts` — поточний GET з 8 filter params
   - `apps/store/app/manager/(workstation)/customers/page.tsx` — table render
   - `apps/store/app/manager/(workstation)/customers/_components/` — filter sheet + toolbar
   - `packages/db/prisma/schema.prisma` — MgrClient + MgrUserViewPrefs (новий)

---

## Big picture

### Part A — Розширені фільтри

**Зараз (M1.3a):** 8 params — search, statusId, channelId, deliveryMethodId, hasDebt, hasOverpayment, onlyMine, hideTrash.

**Додати (17 нових):**

| Param | Type | Behavior |
|---|---|---|
| `statusOperationalId` | csv string[] | multi-select |
| `categoryTTId` | csv string[] | multi-select |
| `priceTypeId` | csv string[] | multi-select |
| `primaryAssortmentId` | csv string[] | multi-select |
| `primaryRouteId` | csv string[] | multi-select |
| `agentUserId` | csv string[] | multi-select з User WHERE role IN ('manager','admin') |
| `region` | string | LIKE %query% |
| `city` | string | LIKE %query% |
| `dialogStatus` | string | exact match (поки text) |
| `debtMin` | number | `debt >= n` |
| `debtMax` | number | `debt <= n` |
| `overdueDebtMin` | number | `overdueDebt >= n` |
| `overdueDebtMax` | number | `overdueDebt <= n` |
| `monthlyVolumeMin` | number | `monthlyVolume >= n` |
| `monthlyVolumeMax` | number | `monthlyVolume <= n` |
| `daysSinceMin` | number | range по `daysSinceLastPurchase` |
| `daysSinceMax` | number | range |
| `licenseExpiresBefore` | ISO date | `licenseExpiresAt <= date` |
| `hasNewMessage` | boolean | exact match |
| `isViberLinked` | boolean | exact match |
| `createdFrom` | ISO date | `createdAt >= date` |
| `createdTo` | ISO date | `createdAt <= date` |

**URL encoding rules:**
- single: `?statusId=abc`
- multi: `?statusId=abc,def,ghi` (comma-separated — backend split on `,` + filter empties)
- range: `?debtMin=100&debtMax=5000`
- bool: `?hasNewMessage=true` (string "true"/"false")
- date: `?createdFrom=2026-01-01T00:00:00Z` (ISO datetime — input type="date" дає `YYYY-MM-DD`, convert на client до `T00:00:00.000Z`)

**Existing 8 filter params keep as-is.** Old `statusId` (single) стає optional → також працює як multi (legacy: якщо single id передано — wrap у array у backend handler).

**Replace** `hasDebt` boolean → залишаємо для compat, але якщо `debtMin` АБО `debtMax` присутні — вони перебивають `hasDebt`. Same для `hasOverpayment` vs `overdueDebt*`.

### Part B — User view prefs

**Concept:** Окрема DB таблиця `mgr_user_view_prefs` зберігає JSON-конфіг для кожної комбінації (userId, viewKey). Два initial views:
- `clients_table` — конфіг колонок таблиці
- `clients_filters` — конфіг панелі фільтрів

**Schema:**
```prisma
model MgrUserViewPrefs {
  id        String   @id @default(cuid())
  userId    String
  viewKey   String                                // "clients_table" | "clients_filters"
  config    Json                                   // shape per viewKey, validated на API rівні
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, viewKey])
  @@map("mgr_user_view_prefs")
}
```

**Config shape `clients_table`:**
```json
{
  "version": 1,
  "items": [
    { "key": "name",            "visible": true,  "order": 1 },
    { "key": "debt",            "visible": true,  "order": 2 },
    { "key": "statusGeneral",   "visible": true,  "order": 3 },
    { "key": "searchChannel",   "visible": false, "order": 4 },
    { "key": "daysSinceLast",   "visible": true,  "order": 5 },
    { "key": "agent",           "visible": false, "order": 6 }
  ]
}
```

**Config shape `clients_filters`:**
```json
{
  "version": 1,
  "items": [
    { "key": "search",          "visible": true,  "order": 1 },
    { "key": "statusGeneralId", "visible": true,  "order": 2 },
    { "key": "agentUserId",     "visible": false, "order": 3 }
  ]
}
```

**Available column keys** (всього 19):
- `name` / `tradePointName` / `code1C`
- `phonePrimary` (тільки display, **не filter**)
- `statusGeneral` / `statusOperational`
- `searchChannel` / `deliveryMethod` / `categoryTT` / `priceType` / `primaryAssortment` / `primaryRoute`
- `agent`
- `region` / `city`
- `debt` / `overdueDebt`
- `monthlyVolume`
- `daysSinceLast` / `licenseExpiresAt`
- `lastSyncedAt` / `createdAt`

**Default visible columns (7, як M1.3a):** `name`, `phonePrimary`, `debt`, `statusGeneral`, `searchChannel`, `daysSinceLast`, `agent`.

**Available filter keys** (всього 25):
- `search`
- `statusGeneralId` / `statusOperationalId`
- `searchChannelId` / `deliveryMethodId` / `categoryTTId` / `priceTypeId` / `primaryAssortmentId` / `primaryRouteId`
- `agentUserId`
- `region` / `city` / `dialogStatus`
- `debtRange` (combo min/max) / `overdueDebtRange` / `monthlyVolumeRange` / `daysSinceRange`
- `licenseExpiresBefore` / `createdRange`
- `hasNewMessage` / `isViberLinked`
- `hasDebt` / `hasOverpayment` (legacy boolean — лишити для compat)
- `onlyMine` / `hideTrash`

**Default visible filters (8, як M1.3a):** `search`, `statusGeneralId`, `searchChannelId`, `deliveryMethodId`, `hasDebt`, `hasOverpayment`, `onlyMine`, `hideTrash`.

**Merge logic при load:** якщо user має prefs але список items застарілий (з'явилась нова колонка) — auto-append new keys в кінець з `visible: false`. Без user interaction.

### API

**GET `/api/v1/manager/me/view-prefs/[viewKey]`** — read:
- Auth required
- viewKey ∈ {"clients_table", "clients_filters"}
- Якщо немає у DB → return default (з `lib/manager/view-defaults.ts`)
- Якщо є — merge з defaults (auto-append нових keys)
- Response: `{ items: ConfigItem[] }`

**PUT `/api/v1/manager/me/view-prefs/[viewKey]`** — write:
- Auth required
- Body: `{ items: ConfigItem[] }`, Zod validate (всі keys мають бути з whitelisted set)
- Upsert (`@@unique([userId, viewKey])`)
- Response: saved config

### UI

**Toolbar редизайн (`customers/page.tsx`):**

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Search...___________] [Фільтри (3) ▾] [Тільки мої] [⚙️ Налаштування]│
├──────────────────────────────────────────────────────────────────────┤
│ [Прибрати приховані ✓]                            Знайдено: 247       │
└──────────────────────────────────────────────────────────────────────┘
```

- Search — лишається на toolbar (завжди visible — найпопулярніший)
- "Фільтри (N)" — opens filter sheet (counter = active filters count)
- "Тільки мої" — toggle visible на toolbar (зручний shortcut)
- "Прибрати приховані" (hideTrash) — checkbox під toolbar
- "⚙️ Налаштування" — opens prefs sheet (3 sections: Columns / Filters / Reset)

**Filter sheet:**
```
Sheet (right side, w-96)
┌─────────────────────────────┐
│ Фільтри                  ✕  │
├─────────────────────────────┤
│ Статус ▾  [Active, Lost]    │
│ Канал ▾   [Cold call]       │
│ Категорія ТТ ▾  [Магазин]   │
│ Спосіб доставки ▾           │
│ Тип цін ▾                   │
│ Асортимент ▾                │
│ Маршрут ▾                   │
│ Агент ▾                     │
│ Область  [Київська____]     │
│ Місто    [Київ_________]    │
│ Борг     [100] – [10000] ₴  │
│ Просрочено [_] – [_] ₴      │
│ Обєм/міс  [10] – [100] кг   │
│ Днів без покупки [_] – [_]  │
│ Ліцензія до: [2026-12-31]   │
│ Створений з: [_] до: [_]    │
│ □ Нове повідомлення         │
│ □ Підписаний у Viber        │
│ Статус діалогу: [____]      │
├─────────────────────────────┤
│ [Скинути все] [Застосувати] │
└─────────────────────────────┘
```

Фільтри відображаються у порядку з `clients_filters` prefs (`order` ASC, `visible: false` приховані). Multi-select — chip-style з зачитуванням з `dictionaries` API.

**Налаштування sheet (Sheet right side):**
```
┌──────────────────────────────────┐
│ Налаштування таблиці          ✕  │
├──────────────────────────────────┤
│ [Колонки] [Фільтри]              │
├──────────────────────────────────┤
│ Tab Колонки:                     │
│ ─────────────────────────────── │
│ ▲▼ ☑ Найменування              │
│ ▲▼ ☑ Телефон                   │
│ ▲▼ ☑ Борг                       │
│ ▲▼ ☑ Статус                     │
│ ▲▼ ☐ Оперативний статус        │
│ ▲▼ ☐ Категорія ТТ              │
│ ▲▼ ☐ Тип цін                    │
│ ...                              │
├──────────────────────────────────┤
│ [Скинути до дефолту]  [Зберегти] │
└──────────────────────────────────┘
```

- Up/down arrows — переставити вгору/вниз (disabled на крайніх)
- Checkbox — show/hide
- "Скинути до дефолту" — restore default config (call DELETE або PUT з defaults)
- "Зберегти" — PUT API
- Tab "Фільтри" — те ж саме але для filter keys

---

## Файли — повний перелік (~30)

### Backend (~8)

```
packages/db/prisma/migrations/2026MMDD_user_view_prefs/migration.sql  ← NEW idempotent
packages/db/prisma/schema.prisma                                       ← edit: add MgrUserViewPrefs

apps/store/app/api/v1/manager/me/view-prefs/[viewKey]/route.ts         ← NEW GET + PUT
apps/store/app/api/v1/manager/me/view-prefs/[viewKey]/route.test.ts    ← NEW ≥6 tests

apps/store/app/api/v1/manager/clients/route.ts                         ← edit: parse + apply 17 new filter params
apps/store/app/api/v1/manager/clients/route.test.ts                    ← edit: ≥8 нових tests

apps/store/lib/manager/view-defaults.ts                                 ← NEW: default configs + key whitelists
apps/store/lib/manager/view-defaults.test.ts                            ← NEW ≥4 tests (merge logic)

apps/store/lib/validations/view-prefs.ts                                ← NEW Zod schema для PUT body
```

### UI shared (~3)

```
apps/store/app/manager/(workstation)/_components/view-customizer-sheet.tsx     ← NEW: shared UI з 2 tabs (columns/filters)
apps/store/app/manager/(workstation)/_components/view-customizer-list.tsx      ← NEW: list з up/down + checkbox per item
apps/store/app/manager/(workstation)/_hooks/use-view-prefs.ts                  ← NEW: fetch + save with optimistic update
```

### UI clients page (~10)

```
apps/store/app/manager/(workstation)/customers/page.tsx                        ← edit: load view-prefs server-side
apps/store/app/manager/(workstation)/customers/_components/
  clients-table.tsx                                                            ← edit: render only visible columns у заданому order
  clients-table-row.tsx                                                        ← edit: per-key cell renderer
  clients-toolbar.tsx                                                          ← edit: new layout (Search / Фільтри (N) / Налаштування)
  clients-filter-sheet.tsx                                                     ← OVERWRITE: всі 25 filters + visible/order applied
  clients-filter-controls/                                                     ← NEW folder з per-type controls
    select-multi.tsx                                                           ← multi-select chip dropdown
    range-numeric.tsx                                                          ← min/max number pair
    range-date.tsx                                                             ← from/to date pair
    text-filter.tsx                                                            ← single text input
    bool-filter.tsx                                                            ← checkbox
  clients-filter-state.ts                                                      ← NEW: URL ↔ filter state mapping
  clients-filter-state.test.ts                                                 ← NEW ≥6 tests
```

### UI types + utils (~3)

```
apps/store/app/manager/(workstation)/customers/_lib/column-render.ts           ← NEW: key → React cell renderer map
apps/store/app/manager/(workstation)/customers/_lib/filter-labels.ts           ← NEW: key → label dict для UI
apps/store/app/manager/(workstation)/customers/_lib/active-filter-count.ts     ← NEW: pure func рахує active filters з URL
```

### Tests inline (~6)

```
view-customizer-list.test.tsx                                                  ← ≥4 tests (up/down, toggle visible, save)
clients-filter-controls/*.test.tsx                                             ← ≥6 tests (per control input/output)
active-filter-count.test.ts                                                    ← ≥4 tests
```

**Total ~30 файлів, +2000-2500 lines estimate.**

---

## Detailed tasks

### Task 1 — Migration

```sql
CREATE TABLE IF NOT EXISTS "mgr_user_view_prefs" (
  "id"         TEXT         NOT NULL,
  "user_id"    TEXT         NOT NULL,
  "view_key"   TEXT         NOT NULL,
  "config"     JSONB        NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mgr_user_view_prefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_user_view_prefs_user_view_key"
  ON "mgr_user_view_prefs"("user_id", "view_key");

DO $$ BEGIN
  ALTER TABLE "mgr_user_view_prefs"
    ADD CONSTRAINT "mgr_user_view_prefs_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

### Task 2 — view-defaults.ts

```typescript
export const CLIENTS_TABLE_KEYS = [
  "name", "tradePointName", "code1C", "phonePrimary",
  "statusGeneral", "statusOperational",
  "searchChannel", "deliveryMethod", "categoryTT", "priceType", "primaryAssortment", "primaryRoute",
  "agent", "region", "city",
  "debt", "overdueDebt", "monthlyVolume",
  "daysSinceLast", "licenseExpiresAt", "lastSyncedAt", "createdAt",
] as const;

export const CLIENTS_TABLE_DEFAULT: ConfigItem[] = [
  { key: "name",          visible: true,  order: 1 },
  { key: "phonePrimary",  visible: true,  order: 2 },
  { key: "debt",          visible: true,  order: 3 },
  { key: "statusGeneral", visible: true,  order: 4 },
  { key: "searchChannel", visible: true,  order: 5 },
  { key: "daysSinceLast", visible: true,  order: 6 },
  { key: "agent",         visible: true,  order: 7 },
  // решта append як invisible
];

export const CLIENTS_FILTERS_KEYS = [
  "search",
  "statusGeneralId", "statusOperationalId",
  "searchChannelId", "deliveryMethodId", "categoryTTId", "priceTypeId", "primaryAssortmentId", "primaryRouteId",
  "agentUserId",
  "region", "city", "dialogStatus",
  "debtRange", "overdueDebtRange", "monthlyVolumeRange", "daysSinceRange",
  "licenseExpiresBefore", "createdRange",
  "hasNewMessage", "isViberLinked",
  "hasDebt", "hasOverpayment",
  "onlyMine", "hideTrash",
] as const;

export const CLIENTS_FILTERS_DEFAULT: ConfigItem[] = [
  { key: "search",           visible: true, order: 1 },
  { key: "statusGeneralId",  visible: true, order: 2 },
  { key: "searchChannelId",  visible: true, order: 3 },
  { key: "deliveryMethodId", visible: true, order: 4 },
  { key: "hasDebt",          visible: true, order: 5 },
  { key: "hasOverpayment",   visible: true, order: 6 },
  { key: "onlyMine",         visible: true, order: 7 },
  { key: "hideTrash",        visible: true, order: 8 },
];

export function mergePrefs(saved: ConfigItem[] | null, defaults: ConfigItem[], allKeys: readonly string[]): ConfigItem[] {
  // 1. Validate: drop saved items where key ∉ allKeys
  // 2. Auto-append missing keys (from allKeys but not у saved) з visible: false (continue order)
  // 3. Return ordered list
}
```

Tests ≥ 4: empty saved → defaults / saved partial → merge / unknown key dropped / new key appended.

### Task 3 — view-prefs endpoint

```typescript
// GET
export async function GET(_req: NextRequest, { params }: { params: Promise<{ viewKey: string }> }) {
  const user = await getCurrentUser();
  if (!user) return 401;

  const { viewKey } = await params;
  if (!VALID_VIEW_KEYS.includes(viewKey)) return 400;

  const row = await prisma.mgrUserViewPrefs.findUnique({
    where: { userId_viewKey: { userId: user.id, viewKey } },
  });

  const saved = row?.config?.items ?? null;
  const defaults = getDefaultsFor(viewKey);
  const keys = getAllKeysFor(viewKey);
  const merged = mergePrefs(saved, defaults, keys);

  return NextResponse.json({ items: merged });
}

// PUT
export async function PUT(req: NextRequest, ...) {
  // Zod validate body { items: ConfigItem[] }
  // Whitelist check (keys must be у allKeysFor)
  // Upsert
}
```

Tests ≥ 6: GET default / GET saved / GET with new key auto-appended / PUT valid / PUT invalid key 400 / PUT unauthorized 401.

### Task 4 — Extended clients GET filters

`apps/store/app/api/v1/manager/clients/route.ts`:
1. Parse comma-separated arrays для FK params (split + filter empty + validate cuid).
2. Build Prisma `where` clause:
   ```typescript
   const where: Prisma.MgrClientWhereInput = { ...existing };

   // Multi-select FK
   if (statusOperationalIds?.length) where.statusOperationalId = { in: statusOperationalIds };
   if (categoryTTIds?.length) where.categoryTTId = { in: categoryTTIds };
   // ...

   // Range
   if (debtMin != null || debtMax != null) {
     where.debt = {
       ...(debtMin != null ? { gte: debtMin } : {}),
       ...(debtMax != null ? { lte: debtMax } : {}),
     };
   }
   // ...

   // Bool
   if (hasNewMessage != null) where.hasNewMessage = hasNewMessage;

   // Text LIKE
   if (region) where.region = { contains: region, mode: "insensitive" };
   if (city) where.city = { contains: city, mode: "insensitive" };

   // Date range
   if (createdFrom || createdTo) {
     where.createdAt = {
       ...(createdFrom ? { gte: new Date(createdFrom) } : {}),
       ...(createdTo ? { lte: new Date(createdTo) } : {}),
     };
   }
   ```

Tests ≥ 8 (нових): multi-select по category / debt range / region LIKE / hasNewMessage / date range / agent multi / overdueDebt range / combined filters.

### Task 5 — UI view customizer

`view-customizer-sheet.tsx` (client component):

```tsx
"use client";
export function ViewCustomizerSheet({ open, onClose, currentTab = "columns" }: Props) {
  const [tab, setTab] = useState<"columns" | "filters">(currentTab);
  const columnsPrefs = useViewPrefs("clients_table");
  const filtersPrefs = useViewPrefs("clients_filters");

  return (
    <Sheet open={open} onClose={onClose}>
      <header>
        <h2>Налаштування таблиці</h2>
        <TabSwitcher tabs={[{ key: "columns", label: "Колонки" }, { key: "filters", label: "Фільтри" }]} value={tab} onChange={setTab} />
      </header>
      <div className="p-4">
        {tab === "columns" && <ViewCustomizerList prefs={columnsPrefs} labels={COLUMN_LABELS} />}
        {tab === "filters" && <ViewCustomizerList prefs={filtersPrefs} labels={FILTER_LABELS} />}
      </div>
      <footer>
        <button onClick={() => (tab === "columns" ? columnsPrefs.reset() : filtersPrefs.reset())}>
          Скинути до дефолту
        </button>
        <button onClick={() => (tab === "columns" ? columnsPrefs.save() : filtersPrefs.save())}>
          Зберегти
        </button>
      </footer>
    </Sheet>
  );
}
```

`view-customizer-list.tsx` — uses local state, items as `ConfigItem[]`:
```tsx
{items.map((item, i) => (
  <div key={item.key} className="flex items-center gap-2 py-1">
    <button onClick={() => moveUp(i)} disabled={i === 0}>▲</button>
    <button onClick={() => moveDown(i)} disabled={i === items.length - 1}>▼</button>
    <input
      type="checkbox"
      checked={item.visible}
      onChange={(e) => toggleVisible(i, e.target.checked)}
    />
    <span className="flex-1">{labels[item.key]}</span>
  </div>
))}
```

### Task 6 — use-view-prefs hook

```typescript
export function useViewPrefs(viewKey: "clients_table" | "clients_filters") {
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/manager/me/view-prefs/${viewKey}`)
      .then(r => r.json())
      .then(data => setItems(data.items));
  }, [viewKey]);

  const update = (newItems: ConfigItem[]) => {
    setItems(newItems);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    await fetch(`/api/v1/manager/me/view-prefs/${viewKey}`, {
      method: "PUT",
      body: JSON.stringify({ items }),
    });
    setDirty(false);
    setSaving(false);
    router.refresh();  // re-render таблицю з new prefs
  };

  const reset = async () => {
    // PUT defaults
  };

  return { items, update, save, reset, dirty, saving };
}
```

### Task 7 — Apply prefs у таблицю

`clients-table.tsx`:
- Receive `columnsPrefs: ConfigItem[]` as prop (server-side load + pass через page → table)
- Filter `visible: true`, sort by `order`
- Render thead/tbody dynamically:

```tsx
const visibleCols = columnsPrefs.filter(c => c.visible).sort((a, b) => a.order - b.order);

<thead>
  <tr>
    {visibleCols.map(col => <th key={col.key}>{COLUMN_LABELS[col.key]}</th>)}
  </tr>
</thead>
<tbody>
  {clients.map(client => (
    <tr key={client.id}>
      {visibleCols.map(col => <td key={col.key}>{renderCell(col.key, client)}</td>)}
    </tr>
  ))}
</tbody>
```

`column-render.ts`:
```typescript
export function renderCell(key: string, client: ClientListItem): React.ReactNode {
  switch (key) {
    case "name": return <Link href={`/manager/customers/${client.id}`}>{client.name}</Link>;
    case "phonePrimary": return formatPhoneUkr(client.phonePrimary);
    case "debt": return formatMoney(client.debt);
    case "statusGeneral": return client.statusGeneral?.label;
    case "agent": return client.agent?.fullName ?? "—";
    // ... all 19 keys
    default: return "—";
  }
}
```

### Task 8 — Apply prefs у filter sheet

`clients-filter-sheet.tsx`:
- Receive `filtersPrefs: ConfigItem[]` як prop
- Filter `visible: true`, sort by order
- Render per-filter control via switch on key

`filter-key → control type` mapping:
```typescript
const FILTER_CONFIG: Record<string, { type: "multi" | "range" | "text" | "bool" | "search"; ...}> = {
  search: { type: "search", label: "Пошук" },
  statusGeneralId: { type: "multi", label: "Статус", source: "statuses" },
  debtRange: { type: "range", label: "Борг, ₴" },
  region: { type: "text", label: "Область" },
  hasNewMessage: { type: "bool", label: "Нове повідомлення" },
  // ...
};
```

### Task 9 — URL state mapping

`clients-filter-state.ts` — pure functions:

```typescript
export type FilterState = {
  search?: string;
  statusGeneralIds?: string[];
  // ... всі 25 filter keys
};

export function urlToState(searchParams: URLSearchParams): FilterState {
  return {
    search: searchParams.get("search") ?? undefined,
    statusGeneralIds: parseCsvList(searchParams.get("statusId")),
    debtMin: parseNumber(searchParams.get("debtMin")),
    // ...
  };
}

export function stateToUrl(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.statusGeneralIds?.length) params.set("statusId", state.statusGeneralIds.join(","));
  // ...
  return params;
}

export function countActiveFilters(state: FilterState): number {
  let count = 0;
  if (state.search) count++;
  if (state.statusGeneralIds?.length) count++;
  // ...
  return count;
}
```

Tests ≥ 6: roundtrip / empty / unknown param ignored / multi-csv parsed / range / count.

### Task 10 — Toolbar redesign

```tsx
<Toolbar>
  <SearchInput value={state.search} onChange={...} />
  <FilterButton activeCount={countActiveFilters(state)} onClick={openFilterSheet} />
  <BoolToggle label="Тільки мої" checked={state.onlyMine} onChange={...} />
  <CustomizeButton onClick={openCustomizeSheet} />
</Toolbar>
```

### Task 11 — Tests final

Total ≥ 28:
- view-defaults merge (≥ 4)
- view-prefs route (≥ 6)
- extended clients filters (≥ 8)
- view-customizer-list (≥ 4)
- filter controls (≥ 6)
- url state mapping (≥ 6)
- active filter count (≥ 4)

---

## Acceptance criteria

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] Filter sheet з усіма 25 filter keys (за prefs visible)
- [ ] Multi-select chip-style для FK filters
- [ ] Range inputs для debt / overdueDebt / monthlyVolume / daysSince
- [ ] Date inputs для license / createdRange
- [ ] Bool checkbox для hasNewMessage / isViberLinked
- [ ] Старі filter URLs (M1.3a) працюють (`?statusId=abc&hasDebt=true`)
- [ ] Нові filter URLs працюють (`?statusId=a,b,c&debtMin=100`)
- [ ] "Налаштування" sheet — 2 tabs (Колонки / Фільтри)
- [ ] Per-item up/down/checkbox controls
- [ ] Save → PUT → таблиця/панель оновлюється
- [ ] "Скинути до дефолту" — restore defaults
- [ ] Якщо у DB є prefs але список items застарів (нова колонка/фільтр з'явилась) — auto-append без user action
- [ ] Active filter counter на "Фільтри (N)" button
- [ ] **DO NOT push** на main. Тільки на feature branch.

---

## User-action post-merge

```powershell
cd E:\ltex-ecosystem
git pull origin main
.\scripts\deploy.ps1
pnpm --filter @ltex/db exec prisma migrate deploy
```

Seed не потрібен — таблиця `mgr_user_view_prefs` поступово заповниться коли менеджери збережуть свої налаштування. Без них — defaults застосовуються.

---

## Notes for worker

1. **Phasing** (worker — роби у такому порядку):
   - Phase 1: Migration + schema (typecheck має проходити)
   - Phase 2: view-defaults.ts з merge logic + tests
   - Phase 3: view-prefs API endpoint + tests
   - Phase 4: Extended clients GET filter params + tests
   - Phase 5: Filter controls components (multi-select / range / etc.)
   - Phase 6: Filter sheet — apply prefs + URL state mapping
   - Phase 7: Customizer sheet UI (column + filter tabs)
   - Phase 8: Table — apply column prefs
   - Phase 9: Toolbar redesign
   - Phase 10: Final tests + build

2. **DO NOT break URL backward compat.** Старі bookmarks (`?statusId=abc`) мають працювати. Single id → wrap у array у backend.

3. **DO NOT** використовувати DnD library (react-beautiful-dnd, dnd-kit). Тільки up/down arrows.

4. **DO NOT** load view-prefs у кожен page request — server-side load у `customers/page.tsx`, prop drill вниз. Client refetch тільки після save (via router.refresh).

5. **Whitelist check у PUT** — backend MUST validate що всі keys у body належать allowed set. Інакше відкритий jsonb endpoint для injection.

6. **Empty config edge case** — якщо user PUT з порожнім items array → treat as "reset to defaults". АБО reject 400. Я обираю reject 400 — менеджер не може випадково втратити налаштування.

7. **Merge logic** — найвразливіше місце. Тести Phase 2 ≥ 4 — обов'язково.

8. **`agent` column** — у multi-select показуй тільки `role IN ('manager', 'admin')` users. Reuse query з admin/users endpoint.

9. **DialogStatus filter** — text exact match (поки що). У V2 буде enum dropdown.

10. **Performance**: indexes у MgrClient покривають більшість фільтрів через M1.3a (`assigned`, `statusGeneral`, etc.). Range фільтри по debt/monthlyVolume — нема індексів, OK для ~10000 клієнтів. Якщо потрібно — індекси через follow-up.
