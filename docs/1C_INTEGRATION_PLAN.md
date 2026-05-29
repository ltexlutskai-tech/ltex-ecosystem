# Реальні обміни з 1С — Master План

**Статус:** План затверджений user-ом 2026-05-28. Виконання у 5 під-етапах
(2-3 паралельно).

**Контекст:** Усі 5 менеджерських блоків + Нагадування + Чат-inbox Ф1-Ф2 уже на
проді. Backend infrastructure для sync (queue, enqueue payload builders, Fastify
SOAP proxy, cron) готовий 100%. Останній етап — підключити реальну 1С.

---

## 0. Ключове відкриття (2026-05-28)

При аудиті виявлено, що **1С Central база вже має опублікований web-сервіс**
`MobileExchange.1cws` з **24 методами**:

| Файл                                                           | Розмір      | Призначення                |
| -------------------------------------------------------------- | ----------- | -------------------------- |
| `docs/1c-export-mobile/Central/WebServices/MobileExchange.xml` | 1235 рядків | Декларація операцій + WSDL |
| `…/MobileExchange/Ext/Module.bsl`                              | 163 рядки   | Тонкі wrappers             |
| `…/Central/CommonModules/ОбменАРМ/Ext/Module.bsl`              | 7635 рядків | Бізнес-логіка              |

**Наявні методи** (всі повертають `ХранилищеЗначения` — 1С proprietary binary
serialization, який Node.js не вміє розбирати):

- `НачатьОбмен`, `СформироватьПакетДанных`, `ОбработатьПакетДанных` — основа
- `ВивантажитиТовари`/`ВивантажитиКонтрагентів`/`ВивантажитиДокументи` — snapshot
- `ОновитиЗалишкиТаЦіниНоменклатури` — частковий sync
- **`ПолучитьДанныеНезакрытыхЗаказов_v1`** + **`ЗакрытьСтарыеЗаказы_v1`** —
  Closures (вже Тарасова v1 версія)
- `ОбновитьКлиента`, `ЗаписатиЗміниКонтрагента`, `ОбновитьИдентификаторКлиента`
- `СоздатьПКО`, `СоздатьРеализацииТоваровУслуг`, `СоздатьМаршрутныеЛистыТовары`,
  `СоздатьВнутренниеЗаказы` — створення документів
- `ЗабронюватиНоменклатуру`, `ЗаписатиКурсВалют`, `ПолучитьКурсЕвроНаДату`
- `ОновитьЧат`, `ВыполнитьКоманду` — chat + generic
- `ОтриматиЗалишкиХарактеристик`, `ОтриматиДаніХарактеристики`

**Висновок:** Бізнес-логіка цілком готова на 1С-стороні. Нам потрібно дописати
**тонкий шар JSON-обгорток** на 1С (`Функция XJSON(пароль, jsonString) Экспорт`
→ парс JSON → виклик існуючої `ОбменАРМ.X` → серіалізація JSON → return). Це
сильно простіше ніж було заплановано у `docs/1C_SYNC_MODULES_SPEC.md` §3.1-3.6
(там описано писати все з нуля).

---

## 1. Етапи

### Етап 1 — Network discovery + re-publish (user actions)

**Хто:** User. **Розмір:** ~30 хв. **Залежить від:** —.

Web-сервіс уже опублікований у 1С-середовищі. Нам потрібно:

1. Дізнатись **URL** (формат `http://<1c-host>/<base>/ws/MobileExchange.1cws`).
2. Перевірити **network reachability** з Windows Server (де живе наш Node)
   до 1С: `curl <URL>?wsdl` має повернути WSDL.
3. Підтвердити **пароль входу** (`ПарольВхода` параметр у методах) — це
   існуючий механізм через `ОбменАндроид.ПолучитьПродавцаПоКодуПартнера`.
   Для системних викликів (без прив'язки до продавця) додамо новий
   service-account user через `Constant.СинкСистемнийПароль`.

**Вихід Етапу 1:**

- Файл `docs/1C_NETWORK_SETUP.md` (інструкція user-у) — створюється у Етапі 5.
- Env vars `ONEC_SOAP_URL`, `ONEC_SOAP_PASSWORD` готові виставитись у
  `services/manager-sync/.env`.

### Етап 2 — BSL OUTBOUND (JSON-обгортки, наш Node → 1С)

**Хто:** Worker. **Розмір:** ~1.5 год. **Залежить від:** —.

Дописуємо у `MobileExchange/Ext/Module.bsl` 6 нових Export-функцій:

- `ОбновитиКлієнтаJSON(ПарольВхода, JSONДані)` →
  `ОбменАРМ.ЗаписатиЗміниКонтрагента` (line 7314)
- `СтворитиЗамовленняJSON(ПарольВхода, JSONДані)` → нова логіка по аналогії з
  `ОбменАРМ.ОбработатьПакетДанных` (line 3199), створює `Документ.Заказ`
- `СтворитиОплатуJSON(ПарольВхода, JSONДані)` →
  `ОбменАРМ.СоздатьПКО` (line 4629)
- `СтворитиРеалізаціюJSON(ПарольВхода, JSONДані)` →
  `ОбменАРМ.СоздатьРеализацииТоваровУслуг` (line 3571)
- `СтворитиМаршрутнийЛистJSON(ПарольВхода, JSONДані)` →
  `ОбменАРМ.СоздатьМаршрутныеЛистыТовары` (line 5283) +
  `СоздатьМаршрутныеЛистыДокументы` (line 5466)
- `СтворитиКасовийОрдерJSON(ПарольВхода, JSONДані)` → `СоздатьПКО` з вид-операції
  Расход

**Інфраструктура BSL:**

- `Catalog.СинкЛог` — idempotency registry (поле `idempotencyKey`,
  `СтворенийДокумент` посилання, `Дата`). TTL 7 днів через `ScheduledJob`.
- `CommonModule.СинкВхідний` — helpers:
  - `ПарситиJSON(стрічка) → Структура` (через `ЧтениеJSON`)
  - `СерілізуватиJSON(структура) → стрічка` (через `ЗаписьJSON`)
  - `ЗнайтиАбоПовернути(idempotencyKey) → Документ або Undefined` (lookup
    `Catalog.СинкЛог`)
  - `ЗареєструватиСинк(idempotencyKey, документ)` — запис у СинкЛог
- `Constant.СинкСистемнийПароль` — пароль для service-account викликів
  (генеруємо разово, виставляємо у `services/manager-sync/.env`)

**JSON-контракт усіх operations** (стандартизовано):

```json
// Request (parameter JSONДані — JSON-стрічка)
{
  "idempotencyKey": "uuid-v4",
  "data": { /* entity-specific payload */ }
}

// Response (повертаємо JSON-стрічку)
{
  "ok": true,
  "code1C": "<новий UID з 1С>",
  "alreadyProcessed": false,  // true якщо знайдено у СинкЛог
  "error": null
}
```

**Декларація у `MobileExchange.xml`:** додаємо 6 нових `<Operation>` секцій
з `<Parameter Name="JSONДані" Type="d6:string"/>` і
`<ReturnValue Type="d6:string"/>`. Worker згенерує XML-блоки.

**Вихід Етапу 2:**

- `docs/1c-bsl/outbound/MobileExchange.xml.diff` — патч до існуючого XML
- `docs/1c-bsl/outbound/Module.bsl.append` — 6 нових функцій + хелпери
- `docs/1c-bsl/outbound/СинкВхідний.bsl` — новий CommonModule (повний файл)
- `docs/1c-bsl/outbound/СинкЛог.xml` — Catalog metadata + form (повний дамп)
- `docs/1c-bsl/outbound/README.md` — інструкція user-у: куди вставити, в якому
  порядку, як перевірити (з `curl` smoke-тестами проти кожної функції)
- Жоден код на нашій стороні не змінюється — payload builders у
  `apps/store/lib/sync/enqueue.ts` уже відповідають JSON-контракту, треба тільки
  **узгодити поля** (Worker звірить кожен build-функцію з JSON-структурою яку
  очікує 1С).

### Етап 3 — INBOUND polling (1С викликає наш API)

**Хто:** Worker. **Розмір:** ~1 год. **Залежить від:** Етапу 2 (потрібен
СинкЛог + helpers).

**Спрощений підхід:** Замість писати у 1С повноцінний BSL HTTP-клієнт зі
ScheduledJob (складно тестувати), використовуємо **pull-mode**: наш Node Cron
періодично кличе існуючу 1С-функцію `СформироватьПакетДанных` (line 4 у
ОбменАРМ), отримує `ХранилищеЗначения`-пакет, потім 1С-сторона повертає **JSON
зрізку**.

Для цього у 1С дописуємо 1 функцію-wrapper:

- `СформуватиПакетДаннихJSON(ПарольВхода, ОстаннійКодСинхронізації)` →
  викликає існуючу `ОбменАРМ.СформироватьПакетДанных`, але серіалізує результат
  у JSON замість ХранилищеЗначения. Повертає список:
  ```json
  {
    "categories": [...],
    "products": [...],
    "prices": [...],
    "orders": [...],    // новостворені у 1С через телефонні заявки
    "syncCursor": "<новий код>"
  }
  ```

На нашій стороні:

- `services/manager-sync/src/routes/pull.ts` — новий route
  `POST /pull/snapshot` — кличе 1С через SOAP, парсить JSON-response, форвардить
  у відповідні наші `/api/sync/categories`, `/api/sync/products`,
  `/api/sync/prices`, `/api/sync/orders/import` (всі вже існують з S66/S67).
- `apps/store/app/api/cron/pull-from-1c/route.ts` — новий Cron (5-хв інтервал),
  CRON_SECRET auth, кличе `services/manager-sync/pull/snapshot`. Зберігає
  `syncCursor` у `MgrSyncState` (новий model — 1 рядок, key/value).

**Вихід Етапу 3:**

- `docs/1c-bsl/inbound/Module.bsl.append` — функція `СформуватиПакетДаннихJSON`
- `apps/store/app/api/cron/pull-from-1c/route.ts` + tests
- `services/manager-sync/src/routes/pull.ts` + tests
- Міграція `20260602_mgr_sync_state` (mini table `mgr_sync_state` `(key, value)`)
- Доповнення у `docs/EMAIL_QUEUE.md`-style для Windows Scheduled Task

### Етап 4 — Closures блок (UI + 2 JSON wrappers)

**Хто:** Worker. **Розмір:** ~1.5 год. **Залежить від:** Етапу 2.

**Backend на 1С:** дописуємо 2 JSON-обгортки у `MobileExchange/Ext/Module.bsl`:

- `ОтриматиДаніЗакриттяЗамовленьJSON(ПарольВхода, КонтрагентUID)` →
  `ОбменАРМ.ПолучитьДанныеНезакрытыхЗаказов_v1` (line 382),
  серіалізує `ТаблицаЗначений`-результат у JSON.
- `ЗакритиСтаріЗамовленняJSON(ПарольВхода, JSONДані)` →
  `ОбменАРМ.ЗакрытьСтарыеЗаказы_v1` (line 5174). Якщо у `JSONДані` є рядки з
  `ДодатиВЗамовлення: true` — створює +1 новий `Документ.Заказ` (логіка
  закоментована у line 5108-5147, треба розкоментувати + JSON-адаптувати).

**Backend наш:** новий API `/api/v1/manager/closures/[clientId]` — GET (читає
з 1С), POST (закриває + опційно створює новий Order через
`createOrderWithItems`).

**UI** `/manager/closures` (замість поточного `<UnderConstruction>`):

- Picker контрагента (наш `<ClientPicker>`)
- Таблиця незакритих з колонками Замовлення/Дата/Номенклатура/Замовлено/Сума/
  Продано/Чекбокс «Додати в нове»
- Зелена підсвітка рядків де `Продано ≥ Замовлено`
- Кнопка «Закрити замовлення» → POST → success toast + redirect на
  `/manager/orders/<id>` нового замовлення (якщо створене)
- Permission: менеджер бачить тільки своїх клієнтів (через
  `getMyClientCodes1C` як інші менеджерські сторінки)

**Решта (low priority, можна після Етапу 5):**

- `MgrReminderAction.close_orders` enum extension + автонагадування з cron
  «у клієнта є протерміновані замовлення — закрити?» (відкладено у
  Нагадуваннях Етап 4)

**Вихід Етапу 4:**

- `docs/1c-bsl/outbound/Module.bsl.append` — extended з 2 функціями для closures
- `apps/store/app/manager/(workstation)/closures/` — повна реалізація
- `apps/store/app/api/v1/manager/closures/[clientId]/route.ts` + tests
- Жодних DB-міграцій (Order уже має isActual/archived)

### Етап 5 — Activation + smoke E2E

**Хто:** User за моєю інструкцією. **Розмір:** ~1 год. **Залежить від:** 1-4.

**User actions:**

1. Конфігуратор 1С → завантажити нові BSL-файли (Worker їх підготує як готові
   фрагменти для copy-paste):
   - Додати `Catalog.СинкЛог` з форми
   - Додати `Constant.СинкСистемнийПароль` (значення = `openssl rand -hex 32`)
   - Розширити `MobileExchange.xml` (декларації) + `MobileExchange/Module.bsl`
     (нові функції)
   - Додати `CommonModule.СинкВхідний`
   - Додати `ScheduledJob.ЧисткаСинкЛогу` (раз на день)
2. Зберегти конфігу, **оновити** базу даних, **перепублікувати** web-сервіс
   (Адміністрування → Публікація на веб-сервері → Apache/IIS → перепублікувати).
3. На Windows Server (де наш Node):
   - Дописати у `services/manager-sync/.env`:
     ```
     ONEC_SOAP_URL=http://<1c-host>/<base>/ws/MobileExchange.1cws
     ONEC_SOAP_PASSWORD=<значення з Constant.СинкСистемнийПароль>
     SYNC_MOCK_MODE=false
     ```
   - `pm2 restart ltex-manager-sync --update-env`
4. Створити нову Windows Scheduled Task для Cron `POST /api/cron/pull-from-1c`
   (5-хв інтервал, mirror `LTEX Process Sync Queue`).

**Smoke E2E checklist** (доповнюється документом `docs/1C_GO_LIVE_CHECKLIST.md`,
Worker згенерує):

- [ ] `curl <ONEC_SOAP_URL>?wsdl` повертає WSDL з 30+ операціями (включно з
      новими 7 JSON-wrappers)
- [ ] Менеджер у `/manager/customers/<id>` редагує телефон → SUCCESS toast →
      `MgrSyncJob` row `status=sent` → у 1С контрагент оновлений
- [ ] Менеджер створює тестове замовлення в `/manager/orders/new` → у 1С
      з'являється `Документ.Заказ` з тим же `code1C`
- [ ] Cron `/api/cron/pull-from-1c` пуляє → новий категорія/продукт/ціна з 1С
      з'являється у нашій DB
- [ ] `/manager/closures/<clientId>` — список незакритих з реальної 1С
- [ ] Idempotency: повторний enqueue з тим же `idempotencyKey` → 1С повертає
      `alreadyProcessed: true`, не створює дубль

---

## 2. Артефакти проекту

| Артефакт                                         | Етап | Хто пише     |
| ------------------------------------------------ | ---- | ------------ |
| `docs/1C_INTEGRATION_PLAN.md`                    | 0    | Orchestrator |
| `docs/1c-bsl/outbound/Module.bsl.append`         | 2,4  | Worker       |
| `docs/1c-bsl/outbound/MobileExchange.xml.diff`   | 2    | Worker       |
| `docs/1c-bsl/outbound/СинкВхідний.bsl`           | 2    | Worker       |
| `docs/1c-bsl/outbound/СинкЛог.xml`               | 2    | Worker       |
| `docs/1c-bsl/outbound/README.md`                 | 2    | Worker       |
| `docs/1c-bsl/inbound/Module.bsl.append`          | 3    | Worker       |
| `apps/store/app/api/cron/pull-from-1c/`          | 3    | Worker       |
| `services/manager-sync/src/routes/pull.ts`       | 3    | Worker       |
| `apps/store/app/manager/(workstation)/closures/` | 4    | Worker       |
| `apps/store/app/api/v1/manager/closures/`        | 4    | Worker       |
| `docs/1C_GO_LIVE_CHECKLIST.md`                   | 4    | Worker       |
| `docs/1C_NETWORK_SETUP.md`                       | 5    | Orchestrator |

---

## 3. Стан спекі `docs/1C_SYNC_MODULES_SPEC.md`

Поточна спека (1488 рядків, написана у M1.5 / Sale / Payments / RouteSheet)
описує BSL **з нуля**, ще не знаючи про існуючі `ОбменАРМ.*`. **Не
видаляємо** — використовуємо як референс по JSON-структурам payload-ів
(вони актуальні). У документі додамо banner на самому верху що **актуальна
реалізація** — це wrappers у `docs/1c-bsl/`.

## 4. Сесійний log

- **2026-05-28** План створено. Запуск Worker-а на Етап 2.
- (наступне) Worker-звіт по Етапу 2 → merge → запуск Етап 3+4 паралельно.
- (наступне) Etap 5 — User activation, я веду через docs.
