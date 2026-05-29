# L-TEX INBOUND SYNC — BSL артефакти (Етап 3)

**Що це:** STUB BSL-обгортки для **pull-mode** синхронізації 1С → сайт. Наш
Node.js cron (`/api/cron/pull-from-1c`) періодично (5хв) кличе цю функцію
SOAP-ом, отримує JSON-снапшот категорій / товарів / цін / замовлень і
форвардить його у наявні inbound-endpoints (`/api/sync/categories`,
`/api/sync/products`, `/api/sync/prices`, `/api/sync/orders/import`).

Це **Етап 3** master-плану `docs/1C_INTEGRATION_PLAN.md`.

⚠ **STUB:** реалізація BSL-функцій тут повертає порожні масиви. Усі TODO-блоки
чітко позначені у самому коді. Реальне наповнення (вибірки з регістрів) —
окрема BSL-сесія або робота 1С-розробника. Фокус Етапу 3 — **Node-сторона**
(Cron + pull route + DB-міграція).

---

## 1. Список артефактів

| Файл                                     | Призначення                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| [`Module.bsl.append`](Module.bsl.append) | 1 нова експортна функція `СформуватиПакетДаннихJSON` (+ 4 STUB-хелпери) |
| `README.md` (цей файл)                   | Інструкції з розгортання + smoke-тест                                   |

**Залежності з Етапу 2:**

- Уже має існувати `CommonModule.СинкВхідний` (з `docs/1c-bsl/outbound/СинкВхідний.bsl`).
- Уже має існувати `Константа.СинкСистемнийПароль` (auth-перевірка через
  `СинкВхідний.ПеревіритиПароль`).
- Уже має бути перепубліковано `WebService.MobileExchange` (з 6 Етап-2 операціями).

---

## 2. Куди вставляти

1. Конфігуратор → `Загальні` → `WebServices` → `MobileExchange` → `Модуль`.
2. Перейти в **кінець** файлу (після останньої функції з Етапу 2 —
   `СтворитиМаршрутнийЛистJSON`).
3. Скопіювати вміст [`Module.bsl.append`](Module.bsl.append) і вставити.
4. Зберегти модуль (Ctrl+S).

---

## 3. Декларація у `MobileExchange.xml`

Потрібно додати **1 нову операцію** у файл `Central/WebServices/MobileExchange.xml`.

### Через Конфігуратор (рекомендовано)

1. `Загальні` → `WebServices` → `MobileExchange` → `Операції` → правий клік → `Додати`.
2. Ім'я: `СформуватиПакетДаннихJSON`.
3. Тип значення, що повертається: `string` (з простору `http://www.w3.org/2001/XMLSchema`).
4. Ім'я методу: `СформуватиПакетДаннихJSON` (як у Module.bsl).
5. **Параметри** (через правий клік на `Параметри`):
   - `ПарольВхода` — тип `string`, напрямок `Вхідний`
   - `ОстаннійКодСинхронізації` — тип `string`, напрямок `Вхідний`
6. Зберегти, оновити конфігурацію БД (F7), перепублікувати веб-сервіс.

### Через ручне редагування XML (альтернатива)

Знайти у `MobileExchange.xml` блок `<ChildObjects>` і ПЕРЕД `</ChildObjects>` додати:

```xml
<Operation uuid="генерувати-новий-uuid-v4">
  <Properties>
    <Name>СформуватиПакетДаннихJSON</Name>
    <Synonym/>
    <Comment/>
    <ProcedureName>СформуватиПакетДаннихJSON</ProcedureName>
    <Transactioned>false</Transactioned>
    <Type>d6:string</Type>
    <Nillable>false</Nillable>
  </Properties>
  <ChildObjects>
    <Parameter uuid="генерувати-новий-uuid-v4">
      <Properties>
        <Name>ПарольВхода</Name>
        <Synonym/>
        <Comment/>
        <Type>d6:string</Type>
        <Nillable>false</Nillable>
        <TransferDirection>In</TransferDirection>
      </Properties>
    </Parameter>
    <Parameter uuid="генерувати-новий-uuid-v4">
      <Properties>
        <Name>ОстаннійКодСинхронізації</Name>
        <Synonym/>
        <Comment/>
        <Type>d6:string</Type>
        <Nillable>false</Nillable>
        <TransferDirection>In</TransferDirection>
      </Properties>
    </Parameter>
  </ChildObjects>
</Operation>
```

(UUID-и — генерувати через `[guid]::NewGuid()` у PowerShell.)

Далі — Конфігуратор → оновити конфігурацію БД (F7), перепублікувати.

---

## 4. Перевірка (smoke-тести)

### Smoke-тест 1: операція з'явилась у WSDL

```bash
curl -s "https://<1c-host>/<base>/ws/MobileExchange.1cws?wsdl" \
  | grep -oE 'name="СформуватиПакетДаннихJSON"'
```

Очікувано: `name="СформуватиПакетДаннихJSON"`.

### Smoke-тест 2: повний дамп (cursor пустий)

```bash
PASSWORD='<значення-з-Константа.СинкСистемнийПароль>'
URL='https://<1c-host>/<base>/ws/MobileExchange.1cws'

cat > /tmp/req.xml <<EOF
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ms:СформуватиПакетДаннихJSON xmlns:ms="http://arm_mobile">
      <ms:ПарольВхода>$PASSWORD</ms:ПарольВхода>
      <ms:ОстаннійКодСинхронізації></ms:ОстаннійКодСинхронізації>
    </ms:СформуватиПакетДаннихJSON>
  </soap:Body>
</soap:Envelope>
EOF

curl -s -X POST "$URL" \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H 'SOAPAction: "http://arm_mobile#MobileExchange:СформуватиПакетДаннихJSON"' \
  --data @/tmp/req.xml | grep -oE '<[a-z]+:return[^>]*>[^<]*</[a-z]+:return>'
```

Очікувана відповідь (текст всередині `<return>`):

```json
{
  "ok": true,
  "syncCursor": "2026-06-02T15:34:21",
  "data": {
    "categories": [],
    "products": [],
    "prices": [],
    "orders": []
  },
  "error": null
}
```

Поки `data.*` — порожні (це STUB).

### Smoke-тест 3: невірний пароль

Замінити `$PASSWORD` на навмисно неправильне значення. Очікувано:

```json
{
  "ok": false,
  "syncCursor": null,
  "data": null,
  "error": { "code": "auth_failed", "message": "Невірний пароль" }
}
```

### Smoke-тест 4: pull з курсором (диференційний)

Передати ISO-timestamp як `<ms:ОстаннійКодСинхронізації>`:

```xml
<ms:ОстаннійКодСинхронізації>2026-06-02T10:00:00</ms:ОстаннійКодСинхронізації>
```

STUB зараз ігнорує курсор (повертає порожні масиви все одно). Після реальної
реалізації — повинні повернутись тільки зміни після цього часу.

---

## 5. Контракт JSON-полів

Маппінг кожного масиву мусить точно відповідати Zod-схемі нашого endpoint-у:

| Масив        | Zod schema (apps/store/lib/validations.ts) | Endpoint                       |
| ------------ | ------------------------------------------ | ------------------------------ |
| `categories` | `syncCategoriesSchema`                     | `POST /api/sync/categories`    |
| `products`   | `syncProductSchema[]`                      | `POST /api/sync/products`      |
| `prices`     | `syncPricesSchema`                         | `POST /api/sync/prices`        |
| `orders`     | `syncOrdersImportSchema`                   | `POST /api/sync/orders/import` |

Поля повністю описані у docstring-ах усередині `Module.bsl.append`.

---

## 6. Курсор синхронізації

- **Тип:** ISO 8601 timestamp як рядок (`2026-06-02T15:34:21`).
- **Хто зберігає:** Node.js cron — у таблиці `mgr_sync_state` (`key="last_sync_cursor"`).
- **Хто формує:** 1С — повертає у полі `syncCursor` (= `XMLСтрока(ТекущаяДата())` на
  момент завершення вибірки).
- **Хто передає:** Node — при наступному виклику кладе у параметр
  `ОстаннійКодСинхронізації`.
- **Що робить 1С:** якщо параметр непустий — фільтрує вибірку (`ДатаЗміни >= &Курсор`).
  Якщо пустий або невалідний — повний дамп.
- **Атомарність:** Node зсуває курсор **тільки якщо всі endpoint-и успішно
  імпортували дані**. Якщо щось упало — курсор лишається на попередньому значенні;
  наступний cron спробує знову з того ж часу (`at-least-once delivery`, наші
  endpoints іdempotent через upsert by `code1C`).

---

## 7. Безпека

Те саме що у `docs/1c-bsl/outbound/README.md` §6:

- HTTPS only.
- Auth — через `Константа.СинкСистемнийПароль`.
- Журналювання помилок через `ЗаписьЖурналаРегистрации`.

Додатково для INBOUND:

- **Тільки SELECT-запити.** Функція не має `Записать()` нічого у 1С. Це read-only
  snapshot.
- **Привілегований режим** використовується тільки у
  `СинкВхідний.ПеревіритиПароль` (для зчитування константи з паролем).
- **Розмір відповіді.** Якщо повний дамп ~10к товарів — JSON буде ~2-3 МБ.
  SOAP-стек 1С тримає; Node `extractSoapReturn` парсить один регексп — теж OK.
  Якщо в майбутньому вирости до ~50к — додати пагінацію через параметр `limit`
  - продовження курсора.

---

## 8. Сумісність з Node-стороною

Узгоджено: операція `СформуватиПакетДаннихJSON` (з суфіксом `JSON`, як у Етапі 2).
Naming підтверджено у:

- `services/manager-sync/src/routes/pull.ts` (HTTP route → 1С)
- `apps/store/app/api/cron/pull-from-1c/route.ts` (cron-планувальник)

Якщо вирішите перейменувати — синхронно правте обидва місця + цей README +
декларацію в XML.

---

## 9. Запитання до 1С-розробника (відкриті, для наступного раунду)

1. **Чи є у central база `Справочник.Категорії`?** У `MobileAgent` ми бачили
   тільки `Справочник.Номенклатура.КатегорияТТ` (= категорія торгової точки,
   не товарна категорія). На сайті є дерево категорій з 49 елементами — звідки
   воно мало б sync-итись? (Можливо це 1С-довідник з іншою назвою — `ГруппаТоваров`?)
2. **Реквізит `ДатаЗміни`** на `Справочник.Номенклатура` /
   `Справочник.Контрагенты` / `Регистр.ЦеныНоменклатуры` — чи існує? Якщо ні —
   додати або використати стандартну механіку «регістрації змін» (`Планы обмена`).
3. **`Реквізит.ВнешнийИД`** на `Документ.Заказ` (для фільтрації — пропускати
   замовлення, які створив сам Node — Етап 2 `СтворитиЗамовленняJSON`). Якщо
   нема — створити.
4. **Маппінг статусів замовлення:** які точні рядки приходять з
   `Документ.Заказ.СтатусЗаказа`? Перевірити проти `syncOrdersImportSchema` enum.
5. **Категорія slug-ів:** як slug формується з `Категорія.Код`? Чи воно уже в
   lowercase ASCII, чи потрібно `Транслит` + `НРег`?
