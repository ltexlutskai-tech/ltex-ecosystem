# Session M1.5b — POST /orders + UI form + POST /payments + admin sync-jobs UI

**Type:** Worker session (~40 файлів)
**Branch:** `claude/manager-m1-5b-orders-payments-{XXXX}`
**Goal:** Закрити M1.4 "+ Створити замовлення" stub. (1) POST `/api/v1/manager/orders` — створення замовлення з позиціями; (2) UI form `/manager/orders/new` для створення; (3) POST `/api/v1/manager/payments` — створення оплати; (4) enqueue extension — `enqueueOrderCreate` + `enqueuePaymentCreate`; (5) proxy + manager-sync routes для `order` + `payment` entityTypes; (6) admin `/admin/sync-jobs` UI з retry для failed; (7) 1С BSL spec extension — операції `ОбновитиЗамовлення` + `ОбновитиОплату`.

**Parent spec:** `docs/SESSION_M1.5_SYNC_BACKBONE.md` (backbone). **Builds on:** M1.4 (orders list read-only), M1.5 (sync infrastructure).

**User decisions (locked 2026-05-15):**
- M1.5b закриває stub "+ Створити" з M1.4
- Платежі — тільки create (список оплат уже з 1С snapshot, не редагуємо існуючі)
- Order create — без shipment-логіки (це окремо у M1.7+ якщо буде)
- Admin retry UI — поки тільки для failed; cancelled/sent — read-only

---

## ⚠️ HARD RULES

1. **DO NOT** реалізовувати реальний SOAP-call для new operations — все має працювати у mock mode (`SYNC_MOCK_MODE=true` дефолт), як у M1.5.
2. **DO NOT** змінювати схему Order/OrderItem/Payment — використовуй existing fields. Якщо чогось не вистачає (напр. `Order.managerUserId`) — додай **окремою additive migration** і прокоментуй.
3. **DO NOT touch** `services/telegram-bot/` чи `services/viber-bot/`.
4. **DO NOT** змінювати existing `lib/sync/proxy-client.ts` switch без backward-compat для `client` entityType.
5. **DO NOT** туркати `/admin/*` Supabase Auth — `/admin/sync-jobs` теж під тим самим Supabase admin layer (як інші admin pages).
6. **DO NOT** додавати real-1С connection wire-up — це окрема операція юзера post-deploy, поки тільки задокументувати.
7. **READ перед першим commit:**
   - `docs/SESSION_M1.5_SYNC_BACKBONE.md` — попередня spec
   - `apps/store/lib/sync/*` — backbone code
   - `services/manager-sync/src/routes/sync-clients.ts` — pattern для нових routes
   - `apps/store/app/api/v1/manager/orders/route.ts` — M1.4 GET pattern
   - `apps/store/app/api/v1/manager/orders/[id]/route.ts` — M1.4 read detail
   - `apps/store/app/manager/(workstation)/orders/page.tsx` — UI pattern
   - `apps/store/app/(admin)/admin/...` — admin pattern (Supabase auth)
   - `apps/store/app/api/v1/manager/clients/search-all/route.ts` — client picker source (M1.3f)
   - `docs/1C_SYNC_MODULES_SPEC.md` — extend з operations ОбновитиЗамовлення/ОбновитиОплату

---

## Big picture

### Що нового

```
┌─────────────────────────────┐
│  Manager UI                 │
│  /manager/orders/new        │
│                             │
│  • Client picker (autocompl)│
│  • Add items (product+lot)  │
│  • Calculate totals         │
│  • Notes                    │
│  • Submit                   │
└──────────────┬──────────────┘
               │
               ↓ POST
┌─────────────────────────────┐
│  /api/v1/manager/orders     │
│                             │
│  Validate (Zod)             │
│  Ownership check            │
│  Transaction:               │
│    • Create Order           │
│    • Create OrderItems      │
│    • enqueue SyncJob        │
│      (entityType="order")   │
└──────────────┬──────────────┘
               │
               ↓ (через queue + cron + proxy — M1.5 infra)
┌─────────────────────────────┐
│  manager-sync/sync-orders   │
│  ─────────────────────────  │
│  Mock: return ok            │
│  Real: SOAP                 │
│    ОбновитиЗамовлення(...)  │
└─────────────────────────────┘
```

### Order item — lot-bound vs general

З S59 — `OrderItem.lotId` nullable (Migration `20260502_product_attrs_lot_optional`). Тобто item може бути:
- **Bound to lot:** конкретний bag/lot, барcode known, weight fixed → `priceEur = lot.priceEur` (total)
- **General:** менеджер обере вільний лот пізніше → `priceEur = product.price * estWeight`

UI form має дозволити обидва шляхи (radio / toggle per row).

### Payment лайтер scope

- POST `/payments` — `{ orderId, method, amount, currency }` → create Payment + enqueue SyncJob
- НЕ supportable: refund, partial cancel, list edit. Це read-only з 1С snapshot.
- Customer ownership через Order → Customer → code1C (як M1.4)

### Admin sync-jobs UI

`/admin/sync-jobs` (admin Supabase Auth layer):
- Таблиця: id / entityType / entityId / status / attempts / lastError / createdAt
- Filter: status (multi-select)
- Action per row для status='failed': "Retry" button → `POST /api/admin/sync-jobs/[id]/retry` → reset `status='pending'`, `attempts=0`, `nextAttemptAt=now`, `lastError=null`
- Pagination 50/page

---

## Файли — повний перелік (~40)

### POST /orders + tests (5)

```
apps/store/app/api/v1/manager/orders/route.ts                          ← edit: add POST handler
apps/store/app/api/v1/manager/orders/route.test.ts                     ← edit: ≥6 нових тестів для POST
apps/store/lib/validations/manager-order.ts                            ← NEW: Zod schema
apps/store/lib/validations/manager-order.test.ts                       ← NEW ≥5 tests
apps/store/lib/manager/order-create.ts                                 ← NEW: helper для transactional create (Order + items)
apps/store/lib/manager/order-create.test.ts                            ← NEW ≥4 tests
```

### POST /payments + tests (4)

```
apps/store/app/api/v1/manager/payments/route.ts                        ← NEW POST handler
apps/store/app/api/v1/manager/payments/route.test.ts                   ← NEW ≥5 tests
apps/store/lib/validations/manager-payment.ts                          ← NEW Zod
apps/store/lib/validations/manager-payment.test.ts                     ← NEW ≥3 tests
```

### Enqueue + proxy extension (4)

```
apps/store/lib/sync/enqueue.ts                                         ← edit: add enqueueOrderCreate + enqueuePaymentCreate
apps/store/lib/sync/enqueue.test.ts                                    ← edit: ≥4 нових тестів
apps/store/lib/sync/proxy-client.ts                                    ← edit: routing для order/payment
apps/store/lib/sync/proxy-client.test.ts                               ← edit: ≥2 нових тестів
```

### services/manager-sync routes (6)

```
services/manager-sync/src/routes/sync-orders.ts                        ← NEW POST /sync/orders/:id
services/manager-sync/src/routes/sync-orders.test.ts                   ← NEW ≥4 tests (mock + idempotency)
services/manager-sync/src/routes/sync-payments.ts                      ← NEW POST /sync/payments/:id
services/manager-sync/src/routes/sync-payments.test.ts                 ← NEW ≥4 tests
services/manager-sync/src/soap/mock.ts                                 ← edit: додати mockUpdateOrder + mockUpdatePayment
services/manager-sync/src/index.ts                                     ← edit: register нові routes
```

### UI new order form (~10)

```
apps/store/app/manager/(workstation)/orders/new/page.tsx                       ← NEW
apps/store/app/manager/(workstation)/orders/new/_components/order-form.tsx     ← NEW client component (main)
apps/store/app/manager/(workstation)/orders/new/_components/client-picker.tsx  ← NEW (autocomplete з /clients/search-all)
apps/store/app/manager/(workstation)/orders/new/_components/items-editor.tsx   ← NEW (table з add/remove rows)
apps/store/app/manager/(workstation)/orders/new/_components/item-row.tsx       ← NEW (one row form з product/lot picker)
apps/store/app/manager/(workstation)/orders/new/_components/lot-picker.tsx     ← NEW (lots для chosen product)
apps/store/app/manager/(workstation)/orders/new/_components/order-totals.tsx   ← NEW (live calc totalEur/totalUah)
apps/store/app/manager/(workstation)/orders/new/_components/order-form.test.tsx ← NEW ≥3 tests (RTL/UI)
apps/store/app/manager/(workstation)/orders/_components/order-actions.tsx      ← edit: видалити "+ Створити" stub toast, лінк на /manager/orders/new
apps/store/app/manager/(workstation)/customers/[id]/_components/client-orders-tab.tsx ← edit: лінк "+ Створити" на /manager/orders/new?clientId=...
```

### Product/Lot search для items-editor (3)

```
apps/store/app/api/v1/manager/products/search/route.ts                 ← NEW GET ?q=... (autocomplete)
apps/store/app/api/v1/manager/products/search/route.test.ts            ← NEW ≥3 tests
apps/store/app/api/v1/manager/products/[id]/lots/route.ts              ← NEW GET вільні лоти для product
```

### Admin sync-jobs (~5)

```
apps/store/app/(admin)/admin/sync-jobs/page.tsx                        ← NEW server page з server-side data fetch
apps/store/app/(admin)/admin/sync-jobs/_components/sync-jobs-table.tsx ← NEW client component (filter + retry button)
apps/store/app/api/admin/sync-jobs/route.ts                            ← NEW GET (list з filter)
apps/store/app/api/admin/sync-jobs/[id]/retry/route.ts                 ← NEW POST (reset to pending)
apps/store/app/api/admin/sync-jobs/route.test.ts                       ← NEW ≥4 tests
apps/store/app/api/admin/sync-jobs/[id]/retry/route.test.ts            ← NEW ≥3 tests
```

### Documentation (~2)

```
docs/1C_SYNC_MODULES_SPEC.md                                           ← edit: extend з ОбновитиЗамовлення + ОбновитиОплату (+ examples)
docs/M1.5_SYNC_ARCHITECTURE.md                                         ← edit: add note про order/payment entities + admin retry flow
```

**Total ~40 файлів, +3000-3500 lines estimate.**

---

## Detailed tasks

### Task 1 — Zod schemas

`lib/validations/manager-order.ts`:
```typescript
import { z } from "zod";

export const orderItemInputSchema = z.object({
  productId: z.string().min(1),
  lotId: z.string().nullable().optional(),  // null = general (1С обере лот пізніше)
  weight: z.number().positive().max(10_000),
  quantity: z.number().int().positive().max(10_000).default(1),
  priceEur: z.number().nonnegative().max(100_000),
});

export const createOrderSchema = z.object({
  customerId: z.string().min(1),
  notes: z.string().max(2000).optional(),
  exchangeRate: z.number().positive().max(1000).optional(),  // якщо не передано — взяти getCurrentRate()
  items: z.array(orderItemInputSchema).min(1).max(200),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
```

`lib/validations/manager-payment.ts`:
```typescript
import { z } from "zod";

const METHODS = ["cash", "card", "bank_transfer", "online"] as const;

export const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum(METHODS),
  amount: z.number().positive().max(10_000_000),
  currency: z.enum(["UAH", "EUR", "USD"]).default("UAH"),
  externalId: z.string().max(200).optional(),
  paidAt: z.string().datetime().optional(),
});
```

### Task 2 — POST /orders handler

`/api/v1/manager/orders/route.ts` — additionally to existing GET:

```typescript
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Ownership check
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, code1C: true, name: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (!customer.code1C || !myCodes.includes(customer.code1C)) {
      return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
    }
  }

  // Use createOrderHelper з lib/manager/order-create.ts (transactional)
  const created = await createOrderWithItems(input, customer);
  return NextResponse.json(created, { status: 201 });
}
```

### Task 3 — `lib/manager/order-create.ts`

```typescript
import { prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
import { enqueueOrderCreate } from "@/lib/sync/enqueue";
import type { CreateOrderInput } from "@/lib/validations/manager-order";

export async function createOrderWithItems(
  input: CreateOrderInput,
  customer: { id: string; code1C: string | null; name: string },
) {
  const rate = input.exchangeRate ?? (await getCurrentRate());
  const totalEur = input.items.reduce((s, i) => s + i.priceEur, 0);
  const totalUah = totalEur * rate;

  const order = await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        customerId: customer.id,
        status: "draft",
        totalEur,
        totalUah,
        exchangeRate: rate,
        notes: input.notes,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            lotId: i.lotId ?? null,
            priceEur: i.priceEur,
            weight: i.weight,
            quantity: i.quantity,
          })),
        },
      },
      include: { items: true, customer: { select: { id: true, code1C: true, name: true } } },
    });

    return o;
  });

  // Fire-and-forget enqueue (best-effort)
  enqueueOrderCreate(order).catch((e) => {
    console.warn("[L-TEX] Failed to enqueue order sync", {
      orderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    });
  });

  return order;
}
```

### Task 4 — POST /payments

`/api/v1/manager/payments/route.ts`:
```typescript
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const parsed = createPaymentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { customer: { select: { code1C: true } } },
  });
  if (!order) {
    return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });
  }

  // Ownership
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (!order.customer.code1C || !myCodes.includes(order.customer.code1C)) {
      return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
    }
  }

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      method: input.method,
      amount: input.amount,
      currency: input.currency,
      status: "completed",
      externalId: input.externalId,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
    },
  });

  enqueuePaymentCreate(payment).catch((e) => {
    console.warn("[L-TEX] Failed to enqueue payment sync", {
      paymentId: payment.id,
      error: e instanceof Error ? e.message : String(e),
    });
  });

  return NextResponse.json(payment, { status: 201 });
}
```

### Task 5 — enqueue extensions

`lib/sync/enqueue.ts` — add:
```typescript
export async function enqueueOrderCreate(order: Order & { items: OrderItem[]; customer: { code1C: string | null } }) {
  return prisma.mgrSyncJob.create({
    data: {
      entityType: "order",
      entityId: order.id,
      action: "create",
      payload: {
        customerCode1C: order.customer.code1C,
        notes: order.notes,
        totalEur: order.totalEur,
        totalUah: order.totalUah,
        exchangeRate: order.exchangeRate,
        items: order.items.map(i => ({
          productId: i.productId,
          lotId: i.lotId,
          priceEur: i.priceEur,
          weight: i.weight,
          quantity: i.quantity,
        })),
      },
      idempotencyKey: crypto.randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}

export async function enqueuePaymentCreate(payment: Payment) {
  return prisma.mgrSyncJob.create({
    data: {
      entityType: "payment",
      entityId: payment.id,
      action: "create",
      payload: {
        orderId: payment.orderId,
        method: payment.method,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt?.toISOString() ?? null,
      },
      idempotencyKey: crypto.randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}
```

### Task 6 — proxy-client routing

`lib/sync/proxy-client.ts` — extend switch:
```typescript
switch (job.entityType) {
  case "client":
    path = `/sync/clients/${job.entityId}`;
    break;
  case "order":
    path = `/sync/orders/${job.entityId}`;
    break;
  case "payment":
    path = `/sync/payments/${job.entityId}`;
    break;
  default:
    throw new Error(`Unsupported entityType ${job.entityType}`);
}
```

### Task 7 — manager-sync routes для orders + payments

Mirror `sync-clients.ts` pattern:

`services/manager-sync/src/routes/sync-orders.ts`:
```typescript
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config";
import { mockUpdateOrder } from "../soap/mock";
import { updateOrderViaSoap } from "../soap/client";  // якщо є; інакше throw
import { checkAndStoreIdempotencyKey } from "../idempotency";

const bodySchema = z.object({
  idempotencyKey: z.string().uuid(),
  payload: z.record(z.unknown()),
});

export async function syncOrdersRoute(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/orders/:id", async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid body" });

    const { idempotencyKey, payload } = parsed.data;
    const cached = checkAndStoreIdempotencyKey(idempotencyKey);
    if (cached !== null) return cached;

    try {
      const result = config.mockMode
        ? await mockUpdateOrder({ idempotencyKey, data: payload })
        : await updateOrderViaSoap({ idempotencyKey, data: payload });
      checkAndStoreIdempotencyKey(idempotencyKey, result);
      return result;
    } catch (e: any) {
      reply.code(502).send({ ok: false, error: String(e?.message ?? e) });
    }
  });
}
```

Equivalent для payments — `sync-payments.ts`.

`services/manager-sync/src/soap/mock.ts` — add:
```typescript
export async function mockUpdateOrder(payload: { idempotencyKey: string; data: unknown }) {
  await delay();
  return { ok: true, orderCode1C: `MOCK-ORD-${Date.now()}`, mockMode: true };
}

export async function mockUpdatePayment(payload: { idempotencyKey: string; data: unknown }) {
  await delay();
  return { ok: true, paymentCode1C: `MOCK-PMT-${Date.now()}`, mockMode: true };
}
```

`services/manager-sync/src/soap/client.ts` — real SOAP wrappers (mirror updateClientViaSoap pattern, operation names `ОбновитиЗамовлення` + `ОбновитиОплату`).

`services/manager-sync/src/index.ts` — register:
```typescript
app.register(syncClientsRoute, { prefix: "/sync" });
app.register(syncOrdersRoute, { prefix: "/sync" });
app.register(syncPaymentsRoute, { prefix: "/sync" });
```

### Task 8 — UI form `/manager/orders/new`

`page.tsx` (server):
```tsx
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { redirect } from "next/navigation";
import { OrderForm } from "./_components/order-form";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-2xl font-bold">Створити замовлення</h1>
      <OrderForm initialClientId={sp.clientId} />
    </div>
  );
}
```

`_components/order-form.tsx` (client) — state + submit:
```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClientPicker } from "./client-picker";
import { ItemsEditor } from "./items-editor";
import { OrderTotals } from "./order-totals";

export function OrderForm({ initialClientId }: { initialClientId?: string }) {
  const [clientId, setClientId] = useState<string | null>(initialClientId ?? null);
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/manager/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: clientId, items, notes }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Помилка");
        return;
      }
      const order = await res.json();
      router.push(`/manager/orders/${order.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!clientId && items.length > 0 && !submitting;

  return (
    <div className="space-y-6">
      <ClientPicker value={clientId} onChange={setClientId} />
      <ItemsEditor items={items} onChange={setItems} />
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Коментар" className="w-full rounded border p-2" rows={3} />
      <OrderTotals items={items} />
      <button disabled={!canSubmit} onClick={submit} className="rounded bg-green-600 px-6 py-3 text-white disabled:opacity-50">
        Створити замовлення
      </button>
    </div>
  );
}
```

`_components/client-picker.tsx` — debounced search через `/api/v1/manager/clients/search-all?q=`, dropdown з results, `isOwned` chip.

`_components/items-editor.tsx` — список `ItemRow` + add/remove buttons.

`_components/item-row.tsx`:
- Product autocomplete (через `/api/v1/manager/products/search?q=`)
- Lot toggle (radio: "Конкретний лот" vs "Загальна позиція")
- Якщо "Конкретний лот" → `LotPicker` показує вільні лоти для chosen product
- Inputs: weight, quantity, priceEur (auto-fill з product/lot)

`_components/lot-picker.tsx` — fetch `/api/v1/manager/products/[id]/lots?status=free`, dropdown по barcode.

`_components/order-totals.tsx` — live calc `sum(items.priceEur)` → totalEur + totalUah (з `getCurrentRate()` через client-side fetch чи pass з server). Show: `Всього: X € / Y ₴`.

### Task 9 — Product search endpoint

`/api/v1/manager/products/search/route.ts`:
```typescript
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
      ],
      isActive: true,
    },
    select: {
      id: true, name: true, sku: true,
      basePrice: true, weight: true,
    },
    take: 20,
  });
  return NextResponse.json(products);
}
```

`/api/v1/manager/products/[id]/lots/route.ts`:
```typescript
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const { id } = await params;

  const lots = await prisma.lot.findMany({
    where: { productId: id, status: "free", inStock: true },
    select: { id: true, barcode: true, weight: true, quantity: true, priceEur: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(lots);
}
```

### Task 10 — Replace M1.4 stubs

`apps/store/app/manager/(workstation)/orders/_components/order-actions.tsx`:
- Видалити toast `"M1.5"` — замінити `<Link href="/manager/orders/new">+ Створити</Link>`

`apps/store/app/manager/(workstation)/customers/[id]/_components/client-orders-tab.tsx`:
- Знайти "+ Створити" stub та замінити на `<Link href={\`/manager/orders/new?clientId=${clientId}\`}>+ Створити</Link>`

### Task 11 — Admin sync-jobs page

`/admin/sync-jobs/page.tsx` (server, Supabase admin auth check):
```tsx
import { SyncJobsTable } from "./_components/sync-jobs-table";
import { prisma } from "@ltex/db";

export default async function SyncJobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const statusFilter = sp.status?.split(",").filter(Boolean) ?? [];
  const where = statusFilter.length > 0
    ? { status: { in: statusFilter as any } }
    : {};

  const jobs = await prisma.mgrSyncJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-2xl font-bold">Sync Jobs</h1>
      <SyncJobsTable jobs={jobs} statusFilter={statusFilter} />
    </div>
  );
}
```

`_components/sync-jobs-table.tsx` — client component:
- Multi-select status filter (URL `?status=pending,failed`)
- Table: id (short) / entityType / entityId / status / attempts / lastError (truncated) / createdAt
- Per-row, status='failed': "Retry" button → `POST /api/admin/sync-jobs/[id]/retry`

`/api/admin/sync-jobs/[id]/retry/route.ts`:
```typescript
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Supabase admin auth check (як інші admin endpoints — використати existing helper)
  const { id } = await params;
  const job = await prisma.mgrSyncJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "failed") {
    return NextResponse.json({ error: "Only failed jobs can be retried" }, { status: 400 });
  }

  await prisma.mgrSyncJob.update({
    where: { id },
    data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  return NextResponse.json({ ok: true });
}
```

### Task 12 — 1С BSL spec extension

`docs/1C_SYNC_MODULES_SPEC.md` — додати:
- §3.2 `ОбновитиЗамовлення(ПарольВхода, IdempotencyKey, ПакетДанних)` з ПакетДанних JSON структура (customerCode1C, notes, totals, items[] з productCode1C/lotBarcode/priceEur/weight/quantity)
- §3.3 `ОбновитиОплату(ПарольВхода, IdempotencyKey, ПакетДанних)` з orderCode1C, method, amount, currency, paidAt
- §4.2/4.3 — XML examples request/response
- §5 implementation guidance update для 1С-розробника

### Task 13 — Tests final count

Total нових ≥ 50:
- Validations (8): manager-order (5) + manager-payment (3)
- POST /orders (6) + helper (4) + POST /payments (5) = 15
- Enqueue extensions (4) + proxy routing (2) = 6
- manager-sync routes (8 = 4+4) + mock updates (handled у existing tests)
- Admin sync-jobs (7 = 4+3)
- Product search (3) + lots endpoint (3) = 6
- UI form (3 RTL smoke tests)

---

## Acceptance criteria

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] POST `/api/v1/manager/orders` створює Order + items + SyncJob атомарно (transaction)
- [ ] POST `/api/v1/manager/payments` створює Payment + SyncJob
- [ ] Ownership check на POST/orders + POST/payments (manager → only own client; admin — будь-кого)
- [ ] UI `/manager/orders/new` form working — client picker + items editor + submit → redirect
- [ ] M1.4 "+ Створити" stubs (global orders page + client orders tab) — замінено на real link
- [ ] Manager-sync `/sync/orders/:id` + `/sync/payments/:id` working у mock mode
- [ ] Admin `/admin/sync-jobs` показує queue з filter + retry для failed
- [ ] `docs/1C_SYNC_MODULES_SPEC.md` extended з 2 нових operations + XML examples
- [ ] **DO NOT push** на main. Тільки feature branch.

---

## User-action post-merge

```powershell
cd E:\ltex-ecosystem
git pull origin main
.\scripts\deploy.ps1  # M1.5b не додає нових env vars і не вимагає migration
pm2 restart ltex-manager-sync  # нові routes
```

Жодних env vars + жодних migrations. Тільки code redeploy.

---

## Notes for worker

1. **Phasing:**
   - Phase 1: Validations (manager-order + manager-payment)
   - Phase 2: enqueue extensions
   - Phase 3: proxy-client routing extension
   - Phase 4: manager-sync routes + mock helpers
   - Phase 5: POST /orders + helper (transactional)
   - Phase 6: POST /payments
   - Phase 7: Product search + lots endpoints
   - Phase 8: UI form (client-picker → items-editor → order-form)
   - Phase 9: Replace M1.4 stubs з real links
   - Phase 10: Admin sync-jobs page + retry
   - Phase 11: 1С BSL spec extension у `docs/1C_SYNC_MODULES_SPEC.md`
   - Phase 12: Tests + build green

2. **Ownership check на POST/orders** — DRY через `getMyClientCodes1C(user)` (M1.4). Для admin — `myCodes === null` дозволяє будь-кого.

3. **Order create — transaction.** Створити Order, items, **і** SyncJob у одній транзакції? Або enqueue fire-and-forget після успіху?
   - **Recommended:** fire-and-forget після `await prisma.$transaction(...)`. Той самий pattern як M1.5 PATCH /clients/[id]. Якщо enqueue падає — order existing і користувач бачить успіх. Cron retry через queue не triggered, але admin може manually створити SyncJob (rare).
   - Alternative: include enqueue у transaction. Pros: гарантує queue entry. Cons: enqueue failure rollback order.
   - **Vote:** fire-and-forget — менше surface, той самий pattern.

4. **Client picker autocomplete** — debounce 300ms. Якщо `clientId` initial — fetch одного client by id у server page і передати як initial value (показати name, не лиш id).

5. **Items editor — UI complexity.** Не over-engineer. Simple table з add row button + remove per row. Якщо worker бачить що form занадто складна — спрости (наприклад, lotPicker → text field "barcode" optional, без autocomplete).

6. **Exchange rate** — `getCurrentRate()` server-side у helper. UI form у client — show approximate через окремий fetch до `/api/v1/manager/dashboard/stats` (вже повертає eurRate/usdRate з M1.2).

7. **Payment status** — default `"completed"` бо менеджер створює factual payment record (1С підтвердить чи rejectне через sync). Refund/cancel flow — поза scope.

8. **Order detail page** після create redirect — `/manager/orders/[id]` уже існує з M1.4 (read-only).

9. **Admin sync-jobs auth** — використай **existing admin auth pattern** з інших `/admin/*` pages (Supabase). НЕ дублюй.

10. **DO NOT** додавати inline SOAP-test з faked server для нових routes — mock-mode unit tests вистачає (як у M1.5 sync-clients).

11. **Tests RTL для UI form** — мінімум 3: render initial / add item updates totals / submit empty client shows error. Не over-test.

12. **Order Items без OrderItem.notDirectInput?** — у нашій схемі нема такого поля. Не додавай.

13. **`ItemRow priceEur` auto-fill** — коли lot вибраний → `priceEur = lot.priceEur` (read-only). Коли general → `priceEur = product.basePrice * weight` initial estimate (editable).

14. **`Order.status = "draft"`** — поки що default. 1С обере при первинному прийомі.

15. **EUR/UAH consistency.** UI shows both. Submit sends `priceEur` per item — server calculates totalEur sum, multiply by exchange rate → totalUah.
