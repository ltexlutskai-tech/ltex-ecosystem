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

---

## 5.4.6 — декодовані колонки довідників/реєстрів

Exact physical columns verified `metadata.xml` → `dbnames.txt` → `columns.tsv`. These go
**verbatim** into `import-1c-historical.ts`. `RRef` = single ref `binary(16)`; `_TYPE/_RTRef/_RRRef`
trio = polymorphic ref. **ABSENT** = column does not exist (do not invent).

### Catalogs

#### 1. `_Reference96` СтатьиДвиженияДенежныхСредств (cash-flow articles)

| Target       | Column          | Type          | Notes                                |
| ------------ | --------------- | ------------- | ------------------------------------ |
| ID           | `_IDRRef`       | binary(16)    | PK (hex → `code1C`)                  |
| Code         | `_Code`         | nchar(9)      |                                      |
| Name         | `_Description`  | nvarchar(100) |                                      |
| Group flag   | `_Folder`       | binary(1)     | **hierarchical** (`0x01`=group)      |
| Parent       | `_ParentIDRRef` | binary(16)    | self-ref → article hierarchy         |
| Постачальник | `_Fld7697RRef`  | binary(16)    | ref Постачальник (ignore for import) |

#### 2. `_Reference29` БанковскиеСчета (bank accounts) — _prior map was wrong, corrected here_

| Target                                  | Column                        | Type          | Notes                                                                 |
| --------------------------------------- | ----------------------------- | ------------- | --------------------------------------------------------------------- |
| ID                                      | `_IDRRef`                     | binary(16)    | PK                                                                    |
| Code                                    | `_Code`                       | nchar(9)      |                                                                       |
| Account name                            | `_Description`                | nvarchar(100) |                                                                       |
| **Owner**                               | `_OwnerID_TYPE/_RTRef/_RRRef` | trio          | **OWNED** catalog (owner = Организации/Контрагенты)                   |
| **НомерСчета** (acct no./IBAN)          | `_Fld5869`                    | nvarchar(34)  | ← the account-number/IBAN field                                       |
| Банк                                    | `_Fld5870RRef`                | binary(16)    | ref bank                                                              |
| ТекстНазначения                         | `_Fld5871`                    | ntext         |                                                                       |
| ВидСчета                                | `_Fld5872`                    | nvarchar(15)  | **NOT МФО** (prior map guess wrong)                                   |
| ВалютаДенежныхСредств                   | `_Fld5873RRef`                | binary(16)    | ref `_Reference30` Валюты                                             |
| НомерИДатаРазрешения                    | `_Fld5874`                    | nvarchar(30)  |                                                                       |
| ДатаОткрытия                            | `_Fld5875`                    | datetime      |                                                                       |
| ДатаЗакрытия                            | `_Fld5876`                    | datetime      |                                                                       |
| СуммаБезКопеек                          | `_Fld5877`                    | binary(1)     | bool                                                                  |
| НомерСчетаУстаревший                    | `_Fld5878`                    | nvarchar(20)  | legacy acct no. — **NOT IBAN** (prior guess wrong)                    |
| Опис                                    | `_Fld7646`                    | nvarchar(500) | notes                                                                 |
| **НеВідображатиВДодатку** (hide-in-app) | `_Fld7710`                    | binary(1)     | ← the «не відображати» flag (`0x01`=hidden) — prior map **missed it** |

#### 3. `_Reference52` ЕдиницыИзмерения (units of measure)

| Target                  | Column                        | Type          | Notes                                                        |
| ----------------------- | ----------------------------- | ------------- | ------------------------------------------------------------ |
| ID                      | `_IDRRef`                     | binary(16)    | PK                                                           |
| **Owner**               | `_OwnerID_TYPE/_RTRef/_RRRef` | trio          | **OWNED** (owner = Номенклатура — units belong to a product) |
| Code                    | `_Code`                       | nchar(9)      |                                                              |
| Short name (кг/шт/пара) | `_Description`                | nvarchar(50)  |                                                              |
| ЕдиницаПоКлассификатору | `_Fld5987RRef`                | binary(16)    | ref classifier                                               |
| Вес                     | `_Fld5988`                    | numeric(15,3) |                                                              |
| Объем                   | `_Fld5989`                    | numeric(15,3) |                                                              |
| Коэффициент             | `_Fld5990`                    | numeric(10,3) |                                                              |

`_Folder` **ABSENT** (flat, not hierarchical). Because OWNED, resolve unit per doc-line via the
line's unit-ref, not via a flat global dict.

#### 4. `_Reference7513` Маршруты (routes)

| Target | Column         | Type         | Notes |
| ------ | -------------- | ------------ | ----- |
| ID     | `_IDRRef`      | binary(16)   | PK    |
| Code   | `_Code`        | nvarchar(9)  |       |
| Name   | `_Description` | nvarchar(25) |       |

`_Folder` **ABSENT** (flat — no hierarchy, contrary to the §1 table guess).

#### 5. `_Reference6628` ТорговыеАгенты (trade agents)

| Target                     | Column         | Type          | Notes                                   |
| -------------------------- | -------------- | ------------- | --------------------------------------- |
| ID                         | `_IDRRef`      | binary(16)    | PK                                      |
| Code                       | `_Code`        | nvarchar(9)   |                                         |
| Agent name                 | `_Description` | nvarchar(25)  |                                         |
| Склад                      | `_Fld6890RRef` | binary(16)    | ref warehouse                           |
| ПолныеПрава                | `_Fld6944`     | binary(1)     | bool                                    |
| **Користувач** (User link) | `_Fld7445RRef` | binary(16)    | ref Пользователи → map agent→our `User` |
| ТипЦенПродажи              | `_Fld7446RRef` | binary(16)    | ref price type                          |
| Область                    | `_Fld7638`     | nvarchar(500) | text                                    |

`_Folder` **ABSENT** (flat). `_Fld6890RRef` is the **first** attribute (Склад), not «фізособа» as §1
guessed; `_Fld6891` (nvarchar 32) = ПарольДоступаАндроід.

### Info register

#### 6. `_InfoRg4655` КурсыВалют (currency rates)

| Target                   | Column         | Type          | Notes                     |
| ------------------------ | -------------- | ------------- | ------------------------- |
| Period                   | `_Period`      | datetime      |                           |
| Валюта (dim)             | `_Fld4656RRef` | binary(16)    | ref `_Reference30` Валюты |
| Курс (rate)              | `_Fld4657`     | numeric(10,4) |                           |
| Кратность (multiplicity) | `_Fld4658`     | numeric(10,0) | divide rate by this       |

`_Reference30` **Валюты**: `_IDRRef` (PK) · `_Code` **nchar(3)** = **ISO numeric** code
(`"978"`=EUR, `"840"`=USD — padded to 3, NOT alpha) · `_Description` **nvarchar(10)** = **alpha**
short name (`"EUR"`/`"USD"` — what users typed; case as entered). `_Fld5880` (nvarchar 50) =
НаименованиеПолное. **Importer match strategy:** match `_Description IN ('EUR','USD')` OR
`_Code IN ('978','840')` — actual values must be confirmed on live data (catalog has no
predefined items; both columns populated by user, so EUR may appear as `'EUR'`/`'Евро'`).

### Cash documents (СтатьяДвижения + bank/cash desk + operation type)

#### 7. `_Document183` ПриходныйКассовыйОрдер (ПКО / incoming)

| Target                                     | Column                        | Type          | Targets                           |
| ------------------------------------------ | ----------------------------- | ------------- | --------------------------------- |
| Касса (cash desk)                          | `_Fld3261RRef`                | binary(16)    | → `_Reference56` Кассы            |
| **ВидОперации**                            | `_Fld3263RRef`                | binary(16)    | → enum `_Enum262` ВидыОперацийПКО |
| Контрагент                                 | `_Fld3264_TYPE/_RTRef/_RRRef` | **trio**      | polymorphic (Контрагенты/etc.)    |
| СуммаДокумента                             | `_Fld3268`                    | numeric(15,2) |                                   |
| **СтатьяДвиженияДенежныхСредств** (header) | `_Fld3282RRef`                | binary(16)    | → `_Reference96`                  |
| **СчетОрганизации** (bank account)         | `_Fld3283RRef`                | binary(16)    | → `_Reference29`                  |
| МаршрутныйЛист                             | `_Fld6771RRef`                | binary(16)    | → route sheet `_Document6630`     |
| КурсEUR                                    | `_Fld7345`                    | numeric(12,2) |                                   |
| КурсUSD                                    | `_Fld7346`                    | numeric(12,2) |                                   |

#### 8. `_Document187` РасходныйКассовыйОрдер (РКО / outgoing)

| Target                                     | Column                        | Type          | Targets                           |
| ------------------------------------------ | ----------------------------- | ------------- | --------------------------------- |
| Касса (cash desk)                          | `_Fld3399RRef`                | binary(16)    | → `_Reference56` Кассы            |
| **ВидОперации**                            | `_Fld3401RRef`                | binary(16)    | → enum `_Enum274` ВидыОперацийРКО |
| Контрагент                                 | `_Fld3403_TYPE/_RTRef/_RRRef` | **trio**      | polymorphic                       |
| СуммаДокумента                             | `_Fld3407`                    | numeric(15,2) |                                   |
| **СтатьяДвиженияДенежныхСредств** (header) | `_Fld3422RRef`                | binary(16)    | → `_Reference96`                  |
| **СчетОрганизации** (bank account)         | `_Fld3423RRef`                | binary(16)    | → `_Reference29`                  |
| МаршрутныйЛист                             | `_Fld6861RRef`                | binary(16)    | → route sheet                     |
| КурсEUR                                    | `_Fld7347`                    | numeric(12,2) |                                   |
| КурсUSD                                    | `_Fld7348`                    | numeric(12,2) |                                   |

> Both docs also carry **tabular-section duplicates** of СтатьяДвижения (e.g. ПКО
> `_Fld3282`-equivalent in VT, РКО `_Fld44dc1ae2…`) — for MgrCashOrder use the **header** Fld
> above. Контрагент is a polymorphic trio; resolve via `_RRRef` once `_RTRef` confirms the ref
> type points at Контрагенты.

#### Enum value resolution (ВидОперации)

Enum ref stores the element `_IDRRef`; join `_Enum262`/`_Enum274` (`_EnumOrder` follows XML order).

- **`_Enum262` ВидыОперацийПКО** (incoming): ОплатаПокупателя, ПриходДенежныхСредствРозничнаяВыручка,
  ВозвратДенежныхСредствПодотчетником, ВозвратДенежныхСредствПоставщиком,
  ПолучениеНаличныхДенежныхСредствВБанке, РасчетыПоКредитамИЗаймамСКонтрагентами,
  ПриходДенежныхСредствПрочее, ПрочиеРасчетыСКонтрагентами. **Key:** `ОплатаПокупателя` = payment from client.
- **`_Enum274` ВидыОперацийРКО** (outgoing): ОплатаПоставщику, ВозвратДенежныхСредствПокупателю,
  РасчетыПоКредитамИЗаймамСКонтрагентами, ПрочиеРасчетыСКонтрагентами,
  ВыдачаДенежныхСредствПодотчетнику, ВыдачаДенежныхСредствКассеККМ, ВзносНаличнымиВБанк,
  РасходДенежныхСредствПрочее. **Key:** `ОплатаПоставщику` / `ВозвратДенежныхСредствПокупателю`.

## 5.4.6b — регістр боргу (звірка BSL)

**Вердикт: борг клієнта, який показує мобільний АРМ, береться з `_AccumRg5269` =
`РегистрНакопления.ВзаиморасчетыСКонтрагентами`, ресурс `СуммаУпр` (= `_Fld5275`),
згрупований по Контрагент (`_Fld5273RRef`). Валюта — управлінська = EUR.**

### Чому саме цей регістр (а не `_AccumRg5668`)

Звірено по `CommonModules/ОбменАРМ/Ext/Module.bsl`:

- **Активна** процедура `ЗаповнитиБоргиКонтрагентів` (рядок 1991), яку реально кличе вивантаження
  АРМ (виклик на рядку **1143**), читає `РегистрНакопления.ВзаиморасчетыСКонтрагентами.Остатки`
  і бере ресурс **`СуммаУпрОстаток`** (= `СуммаУпр`) → пише у `СтрокаТЗ.Борг` (рядок 2079).
- Сусідня процедура `ЗаповнитиБоргиКонтрагентів_НеВикористовувати` (рядок 1937) — за назвою
  «\_НеВикористовувати» (не використовувати), теж читає той самий регістр/ресурс `СуммаУпр`. Підтверджує
  вибір регістру, але не кличеться.
- Процедура `ОтриматиБорг` (рядок 1740) — окрема, **по-документна** деталізація для одного клієнта
  з ТРЕТЬОГО регістру `ВзаиморасчетыСКонтрагентамиПоДокументамРасчетов` (ресурс `СуммаВзаиморасчетов`,
  з розбивкою Організація ТзОВ/БезТзОВ). Це НЕ загальний борг картки — це розшифровка по документах розрахунків.
- `Функція ПолучитьДолгПартенра(...)` (рядок 4625) — заглушка `ВОЗВРАТ 0`, ігнорувати.
- Мапінг GUID→ім'я підтверджено через `ConfigDumpInfo.xml` + `dbnames.txt`:
  - `_AccumRg5269` ↔ GUID `a24b508c-…` = **`ВзаиморасчетыСКонтрагентами`** ← борг АРМ
  - `_AccumRg5668` ↔ GUID `53f61efb-…` = `РасчетыСКонтрагентами` ← **НЕ використовується** кодом АРМ (інший/регламентований облік, не чіпаємо)
  - `_AccumRgT5276` — таблиця підсумків того ж регістру 5269 (той самий GUID `a24b508c-…`)

### Колонки на обраному регістрі `_AccumRg5269` (підтверджено `columns.tsv` + порядок полів у XML)

| Призначення               | Колонка                            | Тип           | Примітка                                      |
| ------------------------- | ---------------------------------- | ------------- | --------------------------------------------- |
| Період                    | `_Period`                          | datetime      | є                                             |
| Реєстратор                | `_RecorderRRef` (+`_RecorderTRef`) | binary        | є                                             |
| Вид руху                  | `_RecordKind`                      | numeric(1)    | **0 = приход, 1 = расход**                    |
| ДоговорКонтрагента (dim)  | `_Fld5270RRef`                     | binary(16)    |                                               |
| Сделка (dim, полиморф.)   | `_Fld5271_TYPE/_RTRef/_RRRef`      | trio          |                                               |
| Организация (dim)         | `_Fld5272RRef`                     | binary(16)    | АРМ-запит НЕ фільтрує по орг → сумує по всіх  |
| **Контрагент (dim)**      | **`_Fld5273RRef`**                 | binary(16)    | → ключ групування                             |
| СуммаВзаиморасчетов (res) | `_Fld5274`                         | numeric(15,2) | НЕ використовується для боргу АРМ             |
| **СуммаУпр (res)**        | **`_Fld5275`**                     | numeric(15,2) | **значення боргу, EUR (управлінська валюта)** |

### Формула боргу (знак)

1С-вираз `Остатки(...)` уже нетить рух за `_RecordKind`. При імпорті з «плоских» рухів формула:

```
debt(Контрагент) = Σ( приход.СуммаУпр )  −  Σ( расход.СуммаУпр )
                 = Σ over _Fld5273RRef of ( _RecordKind=0 ? +_Fld5275 : −_Fld5275 )
```

**Знак:** для розрахунків з покупцем у цій конфігурації **приход регістру = нарахування боргу
(Реалізація), расход = погашення (ПКО/оплата)**. Тому **позитивний залишок (`debt > 0`) означає,
що КЛІЄНТ ВИНЕН нам (дебіторка)**, а **негативний (`debt < 0`) = переплата клієнта**.
Це узгоджується з логікою `ЗаповнитиБоргиКонтрагентів` (рядки 2050-2073): `СуммаБоргу < 0` трактується
як переплата і йде у борг зі знаком мінус; додатні документи реалізації «з'їдають» позитивний залишок.

> ⚠️ TODO (підтвердити на живих даних): напрям знаку 1С-регістрів іноді інвертований конфігурацією.
> Перевірити на 1-2 відомих клієнтах з ненульовим боргом, що `Σ(приход)−Σ(расход)` дає той самий
> знак/величину (в EUR), що й картка в 1С / мобільному АРМ. Якщо вийде з протилежним знаком —
> перевернути формулу на `Σ(расход)−Σ(приход)`.

### Що заповнювати в `MgrClient`

- **`debt`** — так, з формули вище (нетований залишок `СуммаУпр` по Контрагент, EUR). Це головне поле.
- **`overdueDebt`** — у 1С прострочення для боргу АРМ рахується **НЕ з регістру**, а FIFO-проходом по
  документах Реалізації (`ЗаповнитиБоргиКонтрагентів`, рядки 2007-2083: поріг `ТекущаяДата − 14 днів`,
  списання боргу по датах реалізацій). У batch-запиті з самого регістру 5269 поле `ПростроченийБорг`
  закоментоване → повертає 0. **Рекомендація:** при імпорті НЕ намагатися відтворити цей FIFO зі
  знімку регістру — лишити `overdueDebt = NULL`/0, або порахувати окремо по датах Реалізацій уже
  після імпорту. Не блокує імпорт боргу.
- **`tovDebt` / `boргТзОВ`** — це борг по конкретній організації (ТзОВ vs БезТзОВ) з регістру
  `ВзаиморасчетыСКонтрагентамиПоДокументамРасчетов` (процедура `ОтриматиБорг`). Для основного імпорту
  не обов'язкове; якщо знадобиться — це інший регістр (не 5269/5668). Лишити NULL поки.
- **`sessionRemainder`** — у BSL АРМ-боргу немає поняття «залишок по сеансу» (`Залишок/ОстатокПоСеансу`)
  у цій ділянці коду. Поле приходить з картки Контрагента (`СеансОстаток`/реквізит довідника), а не з
  регістру взаєморозрахунків. Тут не заповнюємо — джерело окреме (довідник Контрагенты).

**Підсумок для імпортера:** netити `_AccumRg5269._Fld5275` по `_Fld5273RRef` з урахуванням
`_RecordKind` (0:+ /1:−) → `MgrClient.debt` (EUR). `overdueDebt`/`tovDebt`/`sessionRemainder` —
поки не заповнювати з цього регістру.
