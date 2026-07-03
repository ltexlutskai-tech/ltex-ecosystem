# Сесія 6.2 — Задача B: чистка не-1С товарів (лишити тільки 1С)

> Рішення user (2026-07-03):
>
> 1. **Товари з історією продажів** (є OrderItem/SaleItem) — НЕ видаляти: сховати з каталогу
>    (`inStock=false` — базовий фільтр каталогу `where {inStock:true}`, `lib/catalog.ts:121`) +
>    прибрати їхні лоти/ціни/фото. Запис Product лишається → звіти/історія цілі.
> 2. **Порожні категорії** після чистки — видалити, АЛЕ лише не-1С (`Category.code1C IS NULL`);
>    1С-дерево категорій НЕ чіпати навіть порожнє.
> 3. Правило основне: **лишаємо товари з `code1C IS NOT NULL`**, решту видаляємо. ⚠️ Це свідомо
>    включає Excel-каталог S71 (805 вітринних товарів, `code1C NULL`) — user підтвердив: вітрину
>    замінять нові фото на 1С-товарах.
>
> Скрипт-патерн: dry-run за замовчуванням, реальний запис лише `--apply --confirm-prod`.
> Аудит уже є: `scripts/audit-non-1c.ts` (read-only). Без міграцій БД.
> **Обовʼязково:** `tsc --noEmit` чистий + vitest на чисті хелпери + `prettier --write`.

## Скрипт `apps/store/scripts/delete-non-1c-products.ts` (новий)

Патерн запуску/гардів — як `import-1c-historical.ts`/інші записувальні скрипти (подивитись, як вони
читають env; якщо записувальні скрипти вимагають `IMPORT_TARGET_DB_URL`-гард — зробити так само;
якщо ні — прямий `DATABASE_URL` з чітким echo цілі й `--confirm-prod`).

### Класифікація (перед будь-чим — порахувати й вивести)

- `keep1C` — `code1C IS NOT NULL` → не чіпати.
- `deleteFull` — `code1C IS NULL` і НЕМАЄ OrderItem/SaleItem → повне видалення.
- `hideHistory` — `code1C IS NULL` і Є OrderItem/SaleItem → сховати (не видаляти).

### Порядок дій для `deleteFull` (у транзакціях батчами, поважаючи FK — ПЕРЕВІРИТИ схему)

Перед написанням прочитати ВСІ FK на Product і Lot у `packages/db/prisma/schema.prisma`
(`onDelete` правила!): images/prices/lots/cartItems/receivingItems/purchasePrices/
videoSubscriptions/favorites/featuredEntry/viewLog + Lot-діти (barcodes? CartItem.lotId SET NULL,
OrderItem.lotId SET NULL). Що каскадиться — не чіпати вручну; що Restrict — видаляти явно ПЕРЕД товаром.

- Видалити: ProductImage (+ спробувати `deleteMediaByUrl(image.url)` — для старих Supabase-URL
  функція тихо no-op-не, це ок), Price, Lot (+залежні), CartItem, Favorite, FeaturedProduct,
  ViewLog, VideoSubscription, PurchasePrice, ReceivingItem?? (⚠️ якщо ReceivingItem має Restrict —
  такі товари ПЕРЕНЕСТИ у hideHistory замість падіння, і вивести окремим списком).
- Потім сам Product.

### Дії для `hideHistory`

- `inStock=false`; видалити його ProductImage (+media), Price, Lot (+залежні), CartItem, Favorite,
  FeaturedProduct — усе, що робить його видимим/продаваним. OrderItem/SaleItem НЕ чіпати.

### Категорії (після товарів)

- Категорії з `code1C IS NULL`, у яких 0 товарів і 0 дочірніх категорій → видалити (bottom-up,
  кілька проходів поки видаляється). 1С-категорії (`code1C IS NOT NULL`) не чіпати.
- Вивести список видалених + список порожніх, але залишених (1С).

### Вивід (і dry-run, і apply)

- Таблиця: keep1C / deleteFull / hideHistory / категорії до видалення — числа.
- Після apply: скільки реально видалено по кожній моделі.
- **Пост-звіт Supabase:** порахувати ProductImage/Banner з URL `%supabase%`, що ЗАЛИШИЛИСЬ
  (очікуємо ~0 після чистки) — це сигнал, що можна прибирати `*.supabase.co` з CSP.

### Безпека

- Без `--apply` — лише звіт (жодного запису). `--apply` без `--confirm-prod` — відмова.
- На старті apply вивести «зробіть pg_dump перед запуском» + 5-секундну паузу.
- Батчі по ~200 товарів, прогрес-лог кожні N.

## Після чистки (окремим кроком у ЦІЙ сесії, лише код)

- `next.config.js`: прибрати `*.supabase.co` з `images.remotePatterns` і CSP `img-src`
  (TODO-коментарі там уже стоять). Це НЕ ламає нічого після чистки, бо supabase-URL більше не буде
  (пост-звіт підтвердить; user застосує деплой після apply).

## Тести

- Чисті хелпери класифікації (given product row + counts → keep1C/deleteFull/hideHistory) — юніт.
- Скрипт у пісочниці НЕ запускати проти БД (немає БД) — лише typecheck.

## ⚠️ Прогін (user, на сервері; НЕ в цій сесії)

1. Свіжий бекап: `pg_dump` (щоденний є, але зробити ручний перед apply).
2. Цифри: `pnpm --filter @ltex/store exec tsx scripts/audit-non-1c.ts`
3. Dry-run: `pnpm --filter @ltex/store exec tsx scripts/delete-non-1c-products.ts`
4. Звірити цифри 2↔3 зі мною → 5. Apply: `... delete-non-1c-products.ts --apply --confirm-prod`
5. Деплой прибирання supabase з CSP (після пост-звіту ~0) + видалення Supabase-проєкту.
