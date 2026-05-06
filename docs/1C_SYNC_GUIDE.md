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
7. **POST /orders/import** — push замовлень, створених у 1С (телефонні заявки), назад у сайт

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

## POST `/api/sync/orders/import`

Push замовлень з 1С на сайт. Використовується коли менеджер створив замовлення
у 1С (наприклад з телефонної заявки) і його треба показати у `/admin/orders`,
а також коли 1С оновлює status уже синхронізованого замовлення.

Ідентифікатор — `code1C` (Order.code1C @unique). Upsert: якщо замовлення з цим
`code1C` уже існує, його дані оновлюються і items замінюються повністю
(старі OrderItem видаляються, нові створюються заново).

### Request

```
POST /api/sync/orders/import
Authorization: Bearer <SYNC_API_KEY>
Content-Type: application/json

[
  {
    "code1C": "ORD-1С-00042",
    "customer": {
      "code1C": "CUST-001",
      "name": "Іван Петров",
      "phone": "+380676710515",
      "email": "ivan@example.com",
      "telegram": "@ivan",
      "city": "Луцьк"
    },
    "status": "confirmed",
    "totalEur": 161.95,
    "totalUah": 7080.92,
    "exchangeRate": 43.72,
    "notes": "Доставка Новою Поштою, відділення 5",
    "createdAt": "2026-05-01T12:00:00Z",
    "items": [
      {
        "barcode": "2580101020506101332006008T",
        "productCode1C": "PROD-0260",
        "priceEur": 161.95,
        "weight": 20.5,
        "quantity": 1
      }
    ]
  }
]
```

### Response

```json
{
  "created": 1,
  "updated": 0,
  "errors": 0,
  "errorDetails": [],
  "total": 1
}
```

### Required fields

- `code1C` — унікальний ID замовлення у 1С
- `customer.name` — обов'язкове, max 200 символів
- `items[].productCode1C` — товар має існувати на сайті (синхронізовано раніше)
- `items[].priceEur` / `weight` / `quantity` — числові значення

### Optional fields

- `customer.code1C` — якщо переданий, шукаємо клієнта по цьому коду; якщо не
  знайдено — fallback на phone; якщо не знайдено по phone — створюємо нового.
  При знайденні існуючого — його дані оновлюються (включно з `code1C` якщо був
  пустим).
- `customer.phone` / `email` / `telegram` / `city` — заповнюються/оновлюються
  на клієнті
- `status` — один з `new` / `confirmed` / `processing` / `shipped` /
  `completed` / `cancelled` (default `new`)
- `totalEur` / `totalUah` / `exchangeRate` — числові, нульові за замовчуванням
- `notes` — довільний коментар менеджера
- `createdAt` — ISO 8601 (`2026-05-01T12:00:00Z`); якщо не передано —
  використовується час обробки запиту (тільки при create, на update — не
  чіпається)
- `items[].barcode` — якщо переданий, лот має існувати і належати тому самому
  товару (`productCode1C`). Якщо не переданий — позиція без конкретного лота
  (загальна позиція; менеджер обере вільний лот пізніше).

### Customer matching

1. Якщо `customer.code1C` переданий → шукаємо клієнта по `code1C` (унікальне)
2. Інакше якщо `customer.phone` переданий → шукаємо першого клієнта з таким
   phone
3. Якщо нічого не знайдено → створюємо нового клієнта з усіма переданими
   полями
4. Якщо знайдено існуючого → оновлюємо name/phone/email/telegram/city (плюс
   code1C якщо переданий) — null-значення в payload **зануляють** поля
   клієнта.

### Errors

- "Product not found: ..." — продукт з `productCode1C` не знайдено на сайті.
  **Дія:** синхронізуй products перед orders.
- "Lot not found: ..." — переданий barcode, але лот відсутній. **Дія:**
  синхронізуй lots, або прибери barcode (тоді буде загальна позиція).
- "Lot ... does not belong to product ..." — barcode існує, але прив'язаний до
  іншого товару. **Дія:** перевір mapping articleCode у 1С.

Помилки повертаються у `200 OK` з масивом `errorDetails` (max 10) — інші
order-и з батчу обробляються окремо.

### Workflow

1. Менеджер створює "Замовлення Покупця" у 1С з телефону.
2. 1С робить POST `/api/sync/orders/import` з `code1C`, customer, items.
3. На сайті у `/admin/orders` з'являється новий запис.
4. Якщо у 1С міняється статус → 1С пере-надсилає те саме замовлення з оновленим
   `status` (upsert замінить items + status + totals).

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

# Test orders import (push 1С-created order to site)
$body = '[{"code1C":"ORD-1С-TEST","customer":{"name":"Тест","phone":"+380000000000"},"status":"new","items":[{"productCode1C":"TEST-1","priceEur":10,"weight":5,"quantity":1}]}]'
Invoke-RestMethod -Uri "$URL/orders/import" -Method Post -Headers $h -Body $body
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

| entity         | entityId                          | example                      |
| -------------- | --------------------------------- | ---------------------------- |
| `category`     | `slug`                            | `shtany`                     |
| `product`      | `code1C`                          | `PROD-0260`                  |
| `price`        | `productCode1C:priceType`         | `PROD-0260:wholesale`        |
| `lot`          | `barcode`                         | `2580101020506101332006008T` |
| `rate`         | (немає логування — тільки upsert) | —                            |
| `order_export` | (немає id — лише count у payload) | —                            |
| `order`        | `code1C` (для import)             | `ORD-1С-00042`               |
