# Session 78 — Close 5 revalidatePath gaps from S69 audit

**Type:** Worker session (mini)
**Branch:** `claude/revalidate-gaps-{XXXX}`
**Goal:** Закрити 5 MISSING gaps з S69 audit. Admin product/lot/category single-row edits мають revalidate-ити public pages.

---

## ⚠️ HARD RULES

1. **DO NOT remove existing revalidate calls** — тільки додавай нові targeted calls.
2. **DO NOT migrate cache strategy на tags.** S69 audit пропонував tag-based optional refactor — не зараз. Зараз — point fixes.
3. **Use `revalidatePath(path, "layout")` тільки коли layout-аffecting** (catalog category structure). Для one-product edits — page-level.
4. **Order of calls:** existing admin paths → нові public paths.
5. Reuse imports — `revalidatePath` вже imported у actions files.

---

## Source

`docs/SESSION_69_REVALIDATE_AUDIT.md` §3 — 5 gaps documented.

---

## Tasks

### Gap 1: `updateProduct` (`apps/store/app/admin/products/actions.ts:64`)

**Effects:** name, price-relevant fields, inStock — affects `/product/[slug]`, `/catalog`, `/sale`, `/new`, possibly homepage.

**Fix:** після existing `revalidatePath("/admin/products")` додай:

```typescript
const product = await prisma.product.findUnique({
  where: { id },
  select: {
    slug: true,
    categoryId: true,
    category: { select: { slug: true, parent: { select: { slug: true } } } },
  },
});
revalidatePath("/admin/products"); // existing
if (product) {
  revalidatePath(`/product/${product.slug}`);
  revalidatePath("/catalog");
  if (product.category) {
    if (product.category.parent) {
      revalidatePath(
        `/catalog/${product.category.parent.slug}/${product.category.slug}`,
      );
      revalidatePath(`/catalog/${product.category.parent.slug}`);
    } else {
      revalidatePath(`/catalog/${product.category.slug}`);
    }
  }
  revalidatePath("/sale"); // sale page filters on isOnSale
  revalidatePath("/new"); // new page filters on createdAt
  revalidatePath("/", "layout"); // home rails (newArrivals, top, featured)
}
```

⚠️ Враховуй що `updateProduct` уже має `product` reference перед update — reuse.

### Gap 2: `deleteProduct` (`apps/store/app/admin/products/actions.ts:71`)

Те саме але preserve slug перед delete:

```typescript
const product = await prisma.product.findUnique({
  where: { id },
  select: { slug: true, category: {...} },
});
await prisma.product.delete({ where: { id } });
revalidatePath("/admin/products");
if (product) {
  revalidatePath(`/product/${product.slug}`);  // 404 page also needs refresh
  revalidatePath("/catalog");
  // ...same as Gap 1
}
```

### Gap 3: image actions (`apps/store/app/admin/products/actions.ts:107-172`)

`uploadProductImage`, `deleteProductImage`, `reorderProductImages` — affects `/product/[slug]` (gallery) + `/catalog` (first image = card thumbnail).

Fix у всіх 3 actions:

```typescript
revalidatePath(`/admin/products/${productId}`); // existing
const product = await prisma.product.findUnique({
  where: { id: productId },
  select: { slug: true },
});
if (product) {
  revalidatePath(`/product/${product.slug}`);
  revalidatePath("/catalog");
}
```

(Не треба категорії, бо thumbnail на all-products grid)

### Gap 4: lot status (`apps/store/app/admin/lots/actions.ts`)

`updateLotStatus`, `bulkUpdateLotStatus` — affects `/lots`, `/lot/[barcode]`, lot counts on `/product/[slug]`, lot status on `/catalog` (StockIndicator).

Fix:

```typescript
revalidatePath("/admin/lots");
revalidatePath("/admin");
// NEW:
revalidatePath("/lots");
const lot = await prisma.lot.findUnique({
  where: { id: lotId },
  select: { barcode: true, product: { select: { slug: true } } },
});
if (lot) {
  revalidatePath(`/lot/${encodeURIComponent(lot.barcode)}`);
  if (lot.product) revalidatePath(`/product/${lot.product.slug}`);
}
revalidatePath("/catalog"); // StockIndicator counts depend on lot.status
```

Для `bulkUpdateLotStatus` — query по lotIds, revalidate one-shot для `/lots` + `/catalog`, plus loop через products якщо ≤10 (інакше skip per-product, занадто дорого).

### Gap 5: category create/delete (`apps/store/app/admin/categories/actions.ts`)

`createCategory`, `deleteCategory` — affects `/catalog`, `/catalog/[categorySlug]`, homepage categories carousel.

Fix:

```typescript
revalidatePath("/admin/categories");
// NEW:
revalidatePath("/catalog", "layout"); // sidebar з categories
revalidatePath("/", "layout"); // homepage carousel from S53
```

⚠️ `"layout"` бо category list у `/catalog/layout.tsx` (sidebar) і homepage layout.

### 2. Tests

Skip — це integration territory. Одна smoke test:

- Mock `revalidatePath` (vi.mock у vitest)
- Call `updateProduct` action
- Assert `revalidatePath` called з `/product/[slug]`, `/catalog`, etc.

Якщо складно з mocking server actions — додай TODO у doc що manual smoke на staging required.

---

## Acceptance criteria

- [ ] `pnpm format:check`/`typecheck`/`test`/`build` зелені
- [ ] 5 gaps fixed per §3 у audit
- [ ] No existing tests broken
- [ ] Update `docs/SESSION_69_REVALIDATE_AUDIT.md` бо тепер 0 MISSING (додай footnote: "Closed in S78 — see commit XXX")
- [ ] Push на `claude/revalidate-gaps-{XXXX}` (НЕ merge!)

---

## User-action post-merge

`.\scripts\deploy.ps1` — code-only redeploy

---

## Reference

- `docs/SESSION_69_REVALIDATE_AUDIT.md` §3 — 5 gaps spec
- `apps/store/app/admin/products/actions.ts`
- `apps/store/app/admin/lots/actions.ts`
- `apps/store/app/admin/categories/actions.ts`
- Next.js docs — `revalidatePath` "page" vs "layout" semantics
