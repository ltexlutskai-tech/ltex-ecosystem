# Блок «Маршрутний лист» — план розробки (менеджерська програма)

> **Мета:** відтворити 1С `Document.МаршрутныйЛист` новим інтерфейсом у `/manager/routes/*` —
> документ-агрегатор дня виїзду: Замовлення → Загрузка(скан) → Реалізації → Оплати → Бракує.
> Гілка `claude/charming-cerf-4067W`. **Аудит-основа:** `docs/ROUTE_SHEET_BLOCK_AUDIT.md`.
>
> **Тег backlog:** M1.9 (маршрут `/manager/routes` зараз stub `UnderConstruction`).
>
> **Особливість:** найбільший блок (8 вкладок), але **Реалізації й Оплати реюзають готові блоки**
> (Реалізація + Оплати/Каса) — МЛ їх лише оркеструє з прив'язкою `routeSheetId`. Маршрут — реюз
> наявного довідника `MgrRoute` (M1.3a). ~50-60% — нове (моделі, Загрузка-скан, нестача, кілометраж).
>
> **Статус:** ✅ Усі 5 етапів реалізовано (гілка `claude/charming-cerf-4067W`, на ревʼю user). Сьют:
> store 1668 pass / 2 skip + manager-sync 53; typecheck/prettier чисті, 0 нових `any`.
> **⚠️ Перед deploy: `prisma migrate deploy`** (1 нова міграція `20260528_mgr_route_sheets`).
> Свідомо: реальний 1С BSL — stub (mock-режим); Реалізації/Продажи/Оплати **виводяться** зі
> зворотних посилань (таблиці `RouteSheetSale/SaleItem/Payment` зарезервовані під payload обміну);
> «споживання Загрузки при реалізації» та жорсткий анти-дубль — відкладено; ролі — одна форма для всіх.

---

## 0. Затверджені рішення user

1. **На документі — усе одразу:** `routeId` (FK наявного `MgrRoute`), `expeditorUserId` (FK `User`),
   **кілометраж** (початок/кінець дня + попередження про незакритий попередній день), **GPS** (легкий
   best-effort знімок координат на статус-переходах). _(1С тримає кілометраж/GPS в окремих регістрах;
   ми кладемо кілометраж на сам МЛ — один МЛ = один день виїзду.)_
2. **Нестача (Бракує):** замовлено − **доступні вільні лоти** на складі (без чужих броней), як 1С.
3. **Ролі:** **одна форма для всіх** (менеджер/склад/експедитор) поки; розподіл прав по вкладках — follow-up.
4. _(Дефолти, успадковані — підтвердити при показі):_ скан як скрізь (камера `BarcodeDetector` +
   ручне поле ШК, лот сканується раз, авто-прив'язка до замовлення за товаром+лотом, вага з лота);
   Реалізації/Оплати — реюз форм з preset `routeSheetId`; статуси Составляется/Отправлен/Завершен,
   `Завершен` = lock (як `ВозвратПоЗакритомуМаршрутнику`); реальний 1С-обмін — лише spec+mock.

---

## 1. База (моделі + міграція `20260528_mgr_route_sheets`, additive)

### `RouteSheet` → `mgr_route_sheets` (шапка)

`id`, `code1C?` @unique, `docNumber` (autoincrement), `date`, `arrivalDate?`,
`status` (draft/dispatched/completed, default draft), `routeId?` (FK `MgrRoute`),
`expeditorUserId?` (FK `User`), `totalUah` / `totalEur` (default 0), `comment?`,
`mileageStartKm?` / `mileageEndKm?` (Float), `gpsLat?` / `gpsLng?` (Float),
`archived` (default false), `exportTo1C` (default true), `posted` (default false),
`createdAt` / `updatedAt`. Relations: route, expeditor, orders, items, loading, sales, saleItems, payments, tasks.

### Дочірні таблиці (additive)

| Модель / таблиця                                  | 1С таб. частина  | Ключові поля                                                                                                                                                                         |
| ------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RouteSheetOrder` `mgr_route_sheet_orders`        | `Заказы`         | `routeSheetId`, `orderId`(FK Order), `customerId`(FK Customer), `city?`                                                                                                              |
| `RouteSheetItem` `mgr_route_sheet_items`          | `ТоварыЗаказов`  | `routeSheetId`, `orderId`, `customerId`, `productId`, `lotId?`, `unit?`, `quantity`, `price`, `sum`, `quantityLoaded`(default 0)                                                     |
| `RouteSheetLoading` `mgr_route_sheet_loading`     | `ЗагрузкаМашины` | `routeSheetId`, `orderId?`, `customerId?`, `productId`, `lotId`, `barcode`, `unit?`, `quantity`(default 1), `weight`, `price`, `sum`, `pricePerKg`, `loaded`(bool), `isReturn`(bool) |
| `RouteSheetSale` `mgr_route_sheet_sales`          | `Реализации`     | `routeSheetId`, `orderId?`, `customerId`, `saleId`(FK Sale), `sum`                                                                                                                   |
| `RouteSheetSaleItem` `mgr_route_sheet_sale_items` | `Продажи`        | `routeSheetId`, `saleId`, `orderId?`, `customerId`, `productId`, `lotId?`, `unit?`, `quantity`, `price`, `sum`, `pricePerKg`                                                         |
| `RouteSheetPayment` `mgr_route_sheet_payments`    | `Оплаты`         | `routeSheetId`, `orderId?`, `saleId?`, `customerId`, `cashOrderId`(FK MgrCashOrder), `amount`                                                                                        |
| `RouteSheetTask` `mgr_route_sheet_tasks`          | `Завдання`       | `routeSheetId`, `customerId`, `comment`                                                                                                                                              |

**`НеХватает` (Бракує) — НЕ зберігаємо** (обчислюване на льоту: замовлено − доступні вільні лоти).

### Зворотні посилання (як 1С пише `.МаршрутныйЛист` на дочірні)

Додати nullable `routeSheetId` на `Order`, `Sale`, `MgrCashOrder` (+ index). Прибирання замовлення з МЛ
→ обнулення (як `ПередЗаписью` у 1С).

### Sync

enum `SyncEntityType` += `route_sheet` (additive).

**Міграція:** одна idempotent additive (за зразком `20260527_mgr_payments`). **⚠️ Перед deploy: `prisma migrate deploy`.**

---

## 2. Перевикористання коду

**Як є:** `MgrRoute` (довідник + у `/dictionaries`), `Order`/`Sale`/`MgrCashOrder`/`Customer`/`Product`/`Lot`,
`/lots/by-barcode` + нативний `BarcodeDetector` (скан з Реалізації), `client-picker`, `getMyClientCodes1C`,
`resolve-customer`, `EmptyState`/`ListPagination`, тулбар/таблиця/filter-state (з `/manager/sales`),
форми **Реалізація** (`/manager/sales/new`) + **Оплата** (`/manager/payments/new`), `ShareSheet`+Viber.

**Нове:** 7 моделей + міграція; список `/manager/routes` + форма-документ із 8 вкладками; Загрузка-скан +
авто-прив'язка; обчислення нестачі (замовлено−доступні лоти) + лічильники; кілометраж (+попередження про
незакритий день) + GPS; sync-каркас + BSL-спека.

---

## 3. Етапи розробки

### Етап 1 — База + список + шапка + Заказы + Товари

- Моделі + міграція + зворотні посилання + enum.
- Список `/manager/routes` (Дата/Номер/Маршрут/Експедитор/Статус/Сума, фільтр архівних, пошук) + «Створити».
- Форма-документ: шапка (Дата/ДатаПриезда/Маршрут/Експедитор/Статус/Коментар), вкладка **Заказы**
  (додати наявні замовлення — фільтр «виключити вже в маршруті»; створити нове; видалити з каскадом),
  вкладка **Товари** (read-only зведення, дерево по клієнту/замовленню, кнопка «Заповнити»).
- API `GET/POST /route-sheets`, `GET/PATCH /route-sheets/[id]`, ownership. Dashboard tile.

### Етап 2 — Загрузка (скан) + Бракує + лічильники

- Вкладка **Загрузка**: камера (`BarcodeDetector`) + ручне поле ШК → `/lots/by-barcode`; гард чужої
  броні; дедуплікація лота (раз); вага з лота; авто-прив'язка до замовлення (товар+лот); `loaded`/`isReturn`.
- Перерахунок `RouteSheetItem.quantityLoaded` із рядків Загрузки.
- Вкладка **Бракує** (обчислювана): замовлено − доступні вільні лоти (без чужих броней), по замовленнях.
- Лічильник «Заказов / заказано / загружено / не хватает».

### Етап 3 — Реалізації + Продажи + Оплати (реюз блоків)

- Вкладка **Реалізації**: «Реалізація»/«Непланова» → перехід на форму Реалізації з preset
  `?routeSheetId&clientId&orderId` (анти-дубль по замовлення+МЛ); на повернення — рядок `RouteSheetSale`
  - рознесення у **Продажи** + споживання рядків Загрузки. Зворотне посилання `Sale.routeSheetId`.
- Вкладка **Продажи**: read-only деталізація.
- Вкладка **Оплати**: «Створити оплату» → форма Оплата з preset `?routeSheetId&saleId&clientId&sumToPayEur`
  (анти-дубль); на повернення — рядок `RouteSheetPayment`. Зворотне `MgrCashOrder.routeSheetId`.
- Viber по реалізації (реюз).

### Етап 4 — Завдання + Кілометраж + GPS + статуси

- Вкладка **Завдання** (вільні нотатки клієнт+коментар).
- **Кілометраж**: поля початок/кінець на МЛ; при створенні/відправці — **попередження, якщо в експедитора
  є попередній МЛ без кінцевого кілометражу** (м'який блок, як 1С).
- **GPS**: best-effort знімок координат (browser geolocation) на «Відправити»/«Завершити».
- **Статуси**: переходи Составляется→Отправлен→Завершен; `Завершен` лочить редагування (як lock 1С).

### Етап 5 — Sync-каркас (mock) + BSL-спека

- `enqueueRouteSheetCreate` (entityType `route_sheet`) + `routeFor` + manager-sync роут `/sync/route-sheets`
  - mock.
- BSL-спека §3.6: двофазний контракт (`СформироватьПакетДанных`→`ДобавитьМаршрутныйЛист`; вхід
  `СоздатьМаршрутныеЛистыТовары`/`…Документы`; `ТабЧасть`-дискримінатори; обчислена `НеХватает`;
  `ВозвратПоЗакритомуМаршрутнику`; кілометраж/GPS).

---

## 4. Поза скоупом (свідомо)

- Реальний 1С BSL обмін (лише spec+mock).
- Розподіл прав по ролях (одна форма поки).
- Друкована форма МЛ (1С `Template`) — за потреби пізніше.
- Повний 1С-регістр складських залишків — нестачу рахуємо по наших `Lot` (вільні лоти).

---

## 5. Перевірка (orchestrator після кожного етапу)

`git diff` → `pnpm --filter @ltex/store run typecheck` → `vitest run` (store + manager-sync) →
`prettier --check`. 0 нових `any`; ownership server-side; магазин/`/admin/*`/mobile не чіпати.
