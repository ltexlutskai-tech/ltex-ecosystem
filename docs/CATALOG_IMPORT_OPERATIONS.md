# Catalog Import — Operations Runbook

**Script:** `scripts/import-catalog-from-excel.ts`
**Source plan:** `docs/CATALOG_IMPORT_PLAN.md`
**Worker spec:** `docs/SESSION_71_CATALOG_IMPORT.md`
**Last dry-run report:** `docs/CATALOG_IMPORT_DRY_RUN_REPORT.md`

The script bulk-imports / synchronizes products + categories from
`Повний каталог товарів.xlsx` into the L-TEX database. It runs in **dry-run by
default**: without `--apply`, the script reads the Excel + queries DB for
diffing, but performs **no writes**.

## TL;DR

```powershell
# 1. Place Повний каталог товарів.xlsx in the repo root.
# 2. Dry-run, generate report (no DB writes):
pnpm exec tsx scripts/import-catalog-from-excel.ts

# 3. Inspect docs/CATALOG_IMPORT_DRY_RUN_REPORT.md.
# 4. Take a fresh DB backup (E:\ltex-backups\pre-import-YYYY-MM-DD.dump).
# 5. Apply changes:
pnpm exec tsx scripts/import-catalog-from-excel.ts --apply

# 6. Redeploy if packages/shared/src/constants/categories.ts changed:
.\scripts\deploy.ps1
```

## Prerequisites

- Node 20+ and pnpm 9.x
- Run from the project root (`E:\ltex-ecosystem` on the production server, or
  the repo clone locally).
- `apps/store/.env` (or root `.env`) with `DATABASE_URL` pointing at the target
  DB. Without DB connectivity the script falls back to **offline dry-run mode**
  — all rows are reported as "CREATE", and DB-dependent sections (existing
  products, deletions, deprecated category counts) are empty. This mode is
  only useful for sanity-checking the parser on a developer machine.
- A recent `prisma generate` so `@prisma/client` resolves:
  `pnpm --filter @ltex/db exec prisma generate`.

## Excel format expectations

The script reads the **first sheet**. Header row (row 1) is skipped; a totals
row with `Артикул = "Разом"` is also skipped.

| Column | Header                                | Notes                                                                                      |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| A      | Артикул                               | Primary lookup key. Coerced to string, trimmed.                                            |
| B      | Номенклатура, Ссылка на youtube, Вага | `name, https://youtube/..., 25` — comma-separated. Weight may be `25` or `15-20`.          |
| C      | Опис                                  | Checklist `✔Сорт: …, ✔Стать: …, …` (also accepts `✔️` with FE0F variation selector).       |
| D      | Категорії                             | Comma-separated tokens (categories, qualities, seasons, countries, genders).               |
| E      | Цена закупки                          | EUR (informational; not stored — Price model only carries wholesale + akciya).             |
| F      | Цена продажи                          | EUR. Stored as `Price.priceType="wholesale"`. **Missing → product flagged inStock=false.** |
| G      | Цена акция                            | EUR. Stored as `Price.priceType="akciya"` if present.                                      |
| H      | Количество (шт)                       | Optional. Only used to gate `inStock` (zero → out of stock).                               |
| I      | Вес (кг)                              | Optional. Falls back to weight from column B name suffix, then `✔Вага лота` from desc.     |

## Step-by-step runbook

### Step 1 — Prepare the Excel

1. Drop the latest `Повний каталог товарів.xlsx` into the repo root.
2. Verify column order matches the table above. (1С export shouldn't change the
   layout, but a manual edit might.)
3. If a row should be **excluded entirely**, either delete it from Excel or add
   it to `SKU_CATEGORY_OVERRIDE` (in `packages/shared/src/utils/import-catalog.ts`)
   with `slug: null`. The script then logs it under "Skipped SKUs".

### Step 2 — Run the dry-run

```powershell
# From repo root
pnpm exec tsx scripts/import-catalog-from-excel.ts
```

Output:

- `docs/CATALOG_IMPORT_DRY_RUN_REPORT.md` — markdown summary
- Console summary: `create=… update=… delete=… blocked=… skipped=…`

### Step 3 — Review the report

Mandatory checks before `--apply`:

1. **DB connected: yes** — header line confirms the script reached the DB.
   Offline reports must NOT be used as the basis for `--apply`.
2. **Categories to ADD** — confirm the new subcategories match
   `packages/shared/src/constants/categories.ts`. (They are derived from it.)
3. **DEPRECATED categories migration** — verify the product counts. A non-zero
   count means real products will be reassigned. If the target slug is wrong,
   edit `CATEGORY_MIGRATIONS` in `packages/shared/src/utils/import-catalog.ts`.
4. **Without `Цена продажи`** — these SKUs land with `inStock=false` and no
   `wholesale` Price row. Sanity-check the list (typically 1-3 SKUs).
5. **Slug collisions** — should be rare. The first SKU keeps the bare slug;
   subsequent ones get `-2`, `-3` suffixes.
6. **Unrecognized category tokens** — any token here means a row falls back to
   `inshe-odyag`. Either extend `CATEGORY_SLUG_MAP` (if the Ukrainian phrase is
   missing) or add a per-SKU entry to `SKU_CATEGORY_OVERRIDE`.
7. **Products to DELETE** — these will be hard-deleted on `--apply`. Spot-check
   that nothing valuable is on the list. SKUs with `OrderItem` history end up
   in **blocked deletes** instead — they are simply skipped.
8. **Sample CREATE/UPDATE preview** — eyeball 3 representative rows for
   correct quality / country / season / categorySlug.

### Step 4 — Backup the DB

Before any `--apply`, snapshot the production DB:

```powershell
# Local PostgreSQL on E:\PostgreSQL\16
pg_dump -Fc -U ltex -h localhost ltex > E:\ltex-backups\pre-import-$(Get-Date -Format yyyy-MM-dd_HHmm).dump
```

The nightly cron also writes to `E:\ltex-backups\` at 03:00 (14-day retention),
but for an irreversible bulk operation a dedicated snapshot is mandatory.

### Step 5 — Apply

```powershell
pnpm exec tsx scripts/import-catalog-from-excel.ts --apply
```

What happens, in order:

1. **Phase 1 — categories.** Top-level + subcategory rows are upserted by slug.
   For every entry in `CATEGORY_MIGRATIONS`, products are reassigned to the
   target subcategory and the deprecated row is deleted (only if no products
   nor children remain).
2. **Phase 4 — products.** For each Excel row, `findFirst({ articleCode })` →
   `update` or `create`. `Price` rows of type `wholesale` / `akciya` with
   `validTo: null` are wiped and rewritten from `priceEur` / `salePriceEur`.
3. **Phase 5 — deletions.** DB products with an `articleCode` that does not
   appear in the Excel are deleted **unless** they have associated `OrderItem`s
   (Restrict FK from `Order` history) — those are reported as blocked.

`Lot`, `Barcode`, `OrderItem`, `CartItem`, `Customer`, `ProductImage` are
**never touched** by the script — those are the 1С sync surface.

### Step 6 — Redeploy the web site

If `packages/shared/src/constants/categories.ts` changed (added/removed
subcategories), the **frontend bundle must be rebuilt** so navigation, filter
checkboxes, and admin selects reflect the new shape. From the production
server:

```powershell
cd E:\ltex-ecosystem
.\scripts\deploy.ps1
```

If only DB content changed (new products, no constants edit) the site
auto-revalidates `/catalog` and `/lots` via the next request — no redeploy
needed.

### Step 7 — Post-apply verification

```sql
-- Smoke counts
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM products WHERE in_stock = true;
SELECT COUNT(*) FROM categories WHERE parent_id IS NOT NULL;

-- Spot-check categories: deprecated should be empty, new should be present
SELECT slug, name FROM categories WHERE slug IN
  ('tolstovky','palto','sukni','spidnytsi','sukni-spidnytsi','miks-odyag');

-- Find any product still pointing at a deprecated category
SELECT p.article_code, c.slug AS category_slug
FROM products p JOIN categories c ON c.id = p.category_id
WHERE c.slug IN ('tolstovky','palto','verhniiy-odyag','dytiachyi-odyag','kostyumy','kombinezony','sukni','spidnytsi');
```

Open `https://new.ltex.com.ua/catalog` and verify:

- Sidebar / mobile bottom-sheet shows new subcategories (Шкарпетки, Лосини,
  Спортивне взуття, etc.).
- Each new subcategory page renders products and isn't 404.
- `/lots` filter chips for Country include Шотландія / США.
- Admin product form (`/admin/products/new`) shows the 3 new combined quality
  options (Екстра+1й сорт, Екстра+Крем, 1й+2й сорт).

## Rollback

```powershell
# Stop the app
pm2 stop store

# Restore the snapshot from Step 4
pg_restore -c -U ltex -h localhost -d ltex E:\ltex-backups\pre-import-YYYY-MM-DD_HHmm.dump

# Restart
pm2 start store
```

If a `categories.ts` change shipped to production along with the import, also
revert the frontend commit and redeploy:

```powershell
git revert <import-commit-sha>
.\scripts\deploy.ps1
```

## Incremental import (single SKU / new SKUs only)

The script is idempotent: every row is upserted by `articleCode`, and prices
are deleted-then-rewritten per product. To process only a subset, you have two
options:

1. **Filter the Excel before running.** Easiest for a one-off — keep just the
   SKUs you want and run `--apply` as usual. Phase 5 (deletions) will then
   propose to delete every SKU not in your filtered file — **don't run
   `--apply` in this mode.** Instead, generate the dry-run report, review, and
   then re-run with the full Excel after merging changes.
2. **Edit the script** to early-return in Phase 5 (deletions) when working with
   a partial Excel, e.g. add a `--no-delete` flag. Not implemented yet — open
   a session if you need it.

For routine "1С changed N rows, sync to site" workflows, use the existing
`/api/sync/products` endpoint (1C → site) — that path is incremental by
design. This script is for the rare full-catalog rebuild from a manually
curated Excel.

## Troubleshooting

**`Excel not found at …`** — the script resolves `Повний каталог товарів.xlsx`
relative to `process.cwd()`. Run from the repo root, or pass the path via env:

```powershell
$env:CATALOG_FILE = "C:\path\to\file.xlsx"  # not yet wired — see follow-up below
```

**`@prisma/client did not initialize yet`** — run
`pnpm --filter @ltex/db exec prisma generate`.

**`DB probe failed`** — check `DATABASE_URL` is exported. The script will
continue in offline mode but the report won't include UPDATE/DELETE counts.

**`prisma.product.delete failed: ... Foreign key constraint`** — a Lot or
ProductImage still references the product. Either delete those manually or
keep the SKU in Excel until inventory is closed out.

**Slug collision report shows many entries** — multiple Excel rows have
similar names. Check whether the source data really intends two products with
near-identical names. Suffixes `-2`, `-3` are stable across runs as long as
row order is preserved.

## Where the logic lives

| File                                               | What                                                          |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `scripts/import-catalog-from-excel.ts`             | CLI entry, Excel reader, Prisma upsert / delete               |
| `packages/shared/src/utils/import-catalog.ts`      | Pure parsers + classification + slug maps                     |
| `packages/shared/src/utils/import-catalog.test.ts` | Parser unit tests (run via `pnpm --filter @ltex/shared test`) |
| `packages/shared/src/constants/categories.ts`      | Canonical CATEGORIES tree (frontend sources this)             |
| `packages/shared/src/constants/quality.ts`         | QUALITY_LEVELS + labels                                       |
| `packages/shared/src/constants/business.ts`        | COUNTRIES + labels                                            |
| `packages/shared/src/types/product.ts`             | SEASONS + labels                                              |

## Follow-ups (not in scope)

- Wire `CATALOG_FILE` env var override.
- Add `--no-delete` flag for partial-Excel runs.
- Backfill product images (currently a manual upload via `/admin/products`).
- Surface "Stub descriptions (6 SKU)" in admin so editors can fill them.
