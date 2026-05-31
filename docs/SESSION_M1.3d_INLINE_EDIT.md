# Session M1.3d — Inline editing полів картки клієнта

**Type:** Worker session (~25 файлів)
**Branch:** `claude/manager-m1-3d-card-edit-{XXXX}`
**Goal:** Додати inline-редагування полів картки клієнта у Tab Реквізити. Toggle "Редагувати" → inputs замість text → "Зберегти"/"Скасувати". Усі поля editable крім грошових aggregates (debt/overdueDebt/etc.) і system (code1C/createdAt/lastSyncedAt).

**Parent spec:** [`docs/MANAGER_APP_STRATEGY.md`](MANAGER_APP_STRATEGY.md) §6. **Builds on:** M1.3a (clients schema), M1.3c (full field parity).

**User decision (locked 2026-05-14):**

- **Conflict policy:** Менеджер і 1С обидва редагують усі поля. Last-write-wins. Жодного field-level tracking — sync logic (M1.5) сам розбереться як merge-ити. У M1.3d просто save → DB.
- **Tabular CRUD (phones/messengers/bank accounts/etc.):** OUT OF SCOPE M1.3d. Це окрема follow-up сесія якщо знадобиться. Зараз тільки **scalar** поля.

**Слідуюча сесія M1.3e** = розширені фільтри клієнтів + налаштування колонок/фільтрів під себе. Окрема spec.

---

## ⚠️ HARD RULES

1. **DO NOT touch** existing M1.3a/M1.3c API endpoints крім `/api/v1/manager/clients/[id]` (тут extend з PATCH).
2. **DO NOT touch** Prisma schema — жодних нових полів. Просто edit existing rows.
3. **DO NOT touch** auth / middleware / `/admin/*` web admin.
4. **DO NOT** робити CRUD для tabular (phones / messengers / bank accounts / routes / assortment / presentations) — це інша сесія.
5. **DO NOT** додавати field-level conflict tracking (`manualEditedAt`, jsonb manualEdits) — спрощуємо. Sync logic у M1.5 розбереться.
6. **DO NOT** робити optimistic updates у UI — звичайний save → router.refresh().
7. **READ** перед першим commit:
   - `apps/store/app/manager/(workstation)/customers/[id]/_components/client-requisites-tab.tsx` — поточний render (read-only)
   - `apps/store/app/manager/(workstation)/customers/[id]/_components/types.ts` — `ClientDetail` shape
   - `apps/store/app/api/v1/manager/clients/[id]/route.ts` — поточний GET endpoint (треба extend з PATCH)
   - `packages/db/prisma/schema.prisma` — `MgrClient` model

---

## Big picture

### Editable / read-only fields

| Поле                    | Editable? | Type у формі                                       |
| ----------------------- | --------- | -------------------------------------------------- |
| `name`                  | ✓         | text input                                         |
| `tradePointName`        | ✓         | text input                                         |
| `region`                | ✓         | text input (або select з distinct у M1.3e)         |
| `city`                  | ✓         | text input                                         |
| `street`                | ✓         | text input                                         |
| `house`                 | ✓         | text input                                         |
| `novaPoshtaBranch`      | ✓         | text input                                         |
| `websiteUrl`            | ✓         | url input                                          |
| `geolocation`           | ✓         | text input ("lat,lng" format)                      |
| `viberContact`          | ✓         | tel input                                          |
| `monthlyVolume`         | ✓         | number input (kg)                                  |
| `licenseExpiresAt`      | ✓         | date input                                         |
| `hasNewMessage`         | ✓         | checkbox                                           |
| `isViberLinked`         | ✓         | checkbox                                           |
| `dialogStatus`          | ✓         | text input (поки text — у V2 буде enum)            |
| `statusGeneralId`       | ✓         | select dropdown з `mgr_client_statuses`            |
| `statusOperationalId`   | ✓         | select dropdown                                    |
| `categoryTTId`          | ✓         | select dropdown з `mgr_categories_tt`              |
| `priceTypeId`           | ✓         | select dropdown з `mgr_price_types`                |
| `primaryAssortmentId`   | ✓         | select з `mgr_assortment_codes`                    |
| `deliveryMethodId`      | ✓         | select з `mgr_delivery_methods`                    |
| `searchChannelId`       | ✓         | select з `mgr_search_channels`                     |
| `primaryRouteId`        | ✓         | select з `mgr_routes`                              |
| `agentUserId`           | ✓         | select з `users WHERE role IN ('manager','admin')` |
| `code1C`                | ✗         | read-only (system)                                 |
| `createdAt`             | ✗         | read-only                                          |
| `updatedAt`             | ✗         | read-only                                          |
| `lastSyncedAt`          | ✗         | read-only                                          |
| `debt`                  | ✗         | read-only (aggregate з документів)                 |
| `overdueDebt`           | ✗         | read-only                                          |
| `tovDebt`               | ✗         | read-only                                          |
| `tovOverdueDebt`        | ✗         | read-only                                          |
| `sessionRemainder`      | ✗         | read-only                                          |
| `daysSinceLastPurchase` | ✗         | read-only (computed)                               |

**25 editable + 9 read-only = 34 total scalar fields.**

### UX flow

```
┌──────────────────────────────────────────────────────────┐
│ Tab Реквізити                                  [Редагувати]│
├──────────────────────────────────────────────────────────┤
│ Code:              000005798                              │
│ Назва:             Магазин Соборна                        │
│ Торгова точка:     ТТ-1                                   │
│ ...                                                        │
└──────────────────────────────────────────────────────────┘

           Click [Редагувати] →

┌──────────────────────────────────────────────────────────┐
│ Tab Реквізити                  [Скасувати] [Зберегти]    │
├──────────────────────────────────────────────────────────┤
│ Code:              000005798       (read-only)            │
│ Назва:             [Магазин Соборна____________]          │
│ Торгова точка:     [ТТ-1_________________________]        │
│ Статус:            [Активний ▾]                           │
│ ...                                                        │
└──────────────────────────────────────────────────────────┘

           Click [Зберегти] → PATCH /api/.../[id]
           → on success: router.refresh() + toast "Збережено"
           → on error: toast з повідомленням, лишити edit mode

           Click [Скасувати] → discard local state + back to read mode
                                (якщо є unsaved changes — confirm dialog)
```

### Save flow

1. Client form збирає всі editable fields (default = current values)
2. На save: dirty-check (тільки змінені поля → submit)
3. PATCH body: `{ name?, tradePointName?, ... }` (partial)
4. Server Zod validate, prisma update, return full updated client
5. Client: replace state з server response, exit edit mode, toast success
6. On validation error: toast з message з server, лишити edit mode

### Permission

- **Admin** — може редагувати **будь-якого** клієнта.
- **Manager** — може редагувати тільки своїх (через `ClientAssignment` або `agentUserId === currentUser.id`).
- Якщо менеджер відкриває чужого клієнта (наприклад через спільний фільтр) — кнопка "Редагувати" disabled з tooltip "Тільки призначений менеджер або адмін може редагувати".

### Discard warning

Якщо є unsaved changes і user тисне "Скасувати" → `confirm()` "Скасувати правки?" → так = discard, ні = лишається у edit mode.

Перейменувати "Скасувати" на "Скасувати правки" якщо є dirty changes (visual hint).

---

## Файли — повний перелік (~25)

### Backend (~5)

```
apps/store/app/api/v1/manager/clients/[id]/route.ts                ← extend з PATCH handler
apps/store/app/api/v1/manager/clients/[id]/route.test.ts           ← extend з ≥6 нових тестів для PATCH
apps/store/lib/validations/mgr-client.ts                            ← NEW: Zod schema для PATCH body
apps/store/lib/validations/mgr-client.test.ts                       ← NEW: ≥6 tests
apps/store/lib/permissions/mgr-client-edit.ts                       ← NEW: helper `canEditClient(user, client)`
```

### UI (~15)

```
apps/store/app/manager/(workstation)/customers/[id]/_components/
  client-requisites-tab.tsx                  ← OVERWRITE: split на view-mode + edit-mode
  client-requisites-view.tsx                  ← NEW: read-only render (extracted з прежнього)
  client-requisites-edit.tsx                  ← NEW: form з усіма editable полями
  client-edit-toggle.tsx                      ← NEW: client wrapper, useState mode
  edit-controls/
    edit-text-row.tsx                         ← NEW: label + text input з value/onChange
    edit-textarea-row.tsx                     ← NEW: для address блоку
    edit-number-row.tsx                       ← NEW: для monthlyVolume
    edit-date-row.tsx                         ← NEW: для licenseExpiresAt
    edit-bool-row.tsx                         ← NEW: checkbox
    edit-select-row.tsx                       ← NEW: dropdown (приймає options array)
    edit-user-select-row.tsx                  ← NEW: special для agentUserId (fetch users)
  client-action-buttons.tsx                   ← edit: додати "Скасувати" / "Зберегти" коли edit mode
  types.ts                                    ← extend: додати EditableClientFields union type
```

### Hooks + utils (~3)

```
apps/store/app/manager/(workstation)/customers/[id]/_hooks/
  use-client-edit.ts                          ← NEW: form state + dirty-check + submit
  use-discard-warning.ts                      ← NEW: confirm dialog коли dirty + cancel/leave
apps/store/lib/manager/client-patch-fetch.ts  ← NEW: typed fetcher для PATCH endpoint
```

### Tests (~2 додаткові)

```
apps/store/app/manager/(workstation)/customers/[id]/_hooks/use-client-edit.test.tsx
apps/store/lib/permissions/mgr-client-edit.test.ts
```

---

## Detailed tasks

### Task 1 — Zod validation schema

`apps/store/lib/validations/mgr-client.ts`:

```typescript
import { z } from "zod";

export const mgrClientPatchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  tradePointName: z.string().max(255).nullable().optional(),
  region: z.string().max(100).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  street: z.string().max(255).nullable().optional(),
  house: z.string().max(50).nullable().optional(),
  novaPoshtaBranch: z.string().max(20).nullable().optional(),
  websiteUrl: z.string().url().max(500).nullable().optional().or(z.literal("")),
  geolocation: z.string().max(50).nullable().optional(),
  viberContact: z.string().max(20).nullable().optional(),
  monthlyVolume: z.number().nonnegative().nullable().optional(),
  licenseExpiresAt: z.string().datetime().nullable().optional(),
  hasNewMessage: z.boolean().optional(),
  isViberLinked: z.boolean().optional(),
  dialogStatus: z.string().max(100).nullable().optional(),
  statusGeneralId: z.string().cuid().nullable().optional(),
  statusOperationalId: z.string().cuid().nullable().optional(),
  categoryTTId: z.string().cuid().nullable().optional(),
  priceTypeId: z.string().cuid().nullable().optional(),
  primaryAssortmentId: z.string().cuid().nullable().optional(),
  deliveryMethodId: z.string().cuid().nullable().optional(),
  searchChannelId: z.string().cuid().nullable().optional(),
  primaryRouteId: z.string().cuid().nullable().optional(),
  agentUserId: z.string().cuid().nullable().optional(),
});

export type MgrClientPatchInput = z.infer<typeof mgrClientPatchSchema>;
```

Tests ≥ 6: valid full payload / empty payload / invalid url / invalid date / unknown field rejected / null vs undefined behavior.

### Task 2 — Permission helper

`apps/store/lib/permissions/mgr-client-edit.ts`:

```typescript
import type { User } from "@prisma/client";
import { prisma } from "@ltex/db";

export async function canEditClient(
  user: User,
  clientId: string,
): Promise<boolean> {
  if (user.role === "admin") return true;

  // Manager — only if assigned OR is agent
  const client = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: {
      agentUserId: true,
      assignments: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!client) return false;
  if (client.agentUserId === user.id) return true;
  if (client.assignments.length > 0) return true;
  return false;
}
```

Tests ≥ 4: admin always true / agent true / assigned manager true / unrelated manager false.

### Task 3 — PATCH endpoint

`apps/store/app/api/v1/manager/clients/[id]/route.ts` — додати:

```typescript
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = mgrClientPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Optional: log into timeline що менеджер змінив поля
  // Skip for now — too noisy. Add у V2 якщо потрібно.

  const updated = await prisma.mgrClient.update({
    where: { id },
    data: {
      ...data,
      licenseExpiresAt:
        data.licenseExpiresAt === undefined
          ? undefined
          : data.licenseExpiresAt
            ? new Date(data.licenseExpiresAt)
            : null,
      websiteUrl: data.websiteUrl === "" ? null : data.websiteUrl,
    },
    include: {
      /* same as GET */
    },
  });

  return NextResponse.json(updated);
}
```

Tests ≥ 6:

- happy update text field as admin
- happy update FK field as agent
- 403 unrelated manager
- 400 validation error (invalid url)
- 404 non-existing client
- partial update (тільки 1 поле) — не зачіпає інших

### Task 4 — UI edit toggle wrapper

`client-edit-toggle.tsx` — client component:

```tsx
"use client";
export function ClientEditToggle({
  client,
  dictionaries,
  currentUserRole,
  canEdit,
}: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");

  if (mode === "view") {
    return (
      <ClientRequisitesView
        client={client}
        onEditClick={canEdit ? () => setMode("edit") : undefined}
      />
    );
  }
  return (
    <ClientRequisitesEdit
      client={client}
      dictionaries={dictionaries}
      onCancel={() => setMode("view")}
      onSaved={() => setMode("view")}
    />
  );
}
```

### Task 5 — Edit form

`client-requisites-edit.tsx` — controlled form з усіма 25 editable fields:

```tsx
"use client";
export function ClientRequisitesEdit({
  client,
  dictionaries,
  onCancel,
  onSaved,
}: Props) {
  const { values, isDirty, dirtyKeys, setField, reset } = useClientEdit(client);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useDiscardWarning(isDirty);

  async function handleSave() {
    if (!isDirty) {
      onSaved();
      return;
    }
    setSaving(true);
    try {
      const payload = pickKeys(values, dirtyKeys);
      const res = await patchClient(client.id, payload);
      if (!res.ok) throw new Error(res.error ?? "Save failed");
      toast.success("Збережено");
      router.refresh();
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (isDirty && !confirm("Скасувати правки?")) return;
    reset();
    onCancel();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <div className="flex items-center justify-end gap-2 mb-4">
        <button type="button" onClick={handleCancel} disabled={saving}>
          {isDirty ? "Скасувати правки" : "Скасувати"}
        </button>
        <button type="submit" disabled={!isDirty || saving}>
          {saving ? "Збереження..." : "Зберегти"}
        </button>
      </div>

      {/* Render usі edit-rows */}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-lg border bg-white p-5 shadow-sm sm:grid-cols-2">
        <ReadonlyRow label="Код" value={client.code1C} />
        <ReadonlyRow label="Створений" value={formatDate(client.createdAt)} />

        <EditTextRow
          label="Найменування"
          value={values.name}
          onChange={(v) => setField("name", v)}
          required
        />
        <EditTextRow
          label="Торгова точка"
          value={values.tradePointName}
          onChange={(v) => setField("tradePointName", v)}
        />

        <ReadonlyRow label="Борг" value={<DebtValue value={client.debt} />} />
        <ReadonlyRow
          label="Протерміновано"
          value={<DebtValue value={client.overdueDebt} />}
        />

        <EditSelectRow
          label="Статус"
          value={values.statusGeneralId}
          onChange={(v) => setField("statusGeneralId", v)}
          options={dictionaries.statuses}
        />
        <EditSelectRow
          label="Оперативний статус"
          value={values.statusOperationalId}
          onChange={(v) => setField("statusOperationalId", v)}
          options={dictionaries.statuses}
        />

        <EditSelectRow
          label="Тип цін"
          value={values.priceTypeId}
          onChange={(v) => setField("priceTypeId", v)}
          options={dictionaries.priceTypes}
        />
        <EditSelectRow
          label="Асортимент"
          value={values.primaryAssortmentId}
          onChange={(v) => setField("primaryAssortmentId", v)}
          options={dictionaries.assortments}
        />
        <EditSelectRow
          label="Спосіб доставки"
          value={values.deliveryMethodId}
          onChange={(v) => setField("deliveryMethodId", v)}
          options={dictionaries.deliveryMethods}
        />
        <EditSelectRow
          label="Категорія ТТ"
          value={values.categoryTTId}
          onChange={(v) => setField("categoryTTId", v)}
          options={dictionaries.categoriesTT}
        />

        <EditTextRow
          label="Область"
          value={values.region}
          onChange={(v) => setField("region", v)}
        />
        <EditTextRow
          label="Місто"
          value={values.city}
          onChange={(v) => setField("city", v)}
        />
        <EditTextRow
          label="Вулиця"
          value={values.street}
          onChange={(v) => setField("street", v)}
        />
        <EditTextRow
          label="Будинок"
          value={values.house}
          onChange={(v) => setField("house", v)}
        />

        <EditTextRow
          label="Відділення НП"
          value={values.novaPoshtaBranch}
          onChange={(v) => setField("novaPoshtaBranch", v)}
        />
        <EditTextRow
          label="Сайт"
          value={values.websiteUrl}
          onChange={(v) => setField("websiteUrl", v)}
          type="url"
        />
        <EditTextRow
          label="Геолокація"
          value={values.geolocation}
          onChange={(v) => setField("geolocation", v)}
          placeholder="50.7472,25.3254"
        />
        <EditNumberRow
          label="Обєм за місяць (кг)"
          value={values.monthlyVolume}
          onChange={(v) => setField("monthlyVolume", v)}
        />

        <EditSelectRow
          label="Канал пошуку"
          value={values.searchChannelId}
          onChange={(v) => setField("searchChannelId", v)}
          options={dictionaries.searchChannels}
        />
        <EditTextRow
          label="Контакт Viber"
          value={values.viberContact}
          onChange={(v) => setField("viberContact", v)}
          type="tel"
        />
        <EditUserSelectRow
          label="Торговий агент"
          value={values.agentUserId}
          onChange={(v) => setField("agentUserId", v)}
        />
        <EditDateRow
          label="Ліцензія дійсна до"
          value={values.licenseExpiresAt}
          onChange={(v) => setField("licenseExpiresAt", v)}
        />

        <ReadonlyRow
          label="Залишок сесії"
          value={formatMoney(client.sessionRemainder)}
        />
        <ReadonlyRow
          label="Оновлено з 1С"
          value={
            client.lastSyncedAt ? formatDateTime(client.lastSyncedAt) : "—"
          }
        />

        <EditSelectRow
          label="Основний маршрут"
          value={values.primaryRouteId}
          onChange={(v) => setField("primaryRouteId", v)}
          options={dictionaries.routes}
        />
        <EditTextRow
          label="Статус діалогу"
          value={values.dialogStatus}
          onChange={(v) => setField("dialogStatus", v)}
        />

        <EditBoolRow
          label="Нове повідомлення"
          value={values.hasNewMessage}
          onChange={(v) => setField("hasNewMessage", v)}
        />
        <EditBoolRow
          label="Підписаний у Viber"
          value={values.isViberLinked}
          onChange={(v) => setField("isViberLinked", v)}
        />
      </dl>
    </form>
  );
}
```

### Task 6 — Edit-row controls

Кожен `edit-controls/*` — невеликий controlled component. Стандартний Tailwind look:

```tsx
// edit-text-row.tsx
export function EditTextRow({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: Props) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <dt className="w-44 shrink-0 text-gray-500">
        {label}
        {required && <span className="text-red-500">*</span>}:
      </dt>
      <dd className="flex-1">
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          placeholder={placeholder}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        />
      </dd>
    </div>
  );
}
```

Аналогічно: `EditNumberRow` (input type="number" + parseFloat), `EditDateRow` (input type="date"), `EditBoolRow` (checkbox), `EditSelectRow` (`<select>` з options), `EditUserSelectRow` (fetch `/api/v1/manager/admin/users` → only role∈{manager,admin}).

### Task 7 — useClientEdit hook

`use-client-edit.ts`:

```typescript
export function useClientEdit(client: ClientDetail) {
  const initial = useMemo(() => extractEditableFields(client), [client]);
  const [values, setValues] = useState(initial);

  const dirtyKeys = useMemo(() => {
    const keys: string[] = [];
    for (const k of Object.keys(initial) as (keyof typeof initial)[]) {
      if (!isEqual(initial[k], values[k])) keys.push(k as string);
    }
    return keys;
  }, [initial, values]);

  const isDirty = dirtyKeys.length > 0;

  const setField = useCallback(
    <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const reset = useCallback(() => setValues(initial), [initial]);

  return { values, isDirty, dirtyKeys, setField, reset };
}
```

Tests ≥ 4: initial state / setField updates / dirtyKeys correct / reset restores.

### Task 8 — Discard warning hook

`use-discard-warning.ts`:

```typescript
export function useDiscardWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
```

Tests ≥ 1 (hook registers/unregisters).

### Task 9 — Page wiring

`apps/store/app/manager/(workstation)/customers/[id]/page.tsx` — додати:

1. Load dictionaries (reuse existing GET /api/v1/manager/dictionaries — теж приймає `priceTypes`?)
2. Compute `canEdit = await canEditClient(user, id)` server-side
3. Pass `dictionaries` + `canEdit` через props у `<ClientEditToggle>`

### Task 10 — Dictionaries endpoint — додати priceTypes

`apps/store/app/api/v1/manager/dictionaries/route.ts` — extend response з `priceTypes: MgrPriceType[]`. (Якщо вже додано у M1.3c — skip.)

### Task 11 — Tests final

Total ≥ 18:

- Zod schema (6)
- Permission helper (4)
- PATCH endpoint (6)
- useClientEdit hook (4)
- useDiscardWarning (1)
- (опційно) integration test для одного edit flow

---

## Acceptance criteria

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] Кнопка "Редагувати" видима у Реквізити tab (тільки якщо `canEdit`)
- [ ] Click → форма з inputs для 25 editable полів + 9 read-only rows
- [ ] Selects заповнені з dictionaries (status / categoryTT / priceType / etc.)
- [ ] "Торговий агент" — dropdown з менеджерів і адмінів
- [ ] Save: PATCH → router.refresh → toast → exit edit mode
- [ ] Cancel з unsaved → confirm dialog
- [ ] Manager без призначення на клієнта — кнопка "Редагувати" disabled з tooltip
- [ ] Admin — завжди може редагувати
- [ ] Validation error (наприклад invalid URL) — toast з message, лишається у edit mode
- [ ] Жодних змін у tabular частинах (phones/messengers/etc.) — read-only як раніше
- [ ] **DO NOT push** на main. Тільки на feature branch.

---

## User-action post-merge

```powershell
cd E:\ltex-ecosystem
git pull origin main
.\scripts\deploy.ps1
```

Жодних DB-міграцій + жодних env vars + жодного seed. Чистий UI/API change.

---

## Notes for worker

1. **Спрощено:** жодного field-level conflict tracking. Просто PATCH → update → return. Sync у M1.5 розбереться як merge.

2. **Permission check на server.** Frontend `canEdit` — тільки для UI hint (кнопка enabled/disabled). Backend все одно перевіряє через `canEditClient()`. Без цього — security gap.

3. **`agentUserId` change** — тільки admin може. У permission helper зробити окремий guard: якщо у PATCH body є `agentUserId` і user.role !== "admin" → 403. (Це окремий від canEditClient бо менеджер може edit basic info але не reassign себе або колегу.)

4. **Toast** — використовуй existing toast lib з admin pages (`@ltex/ui` має `useToast` або analog). Не створюй нову.

5. **Date input** — `<input type="date">` повертає `YYYY-MM-DD`. Конвертуй у ISO datetime перед submit (`new Date("2026-12-31").toISOString()`).

6. **Number input** — пустий рядок → `null`. Не `0`.

7. **`websiteUrl` empty string** — зберігай як `null` у DB.

8. **DO NOT touch** existing tests які passed (M1.3a/c). Тільки додавай нові.

9. **DO NOT** робити "Зберегти" поки немає dirty changes — disabled + label "Зберегти" (а не "Закрити"). Cancel button у такому разі просто закриває edit mode без confirm.
