# HISTORY_MIGRATION_MAP — Мапування 1С MSSQL → Prisma (історичний імпорт)

> **Призначення.** Поле-у-поле мапінг таблиць 1С «Управління Торгівлею» (MS SQL Server,
> база `ltex`) на нашу Prisma-схему (`packages/db/prisma/schema.prisma`) для імпорту
> ~5 років історії (з 2021). Документ зібраний СТАТИЧНО з committed-файлів
> (`docs/1c-mssql-schema/*.tsv`, `dbnames.txt`, `docs/1c-export-2026-06-02/`).
> До БД НЕ підключались. Кожне фізичне ім'я таблиці перевірене grep-ом через
> recipe UUID → dbnames → tables.tsv.
>
> **Дата підготовки:** 2026-06-08. Сесія ORCHESTRATOR 5.2, Пріоритет 2.

---

## 1. Огляд / масштаб імпорту

Кожен 1С-об'єкт резолвиться так: UUID з config-XML → `dbnames.txt` (prefix+номер) →
фізична таблиця `_Reference<N>` / `_Document<N>` / `_InfoRg<N>` → row_count з `tables.tsv`.

### Основні сутності (документи + каталоги даних)

| 1С-об'єкт                       | Тип       | Фізична таблиця        | Рядків     | → Prisma-модель           |
| ------------------------------- | --------- | ---------------------- | ---------- | ------------------------- |
| Catalog.Контрагенты             | Reference | `_Reference66`         | **10 034** | `Customer` + `MgrClient`  |
| Catalog.Номенклатура            | Reference | `_Reference76`         | **3 858**  | `Product`                 |
| Catalog.ХарактеристикиНоменклатуры | Reference | `_Reference113`     | **94 997** | `Lot` (мішки)             |
| InfoRg.Штрихкоды                | InfoReg   | `_InfoRg5249`          | **95 688** | `Barcode` (+`Lot.barcode`)|
| InfoRg.ЦеныНоменклатуры         | InfoReg   | `_InfoRg5225`          | **39 760** | `Price`                   |
| Document.ЗаказПокупателя        | Document  | `_Document130`         | **68 484** | `Order`                   |
| └ ТабСекція «Товары»            | VT        | `_Document130_VT1098`  | **76 929** | `OrderItem`               |
| Document.РеализацияТоваровУслуг | Document  | `_Document189`         | **64 774** | `Sale`                    |
| └ ТабСекція «Товары»            | VT        | `_Document189_VT3525`  | **79 078** | `SaleItem`                |
| Document.ПриходныйКассовыйОрдер | Document  | `_Document183`         | **52 668** | `MgrCashOrder` (income)   |
| Document.РасходныйКассовыйОрдер | Document  | `_Document187`         | **9 116**  | `MgrCashOrder` (expense)  |
| Document.МаршрутныйЛист         | Document  | `_Document6630`        | **2 000**  | `RouteSheet`              |

### Табличні секції Маршрутного листа (`_Document6630_VT*`)

| VT      | Назва (1С)       | Рядків     | → Prisma                                  |
| ------- | ---------------- | ---------- | ----------------------------------------- |
| VT6648  | Заказы           | 21 155     | `RouteSheetOrder`                         |
| VT6654  | ТоварыЗаказов    | 54 233     | `RouteSheetItem`                          |
| VT6668  | Продажи          | 52 848     | `RouteSheetSaleItem` (рядки реалізацій)   |
| VT6787  | Оплата           | 19 748     | `RouteSheetPayment`                       |
| VT6795  | ЗагрузкаМашины   | 23 358     | `RouteSheetLoading`                       |
| VT6853  | КурсыВалют       | 3 000      | (пропустити — курси-знімок у шапку)       |
| VT6897  | Расчеты          | 17 749     | `RouteSheetSale` (зведення сум)           |
| VT7311  | ТорговыеАгенты   | 1 222      | (пропустити — або у tasks/metadata)       |
| VT7334  | Витрати          | 2 543      | (немає таргета — gap, див. §11)           |
| VT7622  | Завдання         | 2 230      | `RouteSheetTask`                          |

### Довідники-FK (мінімальний імпорт: PK + `_Code` + `_Description`)

| Catalog                | Фізична таблиця  | Рядків | Призначення                            |
| ---------------------- | ---------------- | ------ | -------------------------------------- |
| Города                 | `_Reference6810` | 8 059  | `Customer.city`, `MgrClient.city`      |
| Области                | `_Reference6811` | 3 159  | `MgrClient.region`                     |
| ЕдиницыИзмерения       | `_Reference52`   | 3 792  | одиниці виміру рядків                  |
| Склады                 | `_Reference95`   | 36     | `Warehouse` (склади)                   |
| Качество               | `_Reference59`   | 1      | `Product.quality` / `SaleItem.Качество`|
| ТипыЦенНоменклатуры     | `_Reference105`  | 8      | `MgrPriceType` / `Order.priceTypeId`   |
| СтатусиЗамовлень        | `_Reference6930` | 2      | мапа `Order.status` (enum-значення)    |
| СтатусиДоставки         | `_Reference6931` | 3      | мапа статусу доставки                  |

> **СУМАРНО до імпорту (без службових VT з курсами/агентами):**
> Каталоги-дані ≈ **204 537** рядків (Контрагенти 10 034 + Номенклатура 3 858 +
> Характеристики/лоти 94 997 + Штрихкоди 95 688) + Ціни 39 760.
> Документи (шапки) ≈ **197 042** (Замовлення 68 484 + Реалізації 64 774 +
> ПКО 52 668 + РКО 9 116 + Маршрутні 2 000).
> Рядки документів (VT) ≈ **343 000+** (товари замовлень 76 929 + товари реалізацій 79 078 +
> 7 VT маршрутних ≈ 187 000).
> **Орієнтовний загальний обсяг рядків до читання: ~785 тис.** (без чисто-службових регістрів).

---

## 2. Контрагенти → `Customer` + `MgrClient`  (`_Reference66`, 10 034)

Один 1С-довідник лягає на ДВІ наші моделі: `Customer` (мінімальний для замовлень/реалізацій)
і `MgrClient` (повна менеджерська картка). Імпортувати у ОБИДВІ, лінк через `code1C` ← `_Code`.

| 1С реквізит (name)            | фізична колонка   | тип (SQL)      | → наше поле (Prisma)                       | примітки                                                  |
| ----------------------------- | ----------------- | -------------- | ------------------------------------------ | --------------------------------------------------------- |
| (PK)                          | `_IDRRef`         | binary(16)     | `MgrClient.uid1C` (hex)                     | GUID-ref; зберігати як hex для FK-резолву інших таблиць    |
| Код                           | `_Code`           | nchar(9)       | `Customer.code1C`, `MgrClient.code1C`       | **idempotency key**                                       |
| Наименование                  | `_Description`    | nvarchar       | `Customer.name`, `MgrClient.name`           |                                                           |
| ПометкаУдаления               | `_Marked`         | binary(1)      | (фільтрувати або позначити)                 | bool                                                      |
| ЭтоГруппа                     | `_Folder`         | binary(1)      | (пропустити — групи не імпортуємо)          | папки ієрархії                                            |
| Родитель                      | `_ParentIDRRef`   | binary(16)     | (пропустити)                                | FK → `_Reference66`                                       |
| ИНН                           | `_Fld6047`        | nvarchar       | (пропустити / notes)                        |                                                           |
| КодПоЕДРПОУ                    | `_Fld6061`        | nvarchar       | (пропустити)                                |                                                           |
| НомерТелефона                 | `_Fld6740`        | nvarchar       | `Customer.phone`, `MgrClient.phonePrimary`  | основний телефон                                          |
| ЕМейл                         | `_Fld7593`        | nvarchar       | `Customer.email`                            |                                                           |
| Город (FK)                    | `_Fld6812RRef`    | binary(16)     | `Customer.city`, `MgrClient.city`           | **FK → Города `_Reference6810`** (взяти `_Description`)    |
| Область (FK)                  | `_Fld6813RRef`    | binary(16)     | `MgrClient.region`                          | **FK → Области `_Reference6811`**                          |
| Улица                         | `_Fld7524`        | nvarchar       | `MgrClient.street`                          |                                                           |
| Дом                           | `_Fld7525`        | nvarchar       | `MgrClient.house`                           |                                                           |
| НомерВідділенняНП             | `_Fld7300`        | numeric        | `MgrClient.novaPoshtaBranch`                | НП відділення                                             |
| Геолокация                    | `_Fld7521`        | nvarchar       | `MgrClient.geolocation`                     |                                                           |
| СсылкаНаСайт                  | `_Fld7520`        | ntext          | `MgrClient.websiteUrl`                       |                                                           |
| НаименованиеТТ                | `_Fld7519`        | nvarchar       | `MgrClient.tradePointName`                  |                                                           |
| ТорговыйАгент (FK)            | `_Fld6889RRef`    | binary(16)     | `MgrClient.agentUserId` *(резолв)*          | **FK → ТорговыеАгенты**; мапити на наш `User` за code/ПІБ  |
| СтатусКонтрагента (FK)        | `_Fld7465RRef`    | binary(16)     | `MgrClient.statusGeneralId` *(резолв)*       | **FK → СтатусыКонтрагентов** → наш `MgrClientStatus`       |
| ОперативныйСтатусКонтрагента  | `_Fld7609RRef`    | binary(16)     | `MgrClient.statusOperationalId` *(резолв)*  | **FK → довідник статусів**                                |
| Маршрут (FK)                  | `_Fld7516RRef`    | binary(16)     | `MgrClient.primaryRouteId` *(резолв)*       | **FK → Маршруты** → `MgrRoute`                            |
| КодАсортимета (FK)            | `_Fld7518RRef`    | binary(16)     | `MgrClient.primaryAssortmentId` *(резолв)*  | **FK → КодыАссортимента** → `MgrAssortmentCode`           |
| КатегорияТТ (FK)              | `_Fld7594RRef`    | binary(16)     | `MgrClient.categoryTTId` *(резолв)*         | **FK → КатегорииТТ** → `MgrCategoryTT`                    |
| СпособДоставки (FK)           | `_Fld7595RRef`    | binary(16)     | `MgrClient.deliveryMethodId` *(резолв)*     | **FK → СпособыДоставки** → `MgrDeliveryMethod`            |
| КаналПошуку (FK)              | `_Fld7695RRef`    | binary(16)     | `MgrClient.searchChannelId` *(резолв)*      | **FK → КаналыПоиска** → `MgrSearchChannel`               |
| ОбъмЗаМесяц                   | `_Fld7522`        | numeric(3)     | `MgrClient.monthlyVolume`                   |                                                           |
| КоличествоДнейОтПоследнейПокупки | `_Fld7640`     | numeric        | `MgrClient.daysSinceLastPurchase`           |                                                           |
| ДатаПоследнейПокупки          | `_Fld7760`        | datetime       | `MgrClient.lastPurchaseAt`                  |                                                           |
| ДатаСоздания                  | `_Fld7517`        | datetime       | `MgrClient.createdAt` (опц.)                |                                                           |
| ДатаОновлення                 | `_Fld7741`        | datetime       | (пропустити / lastSyncedAt)                 |                                                           |
| Покупатель                    | `_Fld6056`        | binary(1)      | (фільтр — лишити Покупатель=true)           |                                                           |
| Поставщик                     | `_Fld6057`        | binary(1)      | (пропустити для Customer)                   | постачальники → `Supplier`                                |
| ОсновнойБанковскийСчет (FK)   | `_Fld6052RRef`    | binary(16)     | `MgrClientBankAccount` *(окрема таблиця)*   | **FK → БанковскиеСчета**                                  |
| Комментарий                   | `_Fld6049`        | ntext          | `Customer.notes`                            |                                                           |

> **БОРГ (debt/overdueDebt):** на самому Контрагенте НЕ зберігається — це залишки регістру
> взаєморозрахунків (`AccumRg…`). Для `MgrClient.debt`/`overdueDebt`/`tovDebt` потрібен
> окремий запит до регістру боргів (поза цим документом — див. §11 відкрите питання Б).

**Idempotency:** `MgrClient.code1C` / `Customer.code1C` ← `_Code` (unique index `_Reference66_Code_SR`).

---

## 3. Номенклатура → `Product`  (`_Reference76`, 3 858)

| 1С реквізит                 | фізична колонка | тип            | → Prisma                         | примітки                                       |
| --------------------------- | --------------- | -------------- | -------------------------------- | ---------------------------------------------- |
| (PK)                        | `_IDRRef`       | binary(16)     | (резолв для FK лотів/рядків)     | GUID-ref                                        |
| Код                         | `_Code`         | nchar(11)      | `Product.code1C`                 | **idempotency key**                            |
| Наименование                | `_Description`  | nvarchar       | `Product.name`                   |                                                |
| Название                    | `_Fld7773`      | nvarchar       | (альт. назва — опц.)             |                                                |
| Артикул                     | `_Fld6255`      | nvarchar       | `Product.articleCode`            |                                                |
| СсылкаНаYouTube             | `_Fld6916`      | nvarchar       | `Product.videoUrl`               |                                                |
| СреднийВес                  | `_Fld7365`      | nvarchar       | `Product.averageWeight` *(parse)*| у 1С текст → привести до Float                  |
| СтранаПроисхождения (FK)    | `_Fld6284RRef`  | binary(16)     | `Product.country` *(резолв)*     | **FK → СтраныМира**                            |
| ВидНоменклатуры (FK)        | `_Fld6278RRef`  | binary(16)     | `Product.categoryId` *(мапа)*    | **FK → ВидыНоменклатуры `_Reference37`** (2)   |
| НоменклатурнаяГруппа (FK)   | `_Fld6269RRef`  | binary(16)     | `Product.categoryId` *(альт.)*   | категорійна група                              |
| ЦеноваяГруппа (FK)          | `_Fld6281RRef`  | binary(16)     | (пропустити)                     |                                                |
| Производитель (FK)          | `_Fld6741RRef`  | binary(16)     | (пропустити / notes)             |                                                |
| БазоваяЕдиницаИзмерения (FK)| `_Fld6256RRef`  | binary(16)     | `Product.priceUnit` *(мапа)*     | **FK → ЕдиницыИзмерения** (кг/шт/пара)          |
| Весовой                     | `_Fld6257`      | binary(1)      | (визначає kg vs шт)              | bool — допомагає визначити `priceUnit`         |
| ВідображатиВШтуках          | `_Fld7696`      | binary(1)      | (мапа priceUnit)                 |                                                |
| ДополнительноеОписаниеНоменклатуры | `_Fld6283`| ntext          | `Product.description`            |                                                |
| ПосиланняНаСайт             | `_Fld7301`      | nvarchar       | (пропустити — slug генеруємо)    |                                                |
| ПосиланняНаНаявніЛоти       | `_Fld7338`      | nvarchar       | (пропустити)                     |                                                |
| Сортировка                  | `_Fld7366`      | numeric        | (пропустити)                     |                                                |
| ДатаСозданияЭлемента        | `_Fld7392`      | datetime       | `Product.createdAt` (опц.)       |                                                |
| ПометкаУдаления             | `_Marked`       | binary(1)      | `Product.inStock` (інверсія?)    | або фільтр                                     |
| ЭтоГруппа                   | `_Folder`       | binary(1)      | (пропустити групи)               |                                                |

> **Поля яких 1С НЕ має, а нам треба:** `Product.slug` (генерувати з name+code), `quality`,
> `season`, `gender`, `sizes` — у нашій схемі вони є, у Номенклатурі 1С відсутні
> (якість приходить на рівні рядка реалізації, а не товару). Заповнювати дефолтами / парсити з назви.

---

## 4. ХарактеристикиНоменклатуры → `Lot`  (`_Reference113`, 94 997)

Це і є «мішки»/лоти. `_OwnerIDRRef` вказує на Номенклатуру (товар). **Власного `_Code` НЕМАЄ** —
бізнес-ключ = ШТРИХКОД з регістру `_InfoRg5249` (див. §5) АБО hex `_IDRRef`.

| 1С реквізит         | фізична колонка | тип        | → Prisma                       | примітки                                                  |
| ------------------- | --------------- | ---------- | ------------------------------ | --------------------------------------------------------- |
| (PK)                | `_IDRRef`       | binary(16) | (резолв; кандидат на ключ)     | GUID-ref                                                  |
| Владелец (FK)       | `_OwnerIDRRef`  | binary(16) | `Lot.productId` *(резолв)*     | **FK → Номенклатура `_Reference76`** (через code1C)       |
| Наименование        | `_Description`  | nvarchar   | (опц. → comment/description)   |                                                           |
| Вага                | `_Fld6607`      | numeric(1) | `Lot.weight`                   |                                                           |
| Открыт              | `_Fld6814`      | binary(1)  | `Lot.isOpen`                   |                                                           |
| ЕстьВидео           | `_Fld6815`      | binary(1)  | (похідне від videoUrl)         |                                                           |
| Целевой             | `_Fld7351`      | binary(1)  | `Lot.isTarget`                 |                                                           |
| СсылкаНаYouTube     | `_Fld7439`      | nvarchar   | `Lot.videoUrl`                 |                                                           |
| Описание            | `_Fld7440`      | nvarchar   | `Lot.description`              |                                                           |
| Бронь (FK)          | `_Fld7441RRef`  | binary(16) | `Lot.reservedByName` *(резолв)*| **FK → ТорговыеАгенты**; bron→reserved* поля              |
| ПериодБрони         | `_Fld7442`      | datetime   | `Lot.reservedUntil`            |                                                           |
| Контрагент (FK)     | `_Fld7466RRef`  | binary(16) | `Lot.reservedForClientId` *(резолв)* | **FK → Контрагенты** (кому заброньовано)             |
| Постачальник (FK)   | `_Fld7678RRef`  | binary(16) | `Lot.supplierId` *(резолв)*    | **FK → Контрагенты/Поставщики** → `Supplier`              |
| ДатаПоставки        | `_Fld7693`      | datetime   | `Lot.arrivalDate`              |                                                           |
| СекторНаСкладі      | `_Fld7727`      | nvarchar   | `Lot.sector`                   |                                                           |
| Коментар            | `_Fld7728`      | nvarchar   | `Lot.comment`                  |                                                           |
| Ефір                | `_Fld7729`      | binary(1)  | (пропустити / videoDate)       |                                                           |
| ЕфірНаДоставку      | `_Fld7730`      | binary(1)  | (пропустити)                   |                                                           |
| ПометкаУдаления     | `_Marked`       | binary(1)  | `Lot.status` (sold/deleted)    |                                                           |

> **Поля яких НЕМАЄ у 1С, а Prisma вимагає:** `Lot.barcode` (NOT NULL, unique) ← береться з
> `_InfoRg5249` (§5); `Lot.quantity` (1С тримає кількість як залишок у регістрі, не на характеристиці —
> для мішків зазвичай = 1, або з InfoRg залишків); `Lot.priceEur` ← з `_InfoRg5225` (§6) за
> характеристикою. **Без бар코ду лот не вставиться** → порядок: спершу зібрати штрихкоди (§5),
> потім лоти. Якщо у лота немає штрихкода — генерувати синтетичний (`L-<hex>`).

---

## 5. Штрихкоды → `Barcode` (+`Lot.barcode`)  (`_InfoRg5249`, 95 688)

Регістр відомостей. Власник (Владелец) — поліморфний, вказує на Номенклатуру, плюс
окреме посилання на ХарактеристикуНоменклатуры (= лот).

| 1С реквізит                 | фізична колонка   | тип        | → Prisma                  | примітки                                              |
| --------------------------- | ----------------- | ---------- | ------------------------- | ----------------------------------------------------- |
| Штрихкод                    | `_Fld5250`        | nvarchar   | `Barcode.code` / `Lot.barcode` | **бізнес-ключ лота**                              |
| Владелец (poly type-tag)    | `_Fld5251_TYPE`   | binary     | —                         | поліморфний — тип посилання                           |
| Владелец (poly table-ref)   | `_Fld5251_RTRef`  | binary(4)  | —                         | id таблиці                                            |
| Владелец (poly row-ref)     | `_Fld5251_RRRef`  | binary(16) | (резолв → Product)        | **→ Номенклатура `_Reference76`**                     |
| ХарактеристикаНоменклатуры  | `_Fld5254RRef`    | binary(16) | (резолв → Lot)            | **→ ХарактеристикиНоменклатуры `_Reference113`** (ключ зв'язку)|
| ТипШтрихкода (FK)           | `_Fld5252RRef`    | binary(16) | `Barcode.type` *(мапа)*   | EAN13/Code39/…                                        |
| ЕдиницаИзмерения (FK)       | `_Fld5253RRef`    | binary(16) | (пропустити)              |                                                       |
| Качество (FK)               | `_Fld5256RRef`    | binary(16) | (пропустити тут)          |                                                       |
| ПредставлениеШтрихкода      | `_Fld5265`        | nvarchar   | (пропустити)              |                                                       |
| `_Fld52xx` з префіксом «Удалить» | `_Fld5257..5264` | —      | (пропустити)              | застарілі дубль-поля                                  |

> **Алгоритм:** `JOIN _InfoRg5249._Fld5254RRef = _Reference113._IDRRef` → дає баркод для лота.
> Один лот може мати >1 штрихкод → брати перший/основний. Створити `Barcode` (1:багато до `Lot`)
> і заодно заповнити денормалізований `Lot.barcode`.

---

## 6. ЦеныНоменклатуры → `Price`  (`_InfoRg5225`, 39 760)

Періодичний регістр відомостей (рух за `_Period`). Останній запис на товар+тип цін = чинна ціна.

| 1С реквізит                | фізична колонка  | тип        | → Prisma                    | примітки                                              |
| -------------------------- | ---------------- | ---------- | --------------------------- | ----------------------------------------------------- |
| Период                     | `_Period`        | datetime   | `Price.validFrom`           | дата встановлення ціни                                |
| ТипЦен (FK)                | `_Fld5226RRef`   | binary(16) | `Price.priceType` *(мапа)*  | **FK → ТипыЦенНоменклатуры `_Reference105`** → code   |
| Номенклатура (FK)          | `_Fld5227RRef`   | binary(16) | `Price.productId` *(резолв)*| **FK → Номенклатура `_Reference76`** (через code1C)   |
| ХарактеристикаНоменклатуры | `_Fld5228RRef`   | binary(16) | (опц. — per-lot ціна)       | **FK → `_Reference113`**; якщо заповнено → ціна лота  |
| Цена                       | `_Fld5230`       | numeric(2) | `Price.amount`              |                                                       |
| Валюта (FK)                | `_Fld5229RRef`   | binary(16) | `Price.currency` *(мапа)*   | **FK → Валюты** → EUR/UAH                             |
| ЕдиницаИзмерения (FK)      | `_Fld5231RRef`   | binary(16) | (пропустити)                |                                                       |
| ПроцентСкидкиНаценки       | `_Fld5232`       | numeric(2) | (пропустити)                |                                                       |
| _Active                    | `_Active`        | binary(1)  | (фільтр чинних)             | системне — брати active=1                             |

> **Зауваження:** наш `Price` прив'язаний лише до `productId`+`priceType` (не до лота). Якщо
> у 1С ціна задана на характеристику (`_Fld5228RRef`<>порожня) — для wholesale брати ціни на рівні
> товару; per-lot ціни кладуться в `Lot.priceEur` (а не в `Price`). Для лотів: `Lot.priceEur` =
> ціна з цього регістру за ХарактеристикаНоменклатуры × вагу (узгодити з логікою прайсу).

---

## 7. ЗаказПокупателя → `Order` + `OrderItem`

### 7.1 Шапка (`_Document130`, 68 484) → `Order`

| 1С реквізит           | фізична колонка | тип        | → Prisma                       | примітки                                              |
| --------------------- | --------------- | ---------- | ------------------------------ | ----------------------------------------------------- |
| (PK)                  | `_IDRRef`       | binary(16) | (резолв для VT-зв'язку)        | GUID-ref                                              |
| Номер                 | `_Number`       | nchar(11)  | `Order.code1C`                 | **idempotency key** (з `_NumberPrefix`)               |
| ПрефиксНомера         | `_NumberPrefix` | datetime   | (частина ключа номера)         |                                                       |
| Дата документа        | `_Date_Time`    | datetime   | `Order.createdAt`              |                                                       |
| Проведен              | `_Posted`       | binary(1)  | `Order.archived`               | проведено=архів (за нашою угодою)                     |
| Контрагент (FK)       | `_Fld1075RRef`  | binary(16) | `Order.customerId` *(резолв)*  | **FK → Контрагенты** (через `Customer.code1C`)        |
| СуммаДокумента        | `_Fld1085`      | numeric(2) | `Order.totalEur`/`totalUah`    | валюта з ВалютаДокумента                              |
| ВалютаДокумента (FK)  | `_Fld1066RRef`  | binary(16) | (визначає EUR vs UAH)          | **FK → Валюты**                                       |
| КурсВзаиморасчетов    | `_Fld1077`      | numeric(4) | `Order.exchangeRate`           |                                                       |
| ТипЦен (FK)           | `_Fld1086RRef`  | binary(16) | `Order.priceTypeId` *(резолв)* | **FK → ТипыЦенНоменклатуры** → `MgrPriceType`         |
| ТорговийАгент (FK)    | `_Fld6886RRef`  | binary(16) | `Order.assignedAgentUserId` *(резолв)* | **FK → ТорговыеАгенты** → `User`               |
| СтатусЗамовлення (FK) | `_Fld6932RRef`  | binary(16) | `Order.status` *(мапа enum)*   | **FK → СтатусиЗамовлень `_Reference6930`** (2 знач.)  |
| СтатусДоставки (FK)   | `_Fld6933RRef`  | binary(16) | (мапа)                         | **FK → СтатусиДоставки `_Reference6931`** (3 знач.)   |
| Наложка               | `_Fld7326`      | binary(1)  | `Order.cashOnDelivery`         |                                                       |
| Доставка (Enum)       | `_Fld7330RRef`  | binary(16) | `Order.deliveryMethod` *(мапа)*| **EnumRef.НаявністьДоставки** (не каталог!)           |
| АдресДоставки         | `_Fld1065`      | ntext      | (пропустити / notes)           |                                                       |
| ДатаОтгрузки          | `_Fld1069`      | datetime   | (пропустити)                   |                                                       |
| ДатаОплаты            | `_Fld1068`      | datetime   | (пропустити)                   |                                                       |
| Комментарий           | `_Fld1074`      | ntext      | `Order.notes`                  |                                                       |
| Закрытие              | `_Fld6914`      | binary(1)  | `Order.closedAt` (похідне)     | закрите замовлення                                    |
| МаршрутныйЛист*       | (на рівні реалізації, не замовлення) | — | `Order.routeSheetId` | МЛ зв'язок приходить через реалізацію         |

> `Order.exportTo1C`, `isActual`, `version`, `closeReasonId` — наші службові, заповнити дефолтами.

### 7.2 Рядки «Товары» (`_Document130_VT1098`, 76 929) → `OrderItem`

| 1С реквізит                | фізична колонка    | тип        | → Prisma                  | примітки                                              |
| -------------------------- | ------------------ | ---------- | ------------------------- | ----------------------------------------------------- |
| (зв'язок з шапкою)         | `_Document130_IDRRef` | binary(16)| `OrderItem.orderId` *(резолв)* | = `_Document130._IDRRef`                          |
| НомерСтроки                | `_LineNo1099`      | numeric    | (порядок)                 |                                                       |
| Номенклатура (FK)          | `_Fld1105RRef`     | binary(16) | `OrderItem.productId` *(резолв)* | **FK → Номенклатура**                          |
| ХарактеристикаНоменклатуры | `_Fld1112RRef`     | binary(16) | `OrderItem.lotId` *(резолв)* | **FK → ХарактеристикиНоменклатуры** (лот; може бути порожнім)|
| Количество                 | `_Fld1102`         | numeric(3) | `OrderItem.quantity`/`weight` | для вагового — це вага                            |
| Цена                       | `_Fld1113`         | numeric(2) | (ціна за од.)             |                                                       |
| ЦенаПродажиВес             | `_Fld6618`         | numeric(2) | `OrderItem.priceEur` *(розрах.)* | ціна продажу за вагу                            |
| Сумма                      | `_Fld1110`         | numeric(2) | `OrderItem.priceEur`      | сума рядка (line total)                               |
| СвободныйОстаток           | `_Fld6806`         | numeric(3) | (пропустити)              |                                                       |
| КоличествоФакт             | `_Fld6917`         | numeric(3) | (пропустити / факт)       |                                                       |
| ЕдиницаИзмерения (FK)      | `_Fld1100RRef`     | binary(16) | (мапа одиниці)            | **FK → ЕдиницыИзмерения**                            |

**Idempotency:** `Order.code1C` ← `_Number` (+`_NumberPrefix`); рядки видаляються/перевставляються разом із замовленням (cascade).

---

## 8. РеализацияТоваровУслуг → `Sale` + `SaleItem`

### 8.1 Шапка (`_Document189`, 64 774) → `Sale`

| 1С реквізит           | фізична колонка | тип        | → Prisma                       | примітки                                              |
| --------------------- | --------------- | ---------- | ------------------------------ | ----------------------------------------------------- |
| (PK)                  | `_IDRRef`       | binary(16) | (резолв)                       | GUID-ref                                              |
| Номер                 | `_Number`       | nchar(11)  | `Sale.code1C`                  | **idempotency key**                                   |
| Дата документа        | `_Date_Time`    | datetime   | `Sale.createdAt`               |                                                       |
| Проведен              | `_Posted`       | binary(1)  | `Sale.status`=posted/`archived`|                                                       |
| Контрагент (FK)       | `_Fld3493RRef`  | binary(16) | `Sale.customerId` *(резолв)*   | **FK → Контрагенты**                                  |
| СуммаДокумента        | `_Fld3501`      | numeric(2) | `Sale.totalEur`/`totalUah`     |                                                       |
| ТипЦен (FK)           | `_Fld3494RRef`  | binary(16) | `Sale.priceTypeId` *(резолв)*  | **FK → ТипыЦенНоменклатуры**                          |
| ВалютаДокумента (FK)  | `_Fld3495RRef`  | binary(16) | (визначає валюту)              | **FK → Валюты**                                       |
| КурсEUR               | `_Fld7299`      | numeric(2) | `Sale.exchangeRateEur`         |                                                       |
| КурсUSD               | `_Fld7298`      | numeric(2) | `Sale.exchangeRateUsd`         |                                                       |
| ТорговийАгент (FK)    | `_Fld6887RRef`  | binary(16) | `Sale.assignedAgentUserId` *(резолв)* | **FK → ТорговыеАгенты**                         |
| МаршрутныйЛист (FK)   | `_Fld6729RRef`  | binary(16) | `Sale.routeSheetId` *(резолв)* | **FK → МаршрутныйЛист `_Document6630`** (через code1C)|
| Наложка               | `_Fld7327`      | binary(1)  | `Sale.cashOnDelivery`          |                                                       |
| СумаОплатиНаложкою     | `_Fld7775`      | numeric    | `Sale.codAmountUah`            |                                                       |
| Доставка (Enum)       | `_Fld7331RRef`  | binary(16) | `Sale.deliveryMethod` *(мапа)* | EnumRef.НаявністьДоставки                             |
| НомерВідділенняНП     | `_Fld7332`      | nvarchar   | `Sale.novaPoshtaBranch`        |                                                       |
| НомерЭкспрессНакладной| `_Fld7768`      | nvarchar   | `Sale.expressWaybill`          | ТТН Нової Пошти                                       |
| ВидОплаты             | `_Fld7772`      | nvarchar   | (пропустити / notes)           |                                                       |
| Склад (FK)            | `_Fld3491RRef`  | binary(16) | (пропустити / warehouse)       | **FK → Склады**                                       |
| Комментарий           | `_Fld3489`      | ntext      | `Sale.notes`                   |                                                       |
| Проверена             | `_Fld7349`      | binary(1)  | (пропустити)                   |                                                       |

### 8.2 Рядки «Товары» (`_Document189_VT3525`, 79 078) → `SaleItem`

| 1С реквізит                | фізична колонка       | тип        | → Prisma                    | примітки                                          |
| -------------------------- | --------------------- | ---------- | --------------------------- | ------------------------------------------------- |
| (зв'язок з шапкою)         | `_Document189_IDRRef` | binary(16) | `SaleItem.saleId` *(резолв)*| = `_Document189._IDRRef`                          |
| Номенклатура (FK)          | `_Fld3533RRef`        | binary(16) | `SaleItem.productId` *(резолв)* | **FK → Номенклатура**                         |
| ХарактеристикаНоменклатуры | `_Fld3540RRef`        | binary(16) | `SaleItem.lotId`/`barcode` *(резолв)* | **FK → ХарактеристикиНоменклатуры**     |
| Количество                 | `_Fld3530`            | numeric(3) | `SaleItem.weight`/`quantity`|                                                   |
| Цена                       | `_Fld3541`            | numeric(2) | `SaleItem.pricePerKg`       |                                                   |
| ЦенаПродажиВес             | `_Fld6621`            | numeric(2) | `SaleItem.pricePerKg` *(альт.)* |                                               |
| Сумма                      | `_Fld3538`            | numeric(2) | `SaleItem.priceEur`         | line total                                        |
| Качество (FK)              | `_Fld3529RRef`        | binary(16) | (мапа якості)               | **FK → Качество `_Reference59`**                  |
| Знижка                     | `_Fld7342`            | binary(1)  | (пропустити)                |                                                   |
| ЗаказПокупателя (FK)       | `_Fld3548RRef`        | binary(16) | `Sale.orderId` *(резолв)*   | **FK → ЗаказПокупателя** — лінк реалізації на замовлення|
| ЕдиницаИзмерения (FK)      | `_Fld3527RRef`        | binary(16) | (мапа)                      | **FK → ЕдиницыИзмерения**                          |
| Склад (FK)                 | `_Fld3542RRef`        | binary(16) | (пропустити)                | **FK → Склады**                                   |

> `SaleItem.barcode` (nullable) — заповнити з лота через `_Fld3540RRef → _Reference113 → _InfoRg5249`.

---

## 9. ПриходныйКассовыйОрдер / РасходныйКассовыйОрдер → `MgrCashOrder`

ПКО = `MgrCashOrder.type='income'`, РКО = `type='expense'`. Поля майже дзеркальні.

### 9.1 ПКО (`_Document183`, 52 668) → `MgrCashOrder` (income)

| 1С реквізит               | фізична колонка   | тип        | → Prisma                       | примітки                                              |
| ------------------------- | ----------------- | ---------- | ------------------------------ | ----------------------------------------------------- |
| (PK)                      | `_IDRRef`         | binary(16) | (резолв)                       |                                                       |
| Номер                     | `_Number`         | nchar      | `MgrCashOrder.code1C`          | **idempotency key**                                   |
| НомерОрдера               | `_Fld3272`        | numeric    | `MgrCashOrder.docNumber`       |                                                       |
| Дата документа            | `_Date_Time`      | datetime   | `MgrCashOrder.paidAt`/`createdAt`|                                                     |
| Контрагент (poly row-ref) | `_Fld3264_RRRef`  | binary(16) | `MgrCashOrder.customerId` *(резолв)* | **поліморфний FK → Контрагенты** (читати тільки тип=Контрагент)|
| СуммаДокумента            | `_Fld3268`        | numeric(2) | `MgrCashOrder.amountUah` (за валютою) |                                                |
| ВалютаДокумента (FK)      | `_Fld3267RRef`    | binary(16) | (розкласти у amountUah/Eur/Usd)| **FK → Валюты**                                       |
| КурсEUR                   | `_Fld7345`        | numeric(2) | `MgrCashOrder.rateEur`         |                                                       |
| КурсUSD                   | `_Fld7346`        | numeric(2) | `MgrCashOrder.rateUsd`         |                                                       |
| СтатьяДвиженияДенежныхСредств (FK)| `_Fld3282RRef` | binary(16)| `MgrCashOrder.cashFlowArticleId` *(резолв)* | **FK → СтатьиДвиженияДенежныхСредств** → `MgrCashFlowArticle`|
| СчетОрганизации (FK)      | `_Fld3283RRef`    | binary(16) | `MgrCashOrder.bankAccountId` *(резолв)* | **FK → БанковскиеСчета** → `MgrBankAccount`     |
| СуммаОплатыПлатежнымиКартами | `_Fld3290`     | numeric(2) | `MgrCashOrder.amountUahCashless` (частина)| безнал                                       |
| МаршрутныйЛист (FK)       | `_Fld6771RRef`    | binary(16) | `MgrCashOrder.routeSheetId` *(резолв)* | **FK → МаршрутныйЛист**                          |
| ДокументОснование (poly)  | `_Fld3279_RRRef`  | binary(16) | `MgrCashOrder.saleId` *(резолв)* | **поліморфний FK → Реализация** (якщо тип = реалізація)|
| ПринятоОт                 | `_Fld3270`        | ntext      | (пропустити / comment)         |                                                       |
| Комментарий               | `_Fld3278`        | ntext      | `MgrCashOrder.comment`         |                                                       |
| Ответственный (FK)        | `_Fld3277RRef`    | binary(16) | `MgrCashOrder.agentUserId` *(резолв)* | **FK → Користувачі/Агенти**                     |

### 9.2 РКО (`_Document187`, 9 116) → `MgrCashOrder` (expense)

Аналогічно: Контрагент `_Fld3403_RRRef`, СуммаДокумента `_Fld3407`, ВалютаДокумента `_Fld3406RRef`,
КурсEUR `_Fld7347`, КурсUSD `_Fld7348`, СтатьяДвиженияДенежныхСредств `_Fld3422RRef`,
СчетОрганизации `_Fld3423RRef`, МаршрутныйЛист `_Fld6861RRef`, ДокументОснование `_Fld3419_RRRef`,
Номер `_Number`, НомерОрдера `_Fld3416`, Комментарий `_Fld3402`, Ответственный `_Fld3418RRef`.
**Усе → `MgrCashOrder` з `type='expense'`.**

> **Зауваження.** Наш `Payment` — це лише дзеркало для online-оплат магазину; історична каса
> 1С повністю лягає у `MgrCashOrder` (income/expense). `Payment` для історії НЕ використовуємо
> (L-TEX не приймає онлайн-оплати — див. CLAUDE.md правило 5).

---

## 10. МаршрутныйЛист → `RouteSheet` (+7 дочірніх)  (`_Document6630`, 2 000)

### 10.1 Шапка → `RouteSheet`

| 1С реквізит         | фізична колонка | тип        | → Prisma                       | примітки                                          |
| ------------------- | --------------- | ---------- | ------------------------------ | ------------------------------------------------- |
| (PK)                | `_IDRRef`       | binary(16) | (резолв для VT + Sale.routeSheet)|                                                 |
| Номер               | `_Number`       | nchar      | `RouteSheet.code1C`            | **idempotency key**                               |
| Дата документа      | `_Date_Time`    | datetime   | `RouteSheet.date`              |                                                   |
| ДатаПриезда         | `_Fld6647`      | datetime   | `RouteSheet.arrivalDate`       |                                                   |
| Проведен            | `_Posted`       | binary(1)  | `RouteSheet.posted`            |                                                   |
| Автомобиль (FK)     | `_Fld6635RRef`  | binary(16) | (пропустити / notes)           | **FK → Автомобили**                               |
| ОдометрНачало       | `_Fld6636`      | numeric(1) | `RouteSheet.mileageStartKm`    |                                                   |
| ОдометрКонец        | `_Fld6637`      | numeric(1) | `RouteSheet.mileageEndKm`      |                                                   |
| Пробег              | `_Fld6638`      | numeric(1) | (похідне)                      |                                                   |
| ЦенаЗаКМ            | `_Fld7333`      | numeric(2) | (пропустити)                   |                                                   |
| СтатусДокумента (FK)| `_Fld6639RRef`  | binary(16) | `RouteSheet.status` *(мапа)*   | **FK → довідник статусів**                        |
| ТорговийАгент (FK)  | `_Fld7309RRef`  | binary(16) | `RouteSheet.expeditorUserId` *(резолв)* | **FK → ТорговыеАгенты** → `User`         |
| СуммаДокумента      | `_Fld6646`      | numeric(2) | `RouteSheet.totalUah`/`totalEur`|                                                  |
| Склад (FK)          | `_Fld6634RRef`  | binary(16) | (пропустити / warehouse)       | **FK → Склады**                                   |
| Архивный            | `_Fld7352`      | binary(1)  | `RouteSheet.archived`          |                                                   |
| Комментарий         | `_Fld6645`      | ntext      | `RouteSheet.comment`           | сюди ж — текст маршруту                            |

### 10.2 Дочірні VT (резолв `_Document6630_IDRRef` = шапка)

- **VT6648 «Заказы» (21 155)** → `RouteSheetOrder`: рядок із FK на ЗаказПокупателя → `orderId`, Контрагент → `customerId`, місто.
- **VT6654 «ТоварыЗаказов» (54 233)** → `RouteSheetItem`: Номенклатура→`productId`, Характеристика→`lotId`, Количество→`quantity`, Цена→`price`, Сумма→`sum`.
- **VT6795 «ЗагрузкаМашины» (23 358)** → `RouteSheetLoading`: Характеристика(лот)+штрихкод→`barcode`, вага, кількість, ціна.
- **VT6668 «Продажи» (52 848)** → `RouteSheetSaleItem`: рядки реалізацій у межах рейсу.
- **VT6897 «Расчеты» (17 749)** → `RouteSheetSale`: зведення сум по реалізаціях (saleId, sum).
- **VT6787 «Оплата» (19 748)** → `RouteSheetPayment`: касовий ордер→`cashOrderId`, сума.
- **VT7622 «Завдання» (2 230)** → `RouteSheetTask`: Контрагент→`customerId`, текст→`comment`.
- **VT6853 «КурсыВалют» (3 000)** → (пропустити; курси кладемо у шапку Sale/CashOrder).
- **VT7311 «ТорговыеАгенты» (1 222)** → (пропустити або у metadata шапки).
- **VT7334 «Витрати» (2 543)** → **немає таргета** (gap — потрібна нова таблиця або у `RouteSheetTask`).

> Точні `_Fld` номери дочірніх VT не розкривав поіменно (їх 10×) — структура аналогічна
> рядкам замовлення/реалізації; при написанні маппера декодувати кожен через
> `/tmp/decode_table.sh _Document6630_VT<N> Documents/МаршрутныйЛист.xml` (скрипт-рецепт нижче §13).

---

## 11. Idempotency-ключі (повторний імпорт не дублює)

| Сутність     | Унікальний ключ 1С            | Наше поле          | Перевірено                          |
| ------------ | ----------------------------- | ------------------ | ----------------------------------- |
| Customer     | `_Code` (nchar 9)             | `Customer.code1C`  | unique idx `_Reference66_Code_SR` ✓ |
| MgrClient    | `_Code` / `_IDRRef`           | `code1C` / `uid1C` | ✓                                   |
| Product      | `_Code` (nchar 11)            | `Product.code1C`   | ✓                                   |
| Lot          | **барод з `_InfoRg5249`** або hex `_IDRRef` | `Lot.barcode` | ⚠ `_Reference113` НЕ має `_Code`  |
| Price        | (`_Period`,`ТипЦен`,`Номенклатура`) | (productId, priceType, validFrom) | складений   |
| Order        | `_Number` (+`_NumberPrefix`)  | `Order.code1C`     | unique idx `_Document130_ByDocNum_SR` ✓ |
| Sale         | `_Number`                     | `Sale.code1C`      | ✓                                   |
| MgrCashOrder | `_Number`                     | `code1C`           | ✓                                   |
| RouteSheet   | `_Number`                     | `RouteSheet.code1C`| ✓                                   |

---

## 12. Відкриті питання / ризики

**А. Формат `_IDRRef` (16-байтний GUID-ref).** 1С зберігає посилання як `binary(16)`.
   Для матчингу між таблицями (FK-резолв) у скрипті-мапері порівнювати або як raw `Buffer`,
   або конвертувати в hex-рядок (`CONVERT(varchar(36), _IDRRef, 2)` у T-SQL / `.toString('hex')` у Node).
   **Ключове:** перший байт-порядок 1С не збігається з .NET GUID — використовувати raw-байти послідовно,
   будувати словник `hex(_IDRRef) → наш cuid` для КОЖНОГО каталогу під час імпорту, потім резолвити документи.

**Б. Борг клієнта.** `MgrClient.debt`/`overdueDebt`/`tovDebt` — НЕ на `_Reference66`. Це залишки
   регістру накопичення взаєморозрахунків (`_AccumRg…`, напр. `ВзаиморасчетыСКонтрагентами`). Окремий запит
   до регістру залишків (поза цим документом). На першому проході можна імпортувати борг=0, потім добити.

**В. Поліморфні (composite-type) посилання.** `Контрагент` у ПКО/РКО (`_Fld3264`/`_Fld3403`),
   `ДокументОснование` (`_Fld3279`/`_Fld3419`), `Владелец` у штрихкодах (`_Fld5251`) — триплети
   `_TYPE`/`_RTRef`/`_RRRef`. `_RTRef` = id таблиці; читати `_RRRef` лише коли `_RTRef` вказує на
   потрібну таблицю (Контрагенты `_Reference66` / Реализация `_Document189`). Інакше — пропуск.

**Г. Enum vs Catalog для статусів/доставки.** `Доставка` = `EnumRef.НаявністьДоставки` (enum, таблиця `_Enum…`),
   а `СтатусЗамовлення`/`СтатусДоставки` = каталоги (`_Reference6930`/`6931`). Значення enum-ів та
   `_Description` каталогів-статусів треба ВИЧИТАТИ з БД (`SELECT _Description FROM _Reference6930`) і
   скласти мапу `1С-значення → наш string-статус` (`draft|sent|posted|cancelled` тощо). Цього не видно зі схеми.

**Д. ТорговыйАгент → User.** 1С `ТорговыеАгенты` — окремий каталог; наш `User` — інша сутність
   (5-10 менеджерів). Потрібна мапа агент→користувач (за ПІБ/кодом). Незіставлені агенти → null
   або службовий «імпортований з 1С» user.

**Е. Lot.barcode обов'язковий + unique.** Лот без штрихкода у `_InfoRg5249` не вставиться. Стратегія:
   синтетичний `L-<hex(_IDRRef)>`. Також у 1С один лот може мати кілька штрихкодів → брати перший,
   решту класти в `Barcode` (1:багато).

**Є. Кількість лота (`Lot.quantity`).** Не зберігається на характеристиці — це залишок регістру
   `ТовариНаСкладах` (`_AccumRg…`). Для історичних мішків ставити `quantity=1` (мішок як одиниця)
   або підтягувати залишок окремо.

**Ж. Дублі Контрагентів.** `Customer.phone` НЕ unique у нашій схемі; find-or-create робити СУВОРО
   за `code1C` (не за телефоном), щоб не злити різних клієнтів.

**З. `VT7334 «Витрати»` маршрутного — немає Prisma-таргета.** Потрібна нова дочірня таблиця або
   ігнор (узгодити з user).

**И. Курс/валюта документів.** `СуммаДокумента` зберігається у валюті документа (`ВалютаДокумента`).
   Більшість — EUR (опт), частина UAH. Розкладати у `totalEur`/`totalUah` за `КурсВзаиморасчетов`/`КурсEUR`.

---

## 13. Рекомендований порядок імпорту (FK-залежності)

> Принцип: спершу будуємо словники `hex(_IDRRef) → наш id` для кожного каталогу, потім документи.

1. **Довідники-FK** (паралельно, без взаємних залежностей):
   `Города` (`_Reference6810`) → `Области` (`_Reference6811`) → `ЕдиницыИзмерения` (`_Reference52`) →
   `Качество` (`_Reference59`) → `ТипыЦенНоменклатуры` (`_Reference105`→`MgrPriceType`) →
   `Склады` (`_Reference95`→`Warehouse`) → `СтатусиЗамовлень`/`СтатусиДоставки` (мапи enum) →
   `СтатусыКонтрагентов`, `КаналыПоиска`, `КатегорииТТ`, `СпособыДоставки`, `КодыАссортимента`, `Маршруты`
   (наповнюють менеджерські довідники `MgrClientStatus`/`MgrSearchChannel`/… та `MgrRoute`).
2. **Номенклатура** (`_Reference76` → `Product`) — потрібна для лотів/рядків.
3. **Контрагенты** (`_Reference66` → `Customer` + `MgrClient`) — потрібні для документів.
   (борг/`AccumRg` — окремим проходом, опційно.)
4. **Штрихкоды** (`_InfoRg5249`) — зібрати мапу `характеристика(лот) → barcode`.
5. **ХарактеристикиНоменклатуры** (`_Reference113` → `Lot` + `Barcode`) — використовує мапу штрихкодів + Product.
6. **ЦеныНоменклатуры** (`_InfoRg5225` → `Price`) — використовує Product + ТипЦен.
7. **ЗаказПокупателя** (`_Document130` → `Order` + `OrderItem`) — Customer + Product + Lot + ТипЦен + Агент.
8. **МаршрутныйЛист** (`_Document6630` → `RouteSheet` + дочірні) — Order + Customer + Product + Lot + Агент.
9. **РеализацияТоваровУслуг** (`_Document189` → `Sale` + `SaleItem`) — Customer + Product + Lot + Order + RouteSheet.
10. **ПКО/РКО** (`_Document183`/`_Document187` → `MgrCashOrder`) — Customer + Sale + RouteSheet + СтатьяДДС + БанкСчет.

### Допоміжний скрипт-декодер (для дописування мапінгу VT маршрутного тощо)

Recipe `/tmp/decode_table.sh <фізична_таблиця> <шлях_до_config_xml>` (використано у цій сесії):
1. UUID об'єкта = ПЕРШИЙ `uuid="…"` у його config-XML.
2. `grep <uuid> dbnames.txt` (ігнорувати `ChngR`) → prefix+номер → фізична таблиця.
3. Кожна `_Fld<N>` → `grep ',"Fld",<N>}' dbnames.txt` → field-uuid → знайти `<Attribute uuid="…">` у XML → `<Name>`.
4. VT-секції: `grep ',"VT",<M>}' dbnames.txt` → uuid → `<TabularSection uuid="…">` → `<Name>`.

---

## 14. Перевірені приклади (anchor для довіри)

- `Catalog.Контрагенты` uuid `b6412cac-…9229` → `_Reference66` → **10 034** рядків ✓
- `Catalog.Номенклатура` uuid `22d218e8-…ab15` → `_Reference76` → **3 858** ✓
- `Catalog.ХарактеристикиНоменклатуры` uuid `f2aece6c-…1655` → `_Reference113` → **94 997** ✓
  (а `СерииНоменклатуры` `_Reference93` = **0** рядків → НЕ використовується для лотів!)
- `Document.ЗаказПокупателя` uuid `c1dccc32-…50f4` → `_Document130` → **68 484**; VT1098 «Товары» → **76 929** ✓
- `Document.РеализацияТоваровУслуг` uuid `6e3d2ddf-…ba62` → `_Document189` → **64 774**; VT3525 «Товары» → **79 078** ✓
- `Document.ПриходныйКассовыйОрдер` `_Document183` → **52 668**; `Расходный` `_Document187` → **9 116** ✓
- `Document.МаршрутныйЛист` uuid `8b928f15-…100c` → `_Document6630` → **2 000** ✓
- `InfoRg.Штрихкоды` → `_InfoRg5249` → **95 688**; `InfoRg.ЦеныНоменклатуры` → `_InfoRg5225` → **39 760** ✓
