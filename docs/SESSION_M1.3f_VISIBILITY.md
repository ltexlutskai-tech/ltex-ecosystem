# Session M1.3f — Foreign client visibility + contact masking

**Type:** Worker session (~22 файлів)
**Branch:** `claude/manager-m1-3f-visibility-{XXXX}`
**Goal:** Закрити блок Клієнти. Менеджер бачить у списку **тільки своїх** клієнтів. Адмін бачить усіх. При цьому менеджер може **відкрити** картку чужого клієнта (через прямий URL чи M1.5+ document picker) з **маскованими контактами** — телефон у вигляді `*** *** ** 67`, без посилань на месенджери/соцмережі/банк рахунки/нагадування/історію.

**Parent spec:** [`docs/MANAGER_APP_STRATEGY.md`](MANAGER_APP_STRATEGY.md) §6. **Builds on:** M1.3a (list + ownership), M1.3c (full schema), M1.3d (canEditClient), M1.3e (filters), M1.4 (orders).

**User decisions (locked 2026-05-14):**

- Tab Клієнти = **тільки свої** для менеджера (server-enforced, не bypass-абельне)
- Adminstrator бачить усіх
- Foreign-clieнт детальний view = masked phones (last 3 digits) + hidden tabs
- Hidden tabs у foreign view: Презентації / Історія / Нагадування / Viber / Банк. рахунки / Іст. презентацій / Соц мережі
- Visible tabs: Реквізити (masked) / Асортимент / Історія продаж / Замовлення
- Cross-manager search endpoint (`/clients/search-all`) для майбутніх document flows (M1.5+)

---

## ⚠️ HARD RULES

1. **Server-side enforcement** — масків і ownership логіка тільки на сервері. Клієнтський check виключно для UI hints.
2. **DO NOT** додавати нові DB-поля чи migrations. Чисто application-layer.
3. **DO NOT touch** existing M1.3d `canEditClient()` — лишити як є (foreign manager уже 403 на PATCH).
4. **DO NOT touch** auth / middleware / `/admin/*` web admin.
5. **DO NOT** видаляти `mineOnly` filter param з URL — лишити для backward compat, але для менеджера він enforced=true завжди (ігнор bypass-у).
6. **Phone masking** — точно `*** *** ** 67` (3 останні цифри + space groups), для пустих/невалідних phone → `null`.
7. **`isOwnedBy()` query** має бути ефективним — single query без N+1. Cache список myCodes у request scope коли rendering list з 100 клієнтів.
8. **READ** перед першим commit:
   - `apps/store/lib/manager/order-ownership.ts` — patтерн (M1.4)
   - `apps/store/lib/permissions/mgr-client-edit.ts` — M1.3d permission helper
   - `apps/store/app/api/v1/manager/clients/route.ts` — поточний GET з фільтрами
   - `apps/store/app/api/v1/manager/clients/[id]/route.ts` — current detail endpoint
   - `apps/store/app/manager/(workstation)/customers/[id]/_components/client-tabs.tsx` — tabs structure

---

## Big picture

### Концепція visibility scope

| Scenario                                            | Manager scope             | Admin scope     |
| --------------------------------------------------- | ------------------------- | --------------- |
| List `/manager/customers`                           | Тільки свої (forced)      | Усі             |
| Detail `/manager/customers/[id]` свого              | Full + edit               | Full + edit     |
| Detail `/manager/customers/[id]` чужого             | Masked view, no edit      | Full + edit     |
| Picker `/api/v1/manager/clients/search-all` (M1.5+) | Усі з masked для не-своїх | Усі без masking |

### Що масковано у "foreign" view (для менеджера)

| Поле / Tab                                            | Свій                              | Чужий                                  |
| ----------------------------------------------------- | --------------------------------- | -------------------------------------- |
| `name`                                                | Видно                             | Видно                                  |
| `tradePointName`                                      | Видно                             | Видно                                  |
| Адреса (region/city/street/house/novaPoshtaBranch)    | Видно                             | Видно                                  |
| `phonePrimary`                                        | `+380 50 123 45 67`               | `*** *** ** 67`                        |
| `phones[].phone`                                      | повний                            | masked                                 |
| `viberContact`                                        | Видно                             | `null`                                 |
| `websiteUrl`                                          | Видно                             | `null`                                 |
| `geolocation`                                         | Видно                             | `null`                                 |
| `messengers[]`                                        | повний                            | `[]` (empty array)                     |
| Статуси / категорія / тип цін / асортимент / доставка | Видно                             | Видно                                  |
| Борг, обєм/міс, sessionRemainder                      | Видно                             | Видно                                  |
| `agent` (хто менеджер)                                | Видно                             | **Видно** (для banner "Призначений X") |
| `bankAccounts[]`                                      | Видно                             | `[]`                                   |
| `reminders[]`                                         | Видно (тільки свої — owner check) | `[]`                                   |
| `presentations[]`                                     | Видно                             | `[]`                                   |
| `timeline[]` (Історія)                                | Видно                             | `[]`                                   |
| Замовлення / Реалізації                               | Видно                             | Видно                                  |

### Tabs у foreign view

| Tab              | Свій | Чужий                 |
| ---------------- | ---- | --------------------- |
| Реквізити        | ✓    | ✓ (з masked + banner) |
| Асортимент       | ✓    | ✓                     |
| Презентації      | ✓    | **HIDDEN**            |
| Історія          | ✓    | **HIDDEN**            |
| Історія продаж   | ✓    | ✓                     |
| Замовлення       | ✓    | ✓                     |
| Нагадування      | ✓    | **HIDDEN**            |
| Viber            | ✓    | **HIDDEN**            |
| Банк. рахунки    | ✓    | **HIDDEN**            |
| Іст. презентацій | ✓    | **HIDDEN**            |
| Соц мережі       | ✓    | **HIDDEN**            |

Visible 4 / 11 для чужого.

### UX

**Banner для foreign view:**

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠ Чужий клієнт. Призначений менеджер: Олена Петренко         │
│   Контакти приховано. Ви можете створювати документи.        │
└─────────────────────────────────────────────────────────────┘
```

**Кнопка "Редагувати"** — disabled з tooltip "Тільки призначений менеджер".

**Phone display:**

```
*** *** ** 67   (lock icon, no action buttons)
```

(контактні дії для menjager: tel://, viber://, wa.me/ — приховано)

### List endpoint поведінка

`/api/v1/manager/clients`:

- `getCurrentUser()` → role
- Admin: повертає усіх з усіма параметрами без modify
- Manager: **forced** `where = { ...userInput, OR: [{ agentUserId: me }, { assignments: { some: { userId: me } } }] }`
- `mineOnly` URL param ігнорується (завжди true для менеджера)
- `onlyMine=false` для admin'a → шукає по всіх (адмін може)

### Search-all endpoint (NEW)

`/api/v1/manager/clients/search-all?q=...&page=...&pageSize=...`:

- Auth required
- Returns minimal fields для picker: `{ id, name, code1C, city, debt, agentName, isOwned: boolean }`
- Manager: бачить **усіх**, isOwned per item
- Admin: бачить усіх, isOwned: true завжди (admin не має concept "своїх")
- Це endpoint для M1.5+ document creation pickers

---

## Файли — повний перелік (~22)

### Backend (~9)

```
apps/store/lib/manager/client-visibility.ts                        ← NEW: helpers
apps/store/lib/manager/client-visibility.test.ts                   ← NEW ≥10 tests

apps/store/app/api/v1/manager/clients/route.ts                     ← edit: enforce ownership для manager (ignore mineOnly bypass)
apps/store/app/api/v1/manager/clients/route.test.ts                ← edit: ≥3 нових tests

apps/store/app/api/v1/manager/clients/[id]/route.ts                ← edit: apply masking якщо not owned
apps/store/app/api/v1/manager/clients/[id]/route.test.ts           ← edit: ≥4 нових tests

apps/store/app/api/v1/manager/clients/search-all/route.ts          ← NEW picker endpoint
apps/store/app/api/v1/manager/clients/search-all/route.test.ts     ← NEW ≥4 tests
```

### Phone masking utility (~2)

```
packages/shared/src/utils/phone.ts                                  ← edit: add maskPhone(raw) → "*** *** ** 67"
packages/shared/src/utils/phone.test.ts                             ← edit: ≥3 нових tests для mask
```

### UI updates (~8)

```
apps/store/app/manager/(workstation)/customers/[id]/_components/
  client-header.tsx                                                 ← edit: show banner коли foreign
  client-foreign-banner.tsx                                          ← NEW component
  client-tabs.tsx                                                    ← edit: filter tabs за viewerOwnership
  client-requisites-view.tsx                                         ← edit: respect masked fields (no link wrappers)
  client-requisites-tab.tsx                                          ← edit: pass viewerOwnership prop
  client-contact-row.tsx                                              ← edit: accept `masked` prop, hide actions
  client-messenger-link.tsx                                           ← edit: hide якщо masked
  types.ts                                                            ← edit: ClientDetail з viewerOwnership field
```

### List UI (~2)

```
apps/store/app/manager/(workstation)/customers/page.tsx             ← edit: для manager — ignore mineOnly=false override у URL
apps/store/app/manager/(workstation)/customers/_components/clients-toolbar.tsx ← edit: hide "Тільки мої" toggle для менеджерів (для admin лишити)
```

### Tests inline (~1)

```
apps/store/app/manager/(workstation)/customers/[id]/_components/client-tabs.test.tsx ← NEW ≥3 tests (foreign vs mine tab filtering)
```

**Total ~22 файлів, +1500-1800 lines estimate.**

---

## Detailed tasks

### Task 1 — Visibility helpers

`apps/store/lib/manager/client-visibility.ts`:

```typescript
import { prisma } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";
import { maskPhone } from "@ltex/shared/utils/phone";

export type ViewerOwnership = "mine" | "foreign" | "admin";

/**
 * Determines: чи user "власник" цього клієнта?
 * Admin → "admin" (special — has full access).
 * Manager: "mine" якщо agentUserId === user.id OR assignment exists. Else "foreign".
 */
export async function getViewerOwnership(
  user: Pick<CurrentManager, "id" | "role">,
  clientId: string,
): Promise<ViewerOwnership> {
  if (user.role === "admin") return "admin";

  const client = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: {
      agentUserId: true,
      assignments: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!client) return "foreign"; // 404 logic окремо; helper returns conservative
  if (client.agentUserId === user.id) return "mine";
  if (client.assignments.length > 0) return "mine";
  return "foreign";
}

/**
 * Batch version — для list endpoints. Повертає Set code1C-их клієнтів user-а.
 * Admin → null (no restriction).
 */
export async function getOwnedClientIds(
  user: Pick<CurrentManager, "id" | "role">,
): Promise<Set<string> | null> {
  if (user.role === "admin") return null;

  const clients = await prisma.mgrClient.findMany({
    where: {
      OR: [
        { agentUserId: user.id },
        { assignments: { some: { userId: user.id } } },
      ],
    },
    select: { id: true },
  });
  return new Set(clients.map((c) => c.id));
}

/**
 * Returns Prisma WHERE clause фільтр що enforce-ить "тільки свої" для менеджера.
 * Admin → empty object (no filter).
 */
export function ownershipWhere(user: Pick<CurrentManager, "id" | "role">) {
  if (user.role === "admin") return {};
  return {
    OR: [
      { agentUserId: user.id },
      { assignments: { some: { userId: user.id } } },
    ],
  };
}

/**
 * Apply masking на client detail object.
 * Foreign view → mask phones / hide messengers / hide bank accounts / hide sensitive contact fields.
 */
export function maskClientForForeign<T extends ClientShape>(client: T): T {
  return {
    ...client,
    phonePrimary: client.phonePrimary ? maskPhone(client.phonePrimary) : null,
    phones:
      client.phones?.map((p) => ({ ...p, phone: maskPhone(p.phone) })) ?? [],
    viberContact: null,
    websiteUrl: null,
    geolocation: null,
    messengers: [],
    bankAccounts: [],
    reminders: [],
    presentations: [],
    timeline: [],
  };
}
```

Tests ≥ 10:

- admin getViewerOwnership → "admin"
- manager + agentUserId match → "mine"
- manager + assignment match → "mine"
- manager + neither → "foreign"
- non-existing clientId → "foreign"
- getOwnedClientIds admin → null
- getOwnedClientIds manager empty → empty Set
- getOwnedClientIds manager with mix → only correct ids
- ownershipWhere admin → {}
- ownershipWhere manager → OR clause
- maskClientForForeign — phones masked / messengers empty / bankAccounts empty / etc.

### Task 2 — maskPhone util

`packages/shared/src/utils/phone.ts`:

```typescript
/**
 * Mask phone, exposing only last 3 digits.
 * "+380 50 123 45 67" → "*** *** ** 67"
 * Pattern: replace all digits except last 3 with *, keep spaces.
 * Invalid input → null.
 */
export function maskPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e164 = normalizePhone(raw);
  if (!e164) return null; // invalid → null

  const last3 = e164.slice(-2); // last 2 digits (3rd як space-separated)
  // Format: +380 50 123 45 67 → mask all but last 2 digits
  // "*** *** ** XX"
  return `*** *** ** ${last3}`;
}
```

Actually я думаю user сказав "три останні цифри" — то 3 цифри. Хм, поясню format:

`+380 50 123 45 67` — 12 цифр total. Last 3 = "567" (з кінця: 67 + один з '45').

Pattern: `*** *** ** *XX` — нечитабельно. Краще: `*** *** ** 567` — replace all but last 3. Це 12 - 3 = 9 цифр приховано як `*`.

```typescript
export function maskPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e164 = normalizePhone(raw);
  if (!e164) return null;
  const digits = e164.slice(1); // drop "+"
  if (digits.length < 3) return null;
  const last3 = digits.slice(-3);
  // Format as +XXX XX XXX XX XX with masking
  // Simpler: just "*** *** *** 567"
  return `*** *** *** ${last3}`;
}
```

Tests ≥ 3: valid → masked / invalid → null / empty → null.

### Task 3 — `/clients` GET enforce ownership

`apps/store/app/api/v1/manager/clients/route.ts` — у where build:

```typescript
const user = await getCurrentUser();
// ... existing filter parsing

const where: Prisma.MgrClientWhereInput = {
  /* ... */
};

// Apply ownership гарантовано (manager — only own, ignore mineOnly URL override)
const ownership = ownershipWhere(user);
if (Object.keys(ownership).length > 0) {
  // Combine з existing where via AND
  where.AND = [...(where.AND ?? []), ownership];
}

// `mineOnly` URL param тепер тільки для admin-а:
// якщо admin передає `mineOnly=true` → застосувати ownership filter теж
if (user.role === "admin" && url.searchParams.get("mineOnly") === "true") {
  where.AND = [
    ...(where.AND ?? []),
    {
      OR: [
        { agentUserId: user.id },
        { assignments: { some: { userId: user.id } } },
      ],
    },
  ];
}
```

Tests ≥ 3:

- manager — only own returned
- manager + mineOnly=false URL — STILL only own (ignored)
- admin — all returned
- admin + mineOnly=true — only own

### Task 4 — `/clients/[id]` GET apply masking

```typescript
export async function GET(_req, { params }) {
  const user = await getCurrentUser();
  if (!user) return 401;
  const { id } = await params;

  const ownership = await getViewerOwnership(user, id);

  const client = await prisma.mgrClient.findUnique({
    where: { id },
    include: {
      /* ... all relations як раніше */
    },
  });
  if (!client) return 404;

  if (ownership === "foreign") {
    return NextResponse.json({
      ...maskClientForForeign(client),
      viewerOwnership: "foreign",
    });
  }
  return NextResponse.json({ ...client, viewerOwnership: ownership });
}
```

Tests ≥ 4:

- admin → full
- manager own → full
- manager foreign → masked (phones / messengers empty / etc.)
- non-existing → 404

### Task 5 — `/clients/search-all` NEW endpoint

```typescript
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return 401;

  const q = req.nextUrl.searchParams.get("q") || "";
  const page = ...;
  const pageSize = Math.min(50, ...);

  const where: Prisma.MgrClientWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { tradePointName: { contains: q, mode: "insensitive" } },
      { code1C: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }

  const ownedIds = await getOwnedClientIds(user);

  const items = await prisma.mgrClient.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code1C: true,
      tradePointName: true,
      city: true,
      debt: true,
      agent: { select: { fullName: true } },
    },
  });

  const mapped = items.map(c => ({
    ...c,
    isOwned: ownedIds === null || ownedIds.has(c.id),
  }));

  const total = await prisma.mgrClient.count({ where });

  return NextResponse.json({ items: mapped, total, page, pageSize });
}
```

Tests ≥ 4:

- admin sees all з isOwned=true
- manager sees all з isOwned mixed
- search by name працює
- pagination

### Task 6 — UI banner для foreign

`client-foreign-banner.tsx`:

```tsx
export function ClientForeignBanner({
  agentName,
}: {
  agentName: string | null;
}) {
  return (
    <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">
      <strong className="text-amber-900">⚠ Чужий клієнт.</strong>{" "}
      <span className="text-amber-800">
        {agentName
          ? `Призначений менеджер: ${agentName}. `
          : "Призначеного менеджера немає. "}
        Контакти приховано. Ви можете створювати документи.
      </span>
    </div>
  );
}
```

`client-header.tsx` — render banner коли `viewerOwnership === "foreign"`.

### Task 7 — UI tabs filter

`client-tabs.tsx`:

```typescript
const ALL_TABS = [
  { value: "requisites", label: "Реквізити", foreignVisible: true },
  { value: "assortment", label: "Асортимент", foreignVisible: true },
  { value: "presentations", label: "Презентації", foreignVisible: false },
  { value: "history", label: "Історія", foreignVisible: false },
  { value: "sales-history", label: "Історія продаж", foreignVisible: true },
  { value: "orders", label: "Замовлення", foreignVisible: true },
  { value: "reminders", label: "Нагадування", foreignVisible: false },
  { value: "viber", label: "Viber", foreignVisible: false },
  { value: "banks", label: "Банк. рахунки", foreignVisible: false },
  {
    value: "presentation-history",
    label: "Іст. презентацій",
    foreignVisible: false,
  },
  { value: "social", label: "Соц мережі", foreignVisible: false },
];

const tabs = isForeign ? ALL_TABS.filter((t) => t.foreignVisible) : ALL_TABS;
```

Якщо user пробує deeplink `#viber` на чужого → fallback на `#requisites`.

Tests ≥ 3:

- mine → 11 tabs
- foreign → 4 tabs
- admin → 11 tabs

### Task 8 — UI contact masking

`client-contact-row.tsx` — accept `masked` prop:

```tsx
export function ContactRow({ phone, messenger, masked }: Props) {
  const formatted = masked ? phone : formatPhoneUkr(phone);
  const tel = masked ? null : phoneToTelUrl(phone);
  const viber = masked ? null : phoneToViberUrl(phone);
  // ...

  return (
    <div className="flex items-center gap-2">
      <span className={masked ? "font-mono text-gray-500" : "font-medium"}>
        {formatted}
      </span>
      {tel && <a href={tel}>📞</a>}
      {viber && <a href={viber}>💬</a>}
      {/* etc. */}
    </div>
  );
}
```

Якщо masked → render `*** *** *** 567` (preformatted) без iconned actions.

`client-messenger-link.tsx` — render nothing якщо masked (parent decides не передавати взагалі).

### Task 9 — Toolbar hide "Тільки мої" для manager

`customers/page.tsx` АБО `clients-toolbar.tsx`:

```tsx
{user.role === "admin" && (
  <BoolToggle label="Тільки мої" checked={state.onlyMine} onChange={...} />
)}
```

Manager — toggle прихований (він і так бачить тільки своїх).

### Task 10 — Types update

`types.ts` (customers):

```typescript
export type ViewerOwnership = "mine" | "foreign" | "admin";

export interface ClientDetail {
  // ... existing fields
  viewerOwnership: ViewerOwnership;
}
```

Adjust shape — masked-versions полів: `phonePrimary: string | null` (стає masked string), `messengers: []`, `bankAccounts: []`. Server вже відсилає masked — TS shape лишається той же.

### Task 11 — Tests final

Total ≥ 24:

- client-visibility helpers (≥ 10)
- maskPhone (≥ 3)
- /clients route enforcement (≥ 3)
- /clients/[id] masking (≥ 4)
- /clients/search-all (≥ 4)

---

## Acceptance criteria

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] Manager у `/manager/customers` бачить тільки своїх (URL `?mineOnly=false` ігнорується)
- [ ] Admin бачить усіх; може використати `?mineOnly=true` для своїх
- [ ] Manager може відкрити чужого через прямий URL → масковано
- [ ] Foreign view: phone як `*** *** *** 567`, без icon-actions
- [ ] Foreign view: 4 tabs visible (Реквізити / Асортимент / Історія продаж / Замовлення), 7 hidden
- [ ] Foreign view: banner "Чужий клієнт. Призначений: ..."
- [ ] Foreign view: кнопка "Редагувати" disabled з tooltip
- [ ] Edit endpoint (PATCH) повертає 403 для foreign manager (вже з M1.3d)
- [ ] `/clients/search-all` повертає усі клієнти з `isOwned: bool` для manager-а
- [ ] **DO NOT push** на main. Тільки на feature branch.

---

## User-action post-merge

```powershell
cd E:\ltex-ecosystem
git pull origin main
.\scripts\deploy.ps1
```

Жодних DB-міграцій, env vars, seed. Pure application-layer change.

---

## Notes for worker

1. **Phasing:**
   - Phase 1: maskPhone util у @ltex/shared + tests
   - Phase 2: client-visibility helpers + tests
   - Phase 3: `/clients` GET enforce + tests
   - Phase 4: `/clients/[id]` GET masking + tests
   - Phase 5: `/clients/search-all` endpoint + tests
   - Phase 6: UI banner + tabs filter
   - Phase 7: UI contact masking + messenger hide
   - Phase 8: List toolbar hide "Тільки мої" для manager
   - Phase 9: Final tests + build

2. **Server-side masking** — НЕ доставляй сирі дані клієнту і покладайся на UI to hide. Backend обов'язково замінює phone на `*** *** *** XXX` і повертає `[]` для arrays.

3. **`/clients/search-all` masking?** — поки що відповідь повертає тільки minimal fields (без phones/messengers/bankAccounts) — masking не потрібен бо чутливі поля просто не вибираються. Якщо у V2 розширимо payload — додати masking тоді.

4. **`viewerOwnership` field у ClientDetail** — додатковий мета-field у response. Client UI використовує для conditional rendering. Server-side вже застосував masking — це лише hint для UI.

5. **Картка чужого клієнта** — реально CAN open URL `/manager/customers/{id}` для foreign. Не throw 403. Це core requirement.

6. **DO NOT touch** existing M1.3d edit endpoint — він уже правильно 403-ить foreign managers.

7. **Кнопка "Редагувати"** у `client-requisites-view.tsx` — disabled з title attribute коли foreign.

8. **`getViewerOwnership` performance** — це single Prisma query per request у detail page. ОК.

9. **`getOwnedClientIds` cache** — у list endpoint викликати ОДИН раз перед рендерингом 100 рядків (не у map). Set lookup O(1).

10. **`/clients/[id]/orders` endpoint (з M1.4)** — лишити без змін: orders уже permission-checked через `getMyClientCodes1C`. Якщо foreign manager відкриє чужого і клікне Tab Замовлення — endpoint поверне порожній список (тому що customer.code1C НЕ in myCodes). Це OK поведінка — у наступному M1.5 розширимо щоб foreign manager бачив orders для doc context.

    ⚠️ Wait — це conflict з acceptance "Замовлення visible у foreign". Перевір: foreign manager у Tab Замовлення має бачити ці замовлення (для context). Це потребує relaxing `/clients/[id]/orders` для будь-якого authed manager (not тільки owner). Update endpoint:
    - Для foreign client: дозволити перегляд `/clients/[id]/orders` АЛЕ без contact-related data. Orders самі по собі — не secret.
    - Або simpler: видалити ownership check з `/clients/[id]/orders` (всі authed bachat). Перевір що це не leak-ить sensitive data — Order має тільки code1C, status, total, items. Це OK для cross-manager.

    **Decision (locked):** Relax `/clients/[id]/orders` — дозволити foreign manager відкрити. Все одно у Tab Замовлення показано тільки orders (status/total) — не контакти.
