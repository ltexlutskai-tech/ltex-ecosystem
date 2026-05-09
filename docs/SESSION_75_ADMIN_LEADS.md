# Session 75 — Admin leads dashboard

**Type:** Worker session
**Branch:** `claude/admin-leads-{XXXX}`
**Goal:** Розширити `/admin/customers` так, щоб менеджер бачив всіх leads з S73 (web login phone+name), фільтрував по orders / no-orders, експортував CSV.

---

## ⚠️ HARD RULES

1. **DO NOT change Customer schema.** Фічі через query/derived metrics.
2. **DO NOT touch existing customer CRUD у admin.** Тільки розширюй list view.
3. CSV export — server-side only через response stream чи download. НЕ через client-side blob (PII у memory).
4. Reuse existing admin layout / patterns (`/admin/orders`, `/admin/lots` table layouts).

---

## Current state

`apps/store/app/admin/customers/` — exists, basic CRUD list. Перевір що показує і чого бракує. Не чіпай existing CRUD форми.

---

## Tasks

### 1. Розширити `lib/admin-stats.ts` (або новий `lib/admin-customers.ts`)

```typescript
export interface CustomerListItem {
  id: string;
  phone: string | null;
  name: string;
  email: string | null;
  telegram: string | null;
  city: string | null;
  notes: string | null;
  ordersCount: number;
  ordersTotalUah: number; // sum of total_uah from completed orders
  lastOrderAt: Date | null;
  firstSeenAt: Date; // = createdAt у Customer
  lastUpdatedAt: Date; // = updatedAt
}

export interface CustomerListFilter {
  hasOrders?: boolean; // undefined = all, true = with orders, false = leads-only
  search?: string; // matches phone OR name OR email
  sort?:
    | "first_seen_desc"
    | "last_order_desc"
    | "orders_count_desc"
    | "name_asc";
  page?: number;
  pageSize?: number;
}

export async function listCustomers(filter: CustomerListFilter): Promise<{
  items: CustomerListItem[];
  total: number;
}> {
  // Use prisma.customer.findMany with _count on orders.
  // For ordersTotalUah — aggregate Order.totalUah by customerId in a separate query
  // and merge in JS (бо Prisma include не дає aggregate field).
}
```

### 2. Update `apps/store/app/admin/customers/page.tsx`

Нові UI controls (зверху):

- **Search input** — debounced 300ms, query param `q=`
- **Filter tabs** — "Всі" / "Лідери (з замовленнями)" / "Тільки леди (без замовлень)"
- **Sort select** — 4 options
- **Pagination** — 50/page

Table columns:
| Phone | Name | Email/TG/City | First seen | Last order | Orders | Total UAH |
| `+380...` | "Іван" | "ivan@... · @ivan_tg · Луцьк" | "2026-05-07 15:23" | "2026-05-09" or "—" | 3 | 4,500 ₴ |

Row click → existing `/admin/customers/[id]/edit` (якщо є) або просто modal/details.

Header:

- "Всього: N customers"
- "З яких leads (без замовлень): K"
- "З замовленнями: M"
- Button **"Експорт CSV"**

### 3. CSV export `apps/store/app/admin/customers/export/route.ts`

```typescript
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listCustomers } from "@/lib/admin-customers";

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const filter = {
    hasOrders:
      url.searchParams.get("hasOrders") === "true"
        ? true
        : url.searchParams.get("hasOrders") === "false"
          ? false
          : undefined,
    search: url.searchParams.get("q") || undefined,
    pageSize: 10000, // export all matching, no pagination
  };

  const { items } = await listCustomers(filter);

  const csvLines = [
    [
      "Phone",
      "Name",
      "Email",
      "Telegram",
      "City",
      "FirstSeen",
      "LastOrder",
      "OrdersCount",
      "TotalUAH",
    ].join(","),
    ...items.map((c) =>
      [
        c.phone ?? "",
        `"${(c.name ?? "").replace(/"/g, '""')}"`,
        c.email ?? "",
        c.telegram ?? "",
        `"${(c.city ?? "").replace(/"/g, '""')}"`,
        c.firstSeenAt.toISOString(),
        c.lastOrderAt?.toISOString() ?? "",
        c.ordersCount,
        c.ordersTotalUah.toFixed(2),
      ].join(","),
    ),
  ].join("\n");

  return new NextResponse(csvLines, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ltex-customers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
```

UI в page — `<a href="/admin/customers/export?hasOrders=...">Експорт CSV</a>` (preserve current filter в href).

### 4. Tests

`lib/admin-customers.test.ts`:

- listCustomers без filter повертає всіх
- `hasOrders=true` повертає тільки тих хто має >=1 Order
- `hasOrders=false` повертає тільки тих хто має 0 Orders
- search "+380" matches by phone substring
- sort `orders_count_desc` працює
- pagination shape

---

## Acceptance criteria

- [ ] `pnpm format:check`/`typecheck`/`test`/`build` зелені
- [ ] `lib/admin-customers.ts` (or extension of admin-stats.ts) з типами + listCustomers
- [ ] `/admin/customers` page показує: search, 3 filter tabs, sort, pagination, CSV button, table з 7 колонок
- [ ] `/admin/customers/export` стрім CSV з UTF-8 header + filter forwarding
- [ ] Existing CRUD не зламаний
- [ ] 4+ unit tests
- [ ] Push на `claude/admin-leads-{XXXX}` (НЕ merge!)

---

## User-action post-merge

`.\scripts\deploy.ps1` — тільки redeploy, без env/migration

---

## Reference

- `apps/store/app/admin/customers/` — existing list/CRUD
- `apps/store/lib/admin-stats.ts` — pattern для admin queries
- `apps/store/app/admin/orders/page.tsx` — pattern для filter/sort/pagination tables
- `packages/db/prisma/schema.prisma` — Customer (line ~147), Order
