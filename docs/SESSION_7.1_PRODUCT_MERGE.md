# Сесія 7.1 — Злиття дублікатів номенклатури (1С-дублікати одного артикула)

> Рішення user (2026-07-03): дублікати з 1С (старий запис з історією + новий актуальний,
> однаковий артикул, різні code1C) — ЗЛИВАТИ: історію перенести на актуальний, старий прибрати.
> Приклади: арт. 37047 (Футболки ↔ Різне, 2/1314 лотів), 37062, 58058.
> ⚠️ ЗАПУСКАТИ ПІСЛЯ Блоку 0 (щоб не конфліктувати у робочому дереві) і БАЖАНО після
> фінальної звірки B2–B7 (рухи регістрів ще реімпортуються).

## Чому не можна «просто видалити старий»

1. **Реімпорт відтворює**: усі імпорти upsert-ять Product по `code1C` — видалений дублікат
   повернеться першим же `--entity products`.
2. **Рухи регістрів** (`StockMovement`/`SalesMovement`/`CostMovement`/`OrderRemainderMovement`)
   тримають `productCode1C` (hex старого) + `productId` — без перенаправлення звіти покажуть
   «невідомий товар» або загублять кількості.

## Дизайн

### Нова модель `ProductMerge` (невелика міграція)

`{ id, oldCode1C @unique, targetProductId (FK→Product, onDelete: Restrict), oldName, mergedAt }`
— журнал злиттів + мапа для імпортера.

### Скрипт `scripts/merge-duplicate-products.ts`

- **Виявлення груп**: товари з `code1C IS NOT NULL`, згруповані по `articleCode`, де >1 запису.
- **Вибір цільового (survivor)**: евристика — той, що має вільні лоти (`status in free/on_sale`);
  fallback: `inStock=true`; fallback: новіший `createdAt`. Список груп + вибір → у dry-run звіт
  (user переглядає ПЕРЕД apply; можливість override через CSV/аргумент, як мінімум `--only <article>`)
- **Перенесення на survivor** (транзакція на групу):
  `Lot.productId`, `OrderItem.productId`, `SaleItem.productId`, `ReceivingItem.productId`,
  `PurchasePrice.productId`, `ViewLog`, `Favorite` (дедуп по unique), `VideoSubscription`,
  `CartItem.productId` (дедуп), `Price` — ПЕРЕНОСИТИ лише ті типи/періоди, яких survivor не має
  (конфлікт unique (productId,priceType,validFrom) — пропускати з логом), `ProductImage` — НЕ
  переносити (у старого зазвичай нема; якщо є — перенести в кінець списку survivor).
  `FeaturedProduct` старого — видалити (unique на product).
- **Рухи регістрів**: `update*Movement set productId=survivor where productCode1C=oldHex`
  (hex НЕ міняти — він історичний ключ джерела; резолв у звітах іде productId-first).
- **Фіналізація**: створити `ProductMerge(oldCode1C→survivor)`, видалити старий Product
  (на цей момент на ньому не повинно лишитись Restrict-посилань).
- Гарди як у delete-non-1c: dry-run дефолт, `--apply --confirm-prod`, pg_dump-попередження,
  батчі/транзакції, підсумкова таблиця (груп злито / рядків перенесено по моделях).

### Імпортер (`import-1c-historical.ts`) — навчити мапи злиттів

- На старті завантажити `ProductMerge` → `mergedCode1C: Map<oldHex, targetProductId>`.
- `--entity products`: якщо hex ∈ мапи — НЕ створювати/оновлювати старий товар (skip з лічильником).
- Резолв товару по code1C (products dict / lots / barcodes / регістри / документи):
  спершу глянути в мапу злиттів → повертати targetProductId.
- Тест на чистий хелпер резолву з мапою.

### CRM Прайс

- Після злиття дублікати зникнуть самі (старий Product видалено). Додатково НЕ фільтруємо.

## Прогін (user)

1. pg_dump. 2. Dry-run → переглянути список груп/survivor-ів → 3. `--apply --confirm-prod`.
2. Перевірити пари 37047/37062/58058 у CRM. Реімпорти після цього безпечні (мапа поважається).
