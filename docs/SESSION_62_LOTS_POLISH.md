# Session 62 — Lots Page Polish + Quick Order (Worker Spec)

**Дата:** 2026-05-02
**Тип:** worker
**Ефорт:** ~3-4 год
**Branch:** `claude/s62-lots-polish`
**Контекст:** S61 deployed — є 7 issues від QA на проді.

## Issues to fix

### 1. Filters: Apply button for price/weight (desktop UX)

Поточний `LotsFiltersForm` (`apps/store/components/store/lots-filters-form.tsx`) commits price/weight через `onBlur`. На desktop користувач не розуміє коли його зміни застосовані — потрібна явна кнопка.

**Фікс:** Додати "Застосувати" кнопку під price/weight inputs (одна кнопка яка commit-ить **обидва** range — weight + price одразу). Прибрати `onBlur` handlers — лишити локальний state, commit тільки на кнопку.

```tsx
// Замість onBlur:
<button
  type="button"
  onClick={() => commitRanges()}
  className="mt-2 w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
>
  Застосувати ціну та вагу
</button>
```

`commitRanges()` оновлює всі 4 параметри (weightMin/Max + priceMin/Max) одним `router.push`.

### 2. Sidebar — окрема прокрутка на desktop

Файл: `apps/store/components/store/lots-filters.tsx` (рядки 18-24)

Поточний `<aside>` має `lg:sticky lg:top-20` але без max-height. Якщо у фільтрах багато категорій → sidebar може вилазити за viewport.

**Фікс:** додай до `<aside>`:

```tsx
className =
  "hidden h-fit max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-white p-5 lg:sticky lg:top-20 lg:block";
```

`6rem` = top-20 (5rem) + small gap. Sticky + max-h + overflow-y-auto = sidebar скролиться окремо від сторінки.

### 3. Mobile sheet — Застосувати має commit pending range values

Файл: `apps/store/components/store/lots-filters.tsx` (рядки 50-56)

Поточна "Застосувати" кнопка у sheet тільки закриває sheet (`setOpen(false)`) — НЕ commit-ить введені у inputs price/weight. Якщо user вводить "10-50" → tap "Застосувати" → значення втрачаються (бо `onBlur` не fire-ить перед close).

**Фікс:** Зробити так, щоб "Застосувати" у sheet тригерила commit. Найчистіше — `LotsFiltersForm` експонує imperative API:

Варіант A (preferred): додати ref + `useImperativeHandle` у `LotsFiltersForm` що експонує `commitRanges()` метод. Sheet викликає його перед `setOpen(false)`.

Варіант B: винести pending range state у parent (LotsFilterSheet), передати через props. Складніше, не рекомендую.

Йди A. Або простіший варіант — у Form додати `onApply?: () => void` callback АЛЕ також викликати auto-commit на unmount/visibility change. Найпростіше — мобільна "Застосувати" кнопка робить commit через DOM-fired blur події всіх inputs у sheet перед close. Але це fragile.

**Найчистіший варіант:** просто прибрати окрему "Застосувати" кнопку у sheet — і використати ту саму кнопку з форми (з фіксу #1) яка commit-ить ranges. Sheet закривається через X у header або backdrop tap. Це уніфікує UX desktop+mobile.

Якщо все-таки треба окрема "Закрити" у sheet — лишай тільки як `setOpen(false)` без commit (бо commit вже відбувся через кнопку у формі).

### 4. Status filter — новий список значень

Користувач хоче 4 опції замість поточних 3:

- **Заброньовані** — `status === "reserved"`
- **Вільні** — `status === "free"`
- **Акції** — `status === "on_sale"`
- **Новинки** — `isNew === "true"` → додає до query `createdAt: { gte: 14 днів тому }`. Це **окремий** параметр від status (бо новинка може бути одночасно вільна або акційна).

Замінити radio групу у `lots-filters-form.tsx` (рядки 144-177) на **checkbox-набір** для статусів (multi-select) + окремий checkbox для "Новинки":

```
[ ] Заброньовані
[ ] Вільні
[ ] Акції
[ ] Новинки (за останні 14 днів)
```

Backend (`apps/store/app/(store)/lots/page.tsx`):

- Замість `status: searchParams.get("status")` тепер `status: parseList(searchParams.get("status"))` (multi).
- Якщо порожньо → дефолт `["free", "on_sale"]`.
- Якщо є → `where.status: { in: статуси }`.
- Якщо `isNew=true` → додай `where.createdAt: { gte: new Date(Date.now() - 14*24*60*60*1000) }`.
- "Новинки" не робить filter по status сам по собі — лот можна одночасно free + isNew.

**LotCard:** додай "NEW" badge якщо `lot.createdAt > 14 днів тому`. Передавай як prop або обчислюй локально якщо createdAt у LotCardProps.

### 5. Remove "Тільки з відеооглядом" filter

Видалити секцію з `lots-filters-form.tsx` (рядки 179-191). Видалити `hasVideo` з URL params handling. У `lots/page.tsx` прибрати відповідну `where.videoUrl: { not: null }` логіку.

LotCard placeholder "Огляд скоро" лишити — рідкі лоти без відео все одно відображаються.

### 6. List/grid layout toggle

Reuse існуючий `CatalogLayoutToggle` (`apps/store/components/store/catalog-layout-toggle.tsx`). Додай його у `lots/page.tsx` поряд з search + sort:

```tsx
<div className="flex flex-col gap-3 md:flex-row md:items-center">
  <input className="flex-1" />
  <LotsSortSelect />
  <CatalogLayoutToggle currentLayout={layout} />
  <LotsFilterSheet />
</div>
```

URL param `layout` = `grid` | `list` (default grid). Передавай у LotCard як prop.

**LotCard** (`apps/store/components/store/lot-card.tsx`) — додай `layout?: "grid" | "list"` prop:

- `"grid"` (default) — поточний layout (vertical: video top, info bottom)
- `"list"` — horizontal: video thumb 200×112 ліворуч, info справа (як список)

```tsx
if (layout === "list") {
  return (
    <div className="flex gap-4 rounded-lg border bg-white p-3 hover:shadow-md">
      <button className="relative aspect-video w-48 shrink-0 ...">
        {" "}
        {/* video */}{" "}
      </button>
      <div className="flex-1 flex flex-col">
        {" "}
        {/* info + price + cta inline */}{" "}
      </div>
    </div>
  );
}
// existing grid render
```

Wrapper grid у `lots/page.tsx`:

```tsx
<div className={layout === "list" ? "space-y-3" : "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"}>
```

### 7. "Купити в один клік" button + quick order modal

Додай secondary CTA на LotCard (під primary "Додати"). Видимий тільки коли `lot.status` `in ["free", "on_sale"]`.

```tsx
<button
  type="button"
  onClick={() => setQuickOrderOpen(true)}
  className="mt-2 w-full rounded-lg border-2 border-amber-500 bg-amber-50 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
>
  ⚡ Купити в один клік
</button>
```

**New component:** `apps/store/components/store/quick-order-modal.tsx` (client):

```tsx
"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@ltex/ui";

interface QuickOrderModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lot: {
    id: string;
    barcode: string;
    productId: string;
    productName: string;
    weight: number;
    priceEur: number;
    quantity: number;
  };
}

export function QuickOrderModal({
  open,
  onOpenChange,
  lot,
}: QuickOrderModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name, phone },
          lotId: lot.id,
          productId: lot.productId,
          priceEur: lot.priceEur,
          weight: lot.weight,
          quantity: lot.quantity,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Помилка");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Помилка мережі");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogTitle>Заявку прийнято</DialogTitle>
          <p>Менеджер зв'яжеться з вами найближчим часом.</p>
          <button
            onClick={() => {
              setSuccess(false);
              onOpenChange(false);
            }}
            className="mt-4 rounded-md bg-green-600 px-4 py-2 text-white"
          >
            Закрити
          </button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Купити в один клік</DialogTitle>
        <DialogDescription>
          Лот {lot.barcode} — {lot.productName}, {lot.weight} кг
        </DialogDescription>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Ваше ім'я *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Телефон *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              type="tel"
              placeholder="+380..."
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? "Надсилається..." : "Надіслати заявку"}
          </button>
          <p className="text-xs text-gray-500 text-center">
            Менеджер зв'яжеться для підтвердження. Передоплата не потрібна.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**New API route:** `apps/store/app/api/quick-order/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { rateLimit } from "@/lib/rate-limit";
import { sendOrderConfirmationEmail } from "@/lib/email";

const schema = z.object({
  customer: z.object({
    name: z.string().min(2).max(100),
    phone: z.string().min(8).max(30),
  }),
  lotId: z.string().min(1),
  productId: z.string().min(1),
  priceEur: z.number().positive(),
  weight: z.number().positive(),
  quantity: z.number().int().positive(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const limit = rateLimit(`quick-order:${ip}`, { windowMs: 60_000, max: 3 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Забагато запитів" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невалідні дані" }, { status: 400 });
  }

  const { customer, lotId, productId, priceEur, weight, quantity } = parsed.data;

  // Customer.phone НЕ unique у schema — використай findFirst + create окремо.
  let dbCustomer = await prisma.customer.findFirst({
    where: { phone: customer.phone },
  });
  if (!dbCustomer) {
    dbCustomer = await prisma.customer.create({
      data: { name: customer.name, phone: customer.phone },
    });
  }

  const order = await prisma.order.create({
    data: {
      customerId: dbCustomer.id,
      status: "new",
      notes: "Швидке замовлення з картки лоту",
      items: {
        create: [{ lotId, productId, priceEur, weight, quantity }],
      },
    },
    include: { customer: true, items: true },
  });

  // Email manager — fire-and-forget
  sendOrderConfirmationEmail({
    orderId: order.id,
    customerName: dbCustomer.name,
    customerEmail: dbCustomer.email ?? "",
    items: order.items.map((i) => ({ ... })),
  }).catch(console.error);

  return NextResponse.json({ orderId: order.id }, { status: 201 });
}
```

⚠️ Customer.phone **НЕ unique** у поточній schema — використано `findFirst` + create. Не намагайся upsert by phone, це впаде на runtime.

⚠️ Email шле тільки якщо у customer є `email`. Quick-order часто без email — менеджер бачитиме у адмінці, не в email. Це OK, business decision.

⚠️ MIN_ORDER_KG=10 не апплі-ється до quick-order (бо це "інтерес" а не формальне замовлення). Це фіча, не баг.

## Out of scope

- Telegram-нотифікація менеджеру при quick-order — додамо коли user готовий (env `TELEGRAM_MANAGER_CHAT_ID`).
- "Новинки" filter як окремий бейдж на product cards у /catalog — окрема задача.
- List view layout для `ProductCard` у /catalog — це вже є (S31).
- Mobile app — paused.

## Verification

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test` зелено
- [ ] `cd apps/store && pnpm build` standalone build success
- [ ] Manual desktop: ввести "5" і "20" у вагу → клік "Застосувати" → URL update + grid фільтрується
- [ ] Manual mobile (Pixel 7): відкрити sheet → ввести range → tap "Застосувати ціну та вагу" → grid фільтрується (sheet закривається)
- [ ] Manual: sidebar з ~25 категоріями скролиться окремо від сторінки (page scroll лишається)
- [ ] Manual: status checkboxes — Заброньовані / Вільні / Акції / Новинки. "Новинки" фільтрує lots старіші 14 днів геть.
- [ ] Manual: відсутній "Тільки з відеооглядом" чекбокс
- [ ] Manual: layout toggle grid/list — URL `?layout=list` → cards рендеряться horizontally
- [ ] Manual: "⚡ Купити в один клік" → modal з name+phone → submit → "Заявку прийнято"
- [ ] Перевір що email менеджеру або order у адмінці створюється

## Commit strategy

1. `fix(s62a): lots filters — apply button for price/weight ranges + sidebar own scroll`
2. `fix(s62b): mobile filter sheet — commit pending ranges before close`
3. `feat(s62c): status filter — multi-select Заброньовані/Вільні/Акції/Новинки + remove hasVideo`
4. `feat(s62d): list/grid layout toggle on /lots`
5. `feat(s62e): quick order modal + /api/quick-order endpoint`

Push `claude/s62-lots-polish`. NOT merge to main, NOT create PR.

## Hard rules

- TypeScript strict, 0 `any`.
- Pre-commit hook auto-prettier — НЕ bypass.
- НЕ редагуй CLAUDE.md / HISTORY.md / SESSION_TASKS.md.
- НЕ запускай pm2.
- Усі user-facing strings українською.
- НЕ міняй DB schema — Customer.phone @unique перевір; якщо немає, використай findFirst+create.
