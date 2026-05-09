# Session 66 — 1C Sync Catalog + Lots Upload (Worker Spec)

**Дата:** 2026-05-04
**Тип:** worker
**Ефорт:** ~3-4 год
**Branch:** `claude/s66-1c-sync-catalog`
**Контекст:** Перед production go-live треба завершити infrastructure для вивантаження товарів і лотів з 1С → сайт. Базові endpoints (`/api/sync/products`, `/api/sync/lots`, `/api/sync/rates`, `/api/sync/orders/export`) вже існують, secured через `SYNC_API_KEY`, з rate limit, Zod validation, SyncLog. **Треба:** доповнити новими полями S59, додати endpoints що бракують, і написати docs для 1С-розробника.

## Issues

### 1. Extend syncProductSchema з 4 новими полями (S59)

**Файл:** `apps/store/lib/validations.ts`

Зараз `syncProductSchema` НЕ приймає `gender`, `sizes`, `unitsPerKg`, `unitWeight` — ці поля додані у S59 (`docs/SESSION_59_PRODUCT_CARD_REDESIGN.md`), але не пробросились у sync контракт. Тож 1С не може заповнити їх.

Додай:

```ts
export const syncProductSchema = z.object({
  code1C: z.string().min(1),
  articleCode: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().min(1),
  categorySlug: z.string().min(1),
  description: z.string().optional(),
  quality: z.string().min(1),
  season: z.string().optional(),
  country: z.string().min(1),
  priceUnit: z.enum(["kg", "piece"]).optional(),
  averageWeight: z.number().positive().optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  inStock: z.boolean().optional(),
  // ─── S66: нові поля з S59 ────────────────────────────────
  gender: z.string().max(50).optional().nullable(),
  sizes: z.string().max(100).optional().nullable(),
  unitsPerKg: z.string().max(50).optional().nullable(),
  unitWeight: z.string().max(50).optional().nullable(),
});
```

**Файл:** `apps/store/app/api/sync/products/route.ts` — у блоці `data = {...}` (~рядки 59-72) додай:

```ts
gender: p.gender ?? null,
sizes: p.sizes ?? null,
unitsPerKg: p.unitsPerKg ?? null,
unitWeight: p.unitWeight ?? null,
```

### 2. New endpoint: `/api/sync/categories`

**Проблема:** Зараз `/api/sync/products` падає з `Category not found: <slug>` якщо 1С створив нову категорію якої немає у web DB. Адмін сайту мусить спочатку додати її через `/admin/categories`. Це ламає automated flow.

**Файл:** новий `apps/store/app/api/sync/categories/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { syncCategoriesSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`sync-categories:${ip}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncCategoriesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const cats = parsed.data;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  // Two-pass: create/upsert all without parent links first, then resolve parents.
  // 1С може надіслати child-категорію раніше за parent у тому самому батчі.

  for (const c of cats) {
    try {
      const existing = await prisma.category.findUnique({
        where: { slug: c.slug },
      });
      const data = {
        name: c.name,
        position: c.position ?? 0,
      };
      if (existing) {
        await prisma.category.update({ where: { slug: c.slug }, data });
        updated++;
      } else {
        await prisma.category.create({ data: { ...data, slug: c.slug } });
        created++;
      }
    } catch (err) {
      errors.push(
        `Failed: ${c.slug} — ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  // Pass 2: parent relationships
  for (const c of cats) {
    if (!c.parentSlug) continue;
    const child = await prisma.category.findUnique({ where: { slug: c.slug } });
    const parent = await prisma.category.findUnique({
      where: { slug: c.parentSlug },
    });
    if (child && parent && child.parentId !== parent.id) {
      await prisma.category.update({
        where: { slug: c.slug },
        data: { parentId: parent.id },
      });
    }
  }

  if (created > 0 || updated > 0) {
    revalidatePath("/catalog", "layout");
  }

  return NextResponse.json({
    created,
    updated,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    total: cats.length,
  });
}
```

**Zod схема** у `lib/validations.ts`:

```ts
export const syncCategoriesSchema = z.array(
  z.object({
    slug: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    parentSlug: z.string().max(100).optional().nullable(),
    position: z.number().int().min(0).optional(),
  }),
);
```

⚠️ Перевір що Category model має `slug @unique` (так — є у схемі). Не міняй DB schema.

### 3. New endpoint: `/api/sync/prices`

**Проблема:** Product має `prices: Price[]` relation (wholesale + akciya за `priceType`). Зараз 1С не може push прайс-лист — вони редагуються тільки через `/admin/products/<id>` вручну. Для дієвого продакшну це блокер.

**Файл:** новий `apps/store/app/api/sync/prices/route.ts`

Логіка:

- Приймає масив `{ productCode1C, priceType: "wholesale" | "akciya", amount, currency: "EUR" | "UAH", validFrom?, validTo? }`
- Знаходить Product за `code1C`
- Якщо запис з тим `(productId, priceType, validFrom)` уже є → update amount/validTo
- Інакше → create
- Інші priceType (дрібний-опт, роздріб) — приймай, але не render-ить web (це okay, на майбутнє)

```ts
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { syncPricesSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`sync-prices:${ip}`, { windowMs: 60_000, max: 10 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncPricesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const prices = parsed.data;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const p of prices) {
    try {
      const product = await prisma.product.findUnique({
        where: { code1C: p.productCode1C },
      });
      if (!product) {
        errors.push(`Product not found: ${p.productCode1C}`);
        continue;
      }
      const validFrom = p.validFrom ? new Date(p.validFrom) : new Date();
      const existing = await prisma.price.findFirst({
        where: { productId: product.id, priceType: p.priceType, validFrom },
      });
      const data = {
        amount: p.amount,
        currency: p.currency ?? "EUR",
        validTo: p.validTo ? new Date(p.validTo) : null,
      };
      if (existing) {
        await prisma.price.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.price.create({
          data: {
            productId: product.id,
            priceType: p.priceType,
            validFrom,
            ...data,
          },
        });
        created++;
      }
      await prisma.syncLog.create({
        data: {
          entity: "price",
          entityId: `${p.productCode1C}:${p.priceType}`,
          action: existing ? "update" : "create",
          payload: JSON.parse(JSON.stringify(p)),
        },
      });
    } catch (err) {
      errors.push(
        `Failed: ${p.productCode1C}/${p.priceType} — ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  if (created > 0 || updated > 0) {
    revalidatePath("/catalog", "layout");
    revalidatePath("/lots");
  }

  return NextResponse.json({
    created,
    updated,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    total: prices.length,
  });
}
```

**Zod schema** у `lib/validations.ts`:

```ts
export const syncPricesSchema = z.array(
  z.object({
    productCode1C: z.string().min(1),
    priceType: z.string().min(1).max(50), // wholesale | akciya | retail | ...
    amount: z.number().positive(),
    currency: z.enum(["EUR", "UAH", "USD"]).optional(),
    validFrom: z.string().datetime().optional(),
    validTo: z.string().datetime().optional().nullable(),
  }),
);
```

### 4. Documentation: `docs/1C_SYNC_GUIDE.md`

Comprehensive doc для 1С-розробника (українською). Структура:

```markdown
# 1С → L-TEX Site Sync API

Цей документ описує endpoints для вивантаження товарів, лотів, цін, категорій і курсів з 1С у L-TEX web-сайт. Є також endpoint для забирання нових замовлень з сайту назад у 1С.

## Auth

Усі endpoints вимагають заголовок `Authorization: Bearer <SYNC_API_KEY>`. Ключ генерує розробник сайту і передає у безпечному каналі. Зберігається на сервері L-TEX у `apps/store/.env`.

## Base URL

- **Production:** `https://new.ltex.com.ua/api/sync`
- **Staging/test:** немає (тестуй на проді з low-volume батчами)

## Rate limit

10 запитів за хвилину з одного IP. При перевищенні — `429 Rate limit exceeded`. Рекомендація: батчі по 100-500 entities, з паузою 6+ секунд між батчами.

## Recommended sync order (per session)

1. **POST /categories** — спочатку всі категорії (з parent-hierarchy)
2. **POST /products** — після того як категорії існують
3. **POST /prices** — після того як products існують
4. **POST /lots** — після того як products існують (lot-and-product лінк через `articleCode`)
5. **POST /rates** — окремо, у будь-який час
6. **GET /orders/export?since=<ISO>** — забір нових замовлень для обробки в 1С

---

## POST `/api/sync/categories`

Bulk upsert категорій. Ідентифікатор — `slug` (URL-safe, lowercased).

### Request

\`\`\`json
[
{ "slug": "odyag", "name": "Одяг", "position": 1 },
{ "slug": "shtany", "name": "Штани", "parentSlug": "odyag", "position": 1 },
{ "slug": "vzuttia", "name": "Взуття", "position": 2 }
]
\`\`\`

### Response

\`\`\`json
{ "created": 1, "updated": 2, "errors": 0, "errorDetails": [], "total": 3 }
\`\`\`

### Behaviour

- 2-pass: спочатку всі ствояться/оновлюються без parent-зв'язків, потім parent_id resolve-яться. Тож 1С може надіслати child + parent у будь-якому порядку.
- Не видаляє існуючих категорій (видалення — тільки manual через адмінку).

---

## POST `/api/sync/products`

Bulk upsert товарів. Ідентифікатор — `code1C` (унікальний).

### Request

\`\`\`json
[
{
"code1C": "PROD-0260",
"articleCode": "58010",
"name": "Штани спортивні чоловічі демісезон 1й сорт (0260)",
"slug": "shtany-sportyvni-cholovichi-demisezon-1y-sort-0260",
"categorySlug": "shtany",
"description": "Збірний лот спортивних штанів...",
"quality": "1й сорт",
"season": "Демісезон",
"country": "Польща",
"priceUnit": "kg",
"averageWeight": 20.5,
"videoUrl": "https://www.youtube.com/watch?v=abc123",
"inStock": true,
"gender": "Чоловіча",
"sizes": "M-XXL",
"unitsPerKg": "3-4 шт/кг",
"unitWeight": "0.25-0.35 кг"
}
]
\`\`\`

### Required fields

- `code1C`, `name`, `slug`, `categorySlug`, `quality`, `country`

### Optional fields

- `articleCode` — потрібен для лінку з лотами (через `/api/sync/lots`)
- `description`, `season`, `priceUnit` (default `"kg"`), `averageWeight`, `videoUrl`, `inStock` (default `true`)
- `gender`, `sizes`, `unitsPerKg`, `unitWeight` — нові поля з S59. Можна null/відсутнє. Відображаються у "checklist" на product page.

### Quality values

`Екстра` | `Крем` | `1й сорт` | `2й сорт` | `Сток` | `Мікс` (вільний текст, не enum)

### Country values

`Англія`, `Німеччина`, `Канада`, `Польща`, ... (вільний текст)

### Errors

- `Category not found: <slug>` — спочатку sync категорії
- Validation errors → `details` array

---

## POST `/api/sync/prices`

Bulk upsert цін на продукти. Ідентифікатор — `(productCode1C, priceType, validFrom)`.

### Request

\`\`\`json
[
{
"productCode1C": "PROD-0260",
"priceType": "wholesale",
"amount": 7.90,
"currency": "EUR",
"validFrom": "2026-05-01T00:00:00Z"
},
{
"productCode1C": "PROD-0260",
"priceType": "akciya",
"amount": 6.50,
"currency": "EUR",
"validFrom": "2026-05-01T00:00:00Z",
"validTo": "2026-05-31T23:59:59Z"
}
]
\`\`\`

### priceType values

- `wholesale` — основна оптова ціна (показується на сайті)
- `akciya` — акційна ціна (показується перекреслено + sale badge коли є)
- Інші — приймаються, не render-ляться (на майбутнє)

### Behaviour

- Якщо ціна з тим `(productId, priceType, validFrom)` вже є — update amount/validTo
- Інакше — create

---

## POST `/api/sync/lots`

Bulk upsert лотів. Ідентифікатор — `barcode` (унікальний).

### Request

\`\`\`json
[
{
"barcode": "2580101020506101332006008T",
"articleCode": "58010",
"weight": 20.5,
"quantity": 48,
"status": "free",
"priceEur": 161.95,
"videoUrl": "https://www.youtube.com/watch?v=abc123"
}
]
\`\`\`

### Required fields

- `barcode`, `articleCode`, `weight`, `priceEur`

### Optional fields

- `quantity` (default 1), `status` (default `"free"`), `videoUrl`

### status values

`free` | `reserved` | `on_sale` | `sold`

### priceEur

Це **TOTAL** ціна за весь лот (не per-kg). Розраховується у 1С як `weight × per-kg-price` або custom.

### Lot ↔ Product link

Через `articleCode`. Якщо product з таким articleCode не існує → error `Product not found: <code>`.

---

## POST `/api/sync/rates`

Курси валют для конвертації EUR → UAH на сайті.

### Request

\`\`\`json
[
{
"currencyFrom": "EUR",
"currencyTo": "UAH",
"rate": 43.5,
"date": "2026-05-04T09:00:00Z",
"source": "1c"
}
]
\`\`\`

Сайт використовує **останній за датою** курс (`getCurrentRate()`). Можна push кілька разів на день.

---

## GET `/api/sync/orders/export?since=<ISO>&status=<status>`

Забір нових замовлень з сайту для обробки в 1С.

### Request

\`\`\`
GET /api/sync/orders/export?since=2026-05-04T00:00:00Z&status=new
Authorization: Bearer <SYNC_API_KEY>
\`\`\`

### Response

\`\`\`json
{
"orders": [
{
"id": "cm0...",
"code1C": null,
"status": "new",
"customer": { "code1C": null, "name": "...", "phone": "...", "email": "...", "telegram": "..." },
"totalEur": 169.85,
"totalUah": 7395.49,
"exchangeRate": 43.55,
"notes": "...",
"items": [
{ "barcode": "2580...", "productCode1C": "PROD-0260", "weight": 20.5, "priceEur": 161.95, "quantity": 1 }
],
"createdAt": "2026-05-04T..."
}
]
}
\`\`\`

### Workflow

1. 1С робить GET кожні N хвилин з `since=<останній_синхр>`.
2. Створює документ Замовлення Покупця у 1С.
3. POST `/api/sync/orders/update` (TODO — окремий endpoint, поки робиться вручну менеджером через `/admin/orders`) щоб поставити `code1C` і змінити status.

---

## Test commands (PowerShell)

\`\`\`powershell
$KEY = "<SYNC_API_KEY>"
$URL = "https://new.ltex.com.ua/api/sync"
$h = @{ Authorization = "Bearer $KEY"; "Content-Type" = "application/json" }

# Test categories

$body = '[{"slug":"test-cat","name":"Test Category","position":99}]'
Invoke-RestMethod -Uri "$URL/categories" -Method Post -Headers $h -Body $body

# Test products

$body = '[{"code1C":"TEST-1","name":"Test","slug":"test-1","categorySlug":"test-cat","quality":"Мікс","country":"Польща"}]'
Invoke-RestMethod -Uri "$URL/products" -Method Post -Headers $h -Body $body

# Test rates

$body = '[{"currencyFrom":"EUR","currencyTo":"UAH","rate":43.5}]'
Invoke-RestMethod -Uri "$URL/rates" -Method Post -Headers $h -Body $body

# Test orders export

Invoke-RestMethod -Uri "$URL/orders/export?status=new" -Method Get -Headers $h
\`\`\`

## Errors

| Code | Meaning                                 | Action                                                                          |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------- |
| 401  | Unauthorized — bad/missing SYNC_API_KEY | Перевір env var на L-TEX сервері                                                |
| 400  | Validation failed                       | Read `details` для перших 5 помилок                                             |
| 404  | Product/Category not found              | Sync залежності спочатку (категорії перед products, products перед lots/prices) |
| 429  | Rate limit (10/min/IP)                  | Sleep 60s, retry                                                                |
| 500  | Server error                            | Скажи розробнику сайту                                                          |

## SyncLog audit trail

Кожен successful upsert логується у table `sync_logs` (`entity`, `entityId`, `action`, `payload`, `syncedAt`). Адмін бачить це у `/admin/sync-log`. Корисно для debug-у "куди дівся товар".
```

Збережи у `docs/1C_SYNC_GUIDE.md`.

### 5. Update test coverage

Файл: `apps/store/lib/validations.test.ts` (якщо існує — додай; інакше створи) — тести для:

- `syncProductSchema` приймає всі 4 нові поля + null + missing
- `syncCategoriesSchema` приймає parent + no-parent
- `syncPricesSchema` приймає wholesale + akciya + custom validFrom/validTo

Файли тестів для нових endpoints — out of scope (будемо тестити через PowerShell скрипт від 1С).

## Out of scope

- Mobile app sync endpoints — paused.
- 1С → site `customers` sync — окрема задача (S21).
- Site → 1C `orders/update` (1С пушить статус назад) — окрема задача.
- Authentication посилення (HMAC + timestamp anti-replay) — `SYNC_API_KEY` поки достатньо.
- DB schema changes — без них.
- Webhook flow для real-time push — поки 1С пушить батчами на cron.

## Verification

- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test` зелено
- [ ] `cd apps/store && pnpm build` standalone build success — нові routes у списку (/api/sync/categories, /api/sync/prices)
- [ ] Manual smoke (без 1С — через PowerShell з SYNC_API_KEY):
  - POST /api/sync/categories з 2-3 mock categories → 200, перевір `/admin/categories`
  - POST /api/sync/products з gender/sizes/... → 200, перевір на product page що показуються у KeyFactsList
  - POST /api/sync/prices з wholesale + akciya → 200, перевір на product card sale badge
  - POST з невалідним JSON → 400 Validation failed
  - POST без Authorization → 401
- [ ] `docs/1C_SYNC_GUIDE.md` створений з реальними прикладами

## Commit strategy

1. `feat(s66a): sync products — accept S59 fields (gender/sizes/unitsPerKg/unitWeight)`
2. `feat(s66b): sync categories — new endpoint with parent hierarchy`
3. `feat(s66c): sync prices — new endpoint for wholesale/akciya upsert`
4. `test(s66): validation schemas for sync products + categories + prices`
5. `docs(s66): comprehensive 1C sync guide for integration developer`

Push `claude/s66-1c-sync-catalog`. NOT merge to main, NOT create PR.

## Hard rules (CLAUDE.md)

- НЕ міняй DB schema.
- НЕ чіпай `output: 'standalone'`.
- TypeScript strict, 0 `any`.
- Pre-commit hook auto-prettier — НЕ bypass.
- НЕ редагуй CLAUDE.md / HISTORY.md / SESSION_TASKS.md.
- НЕ запускай pm2.
- Validation errors мають return-ити перші 5 issues у `details` (як у поточних endpoints) — паттерн зберегти.
- Усі rate limits 10/min/IP per endpoint — паттерн зберегти.
- Усі sync writes мають залишати запис у `prisma.syncLog.create()`.
