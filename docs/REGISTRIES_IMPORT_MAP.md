# 1С Catalogs / Registers → Manager App Import Map

**Purpose.** Inventory of the 1С довідники (catalogs), реєстри відомостей (`_InfoRg`), and
реєстри накопичення (`_AccumRg`) that our manager blocks actually need — mapped against
what's already imported. We are **NOT** porting all of 1С (419 documents, 222 catalogs, 196
info-registers, 92 accumulation-registers, plus accounting/tax/НДС/procurement objects we
don't replicate). Scope is driven by parity gaps (`PARITY_SUMMARY.md`).

**How numbers were decoded.** metadata object → UUID (from its `.xml`) → `dbnames.txt`
(`{<uuid>,"Reference|InfoRg|AccumRg",<N>}`) → columns in `columns.tsv`. Field labels decoded
by matching attribute UUIDs (`{<uuid>,"Fld",<N>}`).

Classification: **lookup-label catalog** (cheap, import now) · **balance register**
(foundation for financial/stock features) · **skip**.

Legend: ✅ imported · ⚠️ table exists but EMPTY · ❌ missing entirely · ➖ skip-not-needed.

---

## 1. Catalogs (довідники) to import now — lookup labels

| 1С name                                                            | Physical table                                                            | Key columns                                                                                             | Purpose                                                        | Manager block / feature                                       | Our target                                                                       | STATUS                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **СтатьиДвиженияДенежныхСредств**                                  | `_Reference96`                                                            | `_IDRRef`, `_Code`, `_Description` (100), `_Folder` (hierarchy), `_Fld7697RRef`                         | Cash-flow articles («Стаття»)                                  | Оплати/Каса «Стаття»; **also** Route Витрати (`СтаттяВитрат`) | `MgrCashFlowArticle` (code1C/name/parentId)                                      | ⚠️ EMPTY                                                     |
| **БанковскиеСчета**                                                | `_Reference29`                                                            | `_IDRRef`, `_Code`, `_Description` (100), `_Fld5869` (acct no.), `_Fld5872`(МФО?), `_Fld5878`(IBAN-ish) | Bank accounts («Рахунок»)                                      | Оплати/Каса «Рахунок» (безнал)                                | `MgrBankAccount` (code1C/name)                                                   | ⚠️ EMPTY                                                     |
| **ЕдиницыИзмерения**                                               | `_Reference52`                                                            | `_IDRRef`, `_OwnerID_*` (owned!), `_Code`(9), `_Description`(50), `_Fld5988/89/90`(coef/weight)         | Units of measure (шт/кг/пара)                                  | Order/Sale/Route line `unit` (currently `null`)               | string-map onto `*Item.unit`, OR new tiny dict                                   | ❌ missing (unit=null everywhere)                            |
| **ТорговыеАгенты**                                                 | `_Reference6628`                                                          | `_IDRRef`, `_Code`(9), `_Description`(25), `_Fld6890RRef`(фізособа?), `_Fld6891`                        | Trade agents / sellers                                         | Order/Sale `assignedAgent`, route owner                       | map to `User` by name, OR keep label; see §5 note                                | ❌ missing (agent not set on import)                         |
| **Маршруты**                                                       | `_Reference7513`                                                          | `_IDRRef`, `_Code`, `_Description`                                                                      | Route directory                                                | `MgrRoute` (route assignments, route sheets)                  | `MgrRoute` (code1C/name)                                                         | ⚠️ exists, NOT imported (seed-only)                          |
| **ТипыЦенНоменклатуры**                                            | `_Reference105`                                                           | `_IDRRef`, `_Code`, `_Description`                                                                      | Price types (опт/акція/…)                                      | Prices, client price type                                     | `MgrPriceType` (code===Price.priceType)                                          | ✅ used by `importPrices` (`_Code` → priceType)              |
| ВидыОперацийПКО/РКО (Enum)                                         | `_Enum…`                                                                  | —                                                                                                       | ПКО/РКО operation kind                                         | Каса (Приход/Расход)                                          | already derived from doc kind/`_RecordKind`                                      | ➖ not a catalog; covered by importer logic                  |
| Кассы (cash desks)                                                 | `_Reference56`                                                            | `_Code`,`_Description`                                                                                  | Cash desk (готівкова каса)                                     | Каса — single physical desk                                   | not modeled (single-desk)                                                        | ➖ defer                                                     |
| Качество                                                           | `_Reference59`                                                            | `_Code`,`_Description`(50)…                                                                             | Quality (Екстра/Крем/…)                                        | Catalog quality                                               | already string-mapped on products                                                | ➖ done as strings                                           |
| Города / Області                                                   | `_Reference6810` / `_Reference6811`                                       | `_IDRRef`,`_Code`,`_Description`(50); city `_OwnerIDRRef`→region                                        | City/region                                                    | Customer city/region (display)                                | imported **as strings** onto `Customer` (`loadDictNames`)                        | ✅ string-mapped (no dict table)                             |
| Сектори                                                            | `_Reference7781`                                                          | `_Code`,`_Description`                                                                                  | Warehouse sectors                                              | Прайс/Склад sector label                                      | `WarehouseSector` (free-text now)                                                | ➖ defer (sector is free-text today)                         |
| КатегорииТТ / КаналиПошуку / СпособыДоставки / СтатусыКонтрагентов | `_Reference7591` / `_Reference7694` / `_Reference7592` / `_Reference7458` | `_Code`,`_Description`(25–50)                                                                           | TT category / search channel / delivery method / client status | Client card filters/labels                                    | `MgrCategoryTT`/`MgrSearchChannel`/`MgrDeliveryMethod`/`MgrClientStatus` (exist) | ⚠️ EMPTY (seed-only) — defer unless client-card parity needs |
| ДоговорыКонтрагентов                                               | `_Reference…` (contracts)                                                 | —                                                                                                       | Contracts (referenced by debt register dim!)                   | needed as **dimension** of debt register, not as a card       | defer label; see §2 debt note                                                    | ➖ defer (store ref only)                                    |

> **Route expense article resolved:** route Витрати `_Document6630_VT7334._Fld7336RRef`
> (`СтаттяВитрат`) → type `CatalogRef.СтатьиДвиженияДенежныхСредств` = **`_Reference96`**
> (same catalog as cash-flow «Стаття»). So importing `_Reference96` fills **both**
> `MgrCashFlowArticle` AND `RouteSheetExpense.articleName` (importer currently writes
> `articleName: null` — see `import-1c-historical.ts:2238`). VT7334 row: `_Fld7336RRef`=article,
> `_Fld7337`=Сума.

---

## 2. Balance registers (реєстри накопичення `_AccumRg`)

All `_AccumRg` share the system columns: `_Period`(datetime), `_RecorderTRef`+`_RecorderRRef`
(document that wrote the movement), `_LineNo`, `_Active`(bit), **`_RecordKind`** (0=Приход/
receipt, 1=Расход/expense). Balance = SUM over (`Приход`−`Расход`) grouped by dimensions.

### 2.1 ⭐ DEBT register — `ВзаиморасчетыСКонтрагентами` = `_AccumRg5269` (FOUNDATION for 5.4.5 / T3)

THE source of client debt. Currently `MgrClient.debt` is a static snapshot; 5.4.5 needs the
running register so проведення реалізації/оплати recompute debt and «корекція боргу» works.

| Column                          | Logical                 | Type          | Role                                                     |
| ------------------------------- | ----------------------- | ------------- | -------------------------------------------------------- |
| `_Period`                       | date                    | datetime      | movement date                                            |
| `_RecorderTRef`+`_RecorderRRef` | document                | binary 4+16   | which doc moved debt (реалізація/ПКО/РКО/коригування)    |
| `_RecordKind`                   | приход/расход           | numeric(1)    | 0 = debt up, 1 = debt down (sign of СуммаВзаиморасчетов) |
| `_Fld5270RRef`                  | **ДоговорКонтрагента**  | binary 16     | contract (ref `ДоговорыКонтрагентов`)                    |
| `_Fld5271_TYPE/_RTRef/_RRRef`   | **Сделка**              | composite ref | deal/source document (polymorphic)                       |
| `_Fld5272RRef`                  | Организация             | binary 16     | org (single → can ignore)                                |
| `_Fld5273RRef`                  | **Контрагент**          | binary 16     | **client** (→ `MgrClient.code1C`)                        |
| `_Fld5274`                      | **СуммаВзаиморасчетов** | numeric(15,2) | debt amount (the resource to net)                        |
| `_Fld5275`                      | СуммаУпр                | numeric(15,2) | mgmt-accounting amount (alt currency view)               |

**Debt per client** = `SUM(CASE _RecordKind WHEN 0 THEN _Fld5274 ELSE -_Fld5274 END)`
GROUPED BY `_Fld5273RRef` (Контрагент), filtered `_Active=0x01`. Map `_Fld5273RRef` →
`MgrClient` via existing hex→code1C lookup. → **NEW table `MgrDebtMovement`** (or compute a
balance and write `MgrClient.debt`); store contract/deal refs optionally.
⚠️ Sign convention (which `_RecordKind` increases client debt) must be verified against a
known client balance before trusting the import (TODO at run time).

> Sibling registers (verify, likely **defer** — pick the one ОбменАРМ uses for АРМ debt):
> `ВзаиморасчетыСКонтрагентамиПоДокументамРасчетов` (by settlement doc),
> `РасчетыСКонтрагентами` = `_AccumRg5668` (same shape: dims `_Fld5669`(договор)/
> `_Fld5670`(сделка)/`_Fld5671`(орг)/`_Fld5672`(контрагент)/`_Fld5673`?, resources
> `_Fld5674`/`_Fld5675`). **TODO:** confirm in `CommonModules/ОбменАРМ/Ext/Module.bsl` which
> register the existing 1С debt figure (`Контрагент.Долг`) reads from before importing.

### 2.2 Stock registers

| 1С name                  | Table          | Dimensions (`_Fld`)                                                                                                     | Resource                               | Block                                                 | Target                                                  | STATUS                                              |
| ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| **ТоварыНаСкладах**      | `_AccumRg5788` | `_Fld5789`=Склад, `_Fld5790`=Номенклатура, `_Fld5791`=Характеристика, `_Fld5792`=Серия, `_Fld5793`=Качество             | `_Fld5794` Количество (15,3)           | Прайс/Склад availability (piece/pair items)           | compute → `Lot`/availability; likely NEW `StockBalance` | ❌ not imported                                     |
| **ТовариНаСкладахУВазі** | `_AccumRg6608` | `_Fld6609`=Склад, `_Fld6610`=Номенклатура, `_Fld6611`=Характеристика                                                    | `_Fld6612` Количество **(вага, 10,2)** | L-TEX weight stock (kg) — THE relevant one for секонд | compute weight-on-hand per lot/char                     | ❌ not imported (defer — lots already carry weight) |
| ТоварыВРезервеНаСкладах  | `_AccumRg5716` | `_Fld5717`=Склад, `_Fld5718`=Номенклатура, `_Fld5719`=Характеристика, `_Fld5720`(composite=документ-резерв), `_Fld5721` | `_Fld5722` Количество (15,3)           | Reservations                                          | our booking lives in `Lot.reserved*`                    | ➖ defer (we own reservations)                      |

> Stock import is **lower priority**: lots already carry weight/remainder from the lot import.
> Useful later for a live «залишок на складі» that 1С maintains; defer past the debt register.

### 2.3 Other accumulation registers — defer / skip

`Продажи` `_AccumRg5604`, `РеализованныеТовары` `_AccumRg5678`, `ЗаказыПокупателей`
`_AccumRg5374`, `ДенежныеСредства` `_AccumRg5330`, `ДвиженияДенежныхСредств` `_AccumRg5309`
— sales/orders/cash analytics. We already import the **source documents** (orders, sales,
cash orders), so these aggregates are reconstructable from our own data. ➖ **defer/skip**
(import only if a report needs 1С-side aggregation we can't recompute). НДС/Книга*/Закупки/
Партии* etc. — ➖ **skip** (accounting/tax, out of scope).

---

## 3. Information registers (`_InfoRg`)

| 1С name                                                                     | Table         | Key columns                                                                                                           | Our target                                   | STATUS                                                                          |
| --------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| **ЦеныНоменклатуры**                                                        | `_InfoRg5225` | Номенклатура + ТипЦен(`_Fld5226RRef`) + Цена                                                                          | `Price`                                      | ✅ imported (`importPrices`)                                                    |
| **Штрихкоды**                                                               | `_InfoRg5249` | char → Номенклатура/Характеристика                                                                                    | barcodes / `Lot.barcode`                     | ✅ imported (`importBarcodes`)                                                  |
| **КурсыВалют**                                                              | `_InfoRg4655` | `_Period`(date), `_Fld4656RRef`=**Валюта** (`_Reference30` Валюты), `_Fld4657`=Курс(10,4), `_Fld4658`=Кратность(10,0) | `ExchangeRate` (currencyFrom/To, rate, date) | ❌ not imported — historical rates default to 43 (parity gap «історичний курс») |
| ЗапланированыеУведомления / ОчередьНапоминаний                              | `_InfoRg…`    | —                                                                                                                     | our reminders are local                      | ➖ skip (local)                                                                 |
| ViberИсторииСообщений / Чат1С / РеєстрНомерівТелефонів                      | `_InfoRg…`    | —                                                                                                                     | our chat-inbox is local                      | ➖ skip                                                                         |
| АсортиментПокупателя / ИсторияРаботыСКлиентом / ИсторияСтатусовКонтрагентов | `_InfoRg…`    | —                                                                                                                     | client-card extras                           | ➖ defer (client-card parity, separate)                                         |

> **КурсыВалют import (recommended, cheap):** read rows where Валюта ∈ {EUR, USD} →
> `ExchangeRate{currencyFrom:'EUR'|'USD', currencyTo:'UAH', rate:_Fld4657/NULLIF(_Fld4658,0),
date:_Period}`. Fixes historical-rate parity (orders/sales/cash currently fall back to 43).
> Resolve Валюта code via `_Reference30` (`_Code`/`_Description`).

---

## 4. Already done (no action)

- ✅ Customers, products, lots, barcodes (`_InfoRg5249`), prices (`_InfoRg5225` via
  `ТипыЦенНоменклатуры` `_Reference105`), orders, sales, cash orders, route sheets (+VT children).
- ✅ City/Region (`_Reference6810`/`_Reference6811`) — **string-mapped** onto Customer (no table).
- ✅ Legal type (`_Enum377`) — string-mapped onto Customer.

---

## 5. Skip — not needed

- All accounting/tax registers: НДС*, Книга*, Закупки, ЗаказыПоставщикам, ДопРасходы,
  Себестоимость, Партии\* — out of scope (L-TEX manager app doesn't do bookkeeping/НДС).
- Sales/orders/cash **aggregate** AccumRg (§2.3) — recomputable from imported docs.
- Reservation register `_AccumRg5716` — we own booking in `Lot.reserved*`.
- Viber/chat/reminder InfoRg — replaced by our local chat-inbox + reminders.
- Кассы `_Reference56`, ВидыОперацийПКО (Enum) — single-desk / derived from doc kind.

> **Trade-agent decision (TODO for orchestrator):** `ТорговыеАгенты` `_Reference6628` —
> decide whether to (a) match by name to existing `User` rows and backfill
> `Order.assignedAgentUserId`/`Sale` agent, or (b) keep a label-only dict. Importer currently
> sets **no** agent. Resolve before the order/sale debt-attribution work in 5.4.5.

---

## 6. Recommended import ORDER (dependency-sorted)

Catalogs first (they're dimension/label targets), then balance registers.

| #   | Object                                    | Physical                        | Target                                    | Table action                     | Why this order                                                                 |
| --- | ----------------------------------------- | ------------------------------- | ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **СтатьиДвиженияДенежныхСредств**         | `_Reference96`                  | `MgrCashFlowArticle`                      | **existing-empty** (fill)        | label for cash «Стаття» + route Витрати; no deps                               |
| 2   | **БанковскиеСчета**                       | `_Reference29`                  | `MgrBankAccount`                          | **existing-empty** (fill)        | cash «Рахунок»; no deps                                                        |
| 3   | **ЕдиницыИзмерения**                      | `_Reference52`                  | `*Item.unit` strings                      | **string-map** (or tiny dict)    | fills null `unit` on order/sale/route lines                                    |
| 4   | **Маршруты**                              | `_Reference7513`                | `MgrRoute`                                | **existing-empty** (fill code1C) | route-sheet / client route labels                                              |
| 5   | **ТорговыеАгенты**                        | `_Reference6628`                | `User` match / label                      | decision (see §5)                | needed for agent attribution on docs                                           |
| 6   | **КурсыВалют**                            | `_InfoRg4655`                   | `ExchangeRate`                            | **existing** (insert rows)       | historical rate parity; needs Валюты `_Reference30`                            |
| 7   | **Re-run route Витрати**                  | (uses #1)                       | `RouteSheetExpense.articleName`           | re-import routesheets            | backfill `articleName` now that `_Reference96` is loaded                       |
| 8   | ⭐ **ВзаиморасчетыСКонтрагентами (DEBT)** | `_AccumRg5269`                  | `MgrClient.debt` and/or `MgrDebtMovement` | **NEW table** (movements)        | depends on customers; foundation for 5.4.5; verify sign + which register first |
| 9   | ТоварыНаСкладах / УВазі                   | `_AccumRg5788` / `_AccumRg6608` | `StockBalance`                            | NEW (optional)                   | **defer** — lots already carry weight                                          |

**Table-action summary**

- **Fill existing-empty tables:** `MgrCashFlowArticle`, `MgrBankAccount`, `MgrRoute`
  (also `MgrCategoryTT`/`MgrSearchChannel`/`MgrDeliveryMethod`/`MgrClientStatus` if client-card
  parity is in scope — same trivial `_Code`/`_Description` shape, all EMPTY/seed-only).
- **String-map (no new table):** `ЕдиницыИзмерения` → `unit` columns.
- **Insert into existing:** `КурсыВалют` → `ExchangeRate`.
- **NEW Prisma table required:** the DEBT register (movements ledger) — optionally also a
  `StockBalance` later. Confirm whether 5.4.5 wants the full movement ledger or just a netted
  `MgrClient.debt` snapshot.

---

## TODO / unresolved (flag, don't guess)

1. **Which debt register** the 1С АРМ actually reads (`ВзаиморасчетыСКонтрагентами`
   `_AccumRg5269` vs `РасчетыСКонтрагентами` `_AccumRg5668` vs the «ПоДокументамРасчетов»
   variant) — verify in `CommonModules/ОбменАРМ/Ext/Module.bsl` before importing.
2. **Debt sign convention** — which `_RecordKind` value increases client debt; validate against
   one known client balance.
3. **Trade-agent mapping** — `User`-match vs label-only (§5).
4. **ЕдиницыИзмерения is owned** (`_OwnerID_*`) — owner is likely Номенклатура/Классификатор;
   importer should resolve unit `_Description` per line via the doc-line's unit ref, not by a
   flat dict (verify the order/sale line's unit `_Fld…RRef` actually points to `_Reference52`).
5. **Row counts** can't be checked offline (read-only schema dump). Confirm non-empty
   `_AccumRg5269` / `_InfoRg4655` on the live MSSQL before scheduling the import.
