# Parity Audit: 1С «Заказ покупателя» vs Manager-App «Замовлення»

**Date:** 2026-06-10  
**Sources (1С):**
- `docs/1c-export-2026-06-02/Documents/ЗаказПокупателя/Ext/ObjectModule.bsl` (3160 lines)
- `docs/1c-export-2026-06-02/CommonModules/ОбменАРМ/Ext/Module.bsl` (procedures: `ДобавитьЗаказПокупателя` line 2541, `СоздатьВнутренниеЗаказы` line 3388, `ЗакрытьСтарыеЗаказы_v1` line 5174, `ПолучитьДанныеНезакрытыхЗаказов_v1` line 382)
- `docs/1c-export-2026-06-02/Catalogs/СтатусиЗамовлень/Ext/Predefined.xml`

**Sources (our side):**
- `apps/store/app/manager/(workstation)/orders/` (page.tsx, new/, [id]/, _components/)
- `apps/store/lib/manager/order-{status,create,pricing,delivery,bag-weight,ownership}.ts`
- `apps/store/lib/manager/orders-list.ts`
- `apps/store/lib/validations/manager-order.ts`
- `apps/store/lib/manager/generate-reminders.ts` (Detector C — overdue order reminders)

**Legend:**
- ✓ — present in BOTH
- ⚠️ GAP — in 1С, missing in us (needs building)
- ➕ EXTRA — in us, not in 1С (keep)

---

## 1. Header Fields (Шапка документа)

| Feature / Field | Status | Notes |
|---|---|---|
| Контрагент (client reference) | ✓ | Our `Order.customerId` → `Customer`; 1С `ЗаказПокупателя.Контрагент` |
| Тип цін (`ТипЦен`) | ✓ | Our `Order.priceTypeId` → `MgrPriceType`; 1С `ЗаказПокупателя.ТипЦен`; recalc on change in both |
| Валюта документа (`ВалютаДокумента`) | ⚠️ GAP | 1С stores the currency of the document (`ВалютаДокумента`, set from contract); we implicitly use EUR always — no explicit currency field on `Order` |
| Курс взаємрозрахунків (`КурсВзаиморасчетов`/`КратностьВзаиморасчетов`) | ✓ | Our `Order.exchangeRate` stores EUR→UAH snapshot; 1С stores the exchange rate from contract currency to management currency |
| Договір контрагента (`ДоговорКонтрагента`) | ⚠️ GAP | 1С selects the counterparty contract (determines currency, price type, rounding rules). We do not store or validate a contract reference on `Order` |
| Дата документа (`Дата`) | ✓ | Our `Order.createdAt` (auto); 1С has explicit editable `Дата` field |
| Дата відвантаження (`ДатаОтгрузки`) | ⚠️ GAP | 1С: `ДатаОтгрузки = now()+86400` on creation via sync (line 3466); also set on contract change (`УстановитьДатуОплатыПоДоговору`). We have no `shippingDate`/`дата відвантаження` on `Order` |
| Дата оплати (`ДатаОплаты`) | ⚠️ GAP | 1С sets automatically from contract (`УстановитьДатуОплатыПоДоговору`, line 2694); we have no payment due date on `Order` |
| Спосіб доставки (`Доставка`/`НаявністьДоставки`) | ✓ | Our `Order.deliveryMethod` (delivery/post/pickup); 1С `СтатусДоставки` enum (`НаявністьДоставки[Доставка]`); mapping in `mapClientDeliveryToOrder()` |
| Наложка (cash on delivery) | ✓ | Our `Order.cashOnDelivery bool`; 1С `Наложка` bool (line 2565 ОбменАРМ, line 3464 create) |
| Торговий агент (`ТорговийАгент`) | ✓ | Our `Order.assignedAgentUserId`; 1С `ЗаказПокупателя.ТорговийАгент` |
| Вивантажувати в 1С (`ВивантажуватиВ1С`) | ✓ | Our `Order.exportTo1C bool`; 1С-side field equivalent (`ВивантажуватиВ1С`) — both default true |
| Призначити продаж торговому (`ПризначитиПродажТорговому`) | ➕ EXTRA | Our `assignedAgentUserId` covers this. 1С v0 had a separate flag; v1 (`_v1`) logic at line 3800 uses it. Our approach is simpler and equivalent |
| Коментар (`Комментарий`) | ✓ | Our `Order.notes`; 1С `Комментарий` (line 3440, 3550 ОбменАРМ) |
| Склад/Склад-група (`СкладГруппа`) | ⚠️ GAP | 1С assigns warehouse group on create (line 3463 `НовыйОбъект.СкладГруппа = Склад`). We have no warehouse assignment on orders |
| Організація (`Організація`) | ⚠️ GAP | 1С stores the selling legal entity (`Організація`, auto-filled from user defaults at line 3446). We have no multi-entity concept |
| Підрозділ (`Подразделение`) | ⚠️ GAP | 1С `Подразделение = Склад.Подразделение` (line 3468). Not relevant for our current setup |
| Контактна особа контрагента (`КонтактноеЛицоКонтрагента`) | ⚠️ GAP | 1С header has a contact person field from the counterparty (set when creating from event, line 1642); we have no per-order contact person |
| НДС (`УчитыватьНДС`, `СуммаВключаетНДС`) | ⚠️ GAP | Full VAT accounting in 1С (NDS rate per line, total NDS, "inclusive/exclusive"); we have no VAT fields |
| Статус замовлення (`СтатусЗамовлення` catalog `СтатусиЗамовлень`) | ⚠️ GAP | 1С uses a separate catalog with predefined values `Новий` / `Неактуальний` (Predefined.xml). Our `Order.isActual bool` partially maps to this but uses different mechanics |
| Номер документа (`Номер`) | ✓ | Our `Order.code1C` stores the 1С number after sync; 1С auto-assigns on write |

---

## 2. Line Items (Табличная часть Товары / Послуги)

| Feature / Column | Status | Notes |
|---|---|---|
| Товар (Номенклатура) | ✓ | Our `OrderItem.productId`; 1С `Номенклатура` |
| Кількість (`Количество`) | ✓ | Our `OrderItem.quantity`; 1С `Количество` |
| Вага (weight as quantity unit) | ✓ | Our `OrderItem.weight`; 1С uses `Количество` in kg for weight-priced items |
| Ціна (`Цена`) | ✓ | Our `OrderItem.priceEur` (total per line = unitPrice × weight); 1С `Цена` = unit price, `Сумма` = Цена × Количество |
| Сума рядка (`Сумма`) | ✓ | Our `priceEur` is line total; 1С explicit `Сумма` column |
| Ціна продажу за вагу (`ЦенаПродажиВес`) | ⚠️ GAP | 1С has a separate column `ЦенаПродажиВес` in line items (synced in `ДобавитьЗаказПокупателя` line 2560, `2617`). This is the per-kg selling price used for weight-based goods. We store `priceEur` as total; explicit unit price (`unitPriceEur`) only lives in UI state, not persisted |
| Характеристика номенклатури (`ХарактеристикаНоменклатуры`) | ⚠️ GAP | 1С line has product characteristic (lot variant); we use `lotId` instead, which is more specific but `ХарактеристикаНоменклатуры` can also encode lot group (e.g. кольору/розміру) — not stored |
| Одиниця виміру (`ЕдиницаИзмерения`) | ⚠️ GAP | 1С `ЕдиницаИзмерения` and `ЕдиницаИзмеренияМест` columns; we infer unit from `Product.priceUnit` but don't store it per order line |
| К-сть місць (`КоличествоМест`) / одиниця місць (`ЕдиницаМест`) | ⚠️ GAP | 1С has "places" count separate from quantity (e.g. number of bags vs kg). We have `quantity` (bags) and `weight` (kg) which covers this conceptually |
| Відсоток знижки (`ПроцентСкидкиНаценки`) | ⚠️ GAP | 1С per-line manual discount %; auto discount (`ПроцентАвтоматическихСкидок`) computed from pricing rules. Discount columns shown conditionally in print form (ObjectModule.bsl lines 275–290, 597–626). We have NO discount mechanism on order lines |
| Авто-знижка (`ПроцентАвтоматическихСкидок`) | ⚠️ GAP | Automatic discount calculated by 1С `Ценообразование` module. Not implemented in our system |
| Рядки послуг (`Услуги`) | ⚠️ GAP | 1С `ЗаказПокупателя.Услуги` tabular section (services). Our `OrderItem` only supports products |
| Зворотна тара (`ВозвратнаяТара`) | ⚠️ GAP | 1С has returnable container section in order. Not relevant for current L-TEX operations but present in 1С |
| Прив'язка до лоту (`lotId`) | ➕ EXTRA | Our `OrderItem.lotId nullable` allows binding to a specific lot/bag. 1С only references `Номенклатура`+`Характеристика`; specific lot assignment is a warehouse concern |

---

## 3. Price Type Logic (Тип цін)

| Feature | Status | Notes |
|---|---|---|
| Авто-підтягування типу цін клієнта | ✓ | On client select, we pull `MgrClient.priceTypeId` and set it; 1С pulls from `Контрагент.ОсновнойДоговорКонтрагента.ТипЦен` |
| Перерахунок цін рядків при зміні типу | ✓ | `recalcAllRows()` in `order-form.tsx`; `order-pricing.ts::unitPriceForType()`; 1С does the same via `ЗаполнениеДокументов` module |
| Fallback на базовий тип цін | ✓ | `unitPriceForType()` falls back to `wholesale` then first available |
| Право змінювати курси валют (`ПравоМінятиКурсиВалют`) | ⚠️ GAP | 1С: only agents with `ПравоМінятиКурсиВалют=true` can edit exchange rate manually (constant from agent profile line 481 ОбменАРМ). We allow all managers to pass `exchangeRate` in the create/update payload |

---

## 4. Statuses / Проведення

| Feature | Status | Notes |
|---|---|---|
| Статус «Новий» | ✓ | Our `draft`; 1С `Справочники.СтатусиЗамовлень.Новий` — set on create (line 3416) |
| Статус «Неактуальний» | ✓ | Our `isActual=false`; 1С `Справочники.СтатусиЗамовлень.Неактуальний` — set when all goods sold/closed |
| «Проведено» / архів | ✓ | Our `posted` + `archived=true`; 1С `Проведен` flag; both lock the document for editing |
| «Скасовано» | ✓ | Our `cancelled` status |
| Граф переходів | ✓ | Our `order-status.ts::TRANSITIONS`; 1С has similar state machine via `ОтменаПроведения` / `Проведение` |
| Закриття замовлення (power-close) | ✓ | Our `/orders/[id]/close` with `OrderCloseReason` (5 reasons seeded); `Order.closedAt/closeReasonId/closedByUserId/closeNotes`; displayed with red banner |
| Optimistic locking | ➕ EXTRA | Our `Order.version` + 409 conflict detection (Etap 4); 1С manages concurrency via session locking |
| «Закриття старих замовлень» (mass close via 1С document) | ✓ (partial) | Our `/manager/closures` page calls `ЗакрытьСтарыеЗаказы_v1` (line 5174 ОбменАРМ) via SOAP; creates `ЗакрытиеЗаказовПокупателей` document + optionally new order for remaining goods. The per-item "add to new order" path (`addToNewOrder=true`) has a caveat: `product.code1C` → `product.id` resolver not yet implemented (see CLAUDE.md M3.4) |
| Автоматичне відміна проведення (`Розпровести`) | ⚠️ GAP | 1С allows `ОтменаПроведения` without closing. We only have `Закрити`; we don't expose a general "unpost" / reopen workflow for manager orders |

---

## 5. Delivery / Нова Пошта

| Feature | Status | Notes |
|---|---|---|
| Спосіб доставки (delivery/post/pickup) | ✓ | Our `deliveryMethod` enum; 1С `НаявністьДоставки` enum |
| Адреса доставки | ⚠️ GAP | 1С can store a delivery address on the order. We show the client's stored address from `MgrClient` (street+house), but don't let the manager enter a per-order delivery address |
| Номер ТТН Нова Пошта | ⚠️ GAP | 1С orders in production often carry the Nova Poshta TTN (tracking number). We have no `ttнNumber`/`trackingNumber` field on `Order`. The `MgrClient.novaPoshtaDepartment` is on the client, not the order |
| Відділення Нової Пошти (per order) | ⚠️ GAP | Client stores a default NP branch; but per-order override of the branch (e.g. client picks up at different city) is not supported |
| Статус доставки | ⚠️ GAP | 1С `ЗаказПокупателя.СтатусДоставки` (reference catalog, `Код` synced as `Доставка` string in ОбменАРМ line 2562/2599). We have no delivery-status tracking field on `Order` |

---

## 6. Closing Old Orders (Закриття старих замовлень)

| Feature | Status | Notes |
|---|---|---|
| Read open orders by client (`ПолучитьДанныеНезакрытыхЗаказов_v1`) | ✓ | Our `/manager/closures` page fetches via `ОтриматиДаніЗакриттяЗамовленьJSON` SOAP call (M3.4 wrapper) |
| Show sold qty per line (Продано) | ✓ | 1С computes `Продано` as sum of `РеализаціяТоварівПослуг.Кількість` after order date; our Closures block shows this from the 1С response |
| Bulk close via `ЗакрытиеЗаказовПокупателей` document | ✓ | Our POST `/closures/[clientId]` calls `ЗакритиСтаріЗамовленняJSON` SOAP; creates `ЗакрытиеЗаказовПокупателей` in 1С |
| Create new order for remaining items (`ДобавитьВЗаказ`) | ⚠️ GAP | 1С `ЗакрытьСтарыеЗаказы_v1` (line 5214–5252) creates a new `ЗаказПокупателя` in 1С for items marked `ДобавитьВЗаказ=true`. Our API calls `createOrderWithItems` locally when `addToNewOrder=true`, but the `product.code1C → product.id` resolver is incomplete (try/catch + TODO noted in M3.4); the newly-created local order is not synced back to 1С atomically |

---

## 7. Agent Assignment / Ownership

| Feature | Status | Notes |
|---|---|---|
| Менеджер бачить лише своїх клієнтів | ✓ | `getMyClientCodes1C()` scopes orders by agent's client codes; 1С filters by `ТорговийАгент = &Продавец` |
| Призначення торгового агента на замовлення | ✓ | `Order.assignedAgentUserId`; 1С `ЗаказПокупателя.ТорговийАгент` |
| Авто-агент = агент клієнта або поточний продавець | ✓ | Our `assignedAgentUserId ?? actor.userId`; 1С: `НовийОбъект.ТорговийАгент = ?(ЗначениеЗаполнено(Агент), Агент, Продавец)` (line 3503/3504) |
| Admin бачить всі замовлення | ✓ | Admin gets `myCodes = null` → no scope restriction |
| Право відображати всіх клієнтів (`ВідображатиВсіхКлієнтів`) | ⚠️ GAP | 1С agent profile has `ВідображатиВсіхКлієнтів` flag (line 416, 485 ОбменАРМ) for agents who can see all clients. We have only `admin` (all) vs `manager` (own clients) binary — no per-user "see all" permission for non-admins |

---

## 8. Automatic Reminders (Нагадування по замовленнях)

| Feature | Status | Notes |
|---|---|---|
| Reminder every 3 days for pickup/post | ✓ | Detector C in `generate-reminders.ts::detectOverdueOrders`; pickup/post → remind every 3 days |
| Reminder every 7 days for delivery | ✓ | Detector C; delivery method → 7-day interval |
| Escalate to supervisor/senior_manager after 90 days | ✓ | `lastReminderAt`, `remindersSentCount`, `escalatedToSupervisorAt` updated; supervisor/senior_manager notified |
| 1С-side scheduled reminder mechanism | ⚠️ GAP | 1С has `Заплановані Нагадування` (`催 ЗапланованыеУведомления`) catalog tied to orders (line 5954 ОбменАРМ). Our reminder system is separate and does not sync with 1С reminders |

---

## 9. Print Forms (Друкована форма)

| Feature | Status | Notes |
|---|---|---|
| «Замовлення покупця» print form | ⚠️ GAP | 1С: `ПечатьСчетаЗаказа("Заказ")` — `ObjectModule.bsl` lines 362–821 — generates a full tabular document with: header (supplier/buyer org details + bank accounts), line items table with discount columns, totals in words (`СуммаПрописью`). We have NO print form for orders |
| «Рахунок на оплату по замовленню» (invoice) | ⚠️ GAP | 1С: `ПечатьСчетаЗаказа("Счет")` — adds contract, bank details (IBAN/МФО), ЄДРПОУ. We have no invoice generation from orders |
| «Форма формування реалізацій» | ⚠️ GAP | 1С `ФормаФормированияРеализаций` — creates realization documents from order (ФормаФормированияРеализаций.xml). Our equivalent flow is creating a `Sale` doc separately, without a direct "create from order" action |

---

## 10. List Form (ФормаСписка) Columns / Filters

| Feature | Status | Notes |
|---|---|---|
| Columns: №, Клієнт, Місто | ✓ | Our list shows code1C (as №), customer name, city |
| Column: Область (region) | ✓ | Our `orders-list.ts` batch-lookups `MgrClient.region` by code1C and populates `customer.region` |
| Column: Дата | ✓ | `createdAt` shown as date |
| Column: Статус | ✓ | `OrderStatusBadge` in each row |
| Column: Актуальний | ✓ | `isActual bool` with checkmark/minus icon |
| Column: К-сть позицій | ✓ | `itemCount` from `_count.items` |
| Column: Сума (UAH) | ✓ | `totalUah` formatted with `toLocaleString("uk-UA")` |
| Column: Сума (EUR) | ➕ EXTRA | `totalEur` available but not shown in list row; shown only on detail page |
| Filter: Пошук по №/клієнту/товарах | ✓ | `buildOrdersWhere` — searches `code1C`, `customer.name/phone/city`, `items.product.name/articleCode` |
| Filter: Статус | ✓ | Status select in toolbar |
| Filter: Дата (від/до) | ✓ | Date range pickers in toolbar |
| Filter: Архівні (показати проведені) | ✓ | `showArchived` checkbox; default hidden |
| Filter: По клієнту (deeplink from card) | ✓ | `clientCode1C` URL param |
| Filter: ТорговийАгент (1С ФормаСписка) | ⚠️ GAP | 1С ФормаСписка includes filter by agent. Our list scopes by ownership (admin sees all; manager sees own) but doesn't expose an explicit "filter by agent" for admins |

---

## 11. Validation Rules

| Feature | Status | Notes |
|---|---|---|
| Мінімум 1 позиція | ✓ | `z.array(orderItemInputSchema).min(1)` in `createOrderSchema` |
| Клієнт обов'язковий | ✓ | `customerId: z.string().min(1)` + `canSubmit` guard in UI |
| Вага позиції > 0 | ✓ | `weight: z.number().positive()` + `itemsInvalid` check |
| Мін. 10 кг (business rule) | ⚠️ GAP | CLAUDE.md notes: "мін.10кг не перевіряється" (decision in Etap 1). 1С doesn't enforce it either in the mobile module (it's a business-side rule). Low priority but absent |
| Заблокування редагування «posted» | ✓ | `isOrderLocked()` + `canEditOrder()` + PATCH returns 409 on `posted` |
| Заблокування редагування «closed» | ✓ | `editable = canEditOrder(status) && !order.closedAt` |
| Договір контрагента обов'язковий | ⚠️ GAP | 1С raises exception if no contract found (line 3496: `ВызватьИсключение "У контрагента ... нет договора"`). We don't require/validate a contract |
| Optimistic lock версія | ➕ EXTRA | `version` field + 409 with `code:"version_conflict"` — not in 1С mobile |

---

## 12. Actions / Buttons on Form

| Feature | Status | Notes |
|---|---|---|
| Зберегти (create / update) | ✓ | POST `/api/v1/manager/orders` / PATCH `/api/v1/manager/orders/[id]` |
| Змінити статус | ✓ | Via PATCH with `status` field; allowed transitions in `order-status.ts` |
| Закрити замовлення | ✓ | `OrderCloseButton` → POST `/orders/[id]/close`; with reason + notes |
| Скопіювати замовлення | ⚠️ GAP | 1С has copy action (`ИнициализироватьНовыйДокумент` with `ПараметрОбъектКопирования` line 1612). Deliberately not built (CLAUDE.md Etap 2 decision). For L-TEX workflow it would be useful |
| Друкувати / Рахунок | ⚠️ GAP | 1С document form has «Друкувати» → «Замовлення покупця» or «Рахунок на оплату». We have no print button |
| Перейти до реалізації (create реалізація from order) | ⚠️ GAP | 1С `ФормаФормированияРеализаций` — opens the "create realization" wizard from order. Our `Sale` creation is completely independent |
| «+ Створити замовлення» (list) | ✓ | Link to `/manager/orders/new` |
| Deeplink до картки клієнта | ✓ | `customer.name` links to `/manager/customers/[id]` |
| Авто-нагадування (reminders from document) | ➕ EXTRA | Our Detector C in cron generates overdue-order reminders automatically. 1С mobile doesn't have this automated detector |

---

## 13. Sync / 1С Integration

| Feature | Status | Notes |
|---|---|---|
| Відправка нового замовлення в 1С (outbound) | ✓ | `enqueueOrderCreate` fire-and-forget after create/update; `services/manager-sync/src/routes/orders.ts`; BSL stub `СтворитиЗамовленняJSON` |
| Отримання замовлень з 1С (inbound) | ✓ | `POST /api/sync/orders/import` — upsert by `code1C`; cron pull via `ОтриматиДаніЗакриттяЗамовленьJSON`; `MgrSyncState` cursor |
| Синхронізація статусу замовлення (bidirectional) | ⚠️ GAP | 1С can mark an order `Неактуальний` / fully posted. We don't have a reverse sync that updates `Order.status` or `isActual` from 1С state changes (only import creates/updates, doesn't reconcile status continuously) |
| `ВивантажуватиВ1С` per-order flag | ✓ | `Order.exportTo1C`; only enqueued when true |
| Поле розбіжності: статус, totalUah, items[].productId/lotId | ⚠️ GAP | Documented in CLAUDE.md M3.1–M3.2: BSL wraps assignments in `Попытка/Исключение` so mismatches are silent but not propagated to 1С correctly |

---

## Summary: Top Gaps, Prioritized

Below are the most impactful gaps, ordered by business value for L-TEX daily operations:

1. **Дата відвантаження / Дата оплати** — `ДатаОтгрузки` + `ДатаОплаты` fields missing. 1С auto-sets them from contract; mobile agents need to see expected dispatch/payment dates. Critical for delivery management and debt forecasting.

2. **Номер ТТН Нової Пошти** — No `trackingNumber`/`ttнNumber` field on `Order`. L-TEX sends parcels by Nova Poshta; managers need to attach the TTN to the order for tracking. High daily operational value.

3. **Відсоток знижки по рядку** (`ПроцентСкидкиНаценки`) — No per-line discount %. 1С supports both manual discount and auto-discount (`ПроцентАвтоматическихСкидок`). This matters when custom prices are negotiated with specific clients.

4. **Ціна продажу за вагу не зберігається** (`ЦенаПродажиВес`) — We persist only `priceEur` (total). The per-kg unit price lives only in UI state (`unitPriceEur`). 1С syncs `ЦенаПродажиВес` per line (ОбменАРМ line 2560); without this we can't accurately reconstruct unit pricing in reports or re-open/edit logic.

5. **Копіювання замовлення** — No "copy order" action. 1С supports copying; for L-TEX repeat orders (same client, similar goods next week) this would save significant data entry time.

6. **Статус доставки per order** — No `deliveryStatus` field (1С `СтатусДоставки` catalog). After dispatch, managers need to track delivery states (in transit, delivered, returned). Currently invisible to the manager app.

7. **Форма реалізації з замовлення** — No "create realization from order" action (`ФормаФормированияРеализаций`). 1С lets agents create `РеализаціяТоварівПослуг` directly from the open order with goods pre-filled. Our flow requires creating a `Sale` manually and independently.

8. **Відсоток відвантаженого / Продано column** on order line — 1С `ПолучитьДанныеДляАктуализацииЗаказовПокупателя` (line 6760) computes `Продано` (sold qty) per order line (cross-joined against реалізації after order date). We only show this on the Closures screen, not on the order detail itself.

9. **Договір контрагента** — Missing contract reference on `Order`. In 1С, the contract drives currency, VAT, payment terms, price rounding. For full accounting parity this is required; lower priority since L-TEX operates primarily EUR/UAH without multi-contract complexity.

10. **Право «ВідображатиВсіхКлієнтів» per agent** — 1С has a per-agent flag to allow certain agents to see all clients (not just their own). Our current model is binary admin/manager. Relevant when senior agents supervise territory.

11. **Друк «Замовлення покупця» / «Рахунок на оплату»** — No print form. 1С `ПечатьСчетаЗаказа` generates a formatted tabular doc with bank details, ЄДРПОУ, amount in words. L-TEX sends invoices to clients; this is blocked.

12. **Статус 1С `Неактуальний` → bidirectional sync** — `Order.isActual` is set manually; 1С sets `СтатусЗамовлення = Неактуальний` when all items are sold. Without reverse sync, `isActual` in our system will drift from 1С reality for imported historical orders.
