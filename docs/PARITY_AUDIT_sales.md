# Parity Audit: 1С РеализацияТоваровУслуг vs Our Manager «Реалізація»

**Date:** 2026-06-10  
**Scope:** Read-only functional comparison. No code changes made.

**Sources read (1С side):**
- `docs/1c-export-2026-06-02/Documents/РеализацияТоваровУслуг/Ext/ObjectModule.bsl` — document module (print, posting)
- `docs/1c-export-2026-06-02/Documents/РеализацияТоваровУслуг/Forms/ФормаДокумента.xml` + `ФормаСписка.xml` + `ФормаОтбораЗаказов.xml`
- `docs/1c-export-2026-06-02/Documents/РеализацияТоваровУслуг/Templates/Накладная/` + `Акт/`
- `docs/1c-export-2026-06-02/CommonModules/ОбменАРМ/Ext/Module.bsl` — procedures `ДобавитьРеализацию` (line 2351) and `СоздатьРеализацииТоваровУслуг` (line 3571)

**Sources read (our side):**
- `apps/store/app/manager/(workstation)/sales/**` (page, [id], new, _components)
- `apps/store/lib/manager/sale-create.ts`, `sale-status.ts`, `sale-message.ts`, `sale-ownership.ts`, `sales-list.ts`
- `apps/store/lib/manager/cash-order.ts`, `cash-orders-list.ts`

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✓ | Implemented on both sides (parity) |
| ⚠️ | GAP — 1С has the feature, we don't |
| ➕ | EXTRA — we have it, 1С doesn't (added value) |
| 🔴 | Critical gap |
| 🟡 | Medium gap |
| 🟢 | Low-priority gap |

---

## 1. Header Реквізити (Document Header)

| Feature | 1С Field / Procedure | Our Side | Status |
|---------|---------------------|----------|--------|
| Контрагент (mandatory) | `Контрагент` (Catalogs.Контрагенти) | `customerId` → `Customer`, resolved via ClientPicker with search-all | ✓ |
| Тип цін | `ТипЦен` (Catalogs.ТипиЦінНоменклатури) | `priceTypeId` → `MgrPriceType` | ✓ |
| Курс EUR snapshot | `КурсEUR` (set in `ДобавитьРеализацию` from Регистры.КурсиВалют code "978") | `exchangeRateEur` — snapshot taken at create time from `ExchangeRate` | ✓ |
| Курс USD snapshot | `КурсUSD` (code "840") | `exchangeRateUsd` — snapshot | ✓ |
| Наложка (COD flag) | `Наложка` — bool on document header; `СумаОплатиНаложкою` — computed sum | `cashOnDelivery` bool + `codAmountUah = round(totalUah)` | ✓ |
| Спосіб доставки | `Доставка` — Enum `НаявністьДоставки` (Почта/Самовивіз/Адресна) — set in `СоздатьРеализацииТоваровУслуг` line 3676 | `deliveryMethod` — codes `post/pickup/delivery` | ✓ |
| № відділення НП | Implicit in `Комментарій` or address field (1С has no dedicated НП branch field on реалізація; branch extracted from order via `ЗаказПокупателя.Сделка`) | `novaPoshtaBranch` — dedicated text field | ➕ |
| ТТН (Експрес-накладна) | Not a field on `РеализацияТоваровУслуг` itself in the export seen; the waybill number lives on the logistics/shipment doc in full УТ | `expressWaybill` — text field | ➕ |
| Торговий агент | `ТорговийАгент` — auto-set from `Контрагент.ТорговийАгент` or seller; flag `ПризначитиПродажТорговомуКонтрагента` (line 3800: `НовыйОбъект.ТорговийАгент = ?(ПризначитиПродажТорговомуКонтрагента, Агент, Продавец)`) | `onTradeAgent` bool + `assignedAgentUserId` (null = trade agent of client, non-null = current seller) | ✓ |
| Вивантажувати в 1С | `ВивантажуватиВ1С` flag on linked `ЗаказПокупателя` — controls whether the реалізація is synced to central | `exportTo1C` bool | ✓ |
| Маршрутний лист | `МаршрутныйЛист` — FK to `Document.МаршрутныйЛист`; реалізація always comes from an МЛ via `ДобавитьРеализацию` in 1С | `routeSheetId` — optional FK; реалізація can exist standalone | ✓ |
| Сделка / Замовлення | `Сделка` — FK to `ЗаказПокупателя`; used for idempotent find-or-replace logic in `СоздатьРеализацииТоваровУслуг` line 3593–3619; Неплановая реалізація (no order) picks `ДоговорДляНеплановыхПродаж` | No FK from `Sale` to `Order`; standalone реалізація always exists | ⚠️ 🟡 |
| Договір контрагента | `ДоговорКонтрагента` — auto-resolved (основний or неплановий); used in accounting postings | Not stored (accounting not implemented) | ⚠️ 🟢 |
| Організація | `Організація` — legal entity; hardcoded to code `000000001` in sync | Not stored (single org, no need) | ✓ (implicit) |
| Склад | `Склад` — warehouse reference | Not stored (no multi-warehouse yet) | ⚠️ 🟢 |
| ВалютаДокумента | `ВалютаДокумента` — currency of settlement | Implicitly EUR (no multi-currency settlement) | ⚠️ 🟢 |
| УчитыватьНДС / СуммаВключаетНДС | `УчитыватьНДС` bool + `СуммаВключаетНДС` — affects print templates (Накладна/АктЗНДС/БезНДС) | Not tracked (L-TEX is a non-VAT payer) | ⚠️ 🟢 |
| ВидОперації | `ВидОперацийРеализацияТоваров.ПродажаКомиссия` — accounting transaction type | Not stored | ⚠️ 🟢 |
| ВидПередачи | `ВидыПередачиТоваров.СоСклада` — goods transfer type | Not stored | ⚠️ 🟢 |
| Представник покупця / Отримав | `Получил` — who received the goods (for Накладна print) | No field | ⚠️ 🟡 |
| Місце складання документа | `МестоСоставленияДокумента` — printed on Накладна | No field | ⚠️ 🟢 |
| Відповідальний | `Ответственный` → `ФізЛицо` — "Відпустив" on Накладна | No field | ⚠️ 🟢 |
| Неплановая (unplanned sale flag) | `Неплановая` — controls contract resolution path (line 3712) | Not stored; all our реалізації are implicitly unplanned (no order link) | ⚠️ 🟡 |
| Коментар | `Комментарій` — free text appended with "Оновлено з додатку: ..." (line 3656) | `notes` — free text | ✓ |
| Дата документа | `Дата` | `createdAt` (auto) — date cannot be manually set | ⚠️ 🟡 |
| Номер документа | `Номер` — auto by 1С | `docNumber` auto-increment + `code1C` when synced | ✓ |
| ПометкаВидалення | `ПометкаУдаления` — soft delete in 1С | `archived` bool | ✓ |

---

## 2. Line Items (Табличні частини)

| Feature | 1С Field / Procedure | Our Side | Status |
|---------|---------------------|----------|--------|
| Номенклатура | `ТЧ.Номенклатура` — ref to `Catalog.Номенклатура` (by GUID) | `productId` — FK to `Product` | ✓ |
| Характеристика | `ХарактеристикаНоменклатури` — lot/variant dimension | `lotId` — FK to `Lot` (barcode scan) OR null (general pick) | ✓ (mapped to lot) |
| Кількість | `Кількість` — bags count | `quantity` — bags count | ✓ |
| ЕдиницяВиміру | `ЕдиницяВиміру.Найменування` — кг/шт/пара | `product.priceUnit` — `kg/piece/pair` | ✓ |
| Ціна за кг (ЦінаПродажиВес) | `Ціна` — price per kg in document currency | `pricePerKg` (€) | ✓ |
| Сума рядка | `Сумма = Цена × Количество` | `priceEur = pricePerKg × weight × quantity` | ✓ |
| СуммаНДС / СтавкаНДС | Per-row VAT amount and rate | Not stored | ⚠️ 🟢 |
| СуммаСкидки | Discount amount per row (derived in print from `Цена × Кількість - Сума`) | No per-row discount field | ⚠️ 🟡 |
| Вага лота | Implicit via `Характеристика` (lot carries weight in 1С catalog) | `weight` — explicit field | ✓ |
| Штрихкод | No barcode column on реалізація ТЧ in 1С; barcode lives on `Характеристика` | `barcode` — stored directly on SaleItem for fast display | ✓ |
| КодАртикул | `Артикул` (Номенклатура.Артикул) — shown in Накладна print | `product.articleCode` — available | ✓ |
| ПовторитиЦіну | Button in 1С Android app (`ПовторитьЦену`) | "Повторити ціну" copy button per row when same product has multiple rows | ✓ |
| Послуги ТЧ (services) | `Услуги` table part — for transport/service fees | Not implemented (goods only) | ⚠️ 🟢 |
| ВозвратнаТара | Return packaging table part | Not implemented | ⚠️ 🟢 |
| Ціна клієнта vs ціна партнера | `ЦінаКінцевогоПокупателя` vs `ЦінаПартнера` in returns doc (different prices for commission chain) | Single `pricePerKg` | ⚠️ 🟢 |
| Barcode lookup for item add | 1С Android: scan → lookup by `Характеристика` barcode → add row | `BarcodeInput` → `/api/v1/manager/lots/by-barcode` → add row | ✓ |
| Product picker (підбір) | 1С Android: picker dialog from price list | `SaleLotPicker` — search by name; lot (specific) or general pick | ✓ |

---

## 3. Statuses / Проведення

| Feature | 1С Field / Procedure | Our Side | Status |
|---------|---------------------|----------|--------|
| Проведено (posted) | `Проведен` bool — set by `Записать(РежимЗаписиДокумента.Проведення)` | `status=posted` + `archived=true` | ✓ |
| Відмінений (unposted) | `Записать(РежимЗаписиДокумента.ОтменаПроведення)` — reverts accounting entries | `status=cancelled` — no reversal of accounting (not implemented) | ⚠️ 🟡 |
| Чернетка | No draft in 1С — doc is created and immediately written in sync | `status=draft` | ➕ |
| Відправлено в 1С | Not a status in 1С itself (it arrives from mobile) | `status=sent` — indicates queued to 1С | ➕ |
| Граф переходів статусів | 1С: draft → posted → unposted → re-posted (via write/unwrite) | draft↔sent, draft→cancelled, sent→cancelled, cancelled→draft; posted is terminal | ✓ (simplified) |
| Лок при проведенні | `Проведен=true` blocks edits in 1С mobile | `isSaleLocked(posted)` — blocks form edits | ✓ |
| Авто-нагадування при зміні статусу | Нагадування через `MgrReminder` on order status events (existing) | No auto-reminder tied to реалізація status changes | ⚠️ 🟡 |

---

## 4. Payment / Каса Integration

| Feature | 1С Field / Procedure | Our Side | Status |
|---------|---------------------|----------|--------|
| Каса (cash payment) | `Document.КасовийОрдер` — прибутковий КО linked to реалізація | `MgrCashOrder` with FK `saleId` | ✓ |
| Оплата готівкою UAH | `АмаунтUAH` | `amountUah` | ✓ |
| Оплата готівкою EUR | `КурсEUR`-based | `amountEur` | ✓ |
| Оплата готівкою USD | `КурсUSD`-based | `amountUsd` | ✓ |
| Безнал грн (bank) | `АмаунтUAHCashless` | `amountUahCashless` + `bankAccount` | ✓ |
| Здача (change) — 3 валюти | Change fields per currency | `changeUah/changeEur/changeUsd` on `MgrCashOrder` (changeForId FK) | ✓ |
| EUR-base balance calculation | `ПолучитиДанніПоОплаті` — EUR-base total paid vs due | `computeBalanceEur` / `getPaymentSummary` | ✓ |
| Залишок боргу (after payment) | 1С register `ВзаєморозрахункиЗКонтрагентами` — real debt register | Computed from `MgrCashOrder` totals per sale; not a global running debt register | ⚠️ 🟡 |
| Кількість оплат на реалізацію | Multiple КО per реалізація allowed | Multiple `MgrCashOrder` per `Sale` allowed | ✓ |
| Знижка з оплати (discount on remainder) | `discount-remainder` — 5€ threshold discount on most expensive line | `discount-remainder` logic in Payments block (S73) | ✓ |
| Оплата без реалізації | КО can be standalone (борг-погашення) | Payments standalone via `/manager/payments/new` | ✓ |

---

## 5. Viber / Messaging

| Feature | 1С Field / Procedure | Our Side | Status |
|---------|---------------------|----------|--------|
| Повідомлення клієнту | `ПолучитиТекстПовідомленняВайбер` — build message text from реалізація fields | `buildClientSaleMessage` — header + items + totals + COD + rates | ✓ |
| Повідомлення у групу | 1С sends to internal Viber group | `buildGroupSaleMessage` — items with barcode + timestamp + comment | ✓ |
| Реквізити оплати | 1С has separate Viber message for payment details | `buildPaymentRequisitesText` — ФОП КУЗЕНКО + IBAN | ✓ |
| Чек оплати (квитанція) | 1С builds a separate payment receipt text | `buildPaymentReceiptText` — live payment draft send | ✓ |
| Відправка (ShareSheet) | Viber deep-link from 1С Android app | `ShareSheet` — Viber/Telegram/WhatsApp/Copy | ✓ |
| Chat-bot send (inbox) | Not in 1С | "У чат" button — TODO M1.8 placeholder | ⚠️ 🟢 |

---

## 6. Route Sheet Linkage

| Feature | 1С Field / Procedure | Our Side | Status |
|---------|---------------------|----------|--------|
| МаршрутнийЛист FK | `МаршрутныйЛист` — реалізація always created from МЛ in 1С production flow; `ДобавитьРеализацію` filters only реалізації linked to МЛ for sync | `routeSheetId` — optional; реалізація can exist without МЛ | ✓ |
| Відображення реалізацій на МЛ | `RouteSheetSale` reverse relation (read from `routeSheetId`) | `Sale.routeSheetId` → reverse lookup on RouteSheet detail page | ✓ |
| Оплати на МЛ | МЛ aggregates all КО from its реалізацій | `RouteSheetPayment` child table on RouteSheet | ✓ |
| Статус МЛ при проведенні реалізацій | `ВозвратПоЗакритомуМаршрутниику` guard (line 3632) — skips creating/updating реалізація if МЛ already closed | No such guard — реалізація editable regardless of МЛ status | ⚠️ 🟡 |

---

## 7. List / Filters

| Feature | 1С Field / Procedure | Our Side | Status |
|---------|---------------------|----------|--------|
| Список реалізацій | `ФормаСписка` — filtered by agent + date range | `/manager/sales` list — server-rendered, paginated | ✓ |
| Фільтр за статусом | `Проведен` bool (posted / not posted) | `status` dropdown (draft/sent/posted/cancelled) | ✓ |
| Показати архівні | `Проведен=true` shown/hidden | `showArchived` toggle | ✓ |
| Пошук за клієнтом | By `КонтрагентПредставлення` | By customer name/phone/city | ✓ |
| Пошук за товаром | 1С: no in-list search by product | Search via `items.some(product.name)` | ➕ |
| Пошук за номером | By `Номер` | By `docNumber` or `code1C` | ✓ |
| Фільтр за датою | Date range picker | `from` / `to` date range | ✓ |
| Фільтр за МЛ | In 1С, реалізації always surfaced via МЛ context | No filter by `routeSheetId` on list | ⚠️ 🟢 |
| Фільтр за типом цін | Available in 1С | Not available as list filter | ⚠️ 🟢 |
| Область / Регіон колонка | 1С shows `КонтрагентПредставлення` | `customer.region` — batch-lookup from `MgrClient.region` | ✓ |
| Колонка Місто | Available | `customer.city` | ✓ |
| Колонка Сума | `СумаДокумента` | `totalUah` (primary) + `totalEur` | ✓ |
| Стан проведення (колір рядка) | Archived/unposted row styling | `dimmed` class for archived/posted | ✓ |
| Пагінація | 1С native scroll | Server-side pagination, 20/page | ✓ |

---

## 8. Print / Export

| Feature | 1С Field / Procedure | Our Side | Status |
|---------|---------------------|----------|--------|
| Видаткова накладна (А4) | `ПечатьДокумента` — Template `Накладная.xml`; Накладна/Акт/НакладнаСНДС variants | No printable A4 document for реалізація | ⚠️ 🟡 |
| Акт надання послуг | Separate template for service-only реалізацій | Not applicable (no services ТЧ) | ⚠️ 🟢 |
| Бланк товарного наповнення | `ПечатьБланк` — packing layout per storage location | Not implemented | ⚠️ 🟢 |
| Виванстаж 1С Звіт (ПечатьДляВивантаженняВ1СЗвіт) | Ukrainian 1С Zvit export format with UAH sums in words | Not implemented | ⚠️ 🟢 |
| CSV / Excel Export | Not in 1С mobile | No export for sales list | ⚠️ 🟢 |

---

## 9. Sync / 1С Integration

| Feature | 1С Field / Procedure | Our Side | Status |
|---------|---------------------|----------|--------|
| Вихідний sync (App→1С) | 1С `СоздатьРеализацiiТоварівПослуг` — called from `НадіслатиДані`; processes FIRST 2 реалізацій per batch filtered by agent+date≥yesterday | `enqueueSaleCreate` → `MgrSyncJob` → manager-sync → `СтворитиРеалізаціюJSON` (mock mode) | ✓ (mock) |
| Ідентифікація у 1С | 1С UID (`Ссылка.УнікальнийІдентифікатор`) as exchange key | `code1C` stores 1С reference | ✓ |
| Idempotency find-or-replace | `СоздатьРеализацiiТоварів` — finds existing by `Ссылка` GUID, unpost and replace if found | `code1C` unique key — upsert on import; our send uses idempotencyKey | ✓ |
| Вхідний sync (1С→App) | `ДобавитьРеализацiю` — polls 1С for проведені реалізації last 1 day per agent | Not implemented (pull from 1С реалізацій not in scope yet) | ⚠️ 🟡 |
| Sync field: Ссылка.Сделка | `УИДСделка` — order reference synced in payload | `Sale` has no `orderId` FK; 1С field ignored in current BSL spec | ⚠️ 🟡 |
| Sync field: ХарактеристикаНоменклатури | `УИДХарактеристикаНоменклатури` — lot GUID synced | `lot.barcode` (not lot GUID) — will need mapping on real wire-up | ⚠️ 🟡 |

---

## 10. Missing UI Features (not a separate 1С form feature but notable gaps)

| Feature | Notes | Status |
|---------|-------|--------|
| Date override on реалізація | 1С allows backdating via `Дата` field | Not possible — `createdAt` is auto-set | ⚠️ 🟡 |
| Link реалізація ↔ замовлення | `Сделка` FK — important for order fulfillment tracking; closing orders marks them as sold | `Sale` has no `orderId` FK | ⚠️ 🔴 |
| Глобальний борг клієнта (running balance) | 1С: `РегістрНакопичення.ВзаєморозрахункиЗКонтрагентами` — real-time debt register updated at posting | Our debt: `MgrClient.debt` (pulled from 1С snapshot, not live) | ⚠️ 🟡 |
| Повернення товарів | `Document.ВозвратТоваровОтПокупателя` — separate return document; `ДобавитьВозвратОтПокупателя` in ОбменАРМ | Not implemented | ⚠️ 🟡 |
| Послуги (services) табличної частини | Transport/service charges on separate ТЧ | Not implemented | ⚠️ 🟢 |
| ФормаОтбораЗаказів | Choose which order's items to include on реалізація | `SaleLotPicker` covers selection but no order-context filter | ⚠️ 🟡 |
| Колонка «Замовлено» vs «Продано» (closures context) | Closures block uses `ЗаказиПокупателів.Залишки` to compare | Not available without Сделка FK | ⚠️ 🟡 |

---

## Top Gaps, Prioritized

1. 🔴 **No `Sale` → `Order` link (`Сделка` FK)** — in 1С every реалізація is tied to a `ЗаказПокупателя`; this enables order fulfillment tracking, the closures block, and the proper `ДоговорКонтрагента` resolution. Implementing this requires adding `orderId` nullable FK to `Sale` and wiring it in the form (select from open orders of the client).

2. 🟡 **No printable Видаткова Накладна** — `ПечатьДокумента` generates an A4 `Накладная` template used for shipping. Clients and logistics need this. Field mapping: Номер, Дата, Контрагент, позиції (Назва/Артикул/Кількість/ЄдВим/Ціна/Сума/Знижка), СумаДокументу, відпустив/отримав.

3. 🟡 **No date override** — 1С `Дата` can be backdated for in-person sales recorded late. Our `createdAt` is auto. A separate `saleDate` field editable by admin/owner would close this.

4. 🟡 **Повернення товарів (`VозвратТоваровОтПокупателя`) not implemented** — `ДобавитьВозвратОтПокупателя` (ОбменАРМ line 2430+) syncs returns from device to 1С. No return document in our system. Needed before real 1С wire-up.

5. 🟡 **No МЛ-closed guard on реалізація edits** — 1С skips writing реалізація to a closed МЛ (`ВозвратПоЗакритомуМаршрутнику` check). We allow editing a реалізація even after its МЛ is `completed`. Add server-side guard: if `sale.routeSheetId` and referenced RouteSheet status is `completed`, block PATCH.

6. 🟡 **Running debt register gap** — 1С maintains `ВзаєморозрахункиЗКонтрагентами` as a real accumulation register updated at posting. Our `MgrClient.debt` is a snapshot from 1С pull or manual update. After real 1С wire-up, реалізація proведення should trigger a re-fetch of client debt.

7. 🟡 **Inbound sync (1С → App) of реалізацій not implemented** — `ДобавитьРеализацiю` polls last 1-day проведені реалізацій per agent. Needed for two-way parity; sales created directly in 1С by bookkeeper don't appear in our list. Covered in Пріоритет 2 (historical import) but also needed for ongoing sync.

8. 🟡 **`Неплановая` flag missing** — controls whether 1С uses `ДоговорДляНеплановихПродаж` vs `ОсновнийДоговорКонтрагента`. Without it, our sync may create реалізацій with a wrong contract reference in 1С, causing posting errors. Should be `onTradeAgent=false` → `Неплановая=true` heuristic, or explicit field.

9. 🟡 **`Представник покупця / Отримав` field missing** — required for legally valid `Видаткова Накладна` (who received the goods). Low effort to add as an optional text field on `Sale`.

10. 🟡 **Per-row discount (`СуммаСкидки`) not stored** — 1С накладна prints both `СуммаБезСкидки` and `СуммаСкидки` per row. We don't track discount per row (design decision from S73). For the printable накладна this means we can't show the original price vs discounted price.

11. 🟢 **Filter by МЛ on sales list** — useful when reviewing sales for a specific route day. Add `?routeSheetId=` param to `buildSalesWhere`.

12. 🟢 **Services ТЧ (`Услуги`)** — transport fees and packaging services can be added to 1С реалізація on a separate table part. Not a current L-TEX practice but would be needed for service billing (e.g., COD fee).
