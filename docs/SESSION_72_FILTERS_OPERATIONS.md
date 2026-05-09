# Session 72 — Catalog/lots filters: operations runbook

S72 додає 4 нові фільтри у каталог + лоти: gender (multi-checkbox), sizes
(text contains), unitsPerKg range, unitWeight range. Для діапазонних фільтрів
введено 4 нові nullable Float-колонки на `Product` через міграцію
`20260508_product_numeric_ranges`. Існуючі text-колонки `unitsPerKg` /
`unitWeight` лишаються як human-readable дисплей, numeric-пара живе поряд.

## Post-merge user actions

Все треба виконати на сервері (Windows + локальна PostgreSQL 16). Worker не
має SSH-доступу — оператор виконує локально після мерджа в main.

### 1. Apply migration

```powershell
cd E:\ltex-ecosystem
git pull
pnpm install --frozen-lockfile
pnpm --filter @ltex/db exec prisma migrate deploy
```

Очікуваний вивід — `1 migration applied: 20260508_product_numeric_ranges`.

### 2. Backfill existing rows

```powershell
cd E:\ltex-ecosystem
# DRY-RUN перевірка (нічого не пише)
pnpm exec tsx scripts/backfill-numeric-ranges.ts

# Якщо звіт виглядає розумно — застосувати:
pnpm exec tsx scripts/backfill-numeric-ranges.ts --apply
```

Скрипт парсить `unitsPerKg` / `unitWeight` strings (наприклад `"2-4 шт/кг"`,
`"0,25-0,45 кг"`) у пару `(min, max)`. Idempotent — оновлює лише ті рядки де
`*Min` ще `null`. Перші 10 parse errors виводяться для аудиту.

### 3. Redeploy

```powershell
.\scripts\deploy.ps1
```

UI зміни (4 нові секції фільтрів) з'являться на `/catalog`, `/catalog/<slug>`,
`/catalog/<slug>/<sub>` та `/lots`.

## Smoke tests (cURL)

```bash
# Gender single-select
curl 'https://new.ltex.com.ua/api/catalog?gender=%D0%96%D1%96%D0%BD%D0%BE%D1%87%D0%B0'

# Gender multi-select
curl 'https://new.ltex.com.ua/api/catalog?gender=%D0%96%D1%96%D0%BD%D0%BE%D1%87%D0%B0,%D0%A3%D0%BD%D1%96%D1%81%D0%B5%D0%BA%D1%81'

# Sizes — case-insensitive substring
curl 'https://new.ltex.com.ua/api/catalog?sizes=XXL'

# unitsPerKg range overlap (2-5 шт/кг матчиться з продуктом 2-4 чи 4-6)
curl 'https://new.ltex.com.ua/api/catalog?unitsPerKgMin=2&unitsPerKgMax=5'

# unitWeight range — лише min, відкрита межа
curl 'https://new.ltex.com.ua/api/catalog?unitWeightMin=0.3'

# Combined
curl 'https://new.ltex.com.ua/api/catalog?gender=%D0%94%D0%B8%D1%82%D1%8F%D1%87%D0%B0&sizes=86&unitsPerKgMin=4'
```

## UI changes

`/catalog` (sidebar + mobile bottom-sheet) додає після Country:

1. **Стать** — multi-checkbox (Жіноча / Чоловіча / Дитяча / Унісекс / Дорослий)
2. **Розмір** — текстове поле з 350мс debounce (substring match)
3. **К-сть одиниць (шт/кг)** — від/до
4. **Вага одиниці (кг)** — від/до + Apply button (один на обидва діапазони)

`/lots` (sidebar + mobile sheet) додає ті самі 4 фільтри. Apply button лотів
тепер обробляє: weight, price, unitsPerKg, unitWeight (один комміт URL-у).

## Range overlap semantics

Продукт включається коли його `[Min, Max]` перетинається з `[filterMin, filterMax]`:

```
productMax >= filterMin   AND   productMin <= filterMax
```

Це закрите інтервальне перекриття — продукт із `unitsPerKg = 2-4` потрапить
у фільтр `unitsPerKgMin=4&unitsPerKgMax=8` (бо `4 ≤ 8` ∧ `4 ≥ 4`). Точне
співпадіння не вимагається.

## Rollback

Міграція додає 4 nullable колонки + 4 індекси, не видаляє і не змінює
існуючі. Безпечно відкатати:

```sql
DROP INDEX IF EXISTS "products_units_per_kg_min_idx";
DROP INDEX IF EXISTS "products_units_per_kg_max_idx";
DROP INDEX IF EXISTS "products_unit_weight_min_idx";
DROP INDEX IF EXISTS "products_unit_weight_max_idx";
ALTER TABLE "products"
  DROP COLUMN "units_per_kg_min",
  DROP COLUMN "units_per_kg_max",
  DROP COLUMN "unit_weight_min",
  DROP COLUMN "unit_weight_max";
```

`schema.prisma` reverted back до S59 — string columns достатньо для UI.
