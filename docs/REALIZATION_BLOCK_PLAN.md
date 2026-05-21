# Блок «Реалізація» — план розробки (менеджерська програма)

> **Мета:** відтворити екран «Реалізація» (`Document.РеализацияТоваровУслуг`) зі старого 1С-додатку новим інтерфейсом у `/manager/sales/*`. Працюємо на гілці розробки, мерж у `main` — orchestrator.
>
> **Статус:** ✅ Усі 5 етапів реалізовано (на гілці `claude/charming-cerf-4067W`, на ревʼю user-а). Аудит-основа: `docs/REALIZATION_BLOCK_AUDIT.md`. **⚠️ Перед deploy: `prisma migrate deploy`** (2 нові міграції: `20260525_mgr_sales`, `20260526_mgr_cash_orders`).
>
> **Тег у backlog:** M1.6. Маршрут `/manager/sales` (зараз stub `UnderConstruction`).
>
> **Особливість:** на відміну від Замовлень (де багато вже було), Реалізація — **новий блок з нуля**, але ~70% будуємо копіюванням патернів Замовлення (логіка цін, ваги, ownership, форма, список).

---

## 0. Затверджені рішення user (враховано в плані)

1. **Реалізація — окремий документ** (не породжується із Замовлення; «Додати» одразу створює нову). Зв'язок із Замовленням/Маршрутом — необов'язкові посилання, без авто-перенесення.
2. **Суть:** факт продажу/відвантаження (борг клієнта, у central — списання складу).
3. **Оплати:** **повний касовий ордер** — сума в 3 валютах (грн/EUR/USD) + безнал, авто-розрахунок **здачі**, авто-створення другого ордера (розхід) при здачі > 0. Прапор **Наложка** + сума післяплати в грн. → цей етап фактично закриває й ядро майбутнього блоку «Оплати/Каса».
4. **Додавання товарів:** **скан ШК** (ручне поле + камера) **+ підбір за прайсом**. Скан резолвить штрихкод → конкретний **лот** (вага/ціна з нього), **зберігаємо `lotId`**; **залишок/статус лота НЕ міняємо** (це central після обмінів).
5. **Без окремої «Знижки»** на рядку — менеджер редагує ціну за кг вручну (як у Замовленнях).
6. **Viber/повідомлення:** генерація тексту (клієнту / у групу) + «Поділитись» (Viber/Telegram/копіювання) — патерн блоку Прайс. «У чат» (бот) — відкласти до M1.8.
7. **Статуси:** Чернетка / Відправлено в 1С / Проведено (архів) / Скасовано (без окремого «Перевірено»).
8. **Дефолти:** «Вивантажувати в1С» = увімкнено (як у Замовленнях, не FALSE-до-Viber як 1С); «На торгового контрагента» = увімкнено (продаж зараховується агенту клієнта).
9. **Експрес-накладна (ТТН):** поле зберігаємо; фіскальну інтеграцію **CheckBox/ETTN не робимо** (окрема велика тема).
10. **Курс EUR+USD** — знімок на документі при створенні (з `ExchangeRate`); якщо курс порожній — попередження (не жорсткий блок).

---

## 1. База (моделі + міграція)

Нові моделі (additive, магазину не заважають). Зразок — `Order`/`OrderItem` + `Payment`.

### `Sale` → таблиця `mgr_sales`

- `id`, `code1C?` @unique, `docNumber` (auto-increment, відображається як «L…»/«000…»), `customerId` (FK Customer)
- `status` (draft/sent/posted/cancelled, default draft), `archived` (=проведено в 1С), `isActual`
- `totalEur`, `totalUah`, `exchangeRateEur` (КурсEUR), `exchangeRateUsd` (КурсUSD)
- `priceTypeId?` (MgrPriceType.id, без FK), `deliveryMethod?` (delivery/post/pickup), `novaPoshtaBranch?`
- `cashOnDelivery` (Наложка), `codAmountUah?` (сума післяплати грн, обчислюване)
- `assignedAgentUserId?` (кому зараховано продаж; дефолт = агент клієнта), `onTradeAgent` (прапор «На торгового контрагента», default true)
- `exportTo1C` (default true), `expressWaybill?` (ТТН)
- `notes?` (Коментар), `orderId?` (Сделка, опц.), `routeId?` (Маршрут — заглушка під блок Маршрутів)
- `createdAt`, `updatedAt`; relations: `customer`, `items`, `cashOrders`

### `SaleItem` → таблиця `mgr_sale_items`

- `id`, `saleId` (FK Cascade), `productId` (FK Product), `lotId?` (FK Lot — заповнюється при скані)
- `barcode?` (відсканований ШК), `pricePerKg` (ЦенаПродажиВес), `weight` (вага мішка), `quantity` (мішків)
- `priceEur` (рядковий підсумок = pricePerKg × weight × quantity, як total — конвенція Замовлень)

### `MgrCashOrder` → таблиця `mgr_cash_orders` (повний касовий ордер)

- `id`, `code1C?`, `saleId?` (FK), `type` (income/expense — Приход/Расход)
- `amountUah`, `amountEur`, `amountUsd`, `amountUahCashless` (безнал)
- `changeForId?` (FK self — ордер-розхід посилається на прихідний при здачі)
- `bankAccount?`, `cashFlowArticle?`, `comment?`, `agentUserId?`, `paidAt`, `createdAt`

### Sync

- enum `SyncEntityType` += `realization` (+ за потреби `cash_order`). Additive міграція.

**Міграція:** одна additive (`ADD COLUMN/CREATE TABLE IF NOT EXISTS`, idempotent) — за зразком `20260524_order_manager_fields`. **⚠️ Перед deploy: `prisma migrate deploy`.**

---

## 2. Перевикористання коду (з блоку Замовлення)

**Як є:** `order-pricing.ts`, `order-bag-weight.ts`, `price-step.ts` (не потрібен — без кроку, але хай буде), `order-delivery.ts`, `resolve-customer.ts`, `getMyClientCodes1C`; UI `client-picker.tsx`, `product-price-picker.tsx`, `order-totals.tsx`, `use-debounced-search.ts`, `EmptyState`, `ListPagination`, `OrderStatusBadge`; API `products/search`, `products/[id]/lots`.

**Адаптувати (копія+rename):** `order-create.ts`→`sale-create.ts`, `orders-list.ts`→`sales-list.ts`, `order-status.ts`→`sale-status.ts`, `canViewOrder`→`canViewSale`, `manager-order.ts`→`manager-sale.ts`, `order-form.tsx`/`items-editor.tsx`/`types.ts`, тулбар/таблиця/рядок/filter-state, `sync-orders.ts`→`sync-sales.ts`.

**Нове:** моделі+міграція; barcode-resolve endpoint; камера-сканер; повний касовий ордер (форма+розрахунок здачі); генерація Viber-тексту + share; заміна stub.

---

## 3. Етапи розробки

### Етап 1 — База + список Реалізацій

**Менеджер бачить:** список як у 1С — заміна заглушки `/manager/sales`.

> ✅ **ГОТОВО.** Моделі `Sale`/`SaleItem` (`mgr_sales`/`mgr_sale_items`) + additive idempotent міграція `20260525_mgr_sales` + `realization` у enum `SyncEntityType`. Сторінка `/manager/sales` — справжній список (Дата/Номер/Контрагент/Місто/Статус/Сума, пошук, фільтр статусу, «Відображати архівні», ownership — менеджер лише свої клієнти). Dashboard tile «Реалізація» — реальний count. Lib `sales-list.ts`/`sale-ownership.ts`/`sale-status.ts` (перевикористано `getMyClientCodes1C`). +50 тестів, сьют **1282 pass**, typecheck/prettier чисті. **⚠️ Перед deploy: `prisma migrate deploy`** (1 нова міграція). Касовий ордер (`MgrCashOrder`) — відкладено до Етапу 4 (без спекулятивної схеми).

- Моделі + міграція (розділ 1) + enum sync.
- Список: колонки **Дата+Номер**, **Контрагент**, **Місто**, **Сума** (+ Доставка, Торговий агент). Чекбокс **«Відображати архівні»** (за замовч. архівні приховані), пошук (клієнт + товари всередині), пагінація, ownership (менеджер свої / admin усі), архівні приглушені. Кнопка **«Додати»** → `/manager/sales/new`.
- `sales-list.ts` (where-builder + серіалізатор), server-page + API ділять його.
- Dashboard tile «Реалізація» — реальний count (зараз hardcode 0). Вкладка картки клієнта «Історія продаж» — підключити (читає реалізації клієнта).

### Етап 2 — Форма створення/редагування + товари (ШК + камера + підбір)

**Менеджер бачить:** `/manager/sales/new` (+ редагована `[id]`).

> ✅ **ГОТОВО.** Форма `SaleForm` (create+edit): шапка з ClientPicker (підтягує тип цін/доставку/№НП/борг), Тип цін з перерахунком рядків, Доставка, № НП, Наложка + авто-COD грн, «На торгового контрагента» + агент, «Вивантажувати в1С», ТТН, Коментар, знімок курсу EUR/USD. Товари: поле ШК (USB-сканер + нативний `BarcodeDetector`, без npm-залежності) → `GET /lots/by-barcode` (зберігає lotId) + підбір за прайсом (загальна позиція) + ред. ціна/кг. API: `POST /sales`, `GET/PATCH /sales/[id]` (posted-лок 409 + граф переходів + ownership), `GET /lots/by-barcode`. Lib `sale-create.ts` (атомарні create/update + totals), `manager-sale.ts` (Zod), `sale-status.ts` (граф переходів). **Без sync (Етап 5) і оплат (Етап 4).** +72 тести, сьют **1354 pass**, typecheck/prettier/0-`any` чисті.

- **Шапка:** ClientPicker (підтягує тип цін / доставку / № НП / борг із MgrClient), **Тип цін** (зміна → перерахунок усіх рядків), **Доставка**, **№ відділення НП**, **Наложка** + авто-сума післяплати грн, **«На торгового контрагента»** (вибір агента, дефолт = агент клієнта), **«Вивантажувати в1С»**, **ТТН**, **Коментар**, знімок курсу EUR/USD.
- **Товари:**
  - **Поле ШК** (ручний ввід + USB-сканер) + **камера** (`BarcodeDetector` API, fallback `@zxing/browser`) → `GET /lots/by-barcode` резолвить лот → товар+вага+ціна за кг (з типу цін), додає рядок зі **збереженим `lotId`** + перевірка дубля; бронь «не моя» → попередження.
  - **Підбір за прайсом** (`product-price-picker`) → загальна позиція (`lotId=null`).
  - Рядок: ред. ціна/кг, к-сть (мішків); read-only Ціна = ціна/кг×вага, Сума = Ціна×к-сть. Футер: к-сть + Сума (EUR+грн).
- **API:** `POST/GET /api/v1/manager/realizations`, `GET/PATCH /realizations/[id]`, `GET /lots/by-barcode?code=`.
- **Валідації:** заповнені рядки (порожні авто-видаляються); попередження відхилення ціни > 0.20 EUR (опц.); курс присутній.
- Форма параметризована (create+edit), як `OrderForm`.

### Етап 3 — Статуси + проведення + Viber

> ✅ **ГОТОВО.** Статуси зроблено ще в Етапі 2 (`sale-status.ts` + граф переходів + posted-лок). Тут додано Viber: чисті білдери `sale-message.ts` (`buildClientSaleMessage` клієнту + `buildGroupSaleMessage` у групу з артикулом/ШК/датою/коментарем) + секція «Повідомлення» у `SaleForm` з кнопками «Контрагенту»/«У групу», що відкривають перевикористаний `ShareSheet` (копіювати/Viber/Telegram/WhatsApp). «У чат» (бот) — TODO M1.8. +13 тестів, сьют **1367 pass**.

- Статуси draft/sent/posted(архів)/cancelled (`sale-status.ts` — label/колір + граф переходів), posted-лок (409), редагована для draft/sent.
- **Viber:** генерація тексту (клієнту / у групу — з артикулом/ШК/сектором/датою) + **ShareIcons** (Viber/Telegram/WhatsApp/копіювання) — патерн Прайсу. «У групу» у 1С вмикає експорт — у нас просто прапор. «У чат» (бот) — TODO M1.8.

### Етап 4 — Оплати (повний касовий ордер)

**Менеджер бачить:** на Реалізації кнопки «Створити оплату» / «Відкрити оплати».

> ✅ **ГОТОВО.** Модель `MgrCashOrder` (`mgr_cash_orders`) + additive міграція `20260526_mgr_cash_orders`. `cash-order.ts` (чисті `computeChange`/`convertUahTo`/`computeCashSummary` + транзакційна `createCashOrderWithChange`: прихід → при здачі>0 авто-розхід з `changeForId` + здача в обраній валюті; перерахунок `Sale.codAmountUah`). API `POST /cash-orders` (ownership), `GET /sales/[id]/cash-orders` (список + зведення). UI на сторінці `[id]`: `payment-modal` (3 валюти + безнал + валюта здачі + live-розрахунок) + `payments-panel` (до сплати/отримано/баланс). **Зведення враховує EUR/USD за курсами-знімком реалізації** (не лише грн). Закриває ядро блоку «Оплати/Каса». +39 тестів, сьют **1406 pass**. **⚠️ Перед deploy: `prisma migrate deploy`** (міграція `20260526`).

- `MgrCashOrder`: форма оплати — суми в **грн/EUR/USD + безнал грн**, банк. рахунок, стаття руху коштів.
- **Розрахунок здачі:** сума до оплати (з курсами EUR/USD) − отримано → здача; **якщо здача > 0 → авто-створення ордера-розходу** (`changeForId`).
- **Борг** = сума реалізації − оплачено; підпис «Наложка:» коли післяплата.
- «Відкрити оплати» — список касових ордерів по реалізації.
- API: `POST /api/v1/manager/cash-orders`, `GET /sales/[id]/cash-orders`.
- **Примітка:** цей етап закриває ядро окремого блоку «Оплати/Каса» — узгодити, що далі він не дублюється.

### Етап 5 — Обмін із 1С (sync)

> ✅ **ГОТОВО (каркас, mock).** Документ реалізації заведено в наявну чергу `MgrSyncJob` (`entityType=realization`), за зразком Замовлень: `enqueueSaleCreate` + `buildSaleCreatePayload` у `enqueue.ts`, fire-and-forget `enqueueSaleSyncSafe` у кінці `create/updateSaleWithItems` (best-effort, ніколи не ламає запис), `routeFor` case, маршрут `services/manager-sync` `POST /sync/realizations/:id` (mock + SOAP-гілки + ідемпотентність). Транспорт лишається mock. `docs/1C_SYNC_MODULES_SPEC.md` → новий §3.4 «СтворитиРеалізацію» (JSON-пакет + бізнес-ключі + BSL-чернетка). Sync касових ордерів — окремий follow-up. +17 тестів store (сьют **1417**), +6 manager-sync (**43**). **Реальний BSL — на загальному етапі обмінів.**

- Каркас черги (`enqueueSaleCreate` + proxy route `sync-sales.ts` + `realization` у `SyncEntityType` — вже є) пишеться тут (fire-and-forget, як Замовлення). У Етапах 2-4 створення/редагування пишуть лише в нашу DB **без** enqueue.
- **Реальний BSL** (JSON-шар на боці 1С, бо транспорт центральної — бінарний `ValueStorage`) — пишемо самі **наприкінці**, разом з усіма обмінами. Спека — у `docs/1C_SYNC_MODULES_SPEC.md` (додати розділ «СтворитиРеалізацію»).

---

## 4. Порядок

1. **Етап 1** (база + список) — фундамент.
2. **Етап 2** (форма + ШК/камера/підбір) — найбільший за обсягом.
3. **Етап 3** (статуси + Viber).
4. **Етап 4** (оплати/каса) — окремий великий шматок.
5. **Етап 5** (обмін) — відкладено до загального етапу обмінів.

---

## 5. Відкрите / ризики

- **Камера-сканер у вебі:** нативний `BarcodeDetector` (Chrome/Edge/Android/Tauri-webview), **без npm-залежності**; якщо API недоступне — кнопка камери disabled, лишається ручний ввід. USB-сканер = звичайний focus-input + Enter. `@zxing/browser` як fallback — можливе майбутнє покращення, не зараз.
- **Здача в 3 валютах:** формулу й стрес-кейси узгодимо на Етапі 4 (база — курси EUR/USD з документа).
- **Лот у sync:** зберігаємо `lotId` локально, але в central (на обмінах) поки шлемо загальну позицію — лот після готовності central.
- **docNumber:** авто-інкремент локально; при обміні справжній номер дасть 1С (зведемо по `code1C`).

---

## 6. Наступний крок

Після «ок» (і правок) — беру **Етап 1**, даю задачу воркеру, перевіряю (`git diff` + typecheck + vitest + prettier), комічу. Далі по черзі.
