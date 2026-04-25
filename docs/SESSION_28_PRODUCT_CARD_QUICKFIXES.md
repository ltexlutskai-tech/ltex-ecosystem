# Session 28 — Worker Task: Product Card Quick Fixes

**Створено orchestrator-ом:** 2026-04-25
**Пріоритет:** P2 (UX nitpicks per user feedback)
**Очікуваний ефорт:** 15-20 хвилин
**Тип:** worker session (smallest / атомарний)

---

## Контекст

User глянув каталог у проді й помітив 2 дрібниці на product card:

1. **Бейдж NEW/SALE перекриває wishlist кнопку** — обидва рендеряться у `absolute left-2 top-2`, тому при hover wishlist ховається за бейджем.
2. **`X лотів` бейдж справа зверху** — користувач каже це непотрібна для клієнта інформація (він не оперує термінами лотів на рівні картки).

Обидві зміни — лише у `apps/store/components/store/product-card.tsx`. Не зачіпає інші компоненти.

---

## Branch

`claude/session-28-product-card-quickfixes` від main.

---

## Hard rules

1. **НЕ ламати CI** — `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` зелені
2. **НЕ чіпати** comparison feature (S29 окрема), filters layout (S30), view toggle (S31)
3. **НЕ міняти** `ProductCardData` interface — `_count.lots` лишається у типі (бекенд продовжує його віддавати, просто не показуємо)
4. **НЕ редагувати** API / DB / i18n
5. Зміни тільки в одному файлі: `apps/store/components/store/product-card.tsx`

---

## Tasks

### Task 1: Видалити `_count.lots` бейдж справа зверху

**Файл:** `apps/store/components/store/product-card.tsx`, lines ~88-92.

Видалити повністю блок:

```tsx
{
  product._count.lots > 0 && (
    <Badge className="absolute right-2 top-2" variant="secondary">
      {product._count.lots} {dict.catalog.lots}
    </Badge>
  );
}
```

Якщо `Badge` після цього стає невикористаним у файлі — видалити з імпортів.

### Task 2: Перенести WishlistButton на right-2 top-2

**Файл:** `apps/store/components/store/product-card.tsx`, lines ~124-150.

**Поточна структура:**

```tsx
{/* Overlay buttons */}
<div className="absolute left-2 top-2 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
  <WishlistButton .../>
  <ComparisonButton .../>
</div>
```

**Проблема:** і `WishlistButton`, і блок NEW/SALE бейджів обидва на `left-2 top-2` → overlap.

**Рішення:** перенести WishlistButton (і ComparisonButton якщо ще не видалена після S29) на `right-2 top-2`. Бейдж `_count.lots` ми вже видалили (Task 1), тому правий верхній кут вільний.

**Замінити на:**

```tsx
{/* Overlay buttons */}
<div className="absolute right-2 top-2 z-20 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
  <WishlistButton .../>
  <ComparisonButton .../>
</div>
```

**Important:** `z-20` потрібен щоб overlay був над `Card`'s hover scale image. NEW/SALE бейджі мають `z-10`, тому overlay > бейджі.

### Task 3: Прибрати conditional position для CompareCheckbox

**Файл:** `apps/store/components/store/product-card.tsx`, lines ~152-156.

Поточно:

```tsx
<div
  className={`absolute right-2 z-20 ${
    product._count.lots > 0 ? "top-10" : "top-2"
  }`}
>
  <CompareCheckbox .../>
</div>
```

Бо `_count.lots` бейджа більше немає, conditional position не потрібен. Замінити на просто `right-2 top-2`:

```tsx
<div className="absolute right-2 top-2 z-20">
  <CompareCheckbox .../>
</div>
```

**Caveat:** після Task 2 WishlistButton переїде на `right-2 top-2` — у нас з'явиться overlap CompareCheckbox + WishlistButton. Це **очікувана situation** яка вирішиться у S29 (видалення compare entirely).

**Тимчасове рішення для S28** (поки S29 не вмерджено): помістити CompareCheckbox у той самий flex-col stack як WishlistButton:

```tsx
{/* Overlay buttons (right side) */}
<div className="absolute right-2 top-2 z-20 flex flex-col gap-1">
  <CompareCheckbox .../>  {/* Always visible — checkbox */}
  <div className="opacity-0 transition-opacity group-hover:opacity-100">
    <WishlistButton .../>
    <ComparisonButton .../>
  </div>
</div>
```

Або **простіше**: лишити CompareCheckbox на місці (right-2 top-2), а Wishlist+Comparison overlay на `right-2 top-10` (нижче checkbox):

```tsx
<div className="absolute right-2 top-10 z-20 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
  <WishlistButton .../>
  <ComparisonButton .../>
</div>

<div className="absolute right-2 top-2 z-20">
  <CompareCheckbox .../>
</div>
```

Worker — обери варіант який візуально чистіший. **Не optimize-ити для post-S29 стану** — S29 видалить CompareCheckbox + ComparisonButton entirely, тоді WishlistButton зможе переїхати на `top-2`.

---

## Verification checklist

- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — PASS
- [ ] `pnpm -r test` — PASS (tests count = baseline 224, нічого не додалось/видалилось)
- [ ] `pnpm build` — PASS
- [ ] Manual (worker НЕ запускає dev — просто читає JSX і переконується що `left-2 top-2` overlap немає)
- [ ] git diff: тільки `apps/store/components/store/product-card.tsx` (1 файл)

---

## Out of scope

- Видалення comparison entirely — S29
- Filters left sidebar — S30
- Grid/list layout toggle — S31
- Будь-які інші catalog зміни

---

## Commit strategy

```
fix(product-card): remove lots badge, move wishlist to right side

User feedback from production catalog:
- "X лотів" badge top-right was unnecessary for end customers
- NEW/SALE badge top-left overlapped wishlist hover button

Removed lots badge entirely; moved overlay buttons (wishlist +
comparison) to right side so NEW/SALE badge no longer hides them.
Comparison feature removal is tracked separately in S29.
```

---

## Push

```bash
git push -u origin claude/session-28-product-card-quickfixes
```

Завершити повідомленням orchestrator-у з branch name + LOC delta.
