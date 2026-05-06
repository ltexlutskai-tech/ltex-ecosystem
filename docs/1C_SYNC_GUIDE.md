# 1С → L-TEX Site Sync API

Цей документ описує endpoints для вивантаження товарів, лотів, цін, категорій
і курсів з 1С у L-TEX web-сайт. Є також endpoint для забирання нових
замовлень з сайту назад у 1С.

## Auth

Усі endpoints вимагають заголовок `Authorization: Bearer <SYNC_API_KEY>`. Ключ
генерує розробник сайту і передає у безпечному каналі. Зберігається на сервері
L-TEX у `apps/store/.env`.

## Base URL

- **Production:** `https://new.ltex.com.ua/api/sync`
- **Staging/test:** немає (тестуй на проді з low-volume батчами)

## Rate limit

10 запитів за хвилину з одного IP. При перевищенні — `429 Rate limit exceeded`.
Рекомендація: батчі по 100-500 entities, з паузою 6+ секунд між батчами.

## Recommended sync order (per session)

1. **POST /categories** — спочатку всі категорії (з parent-hierarchy)
2. **POST /products** — після того як категорії існують
3. **POST /prices** — після того як products існують
4. **POST /lots** — після того як products існують (lot↔product лінк через
   `articleCode`)
5. **POST /rates** — окремо, у будь-який час
6. **GET /orders/export?since=<ISO>** — забір нових замовлень для обробки в 1С

---

## POST `/api/sync/categories`

Bulk upsert категорій. Ідентифікатор — `slug` (URL-safe, lowercased).

### Request

```json
[
  { "slug": "odyag", "name": "Одяг", "position": 1 },
  { "slug": "shtany", "name": "Штани", "parentSlug": "odyag", "position": 1 },
  { "slug": "vzuttia", "name": "Взуття", "position": 2 }
]
```

### Response

```json
{ "created": 1, "updated": 2, "errors": 0, "errorDetails": [], "total": 3 }
```

### Behaviour

- 2-pass: спочатку всі ствояться/оновлюються без parent-зв'язків, потім
  `parent_id` resolve-яться. Тож 1С може надіслати child + parent у будь-якому
  порядку у тому самому батчі.
- Не видаляє існуючих категорій (видалення — тільки manual через адмінку).
- `parentSlug` може бути `null` або відсутнім (top-level категорія).
- `position` ≥ 0, integer (default 0).

---

## POST `/api/sync/products`

Bulk upsert товарів. Ідентифікатор — `code1C` (унікальний).

### Request

```json
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
```

### Required fields

- `code1C`, `name`, `slug`, `categorySlug`, `quality`, `country`

### Optional fields

- `articleCode` — потрібен для лінку з лотами (через `/api/sync/lots`).
- `description`, `season`, `priceUnit` (default `"kg"`), `averageWeight`,
  `videoUrl`, `inStock` (default `true`).
- `gender`, `sizes`, `unitsPerKg`, `unitWeight` — нові поля з S59. Можна `null`
  або відсутнє. Відображаються у "checklist" на product page (KeyFactsList).

### Quality values

`Екстра` | `Крем` | `1й сорт` | `2й сорт` | `Сток` | `Мікс` (вільний текст,
не enum).

### Country values

`Англія`, `Німеччина`, `Канада`, `Польща`, ... (вільний текст).

### priceUnit values

- `kg` — ціна за кілограм (default, переважна більшість товарів).
- `piece` — ціна за штуку/пару (взуття, 91 позиція).

### Errors

- `Category not found: <slug>` — спочатку sync категорії.
- Validation errors → `details` array (перші 5 issues).

---

## POST `/api/sync/prices`

Bulk upsert цін на продукти. Ідентифікатор — `(productCode1C, priceType,
validFrom)`.

### Request

```json
[
  {
    "productCode1C": "PROD-0260",
    "priceType": "wholesale",
    "amount": 7.9,
    "currency": "EUR",
    "validFrom": "2026-05-01T00:00:00Z"
  },
  {
    "productCode1C": "PROD-0260",
    "priceType": "akciya",
    "amount": 6.5,
    "currency": "EUR",
    "validFrom": "2026-05-01T00:00:00Z",
    "validTo": "2026-05-31T23:59:59Z"
  }
]
```

### priceType values

- `wholesale` — основна оптова ціна (показується на сайті).
- `akciya` — акційна ціна (показується перекреслено + sale badge коли є).
- Інші (`retail`, `dribnyy-opt`, ...) — приймаються, не render-ляться (на
  майбутнє).

### Currency

`EUR` (default) | `UAH` | `USD`. На сайті показ — `EUR` primary +
конвертація в `UAH` через `getCurrentRate()`.

### validFrom / validTo

ISO 8601 datetime з зоною (наприклад `2026-05-01T00:00:00Z`). `validFrom` —
default `now()` коли відсутній. `validTo` — `null` за замовчуванням
(безстрокова ціна).

### Behaviour

- Якщо ціна з тим `(productId, priceType, validFrom)` уже є → update
  `amount` / `validTo`.
- Інакше → create.
- `Product not found: <code>` помилка коли в DB немає продукту з таким
  `code1C` — спочатку sync products.

---

## POST `/api/sync/lots`

Bulk upsert лотів. Ідентифікатор — `barcode` (унікальний).

### Request

```json
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
```

### Required fields

- `barcode`, `articleCode`, `weight`, `priceEur`

### Optional fields

- `quantity` (default 1), `status` (default `"free"`), `videoUrl`.

### status values

`free` | `reserved` | `on_sale` (sync API не приймає `sold` — переводь у
`sold` через адмінку при відвантаженні).

### priceEur

Це **TOTAL** ціна за весь лот (не per-kg). Розраховується у 1С як
`weight × per-kg-price` або custom.

### Lot ↔ Product link

Через `articleCode`. Якщо product з таким `articleCode` не існує → error
`Product not found: <code>`.

---

## POST `/api/sync/rates`

Курси валют для конвертації EUR → UAH на сайті.

### Request

```json
[
  {
    "currencyFrom": "EUR",
    "currencyTo": "UAH",
    "rate": 43.5,
    "date": "2026-05-04T09:00:00Z",
    "source": "1c"
  }
]
```

### Fields

- `currencyFrom`, `currencyTo` — `EUR` | `UAH` | `USD`.
- `rate` — positive number.
- `date` — ISO 8601 datetime (default `now()`).
- `source` — вільний текст (наприклад `"1c"`, `"nbu"`).

Сайт використовує **останній за датою** курс через `getCurrentRate()`. Можна
push кілька разів на день.

---

## GET `/api/sync/orders/export?since=<ISO>&status=<status>`

Забір нових замовлень з сайту для обробки в 1С.

### Request

```
GET /api/sync/orders/export?since=2026-05-04T00:00:00Z&status=new
Authorization: Bearer <SYNC_API_KEY>
```

### Response

```json
{
  "orders": [
    {
      "id": "cm0...",
      "code1C": null,
      "status": "new",
      "customer": {
        "code1C": null,
        "name": "...",
        "phone": "...",
        "email": "...",
        "telegram": "..."
      },
      "totalEur": 169.85,
      "totalUah": 7395.49,
      "exchangeRate": 43.55,
      "notes": "...",
      "items": [
        {
          "barcode": "2580...",
          "productCode1C": "PROD-0260",
          "weight": 20.5,
          "priceEur": 161.95,
          "quantity": 1
        }
      ],
      "createdAt": "2026-05-04T..."
    }
  ]
}
```

### Workflow

1. 1С робить GET кожні N хвилин з `since=<останній_синхр>`.
2. Створює документ Замовлення Покупця у 1С.
3. POST `/api/sync/orders/update` (TODO — окремий endpoint, поки робиться
   вручну менеджером через `/admin/orders`) щоб поставити `code1C` і змінити
   status.

---

## Test commands (PowerShell)

```powershell
$KEY = "<SYNC_API_KEY>"
$URL = "https://new.ltex.com.ua/api/sync"
$h = @{ Authorization = "Bearer $KEY"; "Content-Type" = "application/json" }

# Test categories
$body = '[{"slug":"test-cat","name":"Test Category","position":99}]'
Invoke-RestMethod -Uri "$URL/categories" -Method Post -Headers $h -Body $body

# Test categories with parent
$body = '[{"slug":"test-parent","name":"Parent"},{"slug":"test-child","name":"Child","parentSlug":"test-parent"}]'
Invoke-RestMethod -Uri "$URL/categories" -Method Post -Headers $h -Body $body

# Test products (з S59 полями)
$body = '[{"code1C":"TEST-1","name":"Test","slug":"test-1","categorySlug":"test-cat","quality":"Мікс","country":"Польща","gender":"Унісекс","sizes":"S-XL","unitsPerKg":"4-5 шт/кг","unitWeight":"0.2-0.25 кг"}]'
Invoke-RestMethod -Uri "$URL/products" -Method Post -Headers $h -Body $body

# Test prices (wholesale + akciya)
$body = '[{"productCode1C":"TEST-1","priceType":"wholesale","amount":7.9,"currency":"EUR"},{"productCode1C":"TEST-1","priceType":"akciya","amount":6.5,"currency":"EUR","validTo":"2026-12-31T23:59:59Z"}]'
Invoke-RestMethod -Uri "$URL/prices" -Method Post -Headers $h -Body $body

# Test lots
$body = '[{"barcode":"TEST-LOT-1","articleCode":"TEST-1","weight":20.5,"priceEur":161.95}]'
Invoke-RestMethod -Uri "$URL/lots" -Method Post -Headers $h -Body $body

# Test rates
$body = '[{"currencyFrom":"EUR","currencyTo":"UAH","rate":43.5}]'
Invoke-RestMethod -Uri "$URL/rates" -Method Post -Headers $h -Body $body

# Test orders export
Invoke-RestMethod -Uri "$URL/orders/export?status=new" -Method Get -Headers $h
```

## Errors

| Code | Meaning                                 | Action                                                                          |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------- |
| 401  | Unauthorized — bad/missing SYNC_API_KEY | Перевір env var на L-TEX сервері                                                |
| 400  | Validation failed                       | Read `details` для перших 5 помилок                                             |
| 404  | Product/Category not found              | Sync залежності спочатку (категорії перед products, products перед lots/prices) |
| 429  | Rate limit (10/min/IP)                  | Sleep 60s, retry                                                                |
| 500  | Server error                            | Скажи розробнику сайту                                                          |

> ⚠️ "Product not found" / "Category not found" повертаються у відповіді 200
> з полем `errorDetails: [...]` — endpoint все одно обробляє інші позиції з
> батчу. Тож завжди перевіряй `errors` count у response.

## SyncLog audit trail

Кожен successful upsert логується у table `sync_logs` (`entity`, `entityId`,
`action`, `payload`, `syncedAt`). Адмін бачить це у `/admin/sync-log`.
Корисно для debug-у "куди дівся товар".

| entity     | entityId                          | example                      |
| ---------- | --------------------------------- | ---------------------------- |
| `category` | `slug`                            | `shtany`                     |
| `product`  | `code1C`                          | `PROD-0260`                  |
| `price`    | `productCode1C:priceType`         | `PROD-0260:wholesale`        |
| `lot`      | `barcode`                         | `2580101020506101332006008T` |
| `rate`     | (немає логування — тільки upsert) | —                            |
