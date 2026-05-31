# Session M1.4 — Вкладка Замовлення + Global Orders Page

**Type:** Worker session (~25 файлів)
**Branch:** `claude/manager-m1-4-orders-{XXXX}`
**Goal:** (1) Replace stub Tab "Замовлення" у картці клієнта на real list замовлень цього клієнта; (2) Створити global page `/manager/orders` зі списком усіх замовлень (свої клієнти only для менеджера, всі для адміна). Read-only — створення/редагування у M1.5 (з SOAP write-back).

**Parent spec:** [`docs/MANAGER_APP_STRATEGY.md`](MANAGER_APP_STRATEGY.md) §6. **Builds on:** M1.3a (MgrClient + assignments), M1.3e (view prefs можна reuse), S67 (1С order import).

**User decision (locked 2026-05-14):**

- Спочатку M1.4 (read замовлень), потім M1.3f (visibility/masking)
- M1.4 обмежується **своїми клієнтами** для менеджера. Cross-manager picker — після M1.3f.

---

## ⚠️ HARD RULES

1. **DO NOT** додавати FK `Order.mgrClientId` — JOIN через `MgrClient.code1C === Customer.code1C` (Order → Customer).
2. **DO NOT touch** existing `/admin/orders` (legacy admin UI) — він окремий і працює з тих же даних.
3. **DO NOT touch** S67 1С order import endpoint — read-only consume.
4. **DO NOT** імплементувати "Створити замовлення" як real flow — це M1.5 з SOAP write-back. Зараз — stub button з toast "Створення замовлення зробимо у M1.5".
5. **DO NOT** робити cross-manager search — обмежено своїми клієнтами. Foreign-client picker — M1.3f.
6. **READ** перед першим commit:
   - `packages/db/prisma/schema.prisma` — `Order`, `OrderItem`, `Customer`, `MgrClient` (зокрема `code1C` поля)
   - `apps/store/app/admin/orders/page.tsx` — legacy admin orders UI (для reference на status mapping / display)
   - `apps/store/app/api/sync/orders/import/route.ts` — S67 endpoint (як 1С шле order, що очікувати у даних)
   - `apps/store/app/manager/(workstation)/customers/[id]/_components/client-tabs.tsx` — як replace stub tab

---

## Big picture

### Часті scenarios:

1. **Менеджер заходить у картку свого клієнта → Tab Замовлення** → бачить усі замовлення цього клієнта (свого).
2. **Менеджер у sidebar клікає "Замовлення"** → `/manager/orders` → бачить замовлення усіх своїх клієнтів (зведений список через всі ClientAssignment + agentUserId).
3. **Адмін у sidebar "Замовлення"** → бачить ВСІ замовлення системи.
4. **Менеджер шукає замовлення чужого клієнта** → не може. До M1.3f. Toast "Цей клієнт належить іншому менеджеру".

### Status mapping (з 1С)

Order.status з 1С — рядки `"draft" | "pending" | "approved" | "shipped" | "delivered" | "cancelled"` (вже у use). Map на UI:

| status      | Badge label          | Color  |
| ----------- | -------------------- | ------ |
| `draft`     | Чернетка             | grey   |
| `pending`   | Очікує підтвердження | yellow |
| `approved`  | Підтверджено         | blue   |
| `shipped`   | Відправлено          | indigo |
| `delivered` | Доставлено           | green  |
| `cancelled` | Скасовано            | red    |

### Display fields на сторінці клієнта

```
Tab Замовлення
┌────────────────────────────────────────────────────────────────────┐
│ Замовлення (12)                              + Створити замовлення │
├────────────────────────────────────────────────────────────────────┤
│ № (code1C)  Дата          Статус       Позиції  Сума       Дії    │
│ 000000123   12.05.2026    Підтверджено   8     45 230 ₴   [→]    │
│ 000000119   05.05.2026    Доставлено     5     28 600 ₴   [→]    │
│ ...                                                                │
└────────────────────────────────────────────────────────────────────┘
```

- "[→]" Дії = link на `/manager/orders/[id]` (detail page — stub M1.5 АБО reuse admin)
- "+ Створити замовлення" — toast "M1.5"
- Pagination 10/page (картка — не основний table, маленький list)

### Display fields на global `/manager/orders`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Search...______________] [Статус ▾] [Дата від] [Дата до]                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ № (code1C)  Клієнт              Дата          Статус        Сума       Дії │
│ 000000123   Магазин Соборна     12.05.2026    Підтверджено  45 230 ₴   [→] │
│ 000000122   ФОП Іванов          12.05.2026    Очікує        12 800 ₴   [→] │
│ ...                                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
Pagination: 20/page
```

Filter params:

- `search` — LIKE на code1C OR customer.name
- `status` — single select
- `from` / `to` — ISO date range на createdAt

### Backend logic

**1. `MgrClient → Orders` JOIN:**

```typescript
// Через code1C string match
const orders = await prisma.order.findMany({
  where: {
    customer: { code1C: client.code1C },
  },
  // ...
});
```

⚠️ Якщо `client.code1C` is null → return empty list (не error). Це нормальна ситуація для клієнта що ще не sync-ався з 1С.

**2. "Свої клієнти" фільтр для менеджера:**

```typescript
// Отримати code1C-и моїх клієнтів
const myClients = await prisma.mgrClient.findMany({
  where: {
    OR: [
      { agentUserId: user.id },
      { assignments: { some: { userId: user.id } } },
    ],
    code1C: { not: null },
  },
  select: { code1C: true },
});

const myCode1Cs = myClients.map((c) => c.code1C!);

const orders = await prisma.order.findMany({
  where: {
    customer: { code1C: { in: myCode1Cs } },
    // + status / search / date filters
  },
});
```

⚠️ Якщо у користувача 0 призначених клієнтів → return empty list БЕЗ виконання query з `{ in: [] }` (це Prisma OK для empty array, але optimization).

**3. Permission на одну замовлення (GET single):**

- Admin — завжди ОК
- Manager — ОК тільки якщо `Order.customer.code1C` належить його клієнтам

### Створити замовлення кнопка

Stub:

```tsx
<button
  onClick={() =>
    toast.info("Створення замовлення зробимо у M1.5 (з SOAP write-back у 1С)")
  }
>
  + Створити замовлення
</button>
```

---

## Файли — повний перелік (~25)

### Backend (~8)

```
apps/store/app/api/v1/manager/clients/[id]/orders/route.ts             ← NEW: GET orders для клієнта
apps/store/app/api/v1/manager/clients/[id]/orders/route.test.ts        ← NEW ≥4 tests
apps/store/app/api/v1/manager/orders/route.ts                          ← NEW: GET global list з ownership filter
apps/store/app/api/v1/manager/orders/route.test.ts                     ← NEW ≥6 tests
apps/store/app/api/v1/manager/orders/[id]/route.ts                     ← NEW: GET single з permission
apps/store/app/api/v1/manager/orders/[id]/route.test.ts                ← NEW ≥4 tests
apps/store/lib/manager/order-ownership.ts                               ← NEW: helpers (my-code1Cs / canViewOrder)
apps/store/lib/manager/order-ownership.test.ts                          ← NEW ≥4 tests
apps/store/lib/manager/order-status.ts                                  ← NEW: pure label + color mapping
```

### UI — Tab Замовлення (~5)

```
apps/store/app/manager/(workstation)/customers/[id]/_components/
  client-orders-tab.tsx                                                  ← OVERWRITE з stub на real
  client-orders-list.tsx                                                  ← NEW: list rows
  client-orders-row.tsx                                                   ← NEW: single row
  order-status-badge.tsx                                                  ← NEW shared component
  order-create-button.tsx                                                 ← NEW stub button з toast
```

### UI — Global `/manager/orders` (~7)

```
apps/store/app/manager/(workstation)/orders/page.tsx                     ← OVERWRITE з stub на real
apps/store/app/manager/(workstation)/orders/_components/
  orders-toolbar.tsx                                                       ← NEW: search + status + date filter
  orders-table.tsx                                                          ← NEW: sortable table
  orders-row.tsx                                                            ← NEW
  orders-filter-state.ts                                                    ← NEW: URL ↔ state
  orders-filter-state.test.ts                                               ← NEW ≥4 tests
apps/store/app/manager/(workstation)/orders/[id]/page.tsx                  ← NEW: detail (поки stub M1.5)
```

### UI shared (~2)

```
apps/store/app/manager/(workstation)/_components/empty-state.tsx          ← NEW reusable (для empty lists)
apps/store/app/manager/(workstation)/_components/under-construction.tsx   ← reuse existing
```

### Dashboard stats update (~1)

```
apps/store/app/api/v1/manager/dashboard/stats/route.ts                    ← edit: real ordersToday count замість hardcode
```

**Total ~23-25 файлів, +1500-2000 lines estimate.**

---

## Detailed tasks

### Task 1 — order-ownership helpers

`apps/store/lib/manager/order-ownership.ts`:

```typescript
import { prisma } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";

/**
 * Returns code1C-и усіх клієнтів, призначених на user-а.
 * Admin → null (means "no restriction").
 * Manager → array of code1Cs (можливо empty array → 0 orders видно).
 */
export async function getMyClientCodes1C(
  user: Pick<CurrentManager, "id" | "role">,
): Promise<string[] | null> {
  if (user.role === "admin") return null;

  const clients = await prisma.mgrClient.findMany({
    where: {
      OR: [
        { agentUserId: user.id },
        { assignments: { some: { userId: user.id } } },
      ],
      code1C: { not: null },
    },
    select: { code1C: true },
  });

  return clients.map((c) => c.code1C!).filter(Boolean);
}

/**
 * Check: чи user має право бачити цей конкретний order?
 */
export async function canViewOrder(
  user: CurrentManager,
  orderId: string,
): Promise<boolean> {
  if (user.role === "admin") return true;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customer: { select: { code1C: true } } },
  });
  if (!order?.customer?.code1C) return false;

  const myCodes = await getMyClientCodes1C(user);
  if (myCodes === null) return true;
  return myCodes.includes(order.customer.code1C);
}
```

Tests ≥ 4: admin always true / manager owns / manager not owns / manager with empty list.

### Task 2 — order-status mapping

`apps/store/lib/manager/order-status.ts`:

```typescript
export const ORDER_STATUS_META = {
  draft: { label: "Чернетка", color: "gray" },
  pending: { label: "Очікує підтвердження", color: "yellow" },
  approved: { label: "Підтверджено", color: "blue" },
  shipped: { label: "Відправлено", color: "indigo" },
  delivered: { label: "Доставлено", color: "green" },
  cancelled: { label: "Скасовано", color: "red" },
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS_META;

export function getOrderStatusMeta(status: string) {
  return (
    ORDER_STATUS_META[status as OrderStatus] ?? { label: status, color: "gray" }
  );
}
```

### Task 3 — GET `/clients/[id]/orders`

```typescript
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return 401;

  const { id } = await params;

  // Verify client exists + visibility
  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: {
      id: true,
      code1C: true,
      agentUserId: true,
      assignments: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!client) return 404;

  // Manager: тільки свої клієнти
  if (user.role !== "admin") {
    const isMine =
      client.agentUserId === user.id || client.assignments.length > 0;
    if (!isMine) return 403; // M1.3f розширить це на masked-read
  }

  if (!client.code1C) return NextResponse.json({ items: [], total: 0 });

  const url = new URL(_req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const pageSize = 10;

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where: { customer: { code1C: client.code1C } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where: { customer: { code1C: client.code1C } } }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
```

### Task 4 — GET `/orders` global

```typescript
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return 401;

  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    100,
    Math.max(10, parseInt(url.searchParams.get("pageSize") ?? "20")),
  );

  const where: Prisma.OrderWhereInput = {};

  // Visibility scope
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (myCodes.length === 0) {
      return NextResponse.json({ items: [], total: 0, page, pageSize });
    }
    where.customer = { code1C: { in: myCodes } };
  }

  // Search by code1C OR customer.name
  if (search) {
    where.OR = [
      { code1C: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  // Status
  if (status) where.status = status;

  // Date range
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, code1C: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
```

### Task 5 — GET `/orders/[id]` single

```typescript
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return 401;

  const { id } = await params;
  const ok = await canViewOrder(user, id);
  if (!ok) return 403;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, code1C: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, slug: true } },
          lot: { select: { id: true, barcode: true } },
        },
      },
      shipments: true,
      payments: true,
    },
  });
  if (!order) return 404;

  return NextResponse.json(order);
}
```

### Task 6 — UI Tab Замовлення

`client-orders-tab.tsx` (server component):

```tsx
export async function ClientOrdersTab({ clientId, currentUser }: Props) {
  // Direct prisma (як інші tabs)
  const client = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: { code1C: true },
  });

  if (!client?.code1C) {
    return (
      <EmptyState message="Клієнт ще не sync-ався з 1С — замовлень нема." />
    );
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { customer: { code1C: client.code1C } },
      orderBy: { createdAt: "desc" },
      take: 10, // лише останні — повний список на /manager/orders?clientCode1C=
      include: { _count: { select: { items: true } } },
    }),
    prisma.order.count({ where: { customer: { code1C: client.code1C } } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Замовлення ({total})</h3>
        <OrderCreateButton />
      </div>
      <ClientOrdersList orders={orders} />
      {total > 10 && (
        <Link href={`/manager/orders?clientCode1C=${client.code1C}`}>
          Показати всі ({total}) →
        </Link>
      )}
    </div>
  );
}
```

`client-orders-list.tsx` — таблиця 6 cols, кожен row → `<ClientOrdersRow>`.

### Task 7 — UI Global `/manager/orders` page

```tsx
export default async function ManagerOrdersPage({ searchParams }: Props) {
  const user = await requireManagerOrAdmin();

  const params = await searchParams;
  const search = params.search || "";
  // ... parse інших

  // Fetch list через service helpers (DRY з API endpoint)
  const { items, total } = await fetchOrdersForUser(user, {
    search,
    status,
    from,
    to,
    page,
    pageSize,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Замовлення</h1>
      <OrdersToolbar value={{ search, status, from, to }} />
      <OrdersTable items={items} />
      <Pagination total={total} page={page} pageSize={pageSize} />
    </div>
  );
}
```

`orders-toolbar.tsx` — Search input + Status select + 2 date inputs + apply.

### Task 8 — Order detail page stub

`/manager/orders/[id]/page.tsx`:

```tsx
export default async function ManagerOrderDetailPage({ params }: Props) {
  const user = await requireManagerOrAdmin();
  const { id } = await params;
  const ok = await canViewOrder(user, id);
  if (!ok) notFound(); // 404 для security (без leak)

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { include: { product: true, lot: true } },
      shipments: true,
      payments: true,
    },
  });
  if (!order) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1>Замовлення №{order.code1C ?? "—"}</h1>
        <OrderStatusBadge status={order.status} />
      </header>

      <section className="rounded-lg border bg-white p-5">
        <h2>Клієнт</h2>
        <p>{order.customer.name}</p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2>Позиції ({order.items.length})</h2>
        <table>
          {/* product name / lot barcode / weight / qty / priceEur */}
        </table>
        <p>
          Сума: {order.totalUah} ₴ ({order.totalEur} €)
        </p>
      </section>

      <UnderConstruction
        session="M1.5"
        description="Редагування замовлення + SOAP write-back у 1С — М1.5."
      />
    </div>
  );
}
```

### Task 9 — Dashboard stats update

`apps/store/app/api/v1/manager/dashboard/stats/route.ts` — extend з real ordersToday count:

```typescript
const myCodes = await getMyClientCodes1C(user);
const ordersTodayWhere: Prisma.OrderWhereInput = {
  createdAt: { gte: startOfToday() },
  ...(myCodes !== null ? { customer: { code1C: { in: myCodes } } } : {}),
};
const ordersTodayCount = await prisma.order.count({ where: ordersTodayWhere });
```

Replace `ordersToday: 0` placeholder на real number.

### Task 10 — Tests final

Total ≥ 22:

- order-ownership (≥ 4)
- order-status (≥ 2: known status / unknown fallback)
- clients/[id]/orders route (≥ 4)
- orders global route (≥ 6)
- orders/[id] route (≥ 4)
- orders-filter-state (≥ 4)
- Optional: client-orders-tab snapshot/render (≥ 1)

---

## Acceptance criteria

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] Tab Замовлення показує real list замовлень клієнта (з code1C JOIN)
- [ ] Empty state коли клієнт не sync-ався (code1C is null)
- [ ] "+ Створити замовлення" — toast stub
- [ ] `/manager/orders` показує усі замовлення (admin) / тільки своїх клієнтів (manager)
- [ ] Search працює (code1C + customer.name LIKE)
- [ ] Status filter, date range filter — працюють
- [ ] Pagination 20/page
- [ ] Click row → `/manager/orders/[id]` з detail (read-only)
- [ ] Permission: manager бачить тільки своїх (assignment OR agentUserId)
- [ ] Admin бачить усі замовлення
- [ ] Dashboard stats — real ordersToday count замість hardcode
- [ ] **DO NOT push** на main. Тільки на feature branch.

---

## User-action post-merge

```powershell
cd E:\ltex-ecosystem
git pull origin main
.\scripts\deploy.ps1
```

Жодних DB-міграцій + жодних env vars + жодного seed. Read-only consume з існуючої `Order` таблиці.

---

## Notes for worker

1. **Phasing:**
   - Phase 1: order-ownership + order-status helpers + tests
   - Phase 2: `/clients/[id]/orders` route + tests
   - Phase 3: `/orders` global route + tests
   - Phase 4: `/orders/[id]` single route + tests
   - Phase 5: UI Tab Замовлення + components
   - Phase 6: UI Global page + toolbar + filter state
   - Phase 7: Detail page stub
   - Phase 8: Dashboard stats update
   - Phase 9: Final tests + build

2. **Empty array у Prisma `{ in: [] }`** — це OK (повертає 0 rows). Але optimization — early-return перед query якщо myCodes.length === 0.

3. **MgrClient.code1C is null** — нормальна ситуація для seed-клієнтів (не всі мають code1C). UI має показувати empty state, не error.

4. **`customer.code1C` теж може бути null** — Customer не з 1С (web shop тільки). Order у такому випадку залишиться невидимим для менеджера (бо не може зробити match на null). Це **очікувана поведінка** — менеджер не керує web-замовленнями, тільки 1С-замовленнями.

5. **DO NOT replace `/admin/orders`** — це окремий legacy. Може у V2 буде merge, поки лиш `/manager/orders` додаємо.

6. **DO NOT** імплементувати "Створити" button з real flow. Чітко — stub з toast.

7. **`/manager/orders` дефолтні сортування** — `createdAt DESC` (newest first).

8. **DO NOT touch** M1.3e view-prefs у scope M1.4. Customizable columns на `/manager/orders` — окрема follow-up. Зараз — hardcoded 6 cols.

9. **Permission на single GET** — використовуй `canViewOrder()` helper. Не дублюй logic.

10. **DO NOT** додавати order-status у dictionaries — це фіксований enum у код, не настройка.
