# Parity Audit — Маршрутний лист

**Date:** 2026-06-10  
**1С source:** `docs/1c-export-2026-06-02/Documents/МаршрутныйЛист/`  
**Our source:** `apps/store/app/manager/(workstation)/routes/` + `apps/store/lib/manager/route-sheet-*.ts`  
**VT decode source:** `docs/HISTORY_MIGRATION_MAP.md` §10.2

Markers: ✓ parity | ⚠️ GAP | ➕ EXTRA (we have, 1С doesn't)

---

## 1. Document Header

| Field | 1С | Our system | Status |
|---|---|---|---|
| Дата | `Дата` (DateTime, required) | `date` (Date, read-only from creation) | ✓ |
| Дата приїзду | `ДатаПриезда` (Date, required for Завершен, line 87) | `arrivalDate` (read-only, "з 1С") | ⚠️ GAP — shown read-only; should be editable by manager on completion |
| Одометр початок | `ОдометрНачало` (Number) | `mileageStart` (read-only) | ⚠️ GAP — read-only; 1С allows manual entry |
| Одометр кінець | `ОдометрКонец` (Number) | `mileageEnd` (read-only) | ⚠️ GAP — read-only; 1С allows manual entry |
| Ціна за км | `ЦенаЗаКМ` (Number) — used to calc transport cost: `(ОдометрКонец − ОдометрНачало) × ЦенаЗаКМ` (line ~1847) | **ABSENT** | ⚠️ GAP — field and calculation entirely missing |
| Склад | `Склад` (CatalogRef, required, line 79) | **ABSENT** | ⚠️ GAP — warehouse FK required by 1С for stock movements |
| Автомобіль | `Автомобиль` (CatalogRef, used in print, line 843) | **ABSENT** | ⚠️ GAP — vehicle reference not modeled |
| Торговий агент | `ТорговийАгент (_Fld7309RRef)` (CatalogRef) | `expeditorUserId` (FK → User) | ⚠️ GAP — 1С references 1С Catalog.ТорговыеАгенты; ours maps to our User (acceptable for new system, but code1C mapping absent) |
| Маршрут | `Маршрут` (CatalogRef.Маршруты, synced via ОбменАРМ `ДобавитьСправочникМаршруты`) | Free text in `comment` | ⚠️ GAP — 1С is FK to directory; ours is plain text (intentional round-2 design decision) |
| GPS координати | GPS snapshot from mobile device | `gps` (read-only, "знімок з 1С") | ⚠️ GAP — capture-in-browser removed (round-2); 1С captures on mobile agent |
| Статус | `Составляется / Отправлен / Завершен` | `draft / dispatched / completed` | ✓ semantic parity |
| Архів | implied by Завершен | `completed` acts as archive + lock | ✓ |
| Сума EUR/UAH | computed from Продажи | `totalEur` / `totalUah` derived | ✓ |

---

## 2. Tabular Sections

### 2.1 Заказы (VT6648 — 21,155 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Список замовлень МЛ | Заказы VT: Контрагент, Заказ, Город, ТипЦен, ... | `RouteSheetOrder` (orderId, position) → UI Заказы tab | ✓ |
| Вибір замовлень у МЛ | From orders picker | Date/Client/City/Region filter picker | ✓ |
| ЗмінаАктуальностіЗаказа при Відправлен | `ИзменитьАктуальностьЗаказа` → sets all Заказы rows СтатусЗамовлення=Неактуальний (lines 2196–2227) | **ABSENT** — dispatch transition has no side effect on orders | ⚠️ GAP — orders not marked non-actual on dispatch |

### 2.2 ТоварыЗаказов (VT6654 — 54,233 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Рядки товарів по замовленнях | Номенклатура, Характеристика, Кількість, Вага, Ціна, Сума | `RouteSheetItem` (productId, lotId, quantity, weight, priceEur) | ✓ |
| Відображення на вкладці | Товари tab | Товари tab (зведення з лотами) | ✓ |

### 2.3 ЗагрузкаМашины (VT6795 — 23,358 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| VT структура | Номенклатура, Характеристика, ШК, Кількість, Вага, Ціна, СумаПродажи | `RouteSheetLoading` (lotId, barcode, weight, quantity, priceEur, sumEur) | ✓ |
| Сканування ШК | Mobile agent scans barcode → adds to ЗагрузкаМашины | Backend `addLoadingByBarcode` capable; **UI marked read-only** ("надходить з 1С при обміні, формується складом") | ⚠️ GAP — UI intentionally disabled; backend logic exists but inaccessible to managers |
| Авто-прив'язка до замовлення | Lot matched to order automatically | `addLoadingByBarcode` auto-assigns to RouteSheetOrder | ✓ |
| Відмітка броні при скасуванні | `ОчиститьБронь` on Отправлен transition (lines 615–620 + 627–680): sets `Характеристика.Бронь = Ложь` + clears `ПериодБрони` for all loaded lots | **ABSENT** — our dispatch does nothing to lot reservations | ⚠️ GAP — lots remain reserved after dispatch; no reservation clearance |

### 2.4 Продажи (VT6668 — 52,848 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Реалізації в МЛ | Продажи VT: Реализация, Контрагент, СуммаПродажи, etc. | Реалізації tab: derived from `Sale WHERE routeSheetId` | ✓ derived |
| Непланова продажа | `ФормаНеплановойПродажи` (dedicated form within МЛ) | Link to `/manager/sales/new?routeSheetId=...` | ⚠️ GAP — separate dedicated 1С form; ours navigates away |
| КонтрольЗагрузкиІРеалізацій | `КонтрольЗагрузкиИРеализаций` checks loaded qty ≥ sold qty; warns if over-sold (lines ~556–605) | **ABSENT** | ⚠️ GAP — no validation that loading covers sales |
| КонтрольЦенВРеалізаціях | `КонтрольЦенВРеализациях` checks sale prices against order price type (lines ~606–612) | **ABSENT** | ⚠️ GAP — no price consistency check |

### 2.5 Розрахунки (VT6897 — 17,749 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Settlement per sale | Расчеты VT: settlement summaries per реалізація | `RouteSheetSale` model exists but **explicitly empty** ("зарезервовані під payload обміну Етапу 5") | ⚠️ GAP — model reserved but unpopulated |
| Per-client balance in route | Print МЛ з Оплатою: борг/переплата = Σ(Продажи) − Σ(Оплата) per Контрагент, converted to EUR (lines 1467–1493) | **ABSENT** — no per-client balance view anywhere | ⚠️ GAP |

### 2.6 Оплата (VT6787 — 19,748 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| VT structure | `Контрагент, Сума, Валюта, КурсВал, КурсУпр, Безналичные, Возврат` (lines 1711–1724) | Оплати tab: derived `MgrCashOrder WHERE routeSheetId` — shows `documentSumEur` only | ⚠️ GAP — multi-currency breakdown (cash UAH / USD / EUR / cashless) lost |
| Separate payment form | `ФормаДодаванняОплати` (dedicated add-payment form within МЛ context) | Standard `/manager/payments/new` (not МЛ-aware) | ⚠️ GAP — no МЛ-scoped payment form |
| Payment check before posting | Warns if orders not fully paid (lines 640–660): `ЕстьНеОплаченныеЗаказы → Внимание: не оплачені замовлення` | **ABSENT** — no payment completeness check on status transition | ⚠️ GAP |

### 2.7 КурсыВалют (VT6853 — 3,000 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Currency snapshot at creation | Stores EUR/USD rates at document creation time (persisted in VT) | Uses live `ExchangeRate` table (current rate, not snapshot) | ⚠️ GAP — historical rate not snapshotted; recalculations use current rate |

### 2.8 ТорговыеАгенти (VT7311 — 1,222 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Multi-agent route | VT lists all торгові агенти who participated in route | Single `expeditorUserId` | ⚠️ GAP — only one expeditor; multi-agent routes unsupported |

### 2.9 Витрати (VT7334 — 2,543 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Trip expense rows | `СтаттяВитрат` (expense category) + `Сума` (UAH amount) | **ENTIRELY ABSENT** — no model, no UI, no API | ⚠️ GAP — creates `ДенежныеСредства` cash outflow movements on posting (lines 777–804); affects financial totals in print form |
| Transport cost from odometer | `ОплатаТранспортуГрн = (ОдометрКонец − ОдометрНачало) × ЦенаЗаКМ` auto-added to Витрати (line 1847) | **ABSENT** | ⚠️ GAP |
| Expense directory | `Catalog.СтатьиЗатрат` | **ABSENT** | ⚠️ GAP |

### 2.10 Завдання (VT7622 — 2,230 rows)

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Task list | Задание, Виконавець, Термін, Статус | `RouteSheetTask` (description, assignedUserId, dueAt, completedAt) | ✓ |
| UI tab | Задачі | Завдання tab | ✓ |

---

## 3. Business Logic / Side Effects

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Clear lot reservations on dispatch | `ОчиститьБронь`: for each ЗагрузкаМашины row → clear Бронь + ПериодБрони in Characteristics catalog (lines 627–680) | **ABSENT** | ⚠️ GAP |
| Mark orders Неактуальний on dispatch | `ИзменитьАктуальностьЗаказа`: sets СтатусЗамовлення=Неактуальний for linked Заказы (lines 2196–2227) | **ABSENT** | ⚠️ GAP |
| Stock movement on posting | `ОбработкаПроведения`: moves lots through registers `ТоварыНаСкладах`, `ПартииТоваровНаСкладах`, `ТоварыВДороге`, `ТовариНаСкладахУВазі` | **ABSENT** — stock movement tracked in 1С only | ⚠️ GAP (by design — 1С remains source of truth for stock) |
| Cash movement on posting | `ДенежныеСредства` / `ДвиженияДенежныхСредств` updated for Оплата + Витрати rows | **ABSENT** — cash tracked in 1С only | ⚠️ GAP (by design) |
| Shortage / Бракує calc | НеХватает = замовлено − вільні лоти (no active reservation) | `computeRouteSheetShortage`: shortage = ordered − free lots without reservation | ✓ correct port |
| Мileage warning | Hard block: previous route must be closed before new one | Soft warning only (`route-sheet-mileage.ts`) | ⚠️ GAP — soft vs hard |

---

## 4. Print / Export

| Feature | 1С | Ours | Status |
|---|---|---|---|
| Print МаршрутныйЛист (plain) | `ПечатьМаршрутногоЛиста`: date, routes, orders, items, weights | **ABSENT** | ⚠️ GAP |
| Print МаршрутныйЛистСОплатой | `ПечатьМаршрутногоЛистаСОплатой`: all above + payments per client, debt, Витрати, km cost, transport total | **ABSENT** | ⚠️ GAP |

---

## 5. EXTRA (we have, 1С doesn't)

| Feature | Notes |
|---|---|
| Completion lock (read-only on completed) | Our UI hard-locks all editing on `completed`; 1С allows edits in Завершен |
| URL-based route sheet sharing | Deep-link `/manager/routes/[id]` — not in mobile 1С agent |
| Task assignee from our User table | 1С Виконавець is free text or ref; ours is a typed FK to User |

---

## Top Gaps, Prioritized

1. **Витрати VT7334** — trip expense tabular section entirely absent; `СтаттяВитрат + Сума`; creates `ДенежныеСредства` outflow on posting; transport cost auto-row via `(ОдометрКонец − ОдометрНачало) × ЦенаЗаКМ` also absent → needs new model `RouteSheetExpense`, UI tab, API, and `ЦенаЗаКМ` + `Автомобиль` header fields

2. **Авто-скасування броні при Відправлен** — `ОчиститьБронь` clears `Бронь`/`ПериодБрони` for all `ЗагрузкаМашины` lots; our `dispatched` transition does nothing → reserved lots remain blocked after route dispatches

3. **Авто-скасування актуальності замовлень** — `ИзменитьАктуальностьЗаказа` sets `СтатусЗамовлення = Неактуальний` for all `Заказы` rows on dispatch; our dispatch has no such side effect → stale orders stay "active"

4. **Оплата VT — мультивалютний розбір** — 1С `Оплата` stores `Валюта / КурсВал / КурсУпр / Безналичные / Возврат`; our Оплати tab shows only `documentSumEur`; print МЛ з Оплатою aggregates UAH cash / USD / EUR / cashless separately per client → detail lost

5. **Склад** header field (required by 1С for stock register movements, line 79) — entirely absent from our `RouteSheet` model

6. **Автомобіль** header field (CatalogRef, printed on both print forms, line 843) — entirely absent

7. **ЦенаЗаКМ** header field + transport cost calculation — `ОплатаТранспортуГрн = (ОдометрКонец − ОдометрНачало) × ЦенаЗаКМ` (line ~1847) not modeled

8. **Print forms** — both `ПечатьМаршрутногоЛиста` (plain) and `ПечатьМаршрутногоЛистаСОплатой` (full with per-client debt, Витрати, km cost) absent; no PDF/print export at all

9. **КонтрольЗагрузкиІРеалізацій** — no validation that loaded qty ≥ sold qty before posting; and **КонтрольЦенВРеалізаціях** — no price-type consistency check; both called from `ПередЗаписью`

10. **Per-client balance display** — print МЛ з Оплатою shows `Σ(Продажи) − Σ(Оплата)` per client in EUR (lines 1467–1493); our UI has no per-client balance view within the route

11. **Розрахунки VT6897** — `RouteSheetSale` model reserved but explicitly empty ("зарезервовані під payload обміну Етапу 5"); settlement summaries per sale not populated → Расчеты tab functionally absent

12. **КурсыВалют VT6853** — 1С snapshots EUR/USD rates at document creation time; we use live `ExchangeRate` table → recalculations on old routes use current rate, not historical rate at route date
