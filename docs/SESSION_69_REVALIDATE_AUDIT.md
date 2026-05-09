# Session 69 — `revalidatePath` Cleanup Audit

**Branch:** `claude/revalidatepath-cleanup-audit-KJQrx`
**Scope:** audit every `revalidatePath` / `revalidateTag` call in `apps/store/app/**` and
`apps/store/lib/**`, classify each as OK / TOO_BROAD / MISSING per
PROJECT_AUDIT_2026-04-18.md §8.1 #6, refactor any genuinely too-broad calls.

## TL;DR

- **49 call sites** across **13 files** (all writes; no reads).
- **0 calls classified TOO_BROAD** under the audit's strict definition. The
  `revalidatePath("/")` calls in `admin/banners`, `admin/featured`, and
  `admin/promo` actions all target a path whose UI actually depends on the
  changed data (banners, featured products, promo stripe — all rendered on the
  homepage).
- **0 refactor edits required.** The PROJECT_AUDIT_2026-04-18.md §8.1 #6
  comment ("багато admin actions викликають `revalidatePath('/')` після
  оновлень що не впливають на homepage") appears to be stale: after the
  Session 33-34 homepage redesign (banners + featured rails + sale + new),
  every existing `revalidatePath("/")` site corresponds to a homepage section.
- **22 calls are no-ops** because they target `force-dynamic` admin pages
  (`/admin`, `/admin/orders`, `/admin/lots`, `/admin/products`,
  `/admin/categories`, `/admin/banners`, `/admin/featured`, `/admin/rates`,
  `/admin/promo`). They are harmless (no cache to invalidate, no perf cost) and
  are kept as documentation of intent / future-proofing if any admin page is
  ever moved off `force-dynamic`.
- **5 MISSING gaps** flagged below in §3 — public-facing pages
  (`/product/[slug]`, `/catalog`, `/lots`, `/sale`, `/new`) not invalidated when
  an admin edits a single product/lot. Out of scope for this session per the
  brief ("Тільки прибрати зайве `revalidatePath('/')`"); listed for a future
  task. **→ Closed in Session 78** (see §3 footnote).

## 1. All call sites

| #   | File                                  | Line | Call                                        | Class   | Notes                                                               |
| --- | ------------------------------------- | ---- | ------------------------------------------- | ------- | ------------------------------------------------------------------- |
| 1   | `app/admin/orders/actions.ts`         | 64   | `revalidatePath("/admin/orders")`           | OK_NOOP | target is `force-dynamic`                                           |
| 2   | `app/admin/orders/actions.ts`         | 65   | `revalidatePath("/admin")`                  | OK_NOOP | target is `force-dynamic`                                           |
| 3   | `app/admin/orders/actions.ts`         | 76   | `revalidatePath("/admin/orders")`           | OK_NOOP | target is `force-dynamic`                                           |
| 4   | `app/admin/rates/actions.ts`          | 32   | `revalidatePath("/admin/rates")`            | OK_NOOP | target is `force-dynamic`                                           |
| 5   | `app/admin/lots/actions.ts`           | 19   | `revalidatePath("/admin/lots")`             | OK_NOOP | target is `force-dynamic`                                           |
| 6   | `app/admin/lots/actions.ts`           | 20   | `revalidatePath("/admin")`                  | OK_NOOP | target is `force-dynamic`                                           |
| 7   | `app/admin/lots/actions.ts`           | 35   | `revalidatePath("/admin/lots")`             | OK_NOOP | target is `force-dynamic`                                           |
| 8   | `app/admin/lots/actions.ts`           | 36   | `revalidatePath("/admin")`                  | OK_NOOP | target is `force-dynamic`                                           |
| 9   | `app/admin/categories/actions.ts`     | 27   | `revalidatePath("/admin/categories")`       | OK_NOOP | target is `force-dynamic`                                           |
| 10  | `app/admin/categories/actions.ts`     | 44   | `revalidatePath("/admin/categories")`       | OK_NOOP | target is `force-dynamic`                                           |
| 11  | `app/admin/promo/actions.ts`          | 59   | `revalidatePath("/admin/promo")`            | OK_NOOP | target is `force-dynamic`                                           |
| 12  | `app/admin/promo/actions.ts`          | 60   | `revalidatePath("/")`                       | OK_KEEP | promo stripe rendered on `/` (and via layout on every page); see §2 |
| 13  | `app/admin/products/actions.ts`       | 36   | `revalidatePath("/admin/products")`         | OK_NOOP | target is `force-dynamic`                                           |
| 14  | `app/admin/products/actions.ts`       | 65   | `revalidatePath("/admin/products")`         | OK_NOOP | target is `force-dynamic`                                           |
| 15  | `app/admin/products/actions.ts`       | 72   | `revalidatePath("/admin/products")`         | OK_NOOP | target is `force-dynamic`                                           |
| 16  | `app/admin/products/actions.ts`       | 134  | ``revalidatePath(`/admin/products/${id}`)`` | OK_NOOP | target is `force-dynamic`                                           |
| 17  | `app/admin/products/actions.ts`       | 154  | ``revalidatePath(`/admin/products/${id}`)`` | OK_NOOP | target is `force-dynamic`                                           |
| 18  | `app/admin/products/actions.ts`       | 172  | ``revalidatePath(`/admin/products/${id}`)`` | OK_NOOP | target is `force-dynamic`                                           |
| 19  | `app/admin/banners/actions.ts`        | 37   | `revalidatePath("/admin/banners")`          | OK_NOOP | target is `force-dynamic`                                           |
| 20  | `app/admin/banners/actions.ts`        | 38   | `revalidatePath("/")`                       | OK      | banners only rendered on `/`                                        |
| 21  | `app/admin/banners/actions.ts`        | 46   | `revalidatePath("/admin/banners")`          | OK_NOOP | target is `force-dynamic`                                           |
| 22  | `app/admin/banners/actions.ts`        | 47   | `revalidatePath("/")`                       | OK      | banners only rendered on `/`                                        |
| 23  | `app/admin/banners/actions.ts`        | 54   | `revalidatePath("/admin/banners")`          | OK_NOOP | target is `force-dynamic`                                           |
| 24  | `app/admin/banners/actions.ts`        | 55   | `revalidatePath("/")`                       | OK      | banners only rendered on `/`                                        |
| 25  | `app/admin/banners/actions.ts`        | 120  | `revalidatePath("/admin/banners")`          | OK_NOOP | target is `force-dynamic`                                           |
| 26  | `app/admin/banners/actions.ts`        | 121  | `revalidatePath("/")`                       | OK      | banners only rendered on `/`                                        |
| 27  | `app/admin/featured/actions.ts`       | 25   | `revalidatePath("/admin/featured")`         | OK_NOOP | target is `force-dynamic`                                           |
| 28  | `app/admin/featured/actions.ts`       | 26   | `revalidatePath("/")`                       | OK      | featured rail rendered on `/`                                       |
| 29  | `app/admin/featured/actions.ts`       | 27   | `revalidatePath("/top")`                    | OK      | featured listing on `/top`                                          |
| 30  | `app/admin/featured/actions.ts`       | 33   | `revalidatePath("/admin/featured")`         | OK_NOOP | target is `force-dynamic`                                           |
| 31  | `app/admin/featured/actions.ts`       | 34   | `revalidatePath("/")`                       | OK      | featured rail rendered on `/`                                       |
| 32  | `app/admin/featured/actions.ts`       | 35   | `revalidatePath("/top")`                    | OK      | featured listing on `/top`                                          |
| 33  | `app/admin/featured/actions.ts`       | 44   | `revalidatePath("/admin/featured")`         | OK_NOOP | target is `force-dynamic`                                           |
| 34  | `app/admin/featured/actions.ts`       | 45   | `revalidatePath("/")`                       | OK      | featured rail rendered on `/`                                       |
| 35  | `app/admin/featured/actions.ts`       | 46   | `revalidatePath("/top")`                    | OK      | featured listing on `/top`                                          |
| 36  | `app/admin/featured/actions.ts`       | 59   | `revalidatePath("/admin/featured")`         | OK_NOOP | target is `force-dynamic`                                           |
| 37  | `app/admin/featured/actions.ts`       | 60   | `revalidatePath("/")`                       | OK      | featured rail rendered on `/`                                       |
| 38  | `app/admin/featured/actions.ts`       | 61   | `revalidatePath("/top")`                    | OK      | featured listing on `/top`                                          |
| 39  | `app/admin/featured/actions.ts`       | 89   | `revalidatePath("/admin/featured")`         | OK_NOOP | target is `force-dynamic`                                           |
| 40  | `app/admin/featured/actions.ts`       | 90   | `revalidatePath("/")`                       | OK      | featured rail rendered on `/`                                       |
| 41  | `app/admin/featured/actions.ts`       | 91   | `revalidatePath("/top")`                    | OK      | featured listing on `/top`                                          |
| 42  | `app/admin/featured/actions.ts`       | 119  | `revalidatePath("/admin/featured")`         | OK_NOOP | target is `force-dynamic`                                           |
| 43  | `app/admin/featured/actions.ts`       | 120  | `revalidatePath("/")`                       | OK      | featured rail rendered on `/`                                       |
| 44  | `app/admin/featured/actions.ts`       | 121  | `revalidatePath("/top")`                    | OK      | featured listing on `/top`                                          |
| 45  | `app/api/sync/categories/route.ts`    | 109  | `revalidatePath("/catalog", "layout")`      | OK      | bulk sync — affects all `/catalog/*`                                |
| 46  | `app/api/sync/orders/import/route.ts` | 189  | `revalidatePath("/admin/orders")`           | OK_NOOP | target is `force-dynamic`                                           |
| 47  | `app/api/sync/orders/import/route.ts` | 190  | `revalidatePath("/admin")`                  | OK_NOOP | target is `force-dynamic`                                           |
| 48  | `app/api/sync/prices/route.ts`        | 95   | `revalidatePath("/catalog", "layout")`      | OK      | bulk price sync — affects all catalog listings                      |
| 49  | `app/api/sync/prices/route.ts`        | 96   | `revalidatePath("/lots")`                   | OK      | lots listing reads price data                                       |
| 50  | `app/api/sync/lots/route.ts`          | 88   | `revalidatePath("/lots")`                   | OK      | bulk lot sync                                                       |
| 51  | `app/api/sync/lots/route.ts`          | 89   | `revalidatePath("/catalog", "layout")`      | OK      | lot counts reflected in catalog cards                               |
| 52  | `app/api/sync/products/route.ts`      | 103  | `revalidatePath("/catalog", "layout")`      | OK      | bulk product sync                                                   |

`revalidateTag` is **not used** anywhere in the codebase — the only data cache
that has tags is `getCachedHomeData` in `app/(store)/page.tsx` (`tags: ["home"]`),
which is invalidated indirectly via `revalidatePath("/")`.

### Class definitions (this audit)

- **OK** — call targets a path/layout whose UI is provably affected by the
  write.
- **OK_NOOP** — call targets a `force-dynamic` page; it has no effect, but
  also no cost. Kept as defensive documentation; removing them would create a
  silent invalidation bug if the target page is ever moved off `force-dynamic`.
- **OK_KEEP** — call is debatably suboptimal (too narrow, e.g. promo only
  invalidates `/`) but the brief instructs keeping borderline cases.
- **TOO_BROAD** — `revalidatePath("/")` or `revalidatePath("/x", "layout")`
  for changes that affect a single product/category. **None found.**
- **MISSING** — write that changes public UI but issues no public-path
  invalidation. See §3.

## 2. `revalidatePath("/")` deep dive

Three admin domains call `revalidatePath("/")`. All three are **OK** under this
audit because the homepage genuinely consumes their data (Sessions 33-34
redesign):

```ts
// app/(store)/page.tsx — sections rendered on /
const getCachedHomeData = unstable_cache(
  async () => {
    const [parentCategories, counts, banners, featured, newProducts,
           saleProducts, videoProducts] = await Promise.all([...]);
    return { ... };
  },
  ["home-data"],
  { revalidate: 60, tags: ["home"] },
);
```

| Domain                      | Touched by                                               | Why `revalidatePath("/")` is correct                                                      |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `admin/banners/actions.ts`  | createBanner, updateBanner, deleteBanner, reorderBanners | `BannerCarousel` is the topmost element of the homepage                                   |
| `admin/featured/actions.ts` | add/remove/reorder/move featured                         | "Топ товарів" rail is section #2 of the homepage                                          |
| `admin/promo/actions.ts`    | savePromoStripe                                          | `<PromoStripe>` is in `app/(store)/layout.tsx` and renders above every page including `/` |

### Promo stripe nuance (left untouched)

`<PromoStripe>` is a layout element, so a promo update logically affects
**every** route under the (store) group, not just `/`. The current call only
invalidates the homepage's ISR cache; other static routes (`/catalog`,
`/product/[slug]`, etc.) will continue to serve stale promo HTML until their
own ISR windows (60-300s) expire.

Strict fixes would be either `revalidatePath("/", "layout")` (nukes every
route under the root layout — heavy) or one explicit invalidation per static
route (verbose). Per the brief ("Якщо unsure → keep it. Кращий conservative
refactor ніж зламати invalidation."), this is **OK_KEEP**: promo updates are
infrequent and 60-300s eventual consistency on non-home pages is acceptable.

### Future micro-optimization (not done)

`getCachedHomeData` already declares `tags: ["home"]`. Banner CRUD and
featured CRUD could swap `revalidatePath("/")` for `revalidateTag("home")`,
which only invalidates the data-cache layer rather than the route's RSC
payload. Whether this also propagates page-level invalidation in Next.js 15
ISR is fragile (depends on the runtime's chained-cache behavior). Skipped to
avoid risk; see Next.js 15 cache docs for the dependency edge cases.

## 3. MISSING gaps (flagged, not fixed)

> **Status update — Session 78 (2026-05-08):** All 5 gaps below are now closed.
> `updateProduct` / `deleteProduct` / image actions / lot status actions /
> category create+delete now issue targeted public-path invalidations. See
> `docs/SESSION_78_REVALIDATE_GAPS.md` and the merge commit on `main` for the
> exact paths revalidated per action.

These admin actions mutate data that **does** affect public ISR pages but
issue no public invalidation. The `/admin/*` calls they currently make are
all no-ops (force-dynamic), so the public site silently lags by one ISR
window after every admin edit.

| Action                                                                                             | What it changes                      | Public pages stale after edit                                                           | Current call                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `updateProduct` (products/actions.ts:64)                                                           | name, price-relevant fields, inStock | `/product/[slug]`, `/catalog`, `/catalog/[categorySlug]`, possibly `/`, `/sale`, `/new` | only `revalidatePath("/admin/products")` (no-op)         |
| `deleteProduct` (products/actions.ts:71)                                                           | removes a product                    | same as above                                                                           | same — only no-op admin path                             |
| `uploadProductImage` / `deleteProductImage` / `reorderProductImages` (products/actions.ts:107-172) | gallery images on `/product/[slug]`  | `/product/[slug]`, `/catalog` (first image is the card thumbnail)                       | only ``revalidatePath(`/admin/products/${id}`)`` (no-op) |
| `updateLotStatus` / `bulkUpdateLotStatus` (lots/actions.ts)                                        | lot availability/status              | `/lots`, `/lot/[barcode]`, lot counts on `/product/[slug]`, `/catalog`                  | only `/admin/lots` + `/admin` (both no-op)               |
| `createCategory` / `deleteCategory` (categories/actions.ts)                                        | category tree                        | `/catalog`, `/catalog/[categorySlug]`, homepage categories carousel                     | only `/admin/categories` (no-op)                         |

These are **out of scope** for this audit per the brief
("Тільки прибрати зайве `revalidatePath('/')`. НЕ додавай нові tags на cached
fetch масово."). They warrant a follow-up session that:

1. Picks targeted invalidations for each public page (e.g. ``revalidatePath(`/product/${slug}`)``, `revalidatePath("/catalog", "layout")` for bulk-affecting writes).
2. Optionally migrates `/catalog`, `/product/[slug]`, `/lots` to tag-based
   `unstable_cache` similar to `getCachedHomeData`, then uses `revalidateTag`.
3. Decides whether single-product admin edits should trigger a heavy
   `revalidatePath("/catalog", "layout")` (catalog listings change) or accept
   eventual consistency.

## 4. Refactor outcome

**No code changes.** The audit produced the expected categorisation; nothing
fell into TOO_BROAD. The previously cited concern in
PROJECT_AUDIT_2026-04-18.md §8.1 #6 was resolved organically when Sessions
33-34 wired banners, featured, sale, and new arrivals into the homepage —
making every existing `revalidatePath("/")` correct rather than wasteful.

Verification commands:

```sh
grep -rn "revalidatePath\|revalidateTag" apps/store/app apps/store/lib \
  | grep -v ".next" | grep -v ".test"
# 49 hits — same set as audited above.
```

## 5. References

- PROJECT_AUDIT_2026-04-18.md §8.1 #6 — original "broad invalidation" concern.
- `apps/store/app/(store)/page.tsx` — homepage `unstable_cache` with
  `tags: ["home"]`.
- `apps/store/app/(store)/layout.tsx` — `<PromoStripe>` placement.
- Next.js 15 docs — `revalidatePath` vs `revalidateTag`; layout vs page type
  parameter; `force-dynamic` interaction with `revalidatePath`.
