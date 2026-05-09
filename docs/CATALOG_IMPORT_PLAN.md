# Catalog Import Plan — `Повний каталог товарів.xlsx` → DB

**Created:** 2026-05-07 (Orchestrator session)
**Source file:** `Повний каталог товарів.xlsx` (710 SKUs)
**User answers:** `Catalog_Import_Questions.xlsx` (заповнено 2026-05-07)
**Output worker spec:** `docs/SESSION_71_CATALOG_IMPORT.md`

Цей документ — джерело правди для усіх decisions з імпорту. Worker session S71 має реалізувати точно те що тут описано.

---

## 1. Розширення Constants

### 1.1 `packages/shared/src/constants/categories.ts` — нові subcategories

Додати у `CATEGORIES`:

**Одяг (`odyag`)** — додати:

| slug                  | name                  | джерело                                              |
| --------------------- | --------------------- | ---------------------------------------------------- |
| `miks-odyag`          | Мікс                  | Excel "Одяг мікс" (71)                               |
| `sportyvnyy-odyag`    | Спортивний одяг       | Excel "Спортивний одяг" (55) + 2 SKU без категорії   |
| `kofty-flisovi`       | Кофти флісові         | Excel "Кофти флісові" (20)                           |
| `robochyy-odyag`      | Робочий одяг          | Excel "Робочий одяг" (19) + Overshirt Parkside       |
| `shkarpetky`          | Шкарпетки             | Excel "Шкарпетки" (16)                               |
| `losyny`              | Лосини                | Excel "Лосини" (8)                                   |
| `kolhotky`            | Колготки              | Excel "Колготки та легінси" (5)                      |
| `lyzhnyy-odyag`       | Лижний одяг           | Excel "Лижний одяг" (6)                              |
| `spets-odyah`         | Спец-одяг             | Excel "Спец-одяг" (5) — користувач хоче окрему       |
| `vitrovky-shtormovky` | Вітровки та штормовки | Excel "Вітровки та штормовки" (5) — окрема, не merge |
| `sukni-spidnytsi`     | Сукні та спідниці     | merge `sukni` + `spidnytsi` (rename + drop старі)    |

**Взуття (`vzuttia`)** — додати:

| slug                | name             | джерело                              |
| ------------------- | ---------------- | ------------------------------------ |
| `humove-vzuttia`    | Гумове взуття    | Excel "Гумове взуття" (6)            |
| `roboche-vzuttia`   | Робоче взуття    | Excel "Робоче взуття" (5)            |
| `sportyvne-vzuttia` | Спортивне взуття | для футбольного: 87533, FBL-1, FBL-3 |

**Аксесуари (`aksesuary`)** — додати:

| slug            | name          | джерело                             |
| --------------- | ------------- | ----------------------------------- |
| `holovni-ubory` | Головні убори | Excel "Шапки та головні убори" (16) |
| `rukavytsi`     | Рукавиці      | Excel "Рукавиці / Рукавички" (20)   |

**Дім та побут (`dim-ta-pobut`)** — додати:

| slug      | name  | джерело                                                      |
| --------- | ----- | ------------------------------------------------------------ |
| `pryazha` | Пряжа | Excel "Пряжа" (5)                                            |
| `agd`     | AGD   | Excel "AGD" (6) — постачальницька абревіатура, але збережемо |

### 1.2 Категорії що **видаляємо** з `CATEGORIES`

З парних `Сукні`/`Спідниці` створюємо одну `sukni-spidnytsi`. Існуючі продукти у DB з category=`sukni`/`spidnytsi` — мігрувати на `sukni-spidnytsi`.

Видалити (попередньо мігрувати продукти на target):

| slug (DB)         | merge target                | reason                                                   |
| ----------------- | --------------------------- | -------------------------------------------------------- |
| `tolstovky`       | `svitshoty`                 | merge у Світшоти (не використовується в Excel)           |
| `palto`           | `kurtky`                    | merge у Куртки (Excel: "Куртки та пальта")               |
| `verhniiy-odyag`  | `kurtky`                    | те саме                                                  |
| `dytiachyi-odyag` | (drop, set categoryId=null) | gender=Дитяча обробляється окремо через `Product.gender` |
| `kostyumy`        | (drop)                      | не використовується                                      |
| `kombinezony`     | (drop)                      | не використовується                                      |
| `sukni`           | `sukni-spidnytsi`           | merge                                                    |
| `spidnytsi`       | `sukni-spidnytsi`           | merge                                                    |

⚠️ **Ці зміни — у БД, не у constants.** Тобто: video `categories.ts` — стане canonical новою. БД-міграція runs через worker script.

### 1.3 Категорії що **залишаємо** як є (не використовуються у Excel, але юзер залишив на майбутнє)

`sorochky`, `bluzy`, `tufli`, `sandali`, `remeni`, `kosmetyka` (parent + miks-kosmetyka).

---

### 1.4 `packages/shared/src/constants/quality.ts` — combined grades

Додати **3 нові quality values**:

```typescript
export const QUALITY_LEVELS = [
  "extra",
  "cream",
  "first",
  "second",
  "stock",
  "mix",
  "extra_first", // NEW: "Екстра+1й сорт" (43 SKU)
  "extra_cream", // NEW: "Екстра+Крем" (15 SKU)
  "first_second", // NEW: "1й+2й сорт" (13 SKU)
] as const;

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  // ...existing
  extra_first: "Екстра + 1й сорт",
  extra_cream: "Екстра + Крем",
  first_second: "1й + 2й сорт",
};
```

⚠️ User wants both behaviors: "create combined OR add to both". Combined є простіше і це джерело правди.

### 1.5 `packages/shared/src/constants/business.ts` — нові країни

```typescript
export const COUNTRIES = [
  "england",
  "germany",
  "canada",
  "poland",
  "scotland", // NEW: Шотландія (5 SKU)
  "usa", // NEW: США (для "Америка", 10 SKU)
] as const;

export const COUNTRY_LABELS: Record<Country, string> = {
  // ...existing
  scotland: "Шотландія",
  usa: "США",
};
```

### 1.6 `packages/shared/src/types/product.ts` — нова сезонна опція

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
  all_season: "Всесезонне",
};
```

---

## 2. Парсинг Excel-рядка

### 2.1 Колонки

| col | name                                   | приклад                                             |
| --- | -------------------------------------- | --------------------------------------------------- |
| A   | Артикул                                | `EX-01-001-12kg`                                    |
| B   | Номенклатура (name + youtube + weight) | `Назва, https://youtu.be/abc, 25`                   |
| C   | Опис                                   | checklist `✔Сорт: 1й, ✔Стать: Жіноча, ...`          |
| D   | Категорії                              | `Одяг, Светри, Демісезон, Жіноче, 1-й сорт, Англія` |
| E   | Цена закупки                           | `2.50` (EUR)                                        |
| F   | Цена продажи                           | `3.08` (EUR)                                        |
| G   | Цена акция                             | `2.80` (nullable, EUR)                              |
| H   | Количество (шт)                        | `15` (nullable)                                     |
| I   | Вес (кг)                               | `25` (nullable)                                     |

### 2.2 Парсинг колонки B (Номенклатура)

```python
def parse_nomenklatura(cell):
    parts = [p.strip() for p in cell.split(",")]
    url_idx = next((i for i, p in enumerate(parts)
                    if "youtube" in p.lower() or "youtu.be" in p.lower()), None)
    if url_idx is None:
        return cell.strip(), None, None
    name = ", ".join(parts[:url_idx])
    url = parts[url_idx]
    weight = parts[url_idx + 1] if url_idx + 1 < len(parts) else None
    return name, url, weight
```

### 2.3 Парсинг колонки D (Категорії) — через `classify(token)`

| Тип токена                                                                                                                                     | Куди писати у `Product`                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `quality` (Екстра / Крем / 1-й сорт / 2-й сорт / Сток / Мікс / combined)                                                                       | `Product.quality`                              |
| `season` (Зима / Літо / Демісезон / Всесезонне)                                                                                                | `Product.season`                               |
| `country` (Англія, Німеччина, Канада, Польща, Швеція, Бельгія, Франція, Італія, США/Америка, Голландія, Австрія, Данія, Нідерланди, Шотландія) | `Product.country`                              |
| `gender` (Жіноче / Чоловіче / Дитяче / Унісекс / Доросле)                                                                                      | `Product.gender`                               |
| `category` (інше)                                                                                                                              | `Product.categoryId` через subcategory mapping |

**Шум-фільтрація:**

- `"Німеччина D"` → `country = "germany"` (D ігнорується)
- `"XXL"` → ігнорувати, **не категорія**. (User окремо хоче фільтр розмірів — це не для S71, це окрема задача.)
- `"Америка"` → `country = "usa"`
- Multi-spaces, trailing spaces — `.strip()` перед classify

### 2.4 Парсинг колонки C (Опис) — у структуровані поля

Description формат:

```
✔Сорт: 1й
✔Стать: Жіноча
✔Розміри: XS-2XL
✔К-сть од.: 2-4 шт/кг
✔Вага одиниці: 0.25-0.45 кг
✔Вага лотів: 25 кг
✔Сезон: Демісезон
✔Країна: Англія
```

Parse via regex кожного `✔Ключ: значення\n` → словник, потім mapping:

| Excel checklist key | DB field                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| `✔Сорт`             | `Product.quality` (нормалізувати до slug)                                 |
| `✔Стать`            | `Product.gender` (текст as-is: "Жіноча", "Чоловіча", "Унісекс", "Дитяча") |
| `✔Розміри`          | `Product.sizes` (текст as-is: "XS-2XL", "36-46")                          |
| `✔К-сть од.`        | `Product.unitsPerKg` (текст as-is: "2-4 шт/кг")                           |
| `✔Вага одиниці`     | `Product.unitWeight` (текст as-is: "0.25-0.45 кг")                        |
| `✔Сезон`            | `Product.season`                                                          |
| `✔Країна`           | `Product.country`                                                         |
| `✔Вага лотів`       | використати тільки якщо у Excel I=null (fallback)                         |

**Зберігати повний `description` text як є — щоб користувач міг бачити оригінал.**

### 2.5 Stub-описи (порожні значення)

26 SKU у форматі `✔Сезон: \n✔Сорт: \n...` — записати `null` для structured-полів. `description` = original raw text. Не блокувати імпорт.

---

## 3. Логіка імпорту — Pseudocode

```typescript
// scripts/import-catalog-from-excel.ts

import { read } from "xlsx";
import { prisma } from "@ltex/db";

const DRY_RUN = !process.argv.includes("--apply");

// ─── Phase 1: Apply CATEGORIES changes ──────
//   - Insert new subcategories (1.1)
//   - Migrate products on old subcategory → new (sukni → sukni-spidnytsi etc)
//   - Delete old subcategories (1.2)

// ─── Phase 2: Read Excel ───────────────────
const wb = read(/* file */);
const rows = wb.Sheets[0].iter();

// ─── Phase 3: Per-row processing ───────────
for (const row of rows) {
  const articleCode = row[0];
  if (!articleCode) continue;

  const [name, videoUrl, weightFromName] = parseNomenklatura(row[1]);
  const description = row[2] || "";
  const parsed = parseDescription(description);
  const categoryTokens = parseCategoriesCell(row[3]);

  const slug = slugify(name);
  const purchasePriceEur = row[4];
  const priceEur = row[5]; // null → inStock=false
  const salePriceEur = row[6];
  const quantityPieces = row[7]; // null → "очікується"
  const weightKg = row[8] || weightFromName;

  // map categoryTokens → categoryId / quality / season / country / gender
  const cat = mapCategoryTokens(categoryTokens, articleCode); // sku-special-case lookup

  // upsert by articleCode (NOT by slug — slug duplicates resolved by LAST WINS)
  await prisma.product.upsert({
    where: { articleCode },
    create: {
      articleCode,
      slug,
      name,
      description,
      categoryId: cat.categoryId,
      quality: parsed.quality || cat.quality,
      season: parsed.season || cat.season,
      country: parsed.country || cat.country,
      gender: parsed.gender || cat.gender,
      sizes: parsed.sizes,
      unitsPerKg: parsed.unitsPerKg,
      unitWeight: parsed.unitWeight,
      videoUrl,
      priceEur: priceEur || 0,
      inStock: priceEur != null,
      // ... other defaults
    },
    update: {
      /* same shape, оновити */
    },
  });

  // upsert Price rows (wholesale + akciya)
  // upsert Lot? — НІ. Lots — через 1С sync.
}

// ─── Phase 4: Delete products NOT in Excel ──
const excelArticles = new Set(rows.map((r) => r[0]));
const dbProducts = await prisma.product.findMany({
  select: { articleCode: true },
});
const toDelete = dbProducts.filter((p) => !excelArticles.has(p.articleCode));
//   user answer #6: DELETE (hard delete via Prisma)
//   ⚠️ Cascade — Cart/OrderItem мають productId — soft через nullable FK?
//   Цей пункт — особливий, треба продумати у worker spec.

// ─── Phase 5: Output report ───────────
console.log(`
=== IMPORT REPORT ===
Phase 1: categories
  added: ${addedCount}, deleted: ${deletedCount}, migrated: ${migratedCount}
Phase 3: products
  created: ${createdCount}, updated: ${updatedCount}, skipped: ${skippedCount}
Phase 4: deletions
  to delete: ${toDelete.length}
DRY-RUN ${DRY_RUN ? "yes — no writes" : "NO — writes applied"}
`);
```

---

## 4. Особливі SKU-кейси з Sheet 3

| Артикул                    | dispatch                              |
| -------------------------- | ------------------------------------- |
| `87533`                    | `vzuttia/sportyvne-vzuttia`           |
| `COOLER-BAG-LG`            | `aksesuary/sumky`                     |
| `COOLER-BAG-MED`           | `aksesuary/sumky`                     |
| `COOLER-TUB`               | `aksesuary/sumky`                     |
| `FBL - 3`                  | `vzuttia/sportyvne-vzuttia`           |
| `FBL -1`                   | `vzuttia/sportyvne-vzuttia`           |
| `L.MIX Bodysuits`          | `odyag/bilyzna` (gender=Дитяча)       |
| `L.MIX Crivit Football #5` | **SKIP** (видалити, нема в наявності) |
| `Office pens Mix`          | `bric-a-brac/miks-bric`               |
| `Overshirt Parkside`       | `odyag/robochyy-odyag`                |
| `SPT-1 F`                  | `odyag/sportyvnyy-odyag`              |

Реалізувати як **explicit lookup map** у скрипті: коли categoryTokens дають `category?` без матча — звертатися до цього map; якщо нема — log warning + skip.

---

## 5. Обробка дублікатів і конфліктів

### 5.1 Дублікат slug

- Generate slug з name → якщо два рядки → **last wins** (другий перезапише перший на upsert by articleCode).
- Унікальність забезпечена `articleCode` (primary lookup).
- Якщо `slug` вже зайнятий іншим `articleCode` — додати суфікс `-2`, `-3`.

### 5.2 SKU без `Цена продажи` (3 SKU)

- Зберегти продукт.
- `priceEur = 0`.
- `inStock = false`.
- Додати у звіт окремою секцією.

### 5.3 SKU без `Количество (шт)` або `Вес (кг)`

- Залишити `null` у БД (Prisma model має ці поля nullable).
- `inStock` визначається через `priceEur != null && quantityPieces != 0`.

---

## 6. Що **НЕ** імпортуємо у S71

- **Lots / barcodes** — ці зміни через 1С sync (`/api/sync/lots` не існує — 1С створює Lot через `Catalog.Номенклатура.Lots[]`?). Excel не містить barcodes.
- **Images** — manual upload через admin або 1С `Catalog.ХранилищеДополнительнойИнформации`.
- **Lot videos** — окрема секція, не у цьому файлі.
- **Categories.imageUrl** — admin задає вручну.

---

## 7. Workflow

```
S71 worker:
  1. branch claude/catalog-import-XXXXX
  2. Update categories.ts (1.1) + quality.ts (1.4) + business.ts (1.5) + product.ts (1.6)
  3. Прototype script scripts/import-catalog-from-excel.ts
  4. Run --dry-run, output → docs/CATALOG_IMPORT_DRY_RUN_REPORT.md
  5. Push to feature branch
  6. STOP — НЕ запускати --apply.
       Оrchestrator review → User approve → User runs `pnpm exec tsx scripts/import-catalog-from-excel.ts --apply` локально на server.

After approval:
  - User runs --apply (на E:\ltex-ecosystem на server)
  - DB updated
  - Site auto-revalidate через `revalidatePath("/catalog","layout")`
  - User runs `scripts/deploy.ps1` якщо CATEGORIES в коді змінились (потрібен redeploy)
```

⚠️ **Категорії у `packages/shared/src/constants/categories.ts` — це frontend.** Зміни у цьому файлі вимагають redeploy. БД-сторонні зміни (нові subcategories у DB.Category) не вимагають redeploy. Worker має **обидва** оновити.

---

## 8. Acceptance criteria для worker S71

- [ ] `pnpm -r typecheck` зелений
- [ ] `pnpm -r test` зелений (можуть знадобитись нові unit-тести для парсингу)
- [ ] `pnpm format:check` зелений
- [ ] Dry-run report показує: 0 errors, всі 710 SKUs мають categoryId
- [ ] Усі 11 SKU з Sheet 3 розміщені у правильні categories
- [ ] 95 SKU що в DB не в Excel — у списку to-delete
- [ ] 3 SKU без `Цена продажи` — окрема секція звіту
- [ ] 26 stub-описів — окрема секція звіту
- [ ] Skipping `L.MIX Crivit Football #5` — explicit log line
- [ ] Worker push'ить feature branch без --apply виконання
- [ ] Worker НЕ робить `prisma migrate` — ця міграція тільки даних, не схеми
