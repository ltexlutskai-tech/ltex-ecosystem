# Session 29 — Worker Task: Remove "Compare" Feature Entirely

**Створено orchestrator-ом:** 2026-04-25
**Пріоритет:** P2 (UX simplification per user feedback)
**Очікуваний ефорт:** 30-45 хвилин
**Тип:** worker session (medium / атомарний)

---

## Контекст

Comparison ("Порівняти") feature додавалась у попередніх сесіях але user (B2B клієнти L-TEX) сказав: "ця функція зовсім нам не потрібна — всі кнопки забрати". Вони купують гуртом за вагою, не порівнюють пари товарів.

Видаляємо повністю — компоненти, провайдер, сторінка, тести, i18n keys, всі references. Не залишати dead code.

---

## Branch

`claude/session-29-remove-comparison` від main.

**Залежність:** очікує що S28 вже у main (бо product-card.tsx зачіпається обома). Якщо S28 ще не merged — workflow не блокується, але буде conflict у `product-card.tsx`. Worker — спробуй спочатку rebase від main.

---

## Hard rules

1. **НЕ ламати CI** — `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` зелені
2. **НЕ чіпати** wishlist feature — це окремий і потрібний UX
3. **НЕ редагувати** schema.prisma / API routes — comparison був чисто client-side (localStorage), DB не зачеплено
4. Видалити **повністю** — ніяких "feature flag" обходів, просто чистий delete
5. Адмінка / mobile / packages не зачіпати

---

## Файли для видалення

```
apps/store/lib/comparison.tsx               (provider + hook + types)
apps/store/lib/comparison.test.tsx          (tests for provider)
apps/store/components/store/compare-checkbox.tsx
apps/store/components/store/comparison-bar.tsx
apps/store/components/store/comparison-button.tsx
apps/store/app/(store)/compare/page.tsx     (full /compare route)
```

Якщо `compare/` директорія стає порожньою — видалити і її. Якщо є `loading.tsx`, `error.tsx` всередині — теж під ніж.

---

## Файли для редагування

### 1. `apps/store/app/(store)/layout.tsx`

Видалити:

- `import { ComparisonProvider } from "@/lib/comparison";`
- `import { ComparisonBar } from "@/components/store/comparison-bar";`
- JSX wrapper `<ComparisonProvider>...</ComparisonProvider>` — лишити дітей як є
- JSX `<ComparisonBar />`

Перевірити що layout все ще валідний (1 root element тощо).

### 2. `apps/store/components/store/product-card.tsx`

Видалити:

- `import { ComparisonButton } from "./comparison-button";`
- `import { CompareCheckbox } from "./compare-checkbox";`
- JSX `<ComparisonButton .../>` (всередині overlay block)
- JSX `<CompareCheckbox .../>` (окремий wrapper)
- Conditional class на overlay block — якщо S28 вже додав S29-aware structure, спростити

**Очікуваний результат після S29:**

```tsx
{/* Overlay buttons */}
<div className="absolute right-2 top-2 z-20 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
  <WishlistButton .../>
</div>
<QuickViewButton product={product} />
```

(тільки wishlist + quick-view залишаються)

### 3. `apps/store/lib/i18n/uk.ts`

Видалити блок (lines ~186-191):

```ts
// Comparison
compare: {
  title: "...",
  empty: "...",
  compare: "Порівняти",
  // ... etc
},
```

Якщо `dict.compare.X` використовується десь ще — буде typecheck error, виправити вручну.

### 4. `apps/store/lib/i18n/i18n.test.ts`

Видалити assertions на `dict.compare.*`. Тести count знизиться на 1-2.

### 5. Інші ймовірні точки

Worker має зробити **глобальний пошук** перед коммітом:

```bash
grep -rE "(comparison|Comparison|compare)" apps/store --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | grep -v ".next" | grep -v "^Binary"
```

Має повернути **0 матчів** після видалення (крім legitimate інших слів типу "comparator" якщо випадково є). Worker — пройтись очима по результатах.

**Винятки де `compare` може лишитись legitimately:**

- Sort comparators (Array.sort, Intl.Collator) — це ОК
- TypeScript `compareGenerics<T>(a, b)` etc — ОК

Але `comparison-button`, `ComparisonProvider`, `dict.compare` — все має зникнути.

---

## Verification checklist

- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — PASS (0 errors)
- [ ] `pnpm -r test` — PASS, tests count знизиться на ~3-5 (comparison.test.tsx видалено + i18n.test.ts assertions видалено)
- [ ] `pnpm build` — PASS, нема broken routes (`/compare` 404 — це OK, route видалено)
- [ ] `grep -rE "comparison-bar|ComparisonProvider|comparison-button|compare-checkbox" apps/store` — 0 матчів
- [ ] git diff stat: ~6 файлів deleted + 4 редаговані = 10 changes
- [ ] Адмінка / mobile / packages — 0 changes

---

## Out of scope

- Wishlist removal — wishlist лишається, потрібен B2B клієнтам
- Quick view button — лишається
- Catalog filters / view toggle — окремі сесії S30/S31

---

## Commit strategy

```
refactor(catalog): remove "compare products" feature entirely

B2B wholesale customers don't compare individual products (they buy
by weight in bulk). Per user feedback from production catalog review,
removing all compare UI surface and the underlying provider:
- Deleted lib/comparison.tsx + tests
- Deleted compare-checkbox, comparison-bar, comparison-button components
- Deleted /compare route
- Removed ComparisonProvider wrapper from layout
- Removed compare i18n block + test assertions
- Removed compare imports + JSX from product-card

No DB / API impact (comparison was client-side localStorage only).
Test count drops by ~3-5; no orphan dead code remains.
```

---

## Push

```bash
git push -u origin claude/session-29-remove-comparison
```

Завершити повідомленням orchestrator-у з:
- Branch name
- Test count delta (224 → ?)
- Чи `dict.compare` мав хвости в інших файлах (notify якщо так)
