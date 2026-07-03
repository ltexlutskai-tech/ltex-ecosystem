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

Реалізовано: модель `ProductMerge` + міграція `20260703_product_merge`, скрипт
`apps/store/scripts/merge-duplicate-products.ts`, обізнаність імпортера
(`import-1c-historical.ts`: мапа `mergedCode1C`, skip у `--entity products`,
резолв через `resolveMergedProductId`).

1. **Міграція + клієнт (сервер):**
   ```
   git pull
   pnpm --filter @ltex/db exec prisma migrate deploy   # 20260703_product_merge
   pnpm --filter @ltex/db exec prisma generate
   ```
2. **pg_dump** свіжий бекап.
3. **Dry-run** (за замовчуванням, лише звіт — список груп + survivor):
   ```
   # DATABASE_URL з apps/store/.env
   pnpm --filter @ltex/store exec tsx scripts/merge-duplicate-products.ts
   # одна група для перевірки:
   pnpm --filter @ltex/store exec tsx scripts/merge-duplicate-products.ts --only 37047
   ```
4. Переглянути список груп/survivor-ів → якщо ок:
   ```
   pnpm --filter @ltex/store exec tsx scripts/merge-duplicate-products.ts --apply --confirm-prod
   ```
5. Перевірити пари 37047/37062/58058 у CRM. Реімпорти після цього безпечні
   (мапа поважається: старий code1C skip-ається, посилання ведуть на survivor).

**Ризик, який варто передивитись перед apply:** survivor обирається евристикою
(найбільше вільних лотів → inStock → новіший). Якщо у dry-run survivor виглядає
не тим товаром (напр. актуальний має 0 вільних лотів у момент прогону) — злиття
все одно коректне (історія переноситься на нього), але назва/категорія survivor-а
стануть канонічними. За потреби змінити survivor вручну — поки що лише через
редагування даних (флага override немає; `--only` дозволяє ізолювати групу).
