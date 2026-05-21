# 1С Sync Modules Specification

Цей документ описує SOAP-операції які треба реалізувати у 1С Web Service
`MobileExchange.1cws` (або новий `ManagerSync.1cws`) для двостороннього
обміну з програмою менеджерів L-TEX (Next.js + Tauri shell).

**Цільова аудиторiя:** 1С-розробник (Підприємство 8.3).

**Контракт-партнер:** `services/manager-sync` Node-proxy у нашому
ecosystem-репозиторії. Реальний код виклику — у
`services/manager-sync/src/soap/client.ts`.

**Mock mode:** до моменту реалізації цих модулів — наша сторона працює у
mock-режимі (`SYNC_MOCK_MODE=true`); після впровадження BSL — переключаємось.

---

## 1. Auth

Усі операції приймають перший параметр `ПарольВхода` — shared secret.

- Production value на стороні нашого сервера зберігається у env
  `ONEC_SOAP_PASSWORD`
- На стороні 1С: constant `СинкПароль` (тип Строка), значення identical
- Auth check у самому початку кожної функції; на невірний пароль → return error 1
- **DO NOT** використовувати basic-auth IIS — він not portable між Apache/Linux 1С

Приклад auth-функції:

```bsl
Функция ПеревіритиПароль(ПарольВхода) Експорт
    ОчікуванийПароль = Константы.СинкПароль.Получить();
    Возврат СтрСравнить(ПарольВхода, ОчікуванийПароль) = 0;
КонецФункции
```

---

## 2. Idempotency

Operations що змінюють стан (Update/Create) приймають `IdempotencyKey`
(UUID-string, наприклад `550e8400-e29b-41d4-a716-446655440000`).

1С підтримує реєстр (catalog або реєстр інформації) `СинкЛог`:

- **Поля:** `IdempotencyKey` (Строка 36) UUID, `DateCreated` (Дата/Час),
  `OperationType` (Строка 50), `ResultJSON` (Строка max length)
- **Retention:** 7 днів (cleanup через scheduled task `ЧисткаСинкЛогу`)
- **Behavior:** на повторний call з тим самим key → return cached
  ResultJSON, **не виконуй operation** повторно

Реалізація як catalog `Catalog.СинкЛог` (простіше) або
`InformationRegister.СинкЛог` (швидше для великих обсягів — `Periodic` з
вимірюванням `IdempotencyKey`).

```bsl
Функция ОтриматиСинкЛогЗапис(IdempotencyKey) Експорт
    Запит = Новий Запит;
    Запит.Текст =
        "ВЫБРАТЬ ResultJSON FROM Catalog.СинкЛог
         |ГДЕ IdempotencyKey = &Key";
    Запит.УстановитьПараметр("Key", IdempotencyKey);
    Результат = Запит.Виконати();
    Якщо Результат.Пустой() Тоді
        Возврат Неопределено;
    КонецЕсли;
    Возврат Результат.Вибрати()[0].ResultJSON;
КонецФункции

Процедура ЗберегтиСинкЛогЗапис(IdempotencyKey, OperationType, ResultJSON) Експорт
    Запис = Catalog.СинкЛог.СоздатьЕлемент();
    Запис.Найменування = IdempotencyKey;
    Запис.IdempotencyKey = IdempotencyKey;
    Запис.DateCreated = ПоточнаяДата();
    Запис.OperationType = OperationType;
    Запис.ResultJSON = ResultJSON;
    Запис.Записать();
КонецПроцедуры
```

---

## 3. Operations

### 3.1 ОбновитиКлієнта

Update or create клієнта у 1С на основі data з нашої програми (картка
клієнта була змiнена менеджером у L-TEX Manager).

**Тип:** SOAP function (Output: Строка)

**Параметри:**

| Name             | Type      | In/Out | Description          |
| ---------------- | --------- | ------ | -------------------- |
| `ПарольВхода`    | xs:string | In     | Shared secret        |
| `IdempotencyKey` | xs:string | In     | UUID для dedup       |
| `ПакетДанних`    | xs:string | In     | JSON-payload клієнта |

**`ПакетДанних` JSON структура:**

```json
{
  "code1C": "000005798",
  "name": "Магазин Соборна",
  "tradePointName": "ТТ-1",
  "region": "Київська",
  "city": "Київ",
  "street": "Соборна",
  "house": "12",
  "novaPoshtaBranch": "5",
  "websiteUrl": "https://example.com",
  "geolocation": "50.4501,30.5234",
  "monthlyVolume": "150.50",
  "licenseExpiresAt": "2026-12-31T00:00:00.000Z",
  "viberContact": "+380501112233",
  "dialogStatus": null,
  "statusGeneralCode": "active",
  "statusOperationalCode": null,
  "categoryTTCode": null,
  "deliveryMethodCode": "nova-poshta",
  "searchChannelCode": "google",
  "primaryRouteCode": null,
  "primaryAssortmentCode": null,
  "priceTypeCode": "wholesale",
  "agentCode1C": "U0001"
}
```

**Notes:**

- `code1C: null` означає "створи нового клієнта", 1С повертає згенерований code1C у response
- FK-related передаються через `*Code` поля (наш side тримає id, але для 1С важливі коди довідників)
- `monthlyVolume` — рядок з `.` як decimal separator (NOT comma!) — це для уникнення integer overflow
- `licenseExpiresAt` — ISO 8601 (UTC), 1С парсить через `XMLЗначение(Тип("Дата"), …)`

**Return value:** `xs:string` — JSON:

```json
{
  "ok": true,
  "code1C": "000005798",
  "errors": []
}
```

**Error response:**

```json
{
  "ok": false,
  "errorCode": 2,
  "errorMessage": "Validation: missing tradePointName"
}
```

**Error codes:**

| Code | Name            | When                                          |
| ---- | --------------- | --------------------------------------------- |
| 0    | OK              | (replaced by `ok:true` у response)            |
| 1    | AuthFailed      | wrong `ПарольВхода`                           |
| 2    | ValidationError | JSON malformed або missing required field     |
| 3    | DBError         | 1С DB write failed (exception у `Записать()`) |
| 4    | Other           | unhandled exception                           |

**BSL module signature (CommonModule "СинкВхідний"):**

```bsl
Функция ОбновитиКлієнта(ПарольВхода, IdempotencyKey, ПакетДанних) Експорт
    Якщо Не ПеревіритиПароль(ПарольВхода) Тоді
        Возврат СтворитиВідповідьПомилки(1, "Auth failed");
    КонецЕсли;

    // Idempotency check
    ЗбережениОтвет = ОтриматиСинкЛогЗапис(IdempotencyKey);
    Якщо ЗбережениОтвет <> Неопределено Тоді
        Возврат ЗбережениОтвет;
    КонецЕсли;

    // Parse JSON
    Спробувати
        Парсер = Новий ЧтениеJSON;
        Парсер.УстановитьСтроку(ПакетДанних);
        Дані = ПрочитатьJSON(Парсер);
        Парсер.Закрити();
    Інакше
        Возврат СтворитиВідповідьПомилки(2, "Invalid JSON: " + ОписаниеОшибки());
    КонецСпробувати;

    // Validation
    Якщо ПустоеЗначение(Дані.name) Тоді
        Возврат СтворитиВідповідьПомилки(2, "name is required");
    КонецЕсли;

    // Update/Create
    Спробувати
        Клієнт = ЗнайтиАбоСтворитиКлієнта(Дані.code1C, Дані.name);
        Клієнт.Найменування = Дані.name;
        Клієнт.НаименованиеТТ = Дані.tradePointName;
        Клієнт.Регіон = Дані.region;
        Клієнт.Місто = Дані.city;
        Клієнт.Вулиця = Дані.street;
        Клієнт.НомерБудинку = Дані.house;
        Клієнт.ВідділенняНП = Дані.novaPoshtaBranch;
        Клієнт.СайтURL = Дані.websiteUrl;
        Клієнт.Геолокація = Дані.geolocation;
        Якщо Не ПустоеЗначение(Дані.monthlyVolume) Тоді
            Клієнт.МісячнийОбсяг = Число(Дані.monthlyVolume);
        КонецЕсли;
        Якщо Не ПустоеЗначение(Дані.licenseExpiresAt) Тоді
            Клієнт.ЛіцензіяДо = XMLЗначение(Тип("Дата"), Дані.licenseExpiresAt);
        КонецЕсли;
        Клієнт.КонтактВайбер = Дані.viberContact;
        Клієнт.СтатусДіалогу = Дані.dialogStatus;

        // FK relations by code (find references)
        Клієнт.СтатусЗагальний = ЗнайтиСтатусПоКоду(Дані.statusGeneralCode);
        Клієнт.СтатусОператив = ЗнайтиСтатусПоКоду(Дані.statusOperationalCode);
        Клієнт.КатегоріяТТ = ЗнайтиКатегоріюПоКоду(Дані.categoryTTCode);
        Клієнт.СпособДоставки = ЗнайтиДоставкуПоКоду(Дані.deliveryMethodCode);
        Клієнт.КаналПошуку = ЗнайтиКаналПоКоду(Дані.searchChannelCode);
        Клієнт.ОсновнийМаршрут = ЗнайтиМаршрутПоКоду(Дані.primaryRouteCode);
        Клієнт.ОсновнийАсортимент = ЗнайтиАсортиментПоКоду(Дані.primaryAssortmentCode);
        Клієнт.ТипЦін = ЗнайтиТипЦінПоКоду(Дані.priceTypeCode);
        Клієнт.ТорговийАгент = ЗнайтиАгентаПоКоду(Дані.agentCode1C);

        Клієнт.Записать();

        Результат = СтворитиВідповідьУспіх(Клієнт.Код);
        ЗберегтиСинкЛогЗапис(IdempotencyKey, "ОбновитиКлієнта", Результат);
        Возврат Результат;
    Інакше
        Возврат СтворитиВідповідьПомилки(3, "DB write: " + ОписаниеОшибки());
    КонецСпробувати;
КонецФункции

Функция ЗнайтиАбоСтворитиКлієнта(Code, Name)
    Якщо ПустоеЗначение(Code) Тоді
        // Create new
        Клієнт = Catalogs.Контрагенты.СоздатьЕлемент();
        Клієнт.Найменування = Name;
        Возврат Клієнт;
    КонецЕсли;
    // Find existing
    Знайдений = Catalogs.Контрагенты.НайтиПоКоду(Code);
    Якщо Знайдений.Пустая() Тоді
        Клієнт = Catalogs.Контрагенты.СоздатьЕлемент();
        Возврат Клієнт;
    КонецЕсли;
    Возврат Знайдений.ПолучитьОбъект();
КонецФункции
```

### 3.2 СтворитиЗамовлення (M1.5b — implemented client-side, реальний BSL чекає 1С-розробника)

Створює документ "Замовлення Покупця" (`Document.ЗаказПокупателя`) у 1С на
основі payload-у з нашої програми. Документ створюється у статусі "Черновик"
(не проводиться) — менеджер у 1С підтверджує або відправляє на склад
вручну.

**Тип:** SOAP function (Output: Строка)

**Параметри:**

| Name             | Type      | In/Out | Description            |
| ---------------- | --------- | ------ | ---------------------- |
| `ПарольВхода`    | xs:string | In     | Shared secret          |
| `IdempotencyKey` | xs:string | In     | UUID для dedup         |
| `ПакетДанних`    | xs:string | In     | JSON-payload документа |

**`ПакетДанних` JSON структура** (точно такий shape що шле наша
`apps/store/lib/sync/enqueue.ts::buildOrderCreatePayload`):

```json
{
  "orderInternalId": "ckxyz123abc",
  "code1C": null,
  "status": "draft",
  "customerCode1C": "000005798",
  "notes": "Терміново, погоджено по телефону",
  "totalEur": "150.50",
  "totalUah": "6471.50",
  "exchangeRate": "43.0000",
  "items": [
    {
      "productId": "ckabc1",
      "productCode1C": "0007854",
      "lotId": "cklot1",
      "lotBarcode": "1234567890123",
      "priceEur": "100.50",
      "weight": "25.123",
      "quantity": 1
    },
    {
      "productId": "ckabc2",
      "productCode1C": "0007855",
      "lotId": null,
      "lotBarcode": null,
      "priceEur": "50.00",
      "weight": "10.000",
      "quantity": 2
    }
  ]
}
```

**Поля:**

- `orderInternalId` — наш ID (cuid) у `Order.id`. 1С зберігає у
  `Document.ЗаказПокупателя.ВнішнійID` (новий реквізит) щоб уникнути
  дублів при retry-storms.
- `code1C` — null коли наша сторона ще не знає 1С-кода (це найчастіший
  випадок при create). 1С генерує свій номер документа і повертає у response.
- `customerCode1C` — code1C клієнта (`Catalog.Контрагенты.Код`). 1С шукає
  існуючого через `НайтиПоКоду`; якщо не знайдено — повертає errorCode=2.
- `totalEur` / `totalUah` / `exchangeRate` — string з `.` decimal separator,
  парсити через `Число()`.
- `items[].lotBarcode` — null коли позиція "загальна" (менеджер УП обере
  лот пізніше при відвантаженні). У такому разі 1С створює `Замовлення.Товари`
  рядок з `Сертификат = Неопределено` і `Розкладено = Хибно`.
- `items[].lotBarcode` not null — конкретний лот. 1С шукає `Catalog.Серії`
  по barcode і прив'язує. Якщо лот вже у іншому замовленні → errorCode=3
  "Lot already reserved".
- `items[].productCode1C` — fallback коли `lotBarcode` null; шукає
  `Catalog.Номенклатура` по коду.

**Return:** JSON-string

```json
{
  "ok": true,
  "orderCode1C": "0000123",
  "orderNumber": "L-2026-0123",
  "errors": []
}
```

Або на помилку:

```json
{
  "ok": false,
  "errorCode": 2,
  "errorMessage": "Клієнта 000005798 не знайдено у 1С"
}
```

**Error codes:**

- `1` — невірний пароль (як і ОбновитиКлієнта)
- `2` — referenced entity не знайдена (customer/product/lot)
- `3` — business rule violation (лот вже зарезервований у іншому документі,
  заблокований склад тощо)
- `4` — інша помилка БД у 1С

**Чорновик BSL (для майбутньої реалізації):**

```bsl
Функція СтворитиЗамовлення(ПарольВхода, IdempotencyKey, ПакетДанних) Експорт
    Якщо Не ПеревіритиПароль(ПарольВхода) Тоді
        Возврат СтворитиВідповідьПомилки(1, "Bad password");
    КонецЕсли;

    Cached = ОтриматиСинкЛогЗапис(IdempotencyKey);
    Якщо Cached <> Неопределено Тоді
        Возврат Cached;
    КонецЕсли;

    Спробувати
        Дані = ПрочитатиJSON(ПакетДанних);

        // 1. Find клієнт
        Клієнт = Catalogs.Контрагенты.НайтиПоКоду(Дані.customerCode1C);
        Якщо Клієнт.Пустая() Тоді
            Возврат СтворитиВідповідьПомилки(2, "Клієнта не знайдено: " + Дані.customerCode1C);
        КонецЕсли;

        // 2. Create новий документ
        Документ = Documents.ЗаказПокупателя.СоздатьДокумент();
        Документ.Дата = ПоточнаяДата();
        Документ.Контрагент = Клієнт;
        Документ.ВнішнійID = Дані.orderInternalId; // новий реквізит для dedup
        Документ.СумаEUR = Число(Дані.totalEur);
        Документ.СумаUAH = Число(Дані.totalUah);
        Документ.КурсEUR = Число(Дані.exchangeRate);
        Документ.Коментар = Дані.notes;

        // 3. Items
        Для Каждого Поз Из Дані.items Цикл
            Рядок = Документ.Товари.Добавить();
            // Try lot-bound first
            Якщо Не ПустоеЗначение(Поз.lotBarcode) Тоді
                Серія = Catalogs.Серії.НайтиПоНайменуванню(Поз.lotBarcode);
                Якщо Серія.Пустая() Тоді
                    Возврат СтворитиВідповідьПомилки(2, "Лот не знайдено: " + Поз.lotBarcode);
                КонецЕсли;
                Рядок.Серія = Серія;
                Рядок.Номенклатура = Серія.Номенклатура;
            Інакше
                Номен = Catalogs.Номенклатура.НайтиПоКоду(Поз.productCode1C);
                Якщо Номен.Пустая() Тоді
                    Возврат СтворитиВідповідьПомилки(2, "Товар не знайдено: " + Поз.productCode1C);
                КонецЕсли;
                Рядок.Номенклатура = Номен;
            КонецЕсли;
            Рядок.Вага = Число(Поз.weight);
            Рядок.Количество = Поз.quantity;
            Рядок.ЦінаEUR = Число(Поз.priceEur);
        КонецЦикла;

        Документ.Записать(РежимЗаписиДокумента.Запись); // черновик, не проводимо

        Результат = СтворитиВідповідьЗамовлення(Документ.Код, Документ.Номер);
        ЗберегтиСинкЛогЗапис(IdempotencyKey, "СтворитиЗамовлення", Результат);
        Возврат Результат;
    Виключення
        Возврат СтворитиВідповідьПомилки(4, "DB write: " + ОписаниеОшибки());
    КонецСпробувати;
КонецФункції

Функція СтворитиВідповідьЗамовлення(Code, Номер)
    Шаблон = "{""ok"":true,""orderCode1C"":""%1"",""orderNumber"":""%2"",""errors"":[]}";
    Возврат СтрШаблон(Шаблон, Code, Номер);
КонецФункції
```

### 3.3 СтворитиОплату (M1.5b — implemented client-side)

Створює документ "Поступлення на расчетный счет" або "Поступлення готівки"
(залежить від `method`) у 1С на основі payload-у.

**Тип:** SOAP function (Output: Строка)

**Параметри:** ті самі що `СтворитиЗамовлення`.

**`ПакетДанних` JSON структура** (echo `buildPaymentCreatePayload`):

```json
{
  "paymentInternalId": "ckpay1",
  "orderInternalId": "ckxyz123abc",
  "orderCode1C": "0000123",
  "method": "cash",
  "amount": "1500.00",
  "currency": "UAH",
  "externalId": null,
  "paidAt": "2026-05-15T10:00:00.000Z"
}
```

**Поля:**

- `paymentInternalId` — наш ID (`Payment.id`); 1С зберігає у `ВнішнійID`.
- `orderCode1C` — 1С код документу замовлення. Може бути null коли парент
  Order ще sync-ається у тому ж пакеті — у такому разі 1С шукає по
  `orderInternalId` → знаходить документ через `ВнішнійID`.
- `method` — enum: `cash` | `card` | `bank_transfer` | `online`.
  - `cash` → `Document.ПКО` (Прибутковий касовий ордер)
  - `card` | `online` | `bank_transfer` → `Document.ПоступленнеНаРС`
- `amount` — string з `.` decimal separator.
- `paidAt` — ISO 8601 UTC; 1С парсить через `XMLЗначение(Тип("Дата"), ...)`.

**Return:** JSON-string

```json
{
  "ok": true,
  "paymentCode1C": "0000456",
  "errors": []
}
```

**Error codes:** ті самі що `СтворитиЗамовлення` (1-4).

### 3.4 СтворитиРеалізацію (M1.6 Реалізація, Етап 5 — implemented client-side, реальний BSL чекає 1С-розробника)

Створює документ "Реалізація товарів та послуг"
(`Document.РеализацияТоваровУслуг`) у central 1С на основі payload-у з нашої
програми. Документ фіксує факт продажу/відвантаження клієнту (борг клієнта; у
central — списання складу). Створюється у статусі "Черновик" (не проводиться) —
менеджер у 1С підтверджує/проводить вручну.

> **Транспорт замокано.** На нашій стороні (`apps/store`) Sale-документ
> ставиться у чергу `mgr_sync_jobs` (entityType `realization`), а
> `services/manager-sync` проксі за замовчуванням працює у `SYNC_MOCK_MODE`
> (синтетична відповідь `MOCK-RLZ-…`). Реальний SOAP-виклик активується коли
> виставлено `ONEC_SOAP_URL`/`ONEC_SOAP_PASSWORD` і реалізовано BSL нижче.

**Тип:** SOAP function (Output: Строка)

**Параметри:**

| Name             | Type      | In/Out | Description            |
| ---------------- | --------- | ------ | ---------------------- |
| `ПарольВхода`    | xs:string | In     | Shared secret          |
| `IdempotencyKey` | xs:string | In     | UUID для dedup         |
| `ПакетДанних`    | xs:string | In     | JSON-payload документа |

**`ПакетДанних` JSON структура** (точно такий shape що шле наша
`apps/store/lib/sync/enqueue.ts::buildSaleCreatePayload`):

```json
{
  "saleInternalId": "ckxyz123abc",
  "code1C": null,
  "docNumber": 42,
  "customerCode1C": "000005798",
  "customerName": "Магазин Соборна",
  "notes": "Відвантажено по маршруту №3",
  "totalEur": "150.50",
  "totalUah": "6471.50",
  "exchangeRateEur": "43.0000",
  "exchangeRateUsd": "39.8500",
  "priceTypeId": "ckpt-retail",
  "deliveryMethod": "post",
  "novaPoshtaBranch": "7",
  "cashOnDelivery": true,
  "codAmountUah": "6471.00",
  "assignedAgentUserId": "ckmgr9",
  "onTradeAgent": false,
  "expressWaybill": "TTN-20260521-001",
  "items": [
    {
      "productId": "ckabc1",
      "productCode1C": "0007854",
      "lotId": "cklot1",
      "lotBarcode": "1234567890123",
      "pricePerKg": "4.05",
      "priceEur": "100.50",
      "weight": "25.123",
      "quantity": 1
    },
    {
      "productId": "ckabc2",
      "productCode1C": "0007855",
      "lotId": null,
      "lotBarcode": null,
      "pricePerKg": "5.00",
      "priceEur": "50.00",
      "weight": "10.000",
      "quantity": 2
    }
  ]
}
```

**Поля:**

- `saleInternalId` — наш ID (cuid) у `Sale.id`. 1С зберігає у
  `Document.РеализацияТоваровУслуг.ВнішнійID` (новий реквізит) щоб уникнути
  дублів при retry-storms (idempotency на рівні документа).
- `code1C` — null коли наша сторона ще не знає 1С-кода (найчастіший випадок
  при create). 1С генерує свій номер документа і повертає у response.
- `docNumber` — наш людиночитаний номер (`Sale.docNumber`, autoincrement);
  довідково, для звірки з менеджером. 1С веде власну нумерацію.
- `customerCode1C` — code1C клієнта (`Catalog.Контрагенты.Код`). 1С шукає через
  `НайтиПоКоду`; якщо не знайдено — `errorCode=2`. `customerName` — лише для
  логів/звірки.
- `totalEur` / `totalUah` — суми документа, string з `.` decimal separator
  (парсити через `Число()`).
- `exchangeRateEur` / `exchangeRateUsd` — знімок курсів EUR→UAH і USD→UAH на
  документі (4 знаки). USD потрібен для каси/здачі у 3 валютах (Етап 4).
- `priceTypeId` — наш `MgrPriceType.id` типу цін (для довідки; central
  застосовує власний тип цін за клієнтом). Може бути null.
- `deliveryMethod` — `delivery` | `post` | `pickup`. `novaPoshtaBranch` — №
  відділення Нової Пошти (актуально для `post`). `expressWaybill` — ТТН.
- `cashOnDelivery` (Наложка) — bool; `codAmountUah` (СумаОплатиНаложкою) —
  сума післяплати у грн (string) або null коли наложки немає.
- `assignedAgentUserId` (ПризначитиПродажТорговомуКонтрагента) — кому
  зараховано продаж (`User.id` нашої сторони). Може бути null. `onTradeAgent` —
  bool «зарахувати агенту клієнта».
- `items[].lotBarcode` — null коли позиція «загальна» (менеджер УП обере лот
  пізніше). **Central може поки не приймати точний лот** — тому `lotBarcode`
  опційний; на цьому етапі рекомендовано слати «загальні позиції» по коду
  товару (`productCode1C`), а прив'язку до серії робити вже після обмінів.
- `items[].lotBarcode` not null — конкретний лот; 1С шукає `Catalog.Серії` по
  barcode (як у `СтворитиЗамовлення`). Якщо лот зайнято → `errorCode=3`.
- `items[].productCode1C` — `Catalog.Номенклатура` по коду (fallback / основний
  спосіб коли лот не передається).
- `items[].pricePerKg` (ЦенаПродажиВес) — ціна за кг (€), string. `priceEur` —
  сумарна ціна рядка = pricePerKg × weight × quantity. `weight` — вага позиції,
  кг (3 знаки).

**Return:** JSON-string

```json
{
  "ok": true,
  "realizationCode1C": "0000456",
  "realizationNumber": "R-2026-0456",
  "errors": []
}
```

Або на помилку:

```json
{
  "ok": false,
  "errorCode": 2,
  "errorMessage": "Клієнта 000005798 не знайдено у 1С"
}
```

**Error codes:** ті самі що `СтворитиЗамовлення`:

- `1` — невірний пароль
- `2` — referenced entity не знайдена (customer/product/lot)
- `3` — business rule violation (лот вже зарезервований/проданий, склад
  заблоковано тощо)
- `4` — інша помилка БД у 1С

**Чорновик BSL (для майбутньої реалізації):**

```bsl
Функція СтворитиРеалізацію(ПарольВхода, IdempotencyKey, ПакетДанних) Експорт
    Якщо Не ПеревіритиПароль(ПарольВхода) Тоді
        Возврат СтворитиВідповідьПомилки(1, "Bad password");
    КонецЕсли;

    Cached = ОтриматиСинкЛогЗапис(IdempotencyKey);
    Якщо Cached <> Неопределено Тоді
        Возврат Cached;
    КонецЕсли;

    Спробувати
        Дані = ПрочитатиJSON(ПакетДанних);

        // 1. Find клієнт
        Клієнт = Catalogs.Контрагенты.НайтиПоКоду(Дані.customerCode1C);
        Якщо Клієнт.Пустая() Тоді
            Возврат СтворитиВідповідьПомилки(2, "Клієнта не знайдено: " + Дані.customerCode1C);
        КонецЕсли;

        // 2. Create новий документ Реалізації
        Документ = Documents.РеализацияТоваровУслуг.СоздатьДокумент();
        Документ.Дата = ПоточнаяДата();
        Документ.Контрагент = Клієнт;
        Документ.ВнішнійID = Дані.saleInternalId; // новий реквізит для dedup
        Документ.СумаEUR = Число(Дані.totalEur);
        Документ.СумаUAH = Число(Дані.totalUah);
        Документ.КурсEUR = Число(Дані.exchangeRateEur);
        Документ.КурсUSD = Число(Дані.exchangeRateUsd);
        Документ.СпособДоставки = Дані.deliveryMethod;
        Документ.ОтделениеНП = Дані.novaPoshtaBranch;
        Документ.Наложка = Дані.cashOnDelivery;
        Якщо Дані.cashOnDelivery Тоді
            Документ.СуммаОплатыНаложкой = Число(Дані.codAmountUah);
        КонецЕсли;
        Документ.ЭкспрессНакладная = Дані.expressWaybill;
        Документ.Коментар = Дані.notes;

        // 3. Items
        Для Каждого Поз Из Дані.items Цикл
            Рядок = Документ.Товари.Добавить();
            // Конкретний лот (опційно — central може поки не приймати)
            Якщо Не ПустоеЗначение(Поз.lotBarcode) Тоді
                Серія = Catalogs.Серії.НайтиПоНайменуванню(Поз.lotBarcode);
                Якщо Серія.Пустая() Тоді
                    Возврат СтворитиВідповідьПомилки(2, "Лот не знайдено: " + Поз.lotBarcode);
                КонецЕсли;
                Рядок.Серія = Серія;
                Рядок.Номенклатура = Серія.Номенклатура;
            Інакше
                Номен = Catalogs.Номенклатура.НайтиПоКоду(Поз.productCode1C);
                Якщо Номен.Пустая() Тоді
                    Возврат СтворитиВідповідьПомилки(2, "Товар не знайдено: " + Поз.productCode1C);
                КонецЕсли;
                Рядок.Номенклатура = Номен;
            КонецЕсли;
            Рядок.Вага = Число(Поз.weight);
            Рядок.Количество = Поз.quantity;
            Рядок.ЦенаПродажиВес = Число(Поз.pricePerKg);
            Рядок.ЦінаEUR = Число(Поз.priceEur);
        КонецЦикла;

        Документ.Записать(РежимЗаписиДокумента.Запись); // черновик, не проводимо

        Результат = СтворитиВідповідьРеалізації(Документ.Код, Документ.Номер);
        ЗберегтиСинкЛогЗапис(IdempotencyKey, "СтворитиРеалізацію", Результат);
        Возврат Результат;
    Виключення
        Возврат СтворитиВідповідьПомилки(4, "DB write: " + ОписаниеОшибки());
    КонецСпробувати;
КонецФункції

Функція СтворитиВідповідьРеалізації(Code, Номер)
    Шаблон = "{""ok"":true,""realizationCode1C"":""%1"",""realizationNumber"":""%2"",""errors"":[]}";
    Возврат СтрШаблон(Шаблон, Code, Номер);
КонецФункції
```

> **Follow-up — каса/оплата для реалізації.** Sync касового ордера
> (`Document.КассовыйОрдер` / `MgrCashOrder`, здача у 3 валютах) — окремий
> наступний крок і **поки не реалізовано**. Shape оплати вже описано у §3.3
> `СтворитиОплату`; коли дійдемо до каси — додамо аналогічну `entityType` +
> route у proxy і нову операцію тут.

### 3.5 ОтриматиСнапшот (M1.6, заплановано — inbound)

**Поки лише поняття.** Це **outbound** з 1С → наша сторона polling-ить
періодично. Тип буде "Function returns xs:string"; payload — пачка
оновлених клієнтів/боргів/замовлень з 1С у нашу `mgr_*` сторону.

```json
{
  "snapshotAt": "2026-05-15T12:34:56.000Z",
  "clients": [{ "code1C": "000005798", "debt": "1234.56", ... }],
  "orders": [{ "code1C": "L-2026-0123", "status": "shipped", ... }]
}
```

### 3.6 Helpers (internal, не SOAP)

```bsl
Функция СтворитиВідповідьУспіх(Code1C)
    Возврат "{""ok"":true,""code1C"":""" + Code1C + """,""errors"":[]}";
КонецФункции

Функция СтворитиВідповідьПомилки(ErrCode, ErrMsg)
    Шаблон = "{""ok"":false,""errorCode"":%1,""errorMessage"":%2}";
    Возврат СтрШаблон(Шаблон, ErrCode, ОбернутьУЛапки(ErrMsg));
КонецФункции

Функция ОбернутьУЛапки(Стр)
    // JSON-quote: escape " і \n
    Стр2 = СтрЗаменить(Стр, "\", "\\");
    Стр2 = СтрЗаменить(Стр2, """", "\""");
    Стр2 = СтрЗаменить(Стр2, Символы.ПС, "\n");
    Возврат """" + Стр2 + """";
КонецФункции
```

---

## 4. Examples (XML over HTTP)

### Request `ОбновитиКлієнта`

```xml
POST /ltex/ws/MobileExchange.1cws HTTP/1.1
Host: 1c-server.local
Content-Type: text/xml; charset=utf-8
SOAPAction: "http://arm_mobile#MobileExchange:ОбновитиКлієнта"

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:ОбновитиКлієнта xmlns:ms="http://arm_mobile">
      <ms:ПарольВхода>shared-secret-value</ms:ПарольВхода>
      <ms:IdempotencyKey>550e8400-e29b-41d4-a716-446655440000</ms:IdempotencyKey>
      <ms:ПакетДанних>{"code1C":"000005798","name":"Магазин Соборна","tradePointName":"ТТ-1"}</ms:ПакетДанних>
    </ms:ОбновитиКлієнта>
  </soap:Body>
</soap:Envelope>
```

### Successful Response

```xml
HTTP/1.1 200 OK
Content-Type: text/xml; charset=utf-8

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:ОбновитиКлієнтаResponse xmlns:ms="http://arm_mobile">
      <ms:return>{"ok":true,"code1C":"000005798","errors":[]}</ms:return>
    </ms:ОбновитиКлієнтаResponse>
  </soap:Body>
</soap:Envelope>
```

### Error Response (validation)

```xml
HTTP/1.1 200 OK
Content-Type: text/xml; charset=utf-8

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:ОбновитиКлієнтаResponse xmlns:ms="http://arm_mobile">
      <ms:return>{"ok":false,"errorCode":2,"errorMessage":"name is required"}</ms:return>
    </ms:ОбновитиКлієнтаResponse>
  </soap:Body>
</soap:Envelope>
```

**Note:** SOAP-faults НЕ використовуємо — усі помилки приходять у body
як JSON у `ok:false` форматі. Це уніфікує клієнтський код.

### Request `СтворитиЗамовлення`

```xml
POST /ltex/ws/MobileExchange.1cws HTTP/1.1
Host: 1c-server.local
Content-Type: text/xml; charset=utf-8
SOAPAction: "http://arm_mobile#MobileExchange:СтворитиЗамовлення"

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:СтворитиЗамовлення xmlns:ms="http://arm_mobile">
      <ms:ПарольВхода>shared-secret-value</ms:ПарольВхода>
      <ms:IdempotencyKey>660e8400-e29b-41d4-a716-446655440100</ms:IdempotencyKey>
      <ms:ПакетДанних>{"orderInternalId":"ckxyz123","customerCode1C":"000005798","totalEur":"150.50","totalUah":"6471.50","exchangeRate":"43.0000","items":[{"productId":"ckabc1","productCode1C":"0007854","lotId":"cklot1","lotBarcode":"1234567890123","priceEur":"100.50","weight":"25.123","quantity":1}]}</ms:ПакетДанних>
    </ms:СтворитиЗамовлення>
  </soap:Body>
</soap:Envelope>
```

### Successful Response `СтворитиЗамовлення`

```xml
HTTP/1.1 200 OK
Content-Type: text/xml; charset=utf-8

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:СтворитиЗамовленняResponse xmlns:ms="http://arm_mobile">
      <ms:return>{"ok":true,"orderCode1C":"0000123","orderNumber":"L-2026-0123","errors":[]}</ms:return>
    </ms:СтворитиЗамовленняResponse>
  </soap:Body>
</soap:Envelope>
```

### Request `СтворитиОплату`

```xml
POST /ltex/ws/MobileExchange.1cws HTTP/1.1
Host: 1c-server.local
Content-Type: text/xml; charset=utf-8
SOAPAction: "http://arm_mobile#MobileExchange:СтворитиОплату"

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:СтворитиОплату xmlns:ms="http://arm_mobile">
      <ms:ПарольВхода>shared-secret-value</ms:ПарольВхода>
      <ms:IdempotencyKey>770e8400-e29b-41d4-a716-446655440200</ms:IdempotencyKey>
      <ms:ПакетДанних>{"paymentInternalId":"ckpay1","orderCode1C":"0000123","method":"cash","amount":"1500.00","currency":"UAH","paidAt":"2026-05-15T10:00:00.000Z"}</ms:ПакетДанних>
    </ms:СтворитиОплату>
  </soap:Body>
</soap:Envelope>
```

### Successful Response `СтворитиОплату`

```xml
HTTP/1.1 200 OK
Content-Type: text/xml; charset=utf-8

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:СтворитиОплатуResponse xmlns:ms="http://arm_mobile">
      <ms:return>{"ok":true,"paymentCode1C":"0000456","errors":[]}</ms:return>
    </ms:СтворитиОплатуResponse>
  </soap:Body>
</soap:Envelope>
```

---

## 5. Implementation у 1С — checklist

1. Створи `CommonModule "СинкВхідний"` (server-side, External access disabled, Reusable=true)
2. Створи `Catalog "СинкЛог"` з полями:
   - `IdempotencyKey` (Строка 36) UUID
   - `DateCreated` (Дата/Час)
   - `OperationType` (Строка 50)
   - `ResultJSON` (Строка max length)
3. Створи `Constant "СинкПароль"` (Строка 64), задай random shared secret
4. Створи `ScheduledJob "ЧисткаСинкЛогу"` — щодня видаляє `СинкЛог` записи старші 7 днів
5. Створи `WebService "MobileExchange"` (URI Namespace: `http://arm_mobile`)
6. Додай operations (усі мають однаковий signature: 3 xs:string In params, return xs:string):
   - `ОбновитиКлієнта` — update/create клієнта
   - `СтворитиЗамовлення` — create Document.ЗаказПокупателя (chernovik)
   - `СтворитиОплату` — create Document.ПКО або ПоступленнеНаРС
   - У майбутньому: `ОтриматиСнапшот` (inbound polling, M1.6)
7. Додай реквізит `ВнішнійID` (Строка 36) до:
   - `Catalogs.Контрагенты` (для match при ОбновитиКлієнта-create flow)
   - `Documents.ЗаказПокупателя` (для match при retry-storm на СтворитиЗамовлення)
   - `Documents.ПКО` + `Documents.ПоступленнеНаРС` (для СтворитиОплату)
   - НЕ unique constraint на 1С-стороні — `СинкЛог.IdempotencyKey` робить
     primary dedup; `ВнішнійID` корисний для manual cross-reference під час
     debugging
8. Each operation мapping на функцію `СинкВхідний.<operation>(…)`
9. Публікація через web-platform на IIS / Apache (стандартний 1С workflow)
10. URL endpoint format: `https://<1c-server>/<base>/ws/MobileExchange.1cws`
11. Тест через SoapUI або curl + manual XML envelope (див. приклади у §4)

---

## 6. Compatibility notes

- 1С поверне `text/xml`, не `application/soap+xml` — це SOAP 1.1, не 1.2.
  Наша сторона parse-ить як `text/xml` тому це OK.
- `Empty` строки у JSON (`""`) краще передавати як `null`. Наша сторона
  трактує empty == null для optional полів.
- `Decimal` поля (debt, monthlyVolume) — завжди string з `.` decimal
  separator, не number у JSON, щоб уникнути floating-point issues.
- 1С чомусь любить BOM у JSON-output — наш SOAP-parser strip-ить BOM на
  всякий випадок.

---

## 7. Майбутні розширення

| Operation               | Status                      | Notes                                         |
| ----------------------- | --------------------------- | --------------------------------------------- |
| `ОбновитиКлієнта`       | client-side shipped (M1.5)  | BSL чекає 1С-розробника                       |
| `СтворитиЗамовлення`    | client-side shipped (M1.5b) | mock-mode default; BSL чекає 1С-розробника    |
| `СтворитиОплату`        | client-side shipped (M1.5b) | mock-mode default; BSL чекає 1С-розробника    |
| `СтворитиРеалізацію`    | future                      | Facts of delivery (можливо M1.7)              |
| `ОтриматиСнапшот`       | future M1.6                 | Inbound polling                               |
| Inbound webhook from 1С | future V2                   | Push-based snapshot замість pull (1С 8.3.21+) |

---

## 8. Verify / smoke test

Після впровадження BSL-модулів, тестуємо так:

1. На 1С-стороні: відкрий конфігуратор → WS → MobileExchange → "Опубликовать на веб-сервере" — переконайся endpoint reachable
2. Curl-test:

```bash
curl -X POST 'https://1c.local/ltex/ws/MobileExchange.1cws' \
  -H 'Content-Type: text/xml; charset=utf-8' \
  -H 'SOAPAction: "http://arm_mobile#MobileExchange:ОбновитиКлієнта"' \
  --data '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <ms:ОбновитиКлієнта xmlns:ms="http://arm_mobile">
        <ms:ПарольВхода>YOUR_SECRET</ms:ПарольВхода>
        <ms:IdempotencyKey>550e8400-e29b-41d4-a716-446655440000</ms:IdempotencyKey>
        <ms:ПакетДанних>{"code1C":null,"name":"TEST CLIENT","tradePointName":"TT-test"}</ms:ПакетДанних>
      </ms:ОбновитиКлієнта>
    </soap:Body>
  </soap:Envelope>'
```

3. Перевір: у 1С з'явився новий контрагент з name "TEST CLIENT".
4. Повтори тот самий curl — у відповіді той самий cached result (idempotency works).
5. Через 7 днів — `Catalog.СинкЛог` має очиститись (scheduled task).

---

## See also

- `docs/M1.5_SYNC_ARCHITECTURE.md` — наша сторона: queue + proxy + cron
- `services/manager-sync/src/soap/client.ts` — як ми викликаємо ці operations
- `apps/store/lib/sync/enqueue.ts` — як ми готуємо payload для `ОбновитиКлієнта`
- `docs/1c-export-mobile/Central/WebServices/MobileExchange.xml` — приклад
  наявного WebService 1С (для mobile-1С обміну, не плутати з нашим)
