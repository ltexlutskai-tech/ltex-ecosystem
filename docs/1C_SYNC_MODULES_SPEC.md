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

### 3.2 СтворитиЗамовлення (M1.5b, заплановано)

**Тип:** SOAP function

**Параметри:**

| Name             | Type      | In/Out |
| ---------------- | --------- | ------ |
| `ПарольВхода`    | xs:string | In     |
| `IdempotencyKey` | xs:string | In     |
| `ПакетДанних`    | xs:string | In     |

**`ПакетДанних` приклад:**

```json
{
  "clientCode1C": "000005798",
  "managerCode1C": "U0001",
  "warehouseCode": "001",
  "priceTypeCode": "wholesale",
  "comment": "Терміново, погоджено по телефону",
  "items": [
    {
      "barcode": "1234567890123",
      "quantity": 5,
      "priceUah": "1500.00"
    },
    {
      "productCode1C": "0007854",
      "quantity": 2,
      "priceUah": "800.00"
    }
  ]
}
```

**Return:** `{ok: true, orderCode1C: "0000123", orderNumber: "L-2026-0123"}` — щоб наша сторона зберегла `code1C` у `Order` record.

### 3.3 СтворитиОплату (M1.5b, заплановано)

Аналогічна структура. Створює документ "Платіж" у 1С.

### 3.4 ОтриматиСнапшот (M1.6, заплановано — inbound)

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

### 3.5 Helpers (internal, не SOAP)

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
6. Додай operations:
   - `ОбновитиКлієнта` (Type: Function, Return: xs:string, Params: ПарольВхода, IdempotencyKey, ПакетДанних — усі xs:string In)
   - У майбутньому: `СтворитиЗамовлення`, `СтворитиОплату`, `ОтриматиСнапшот`
7. Each operation мapping на функцію `СинкВхідний.<operation>(…)`
8. Публікація через web-platform на IIS / Apache (стандартний 1С workflow)
9. URL endpoint format: `https://<1c-server>/<base>/ws/MobileExchange.1cws`
10. Тест через SoapUI або curl + manual XML envelope (див. приклади у §4)

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

| Operation               | Coming in  | Notes                                         |
| ----------------------- | ---------- | --------------------------------------------- |
| `СтворитиЗамовлення`    | M1.5b      | Order creation                                |
| `СтворитиОплату`        | M1.5b      | Payment creation                              |
| `СтворитиРеалізацію`    | M1.5b опц. | Facts of delivery                             |
| `ОтриматиСнапшот`       | M1.6       | Inbound polling                               |
| Inbound webhook from 1С | Future V2  | Push-based snapshot замість pull (1С 8.3.21+) |

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
