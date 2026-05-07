# Session 71 — Bulk catalog import from `Повний каталог товарів.xlsx`

**Type:** Worker session
**Branch:** `claude/catalog-import-{XXXX}`
**Source plan:** `docs/CATALOG_IMPORT_PLAN.md` (читай **перед стартом** — там усі decisions користувача)
**Source file:** `Повний каталог товарів.xlsx` (710 SKUs, у корені репо)
**Goal:** Створити repeatable script для bulk-імпорту/синку products + categories з Excel у DB.

---

## ⚠️ HARD RULES

1. **DRY-RUN by default.** Скрипт без флага `--apply` ТІЛЬКИ читає Excel + генерує звіт. Жодного `prisma.product.create/update/delete`. Worker НЕ запускає `--apply`.
2. **DO NOT touch `prisma/schema.prisma`.** Усі поля вже існують (`gender`, `sizes`, `unitsPerKg`, `unitWeight` додані у S59).
3. **DO NOT run migrations.** Тільки seed-style data writes (через --apply, який запустить юзер).
4. **DO NOT delete files** з `apps/store` чи `packages/db/`. Тільки створюй нові у `scripts/` + оновлюй constants у `packages/shared/src/constants/`.
5. Категорії у `packages/shared/src/constants/categories.ts` — **canonical for frontend**. Зміни вимагають `pnpm -r typecheck` + `pnpm -r build` зелений + redeploy.
6. **LAST WINS** на дублікатах slug — другий рядок Excel перезаписує перший.
7. **Excel articleCode** = primary lookup (НЕ slug). Але `articleCode` не `@unique` — використовуй `findFirst({ where: { articleCode } })` + create-or-update.

---

## Tasks

### 1. Update `packages/shared/src/constants/categories.ts`

Додати усі нові subcategories per `CATEGORIES_CHANGES` нижче. Видалити depricated (sukni, spidnytsi → одна `sukni-spidnytsi`; tolstovky/palto/verhniiy-odyag/dytiachyi-odyag/kostyumy/kombinezony — drop).

**Final shape — кінцевий стан `CATEGORIES`:**

```typescript
[
  {
    slug: "odyag",
    name: "Одяг",
    subcategories: [
      // EXISTING (keep):
      { slug: "futbolky", name: "Футболки" },
      { slug: "sorochky", name: "Сорочки" },
      { slug: "svitshoty", name: "Світшоти" },
      { slug: "svetry", name: "Светри" },
      { slug: "kurtky", name: "Куртки" },
      { slug: "zhylety", name: "Жилети" },
      { slug: "dzhinsy", name: "Джинси" },
      { slug: "shtany", name: "Штани" },
      { slug: "shorty", name: "Шорти" },
      { slug: "sportyvni-shtany", name: "Спортивні штани" },
      { slug: "bluzy", name: "Блузи" },
      { slug: "pizhamy", name: "Піжами" },
      { slug: "bilyzna", name: "Білизна" },
      { slug: "kupalniky", name: "Купальники" },
      { slug: "inshe-odyag", name: "Інше" },
      // NEW:
      { slug: "miks-odyag", name: "Мікс" },
      { slug: "sportyvnyy-odyag", name: "Спортивний одяг" },
      { slug: "kofty-flisovi", name: "Кофти флісові" },
      { slug: "robochyy-odyag", name: "Робочий одяг" },
      { slug: "shkarpetky", name: "Шкарпетки" },
      { slug: "losyny", name: "Лосини" },
      { slug: "kolhotky", name: "Колготки" },
      { slug: "lyzhnyy-odyag", name: "Лижний одяг" },
      { slug: "spets-odyah", name: "Спец-одяг" },
      { slug: "vitrovky-shtormovky", name: "Вітровки та штормовки" },
      { slug: "sukni-spidnytsi", name: "Сукні та спідниці" },
      // REMOVED: tolstovky, palto, sukni, spidnytsi, kostyumy, kombinezony,
      //          verhniiy-odyag, dytiachyi-odyag
    ],
  },
  {
    slug: "vzuttia",
    name: "Взуття",
    subcategories: [
      // EXISTING:
      { slug: "krosivky", name: "Кросівки" },
      { slug: "cherevyky", name: "Черевики" },
      { slug: "choboty", name: "Чоботи" },
      { slug: "tufli", name: "Туфлі" },
      { slug: "sandali", name: "Сандалі" },
      { slug: "shlopantsi", name: "Шльопанці" },
      { slug: "inshe-vzuttia", name: "Інше" },
      // NEW:
      { slug: "humove-vzuttia", name: "Гумове взуття" },
      { slug: "roboche-vzuttia", name: "Робоче взуття" },
      { slug: "sportyvne-vzuttia", name: "Спортивне взуття" },
    ],
  },
  {
    slug: "aksesuary",
    name: "Аксесуари",
    subcategories: [
      // EXISTING:
      { slug: "sumky", name: "Сумки" },
      { slug: "remeni", name: "Ремені" },
      { slug: "inshe-aksesuary", name: "Інше" },
      // NEW:
      { slug: "holovni-ubory", name: "Головні убори" },
      { slug: "rukavytsi", name: "Рукавиці" },
    ],
  },
  {
    slug: "dim-ta-pobut",
    name: "Дім та побут",
    subcategories: [
      // EXISTING:
      { slug: "postil", name: "Постіль" },
      { slug: "shtory", name: "Штори" },
      { slug: "rushnyky", name: "Рушники" },
      { slug: "kovdry", name: "Ковдри" },
      { slug: "inshe-dim", name: "Інше" },
      // NEW:
      { slug: "pryazha", name: "Пряжа" },
      { slug: "agd", name: "AGD" },
    ],
  },
  // unchanged: igrashky, bric-a-brac, kosmetyka
];
```

### 2. Update `packages/shared/src/constants/quality.ts`

```typescript
export const QUALITY_LEVELS = [
  "extra",
  "cream",
  "first",
  "second",
  "stock",
  "mix",
  "extra_first",
  "extra_cream",
  "first_second",
] as const;

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  extra: "Екстра",
  cream: "Крем",
  first: "1й сорт",
  second: "2й сорт",
  stock: "Сток",
  mix: "Мікс",
  extra_first: "Екстра + 1й сорт",
  extra_cream: "Екстра + Крем",
  first_second: "1й + 2й сорт",
};
```

### 3. Update `packages/shared/src/constants/business.ts`

```typescript
export const COUNTRIES = [
  "england",
  "germany",
  "canada",
  "poland",
  "scotland",
  "usa",
] as const;

export const COUNTRY_LABELS: Record<Country, string> = {
  england: "Англія",
  germany: "Німеччина",
  canada: "Канада",
  poland: "Польща",
  scotland: "Шотландія",
  usa: "США",
};
```

### 4. Update `packages/shared/src/types/product.ts`

```typescript
export const SEASONS = [
  "winter",
  "summer",
  "demiseason",
  "all_season",
  "",
] as const;

export const SEASON_LABELS: Record<string, string> = {
  // ...existing
  winter: "Зима",
  summer: "Літо",
  demiseason: "Демісезон",
  all_season: "Всесезонне",
  "": "—",
};
```

### 5. Створити `scripts/import-catalog-from-excel.ts`

#### 5.1 Залежності

- `xlsx` (вже є у root deps? — перевір; якщо ні — `pnpm add -D -w xlsx`).
- `@ltex/db` (Prisma client).
- Native Node: `fs`, `path`, `process.argv`.

#### 5.2 CLI

```bash
# Default — DRY RUN
pnpm exec tsx scripts/import-catalog-from-excel.ts

# Apply changes (тільки після approval)
pnpm exec tsx scripts/import-catalog-from-excel.ts --apply

# Output report path (default: docs/CATALOG_IMPORT_DRY_RUN_REPORT.md)
pnpm exec tsx scripts/import-catalog-from-excel.ts --report=path/to/report.md
```

#### 5.3 Алгоритм

**Phase 1: Reconcile categories (DB)**

```typescript
// читай packages/shared CATEGORIES → flatten subcategories
// для кожної target subcategory: prisma.category.upsert({ where: { slug } })
// для DEPRECATED slugs (tolstovky, palto, sukni, spidnytsi, kostyumy, kombinezony,
//   verhniiy-odyag, dytiachyi-odyag):
//     - find existing category by slug
//     - якщо є products у ній → update products.categoryId на target (mapping table)
//     - delete category (тільки після migration products)
```

Mapping table (DEPRECATED → target):

```typescript
const CATEGORY_MIGRATIONS: Record<string, string | null> = {
  tolstovky: "svitshoty",
  palto: "kurtky",
  "verhniiy-odyag": "kurtky",
  "dytiachyi-odyag": null, // products → categoryId стане categoryId батька 'odyag'? НІ:
  // Product.categoryId required. Setи на 'inshe-odyag' (Інше → Одяг).
  // gender тих SKUs має лишитись 'Дитяча'.
  kostyumy: "inshe-odyag",
  kombinezony: "inshe-odyag",
  sukni: "sukni-spidnytsi",
  spidnytsi: "sukni-spidnytsi",
};
```

⚠️ Phase 1 не повинна виконуватися якщо `--dry-run` — тільки log "would migrate N products from X to Y". Reconcile categories у DB робиться **ТІЛЬКИ при --apply**.

**Phase 2: Read Excel**

```typescript
import * as XLSX from "xlsx";
const wb = XLSX.readFile("Повний каталог товарів.xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1); // skip header
```

**Phase 3: Per-row processing**

Для кожного row створи `ParsedRow`:

```typescript
type ParsedRow = {
  articleCode: string;
  name: string;
  videoUrl: string | null;
  description: string;
  // parsed from description:
  parsedQuality?: string; // 'extra' | 'first' | ...
  parsedSeason?: string;
  parsedCountry?: string;
  parsedGender?: string;
  parsedSizes?: string;
  parsedUnitsPerKg?: string;
  parsedUnitWeight?: string;
  // parsed from category cell (D):
  catTokens: {
    kind: "category" | "quality" | "season" | "country" | "gender";
    value: string;
  }[];
  // resolved:
  categorySlug: string; // final mapped slug (subcategory)
  // raw:
  purchasePriceEur: number | null;
  priceEur: number | null;
  salePriceEur: number | null;
  quantityPieces: number | null;
  weightKg: number | null;
};
```

#### Helper functions:

```typescript
parseNomenklatura(cell: string): { name, videoUrl, weightFromName }
parseDescription(cell: string): { quality, season, country, gender, sizes, unitsPerKg, unitWeight }
parseCategoryCell(cell: string): Token[]
classifyToken(token: string): { kind, value }   // see logic below
slugify(name: string): string                   // lowercase + ascii + dashes
```

**Classify logic** (`classifyToken`):

| Input regex (case-insensitive, trimmed)                                                             | Output                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `^(екстра)$`                                                                                        | `quality:extra`                                                                             |
| `^(крем)$`                                                                                          | `quality:cream`                                                                             |
| `^(1[-]?[йьі]? сорт)$`                                                                              | `quality:first`                                                                             |
| `^(2[-]?[йьі]? сорт)$`                                                                              | `quality:second`                                                                            |
| `^(сток)$`                                                                                          | `quality:stock`                                                                             |
| `^(мікс)$`                                                                                          | `quality:mix`                                                                               |
| `^(екстра \+ ?1[-]?[йьі]? сорт)$`                                                                   | `quality:extra_first`                                                                       |
| `^(екстра ?\+ ?крем)$`                                                                              | `quality:extra_cream`                                                                       |
| `^(1[-]?[йьі]? \+ ?2[-]?[йьі]? сорт)$`                                                              | `quality:first_second`                                                                      |
| `^(зима)$`                                                                                          | `season:winter`                                                                             |
| `^(літо)$`                                                                                          | `season:summer`                                                                             |
| `^(демісезон)$`                                                                                     | `season:demiseason`                                                                         |
| `^(всесезонне)$`                                                                                    | `season:all_season`                                                                         |
| `^(англія)$`                                                                                        | `country:england`                                                                           |
| `^(німеччина)( D)?$`                                                                                | `country:germany` (D ignored)                                                               |
| `^(канада)$`                                                                                        | `country:canada`                                                                            |
| `^(польща)$`                                                                                        | `country:poland`                                                                            |
| `^(швеція)$`                                                                                        | `country:sweden`? (NEW — додай якщо є SKU)                                                  |
| `^(бельгія)$`, `^(франція)$`, `^(італія)$`, `^(голландія\|нідерланди)$`, `^(австрія)$`, `^(данія)$` | `country:other` АБО додай у COUNTRIES (рекомендую `other` спочатку — щоб не роздувати enum) |
| `^(шотландія)$`                                                                                     | `country:scotland`                                                                          |
| `^(сша\|америка)$`                                                                                  | `country:usa`                                                                               |
| `^(жіноче)$`                                                                                        | `gender:Жіноча`                                                                             |
| `^(чоловіче)$`                                                                                      | `gender:Чоловіча`                                                                           |
| `^(дитяче)$`                                                                                        | `gender:Дитяча`                                                                             |
| `^(мікс жіноче ?\+ ?чоловіче\|унісекс)$`                                                            | `gender:Унісекс`                                                                            |
| `^(мікс доросле ?\+ ?дитяче\|доросле)$`                                                             | `gender:Дорослий`                                                                           |
| `^(XXL\|XXXL\|2XL\|3XL\|4XL\|5XL)$`                                                                 | `noise:size` (skip — не зберігаємо)                                                         |
| else                                                                                                | `category:<original>` (для resolution через slug-mapping)                                   |

⚠️ Якщо у `parseDescription` (з ✔Сорт:) є значення — воно **в пріоритеті** над token з category cell. Категорія cell часто містить summary (combined), а описи містять single quality.

**Resolve `categorySlug`:**

```typescript
const CATEGORY_SLUG_MAP: Record<string, string> = {
  // Excel string → DB slug
  одяг: "miks-odyag", // top-level "Одяг" alone → Мікс
  "одяг мікс": "miks-odyag",
  футболки: "futbolky",
  "сорочки та блузи": "sorochky", // у Excel об'єднані → лишаємо у sorochky
  "светри та кардигани": "svetry",
  светри: "svetry",
  "кофти флісові": "kofty-flisovi",
  "куртки та пальта": "kurtky",
  куртки: "kurtky",
  штани: "shtany",
  джинси: "dzhinsy",
  шорти: "shorty",
  сукні: "sukni-spidnytsi",
  спідниці: "sukni-spidnytsi",
  "сукні та спідниці": "sukni-spidnytsi",
  білизна: "bilyzna",
  піжами: "pizhamy",
  купальники: "kupalniky",
  "робочий одяг": "robochyy-odyag",
  "спец-одяг": "spets-odyah", // user wants separate
  "спец одяг": "spets-odyah",
  "вітровки та штормовки": "vitrovky-shtormovky", // user wants separate
  "лижний одяг": "lyzhnyy-odyag",
  лосини: "losyny",
  "колготки та легінси": "kolhotky",
  колготки: "kolhotky",
  шкарпетки: "shkarpetky",
  "спортивний одяг": "sportyvnyy-odyag",
  "худі та світшоти": "svitshoty",
  світшоти: "svitshoty",
  жилети: "zhylety",
  "спортивні штани": "sportyvni-shtany",
  // Взуття
  взуття: "inshe-vzuttia",
  кросівки: "krosivky",
  черевики: "cherevyky",
  чоботи: "choboty",
  туфлі: "tufli",
  сандалі: "sandali",
  шльопанці: "shlopantsi",
  "гумове взуття": "humove-vzuttia",
  "робоче взуття": "roboche-vzuttia",
  // Аксесуари
  сумки: "sumky",
  ремені: "remeni",
  "шапки та головні убори": "holovni-ubory",
  "головні убори": "holovni-ubory",
  шапки: "holovni-ubory",
  рукавиці: "rukavytsi",
  рукавички: "rukavytsi",
  "рукавиці / рукавички": "rukavytsi",
  // Дім та побут
  постіль: "postil",
  штори: "shtory",
  рушники: "rushnyky",
  ковдри: "kovdry",
  "домашній текстиль": "inshe-dim", // merge
  "побутові товари": "inshe-dim", // merge
  пряжа: "pryazha",
  agd: "agd",
  // Іграшки
  іграшки: "miaki", // top-level alone → М'які? (більшість — м'які іграшки)
  "м'які іграшки": "miaki",
  "пластикові іграшки": "plastykovi",
  // Bric-a-Brac
  "bric-a-brac": "miks-bric",
  "bric a brac": "miks-bric",
  // Косметика
  косметика: "miks-kosmetyka",
};
```

**Special-case SKU lookup** (для 11 SKU без розпізнаваної категорії — Sheet 3):

```typescript
const SKU_CATEGORY_OVERRIDE: Record<
  string,
  { slug: string | null; gender?: string }
> = {
  "87533": { slug: "sportyvne-vzuttia" },
  "COOLER-BAG-LG": { slug: "sumky" },
  "COOLER-BAG-MED": { slug: "sumky" },
  "COOLER-TUB": { slug: "sumky" },
  "FBL - 3": { slug: "sportyvne-vzuttia" },
  "FBL -1": { slug: "sportyvne-vzuttia" },
  "L.MIX Bodysuits": { slug: "bilyzna", gender: "Дитяча" },
  "L.MIX Crivit Football #5": { slug: null }, // SKIP
  "Office pens Mix": { slug: "miks-bric" },
  "Overshirt Parkside": { slug: "robochyy-odyag" },
  "SPT-1 F": { slug: "sportyvnyy-odyag" },
};
```

Якщо `SKU_CATEGORY_OVERRIDE[articleCode].slug === null` → log "SKIPPED: not in stock" + не імпортувати.

**Defaults для required Product fields:**

| field        | default коли парсинг не дав                                  | reason                                        |
| ------------ | ------------------------------------------------------------ | --------------------------------------------- |
| `quality`    | `"mix"`                                                      | required, fallback                            |
| `country`    | `"germany"`                                                  | required — більшість SKU з Німеччини          |
| `season`     | `""`                                                         | required, default empty                       |
| `categoryId` | resolved from `inshe-odyag` (last fallback)                  | required                                      |
| `priceUnit`  | `"kg"`                                                       | окремо: для footwear (vzuttia/\*) — `"piece"` |
| `inStock`    | `true` тільки якщо `priceEur != null && quantityPieces != 0` | computed                                      |

**Phase 4: Upsert**

```typescript
// Lookup by articleCode (NOT unique — use findFirst)
const existing = await prisma.product.findFirst({
  where: { articleCode: row.articleCode },
});

const productData = {
  articleCode: row.articleCode,
  name: row.name,
  slug: ensureUniqueSlug(slugify(row.name), existing?.id),
  description: row.description,
  categoryId: getCategoryIdBySlug(row.categorySlug),
  quality: row.parsedQuality ?? row.catQuality ?? "mix",
  country: row.parsedCountry ?? row.catCountry ?? "germany",
  season: row.parsedSeason ?? row.catSeason ?? "",
  gender: row.parsedGender ?? row.catGender ?? null,
  sizes: row.parsedSizes ?? null,
  unitsPerKg: row.parsedUnitsPerKg ?? null,
  unitWeight: row.parsedUnitWeight ?? null,
  videoUrl: row.videoUrl,
  priceUnit: isFootwear(row.categorySlug) ? "piece" : "kg",
  averageWeight: row.weightKg ?? row.weightFromName ?? null,
  inStock: row.priceEur != null && (row.quantityPieces ?? 1) > 0,
};

if (DRY_RUN) {
  report.products.push({ action: existing ? "UPDATE" : "CREATE", articleCode, name, ... });
} else {
  if (existing) {
    await prisma.product.update({ where: { id: existing.id }, data: productData });
  } else {
    await prisma.product.create({ data: productData });
  }
}
```

**Prices** — окремо upsert у `Price` table (priceType `wholesale` + опціонально `akciya`):

```typescript
// wholesale
await prisma.price.upsert({
  where: { /* composite unique not exists — find first */ },
  // simpler: deleteMany + createMany approach for fresh state per import
});

// pseudocode for price sync per product:
const productId = ...;
await prisma.price.deleteMany({
  where: { productId, priceType: { in: ["wholesale", "akciya"] }, validTo: null },
});
await prisma.price.createMany({
  data: [
    { productId, priceType: "wholesale", currency: "EUR", amount: row.priceEur },
    ...(row.salePriceEur ? [{ productId, priceType: "akciya", currency: "EUR", amount: row.salePriceEur }] : []),
  ].filter(p => p.amount != null),
});
```

⚠️ **Не чіпати Lots, Barcodes, OrderItems, CartItems** — ці mng-аються через 1С.

**Phase 5: Delete products NOT in Excel**

```typescript
const excelArticles = new Set(rows.map((r) => r.articleCode).filter(Boolean));
const dbProducts = await prisma.product.findMany({
  select: { id: true, articleCode: true, name: true },
});
const toDelete = dbProducts.filter(
  (p) => p.articleCode && !excelArticles.has(p.articleCode),
);

// ⚠️ Cascade проблема:
//   Lot.productId → Cascade NOT defined? треба перевірити (default = Restrict)
//   OrderItem.productId → Restrict (продукт не можна видалити якщо є замовлення)
//   CartItem.productId → Cascade (з S59 nullable+SetNull?)
//
// Безпечний підхід: для кожного to-delete продукта:
//   - якщо є OrderItem.productId → log "BLOCKED: has orders, skipping" + skip
//   - інакше: prisma.product.delete (Lots/Cart/Favorites cascade)
```

⚠️ Якщо worker не впевнений у cascades — **РОБИ READ-ONLY у Phase 5 під час dry-run**, дай юзеру список to-delete у звіті і дай вирішити.

**Phase 6: Generate report**

Зберегти `docs/CATALOG_IMPORT_DRY_RUN_REPORT.md`:

````markdown
# Catalog Import Report (DRY-RUN)

Generated: 2026-05-07T...

## Summary

- Total Excel rows: 710
- Skipped (manual override null): 1 (`L.MIX Crivit Football #5`)
- To CREATE: 524
- To UPDATE: 185
- To DELETE (not in Excel): 95
- Categories to DEPRECATE: 8 (tolstovky, palto, …)
- Categories to ADD: 18 (miks-odyag, sportyvnyy-odyag, …)

## Issues found

### Without `Цена продажи` (3 SKUs — imported with inStock=false)

- `XXX` — Назва, …

### Without `Количество (шт)` (treated as `?`)

- 47 SKUs (list)

### Stub descriptions (parsed fields = null)

- 26 SKUs (list)

### Slug collisions (last-wins applied)

- ...

### Unrecognized category tokens (fell back to `inshe-odyag`)

- ...

## Sample CREATE preview (first 3)

```json
{
  "articleCode": "EX-01-001-12kg",
  ...
}
```
````

## DEPRECATED categories migration

- `tolstovky` → `svitshoty`: 0 products to migrate
- `palto` → `kurtky`: 5 products
- ...

## Products to DELETE (95)

- ...

```

#### 5.4 Tests (`scripts/import-catalog-from-excel.test.ts`)

Mandatory unit tests:
- `parseNomenklatura("Назва, https://youtu.be/abc, 25")` → `{ name: "Назва", videoUrl: "https://youtu.be/abc", weightFromName: 25 }`
- `parseNomenklatura("Тільки назва")` → `{ name: "Тільки назва", videoUrl: null, weightFromName: null }`
- `parseDescription("✔Сорт: 1й\n✔Розміри: XS-2XL")` → `{ quality: "first", sizes: "XS-2XL", ... }`
- `classifyToken("Німеччина D")` → `{ kind: "country", value: "germany" }`
- `classifyToken("XXL")` → `{ kind: "noise", value: "size" }`
- `slugify("Куртка демісезон")` → `"kurtka-demisezon"` (cyrillic → latin)
- Edge: empty cells, multi-spaces, trailing commas

---

### 6. Documentation

Створи `docs/CATALOG_IMPORT_OPERATIONS.md` (200-300 рядків) з runbook:
1. Як підготувати Excel
2. Як запустити dry-run + знайти report у `docs/CATALOG_IMPORT_DRY_RUN_REPORT.md`
3. Як перевірити звіт перед apply
4. Як запустити apply (`pnpm exec tsx scripts/import-catalog-from-excel.ts --apply`)
5. Як перевірити DB після apply (`SELECT COUNT(*) FROM products WHERE in_stock = true;`)
6. Як rollback (через pg_dump backup перед apply)
7. Як зробити incremental import (тільки нові SKUs?)

---

## Acceptance criteria

- [ ] Усі 4 constants файли оновлені, типи зелені
- [ ] `pnpm -r typecheck` зелений
- [ ] `pnpm -r test` зелений (з новими тестами для парсингу)
- [ ] `pnpm format:check` зелений
- [ ] `pnpm -r build` зелений (perevіriти що CATEGORIES оновлення не зламали UI rendering)
- [ ] `scripts/import-catalog-from-excel.ts` + `.test.ts` створені
- [ ] Dry-run виконується успішно (`pnpm exec tsx scripts/import-catalog-from-excel.ts`)
- [ ] `docs/CATALOG_IMPORT_DRY_RUN_REPORT.md` створено з реальними даними з Excel
- [ ] Звіт містить **усі** sections з §5.3 Phase 6
- [ ] `docs/CATALOG_IMPORT_OPERATIONS.md` runbook створено
- [ ] Жодного `prisma.*.create/update/delete` без `--apply` flag
- [ ] Push на `claude/catalog-import-{XXXX}` (НЕ merge!)

---

## Reference

- `docs/CATALOG_IMPORT_PLAN.md` — повний план з усіма decisions користувача
- `Catalog_Import_Questions.xlsx` — sirov анкета з відповідями (root)
- `Повний каталог товарів.xlsx` — джерело даних (root)
- `packages/db/prisma/schema.prisma` lines 32-72 — Product model
- `packages/db/prisma/schema.prisma` lines 130-143 — Price model
- `apps/store/lib/validations.ts` — `syncProductSchema` (для reference на валідацію)
```
