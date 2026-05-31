# M1.5 Re-spec from existing 1C ExchangePlans

**Сесія:** orchestrator analysis перед M1.5 real-wire.
**Контекст:** до commit 009abe2 ми будували M1.5 sync naivly з нуля. Сьогодні маємо повну 1С-конфігурацію → re-evaluation.

## TL;DR (рекомендація)

**Option C — Hybrid: deprecated більшість M1.5 client-side і пере-mapним наш queue на існуючу `WebServices/MobileExchange` operation `ОбработатьПакетДанных`.** Не дублюємо BSL. У `СинкЛог` додаємо тільки idempotency layer + `ВнішнійID` реквізити (це доповнення, не reflexive переписання). Outbound (1С → site) — реалізований через `EventSubscription + ScheduledJob + CommonModule.ПроцедурыОбменаССайтом` (BSL exists, ми його ще не бачили). Поточний `/api/sync/*` S66 шар (Bearer + JSON) — лишається активним як push-from-1C entry.

Деталі — у §4.

---

## 1. Інвентар існуючої 1С-інтеграції з сайтом

### 1.1 ExchangePlan `ОбменССайтомЗаказами` (заказами)

`docs/1c-export-full/ExchangePlans/ОбменССайтомЗаказами.xml:1-79` — це чисте plan-of-exchange metadata. **`<Content>` секції НЕМАЄ** у XML. Це означає: ChildObjects (зареєстровані об'єкти) тримаються у супровідних `*/Ext/Content.xml` файлах яких немає у нашому експорті — або реєстрація відбувається динамічно через `EventSubscription` handlers (типове рішення для 1С 8.3 коли plan створено без жорсткого Content).

**Що ми МОЖЕМО сказати** з metadata + EventSubscriptions:

- Plan створений; має 2 форми (`ФормаСписка`, `ФормаУзла`) — UI для управління exchange nodes у самій 1С (наприклад "Сайт LTEX" node з кодом)
- `CodeLength=3`, `DescriptionLength=100` — стандартні налаштування node identification
- НЕ DistributedInfoBase (це не RIB-обмін, а custom-channel)

### 1.2 ExchangePlan `ОбменССайтомТоварами` (товарами)

`docs/1c-export-full/ExchangePlans/ОбменССайтомТоварами.xml:1-79` — повний аналог попереднього, тільки під катало.

### 1.3 EventSubscriptions (вирішують gap "що саме реєструється")

Без `<Content>` у плані registry-логіка змодельована через 3 EventSubscriptions які диктують **які записи продукуються у `РегистрСведений.РегистрацияОбмена`** (це класичний 1С Site sync registry):

**`ПриЗаписиСправочникаОбменССайтом`** (`docs/1c-export-full/EventSubscriptions/ПриЗаписиСправочникаОбменССайтом.xml:13-19`):

```xml
<Source>
  <v8:Type>cfg:CatalogObject.ХранилищеДополнительнойИнформации</v8:Type>
  <v8:Type>cfg:CatalogObject.ЕдиницыИзмерения</v8:Type>
  <v8:Type>cfg:CatalogObject.ХарактеристикиНоменклатуры</v8:Type>
</Source>
<Event>OnWrite</Event>
<Handler>CommonModule.ПроцедурыОбменаССайтом.ПриЗаписиСправочникаОбменССайтомПриЗаписи</Handler>
```

**`ПриЗаписиРегистраНакопленияОбменССайтом`** (`docs/1c-export-full/EventSubscriptions/ПриЗаписиРегистраНакопленияОбменССайтом.xml:13-19`):

```xml
<Source>
  <v8:Type>cfg:AccumulationRegisterRecordSet.ВзаиморасчетыСКонтрагентами</v8:Type>
  <v8:Type>cfg:AccumulationRegisterRecordSet.ТоварыНаСкладах</v8:Type>
  <v8:Type>cfg:AccumulationRegisterRecordSet.ЗаказыПокупателей</v8:Type>
</Source>
```

**`ПриЗаписиРегистраСведенийОбменССайтом`** (`docs/1c-export-full/EventSubscriptions/ПриЗаписиРегистраСведенийОбменССайтом.xml:13-19`):

```xml
<Source>
  <v8:Type>cfg:InformationRegisterRecordSet.Штрихкоды</v8:Type>
  <v8:Type>cfg:InformationRegisterRecordSet.ЦеныНоменклатуры</v8:Type>
  <v8:Type>cfg:InformationRegisterRecordSet.ЗначенияСвойствОбъектов</v8:Type>
</Source>
```

**Що це означає:** при будь-якому write у одного з цих **8 типів об'єктів** на стороні 1С — handler у `CommonModule.ПроцедурыОбменаССайтом` фіксує зміну (логічно) у одному з двох планів. Список зареєстрованих типів:

- Catalog: `ХранилищеДополнительнойИнформации` (фото товарів), `ЕдиницыИзмерения`, `ХарактеристикиНоменклатуры` (атрибути)
- AccumRegister: `ВзаиморасчетыСКонтрагентами` (борги клієнтів!), `ТоварыНаСкладах` (залишки), `ЗаказыПокупателей` (статус замовлень)
- InfoRegister: `Штрихкоды`, `ЦеныНоменклатуры` (ціни — той що ми вже sync-имо!), `ЗначенияСвойствОбъектов` (атрибути)

**Що цікаво** — у source-list немає прямо `Catalog.Номенклатура` і `Catalog.Контрагенты`. Це означає що зміни самих карток товару / клієнта 1С НЕ реєструє у плани обміну з сайтом. Тільки залишки/ціни/штрихкоди (вторинні дані). **BSL для `ПроцедурыОбменаССайтом` треба інспектувати** щоб зрозуміти як 1С пушить новий продукт або клієнта на сайт.

### 1.4 ScheduledJob `ЗаданиеОбменССайтом`

`docs/1c-export-full/ScheduledJobs/ЗаданиеОбменССайтом.xml:13-19`:

```xml
<MethodName>CommonModule.ПроцедурыОбменаССайтом.ЗаданиеОбменССайтом</MethodName>
<Use>true</Use>
<RestartCountOnFailure>3</RestartCountOnFailure>
<RestartIntervalOnFailure>10</RestartIntervalOnFailure>
```

**Periodic job активний** (`Use=true`). 1С запускає його за внутрішнім розкладом (періодичність у самій 1С — не у XML metadata). Це **outbound push** з 1С на сайт: щось схоже на cron, що бере накопичені зміни з планів обміну і шле на наш `/api/sync/*` endpoint (S66 layer). Confirms: S66 `/api/sync/products|prices|lots|categories|rates|orders/import|orders/export` є **target цього scheduled job** — це не legacy, це активний канал.

### 1.5 WebService `MobileExchange` — 19 operations

`docs/1c-export-full/WebServices/MobileExchange.xml:1-1236`, namespace `http://arm_mobile`, file `MobileExchange.1cws`. Усі operations повертають `xs:string` або `v8:ValueStorage`.

| #   | Operation                         | Params                                                 | Returns      | Призначення                                                                                      |
| --- | --------------------------------- | ------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------ |
| 1   | `НачатьОбмен`                     | Версия, ИдентификаторКлиента, Пароль, ЭтоНеПервыйОбмен | xs:string    | Handshake initialization                                                                         |
| 2   | `СформироватьПакетДанных`         | ИдентифікаторКлієнта, Пароль                           | ValueStorage | Build outbound bundle (товари+клієнти+документи)                                                 |
| 3   | `ВивантажитиТовари`               | ИдентифікаторКлієнта, Пароль                           | ValueStorage | Outbound: тільки товари (subset of #2)                                                           |
| 4   | `ВивантажитиКонтрагентів`         | ИдентифікаторКлієнта, Пароль                           | ValueStorage | Outbound: тільки клієнти                                                                         |
| 5   | `ВивантажитиДокументи`            | ИдентифікаторКлієнта, Пароль                           | ValueStorage | Outbound: тільки документи                                                                       |
| 6   | `ОбработатьПакетДанных`           | Пароль, **Данные** (ValueStorage)                      | ValueStorage | **Inbound: обробити пакет (контрагенти+заказы+маршрути+реалізації+презентації+ПКО+нагадування)** |
| 7   | `УдалитьРегистрацию`              | МассивИД, Пароль                                       | ValueStorage | Mark received items as processed                                                                 |
| 8   | `ВключитьЧастичныйОбмен`          | Пароль                                                 | xs:string    | Switch mode                                                                                      |
| 9   | `ПолучитьДолгПартнера`            | Пароль                                                 | xs:double    | Get partner debt                                                                                 |
| 10  | `ОтриматиЗалишкиХарактеристик`    | Пароль, Номенклатура                                   | ValueStorage | Lot stock balances                                                                               |
| 11  | `ОновитьОстаткиТаЦены`            | Пароль                                                 | ValueStorage | Refresh stock + prices (full)                                                                    |
| 12  | `ОновитьОстаткиТаЦеныЧастково`    | Пароль                                                 | ValueStorage | Refresh stock + prices (delta)                                                                   |
| 13  | `ПолучитьДанныеНезакрытыхЗаказов` | Пароль, Контрагент_уид                                 | ValueStorage | Open orders per client                                                                           |
| 14  | `ЗакрытьСтарыеЗаказы`             | Пароль, Товары, Контрагент_уид                         | xs:string    | Close stale orders                                                                               |
| 15  | `ПолучитьКурсЕвроНаДату`          | Пароль, Дата                                           | ValueStorage | EUR rate at date                                                                                 |
| 16  | `ОновитиКурси`                    | Пароль                                                 | ValueStorage | Refresh all currency rates                                                                       |
| 17  | `ЗаписатиКурсВалют`               | Пароль, Данные                                         | ValueStorage | Write currency rates (inbound)                                                                   |
| 18  | `ОновитьЧат`                      | Пароль, НовыеСообщения, УИД_Клиента                    | ValueStorage | Chat sync                                                                                        |
| 19  | `ЗабронюватиНоменклатуру`         | Пароль, Данные                                         | ValueStorage | Reserve lot                                                                                      |
| 20  | **`ОбновитьКлиента`**             | Пароль, Данные                                         | ValueStorage | **Update client** ← target нашого ОбновитиКлієнта                                                |
| 21  | `ВыполнитьКоманду`                | Пароль, Данные                                         | ValueStorage | Generic command (бек-двір)                                                                       |
| 22  | **`ЗаписатиЗміниКонтрагента`**    | Пароль, Данные                                         | ValueStorage | **Persist client changes** (alternative до #20)                                                  |
| 23  | `ОтриматиДаніХарактеристики`      | Данные, Сектор                                         | xs:string    | Get characteristic by UUID                                                                       |

**Critical insight #1:** namespace `http://arm_mobile` той самий що і в моїй M1.5 spec (`docs/1C_SYNC_MODULES_SPEC.md:521`). У моїй spec я навіть посилаюсь на `MobileExchange.1cws` як target. **Це не нова створювана служба — це існуюча.**

**Critical insight #2:** усі operations що повертають `ValueStorage` — це 1С-native binary serialization (`Новый ХранилищеЗначения(..., Новый СжатиеДанных(9))` з compression level 9), НЕ JSON. Це `application/x-1c-serialized` payload over SOAP. Mobile-1C клієнт це знає, але наш Node SOAP-client цього робити НЕ ВМІЄ. Підтверджено у `docs/1c-export-mobile/Central/WebServices/MobileExchange/Ext/Module.bsl:109-113` + `docs/1c-export-mobile/Central/CommonModules/ОбменАРМ/Ext/Module.bsl:5745-5757`.

### 1.6 HTTPService `Боты`

`docs/1c-export-full/HTTPServices/Боты.xml:1-136`, RootURL `bots`. 4 REST endpoints:

| Method | URL Template  | Handler                    | Призначення (підозра)           |
| ------ | ------------- | -------------------------- | ------------------------------- |
| GET    | `/ping`       | `pingGETping`              | Healthcheck                     |
| POST   | `/send`       | `SendPOSTSend`             | Send message bot #1 (Viber?)    |
| POST   | `/sendsecond` | `SendSecondPOSTSend`       | Send message bot #2 (Telegram?) |
| POST   | `/exchange`   | `exchangePOSTSendExchange` | Generic bot exchange            |

Без BSL handlers і без UrlPath details не можна сказати точно але назви + існування `Catalog/ViberОбмен.xml` + `МодульУправленияViber.xml` + згадки в Module.bsl процедур `ВыполнитьКоманду`/`ОновитьЧат` показують: це **Telegram/Viber webhook layer для inbound messages у 1С**. Наш сайт зараз має `app/api/telegram/webhook` + `app/api/viber/webhook` що приймають bot-updates і фіксують у нашу DB; 1С має паралельний канал для тих самих bots напряму. Це НЕ конфлікт з M1.5 sync — це для M1.8 chat-bots epic.

### 1.7 Релевантні CommonModules

Знайдено через `grep -l "Сайт\|сайт\|WEB"`:

- **`CommonModule.ПроцедурыОбменаССайтом`** — `docs/1c-export-full/CommonModules/ПроцедурыОбменаССайтом.xml`. Server=true, ServerCall=true, ExternalConnection=true. **Це сердце outbound-каналу 1C → site.** BSL код містить: `ЗаданиеОбменССайтом` (entry для scheduled job), `ПриЗаписиСправочникаОбменССайтомПриЗаписи` тощо.

  **BSL ВІДСУТНІЙ у експорті** — це найкритичніший gap для розуміння стратегії. Без цього BSL ми не знаємо як 1С формує payload + куди шле + який format.

- **`CommonModule.WEBПриложения`** — `docs/1c-export-full/CommonModules/WEBПриложения.xml`. ExternalConnection=true, Server=false. Скоріше за все стара чи допоміжна; **BSL відсутній**.

- **`CommonModule.УправлениеЗаказами`** (`docs/1c-export-full/CommonModules/УправлениеЗаказами.xml`) — business logic для замовлень. BSL відсутній.

- **`CommonModule.УправлениеКонтрагентами`** — те саме для клієнтів.

- **`CommonModule.ОбменАРМ`** — це **target нашої mobile-agent інтеграції** (для М1.5 ми використовуємо той самий BSL pattern). У `docs/1c-export-mobile/` ми ВЖЕ маємо повний 516 КБ BSL — 7635 рядків з ~80 функціями. Не релевантно для сайт-sync direct, але корисно як **JSON-vs-ValueStorage payload reference + помилка handling pattern**.

### 1.8 Об'єкти даних — confirmed structures

**`Catalog.Контрагенты`** (`docs/1c-export-full/Catalogs/Контрагенты.xml`) — extended атрибути збігаються з 1:1 з моєю M1.5 spec для `ОбновитиКлієнта`:

- `НаименованиеТТ` ↔ `tradePointName`
- `Геолокация` ↔ `geolocation`
- `ОбъмЗаМесяц` ↔ `monthlyVolume`
- `Город`, `Область`, `Улица`, `Дом`, `НомерВідділенняНП`
- `СтатусКонтрагента`, `ОперативныйСтатусКонтрагента`
- `КатегорияТТ`, `СпособДоставки`, `КаналПошуку`, `Маршрут`
- `КодАсортимета`, `СсылкаНаСайт`, `ТорговыйАгент`
- `КоличествоДнейОтПоследнейПокупки`, `ДатаПоследнейПокупки`, `ДатаСоздания`

**`Document.ЗаказПокупателя`** (`docs/1c-export-full/Documents/ЗаказПокупателя.xml`) — атрибути:

- `Контрагент`, `Организация`, `ДоговорКонтрагента`, `ВалютаДокумента`, `СуммаДокумента`
- `СкладГруппа`, `ТипЦен`, `СтатусЗамовлення`, `СтатусДоставки`, `Наложка`, `Доставка`
- TabularSection `Товары` з полями: `Номенклатура`, `Количество`, `Цена`, `Сумма`, `СерияНоменклатуры` (= наш `barcode`!), `ХарактеристикаНоменклатуры`, `Размещение`
- `ТорговийАгент`, `НомерВходящегоДокументаЭлектронногоОбмена` ← можна reuse як **`ВнішнійID`** замість додавання нового реквізиту як я писав у M1.5 spec §5.7

**ВАЖЛИВО:** `НомерВходящегоДокументаЭлектронногоОбмена` (input doc number) + `ДатаВходящегоДокументаЭлектронногоОбмена` (input date) — це уже існуючі fields specifically для inbound-документів з електронного обміну. Це **точно те що нам потрібно** для idempotency без створення нового реквізиту.

---

## 2. Overlap з моєю M1.5 SOAP-spec

### 2.1 Операції що дублюються

| M1.5 spec operation             | Існуюча 1С operation                                                                                                | Точність матчу                          | Notes                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ОбновитиКлієнта`               | `MobileExchange.ОбновитьКлиента` (line 1030-1082)                                                                   | **100% — точна назва**                  | Намірений match у моїй spec                                                                                                                                                                                            |
| `ОбновитиКлієнта` (alt)         | `MobileExchange.ЗаписатиЗміниКонтрагента` (line 1136-1184)                                                          | 95%                                     | Stub у mobile-export (`Возврат Сериализовать(Истина);`) — но прив'язаний до `ОбновитьКонтрагентов` через коментарі                                                                                                     |
| `СтворитиЗамовлення`            | `MobileExchange.ОбработатьПакетДанных` (line 162-214)                                                               | **80% — generic bundle, не dedicated**  | Один endpoint приймає `Контрагенты + Заказы + МаршрутныеЛисты + Реализации + Презентации + ПКО + Напоминания` в одному виклику. `СоздатьВнутренниеЗаказы` (line 3388) — внутрішня процедура що обробляє `Заказы` array |
| `СтворитиОплату`                | `MobileExchange.ОбработатьПакетДанных` (sub-key `ПКО`)                                                              | 80%                                     | Той самий entry, sub-key `ПКО` → `СоздатьПКО` (line 4629)                                                                                                                                                              |
| `ОтриматиСнапшот` (M1.6 future) | `MobileExchange.СформироватьПакетДанных` + `ВивантажитиКонтрагентів` + `ВивантажитиТовари` + `ВивантажитиДокументи` | 100% — три dedicated outbound endpoints | Уже існують з повним 1С BSL                                                                                                                                                                                            |

**Висновок:** усі мої запропоновані operations **вже існують** у `MobileExchange.1cws`. Я фактично робив paper-design `MobileExchange v2` навіть не знаючи що v1 існує.

### 2.2 Структури даних — overlap

**Auth pattern** збігся 1-у-1: shared secret як перший параметр (`ПарольВхода`). Існуюче 1С реалізовує його через `ОбменАндроид.ПолучитьПродавцаПоКодуПартнера(ПарольВхода)` — пароль не просто string-equal а додатково мапиться на `Catalog.ТорговыйАгент` (продавець). Це **сильніше** ніж мій naive `СтрСравнить()` — кожен агент має свій пароль, що дає auditing.

**Payload encoding** — критична розбіжність (див. §3.1).

**Idempotency** — не реалізована у існуючому каналі. Мобільний агент покладається на client-side dedup через `УдалитьРегистрацию(МассивИД)` (line 4608) що отримує processed IDs з sequence number. Це **mobile-specific** flow і не годиться для нашого queue-with-retry pattern.

**Error reporting** — існуюче поведення (line 3268-3270):

```bsl
Исключение
    Возврат Сериализовать(ОписаниеОшибки());
КонецПопытки;
```

Просто string у ValueStorage. Без error codes, без structured `{ ok, errorCode, errorMessage }`. Моя spec пропонує **кращий contract** але треба домовитися з 1С-розробником.

---

## 3. Gaps

### 3.1 Є у M1.5 spec, але немає у 1С (наш гап — ми будували те що зайве)

| Item                                                           | Status                                                                    | Impact                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Окремий dedicated `СтворитиЗамовлення` endpoint                | Не існує (треба запушити через `ОбработатьПакетДанных` з ключем `Заказы`) | M1.5 spec §3.2 BSL draft — wasted; реальний BSL приклад уже існує у `СоздатьВнутренниеЗаказы` line 3388 |
| Окремий dedicated `СтворитиОплату` endpoint                    | Не існує (треба через `ОбработатьПакетДанных` з ключем `ПКО`)             | Те саме                                                                                                 |
| JSON serialization (`text/json`) у payload                     | Не існує — 1С використовує `ValueStorage(структура, СжатиеДанных(9))`     | **Severe blocker** — наш Node-SOAP client не вміє читати/писати ValueStorage                            |
| Catalog `СинкЛог` з idempotency keys                           | Не існує                                                                  | Треба написати з нуля — це M1.5 contribution                                                            |
| Structured `{ ok, errorCode, errorMessage }` response contract | Не існує — повертається serialized error string                           | Треба domain-узгодити з 1С-розробником                                                                  |
| `ВнішнійID` реквізит на документах                             | Частково — `НомерВходящегоДокументаЭлектронногоОбмена` уже існує          | **Reuse existing, don't add new**                                                                       |

### 3.2 Є у 1С, але я не покривав (gaps у моєму баченні)

| Operation                                                                                     | Покриття у M1.5 client    | Impact                                                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- | --------------------- | ------------------------------------------ |
| `НачатьОбмен` handshake з версією                                                             | Відсутнє                  | Можливо OK skip — це для session establishment, наш queue stateless                                        |
| `ВивантажитиТовари` / `ВивантажитиКонтрагентів` / `ВивантажитиДокументи` (outbound 1C→client) | Відсутнє                  | **Це full inbound polling — закриває M1.6 SnapshotFetch**, нам не треба будувати свій                      |
| `СформироватьПакетДанных` (combined outbound)                                                 | Відсутнє                  | Спрощує initial sync (full dump)                                                                           |
| `УдалитьРегистрацию` (mark-processed)                                                         | Відсутнє                  | **Критично** — без виклику цієї функції 1С буде шити ті самі ID знову і знову у `РегистрацияОбмена`        |
| `ПолучитьДолгПартнера` / `ПолучитьДанныеНезакрытыхЗаказов`                                    | Відсутнє                  | Перепокривається через S66 GET endpoints або потенційно через outbound polling                             |
| `ОновитьОстаткиТаЦены[Частково]` / `ОтриматиЗалишкиХарактеристик`                             | Відсутнє                  | Це уже purpose S66 sync API endpoints — overlap з нашим pull-from-1C                                       |
| `ОновитиКурси` / `ЗаписатиКурсВалют` / `ПолучитьКурсЕвроНаДату`                               | Відсутнє                  | Покривається S66 `/api/sync/rates` push + наш `getCurrentRate()` reader                                    |
| `ОновитьЧат` + `ЗабронюватиНоменклатуру`                                                      | Відсутнє                  | M1.8 chat-bot + M1.7 reservation epics — non-blocking                                                      |
| `ВыполнитьКоманду` generic command                                                            | Відсутнє                  | Generic escape-hatch — non-blocking                                                                        |
| `ОтриматиДаніХарактеристики`                                                                  | Відсутнє                  | Detail-level lookup — non-blocking                                                                         |
| HTTPService `Боты` `/ping                                                                     | /send                     | /sendsecond                                                                                                | /exchange` | Відсутнє з M1.5 angle | Окремий канал для bot-relay — це M1.8 epic |
| `EventSubscription` + `ЗаданиеОбменССайтом` outbound push                                     | Відсутнє з боку M1.5 SOAP | Це механізм через який S66 `/api/sync/*` отримує payload з 1С — **active channel, відрізняється від M1.5** |

**Найбільший gap:** ми писали M1.5 client як **push** з нашого боку у 1С (queue → SOAP → 1С update). А наявна 1С-архітектура **inverted**: 1С push-ить через ScheduledJob → REST до нашого S66 layer. Outbound from 1С — handled. M1.5 — це справді net-new для **inbound to 1С** (write-back) — ця частина дійсно не існує і будуватись потрібно.

---

## 4. Стратегічна рекомендація

### 4.1 Option A — Reuse existing ExchangePlans + WebService

**Що це означає:**

- Map M1.5 queue operations на existing `MobileExchange.1cws` operations:
  - `ОбновитиКлієнта` → виклик `MobileExchange.ОбновитьКлиента(пароль, данные)` напряму
  - `СтворитиЗамовлення` + `СтворитиОплату` → один виклик `MobileExchange.ОбработатьПакетДанных(пароль, structure{Заказы, ПКО})`
- Полишити S66 `/api/sync/*` endpoints як target outbound 1С push (через `ЗаданиеОбменССайтом` scheduled job) — це працює зараз і не треба чіпати
- BSL не пишеться — все вже є

**Pros:**

- Найменше BSL роботи (0 рядків нового коду у 1С — окрім constants/секрету)
- Знайомий патерн для 1С-розробника, який вже підтримує MobileExchange для мобільного агента
- Намагаємось не зламати mobile-agent flow — `MobileExchange` лишається одна служба
- Outbound (1С → site) **уже активний** — наш сайт уже мав working endpoints S66

**Cons:**

- **CRITICAL: payload encoding ≠ JSON.** Усі operations повертають/приймають `ValueStorage` з `СжатиеДанных(9)`. Це 1С-native binary blob, недоступний без 1С COM-bridge або шлюз-сервіса який вміє читати V8 internal format. Наш Node-SOAP-client цього робити **НЕ ВМІЄ.**
  - Workaround: попросити 1С-розробника додати JSON-paired операції (`ОбновитьКлиентаJSON`, `ОбработатьПакетДанныхJSON`) — це by-design parallel API. Це означає 100-300 рядків BSL — все одно треба code-change.
- Idempotency не існує — треба все одно додати `Catalog.СинкЛог` + check у кожному handler
- Error contract — треба узгодити окремо (повернення `{ ok, errorCode, errorMessage }` JSON-string)
- `ОбновитьКлиента` BSL у MobileExchange.1cws (line 115-129 у mobile-export Module.bsl) — **трохи інший data shape** ніж очікує моя M1.5 spec; треба precise mapping. У 1С: тільки `ОбновитьИдентификаторКлиента(Данные, Продавец)` — оновлює internal identifier, **не повну картку**. Видно з commented-out body у line 7314-7337 — реальний "оновити повну картку" stub-нутий (`Возврат Сериализовать(Истина);`). Тобто **`ОбновитьКлиента` дійсний лише на 5%** того що нам потрібно.

**Висновок Option A:** "reuse" — це міф. Існуючі operations реалізовані для mobile-agent use-case (push minimal data + sync chat), не для повного write-back картки клієнта менеджером. Plus binary ValueStorage не readable Node-сторонй.

### 4.2 Option B — Parallel M1.5 channel (мій оригінальний план)

**Що це означає:**

- Створити **новий** WebService `ManagerSync.1cws` namespace `http://ltex_manager` з JSON-only operations `ОбновитиКлієнта`/`СтворитиЗамовлення`/`СтворитиОплату`
- Створити **новий** CommonModule `СинкВхідний` з повним BSL логікою (вже draft у M1.5 spec)
- Не торкатися MobileExchange/ОбменАРМ/ПроцедурыОбменаССайтом — це independent track для site sync
- S66 outbound layer лишається

**Pros:**

- Чіткий boundary — `MobileExchange` тільки для mobile agents (legacy), `ManagerSync` тільки для site managers (new)
- Незалежна еволюція — можна додавати operations без боязні зламати mobile agent v1.15.3
- JSON-first contract — наш Node SOAP client уже працює (S65 shipped) і test (24 manager-sync tests pass)
- BSL draft вже написаний у моїй spec — можна давати 1С-розробнику як TF
- Idempotency, error contract, retries — все на власних рейках

**Cons:**

- **Duplication of intent:** і `MobileExchange.ОбновитьКлиента` і `ManagerSync.ОбновитиКлієнта` будуть мати overlap. 1С-розробник може запитати "а чого не reuse?" — і він буде формально правий
- Confusion у 1С codebase: 2 канали з картками клієнтів, можуть divergent з часом
- **Реальний blocker** для 1С-розробника — він мусить розібратися як писати дві паралельні версії того ж data write. Patterns відрізняються (ValueStorage vs JSON)

### 4.3 Option C — Hybrid (рекомендована)

**Що це означає:**

1. **Outbound (1С → site)** — лишити як є. S66 `/api/sync/*` REST endpoints приймають JSON push з 1С scheduled job `ЗаданиеОбменССайтом`. Не чіпати. Це **активний робочий канал** (хоча конкретний BSL ще треба пере-валідувати).

2. **Inbound write-back (site → 1С)** — реалізувати через **новий WebService**, але з мінімальною площею і **NOT** копіювати MobileExchange:
   - Створити `WebService ManagerSync.1cws` (namespace `http://ltex_manager`) з лише **2 operations**:
     - `ВиконатиТранзакцію(пароль, idempotencyKey, packetType, ПакетJSON)` — universal entry, packetType: `client_update|order_create|payment_create`
     - `ОтриматиСтатус(пароль, idempotencyKey)` — query status by IdempotencyKey (corner-case для long-running transactions)
   - 1 entry-point замість 3 — дешевше для 1С-розробника
   - Усі парсинг/dispatch — у новому CommonModule `СинкВхідний` (my draft з M1.5 spec)
   - JSON-first — наш Node client уже працює

3. **Reuse data layer:** `СинкВхідний.СтворитиЗамовлення` **реалізовано через виклик existing** `ОбменАРМ.СоздатьВнутренниеЗаказы` (5 параметрів, line 3388) — це той самий BSL код що mobile-agent використовує для створення замовлень. Не дублюємо bookkeeping logic. Reuse `ОбменАРМ.ОбновитьКонтрагентов` для client write-back (line 4181).

4. **Reuse `НомерВходящегоДокументаЭлектронногоОбмена`** як `ВнішнійID` — не додаємо новий реквізит.

5. **`Catalog.СинкЛог`** — додаємо. 1 новий catalog. ~30 рядків BSL для read/write. Підтримує idempotency для site-direction inbound (mobile-agent уже має свій механізм через `УдалитьРегистрацию` + `РегистрСведений.РегистрацияОбмена` — ми **не торкаємось**).

**Pros:**

- Найменше нового BSL — 1 WebService з 2 operations + 1 catalog + 1 wrapper module (~200 рядків BSL total)
- Reuse working business logic з `ОбменАРМ` (4181, 3388) — це битий мобільним агентом код, працює
- Чіткий separation з MobileExchange/legacy
- Підлеглі канали (outbound REST S66, mobile-agent SOAP) лишаються незмінними
- JSON contract на нашому end → наш Node client unchanged

**Cons:**

- 1С-розробник усе одно мусить написати CommonModule `СинкВхідний` + WebService + catalog + parsing helpers. Не zero-work.
- `ОбменАРМ.СоздатьВнутренниеЗаказы` працює з `ТаблицаЗначений` (1С datatype), не з JSON arrays — wrapper мусить translate. Це teach-friction.
- Якщо 1С-розробник захоче проste підставити existing `ОбработатьПакетДанных` — ми втратимо JSON contract і скочимось у Option A. Треба чітко комунікувати.

**Cons mitigations:**

- M1.5 spec вже містить BSL draft (line 167-253) — даємо як стартовий код, 1С-розробник адаптує
- Заплановано "Phase 5" follow-up — після того як 1С-розробник реалізує BSL, перемикаємо `SYNC_MOCK_MODE=false` і виставляємо `ONEC_SOAP_URL`

### 4.4 Recommendation з обґрунтуванням

**RECOMMEND: Option C з 2 corrections relative to моєї M1.5 spec:**

1. **Видалити з spec dedicated `СтворитиЗамовлення` + `СтворитиОплату`.** Замінити universal `ВиконатиТранзакцію(packetType, payload)` operation. Signature shrinks з 3 operations × 3 params = 9 properties у WebService до 1 operation × 4 params + 1 query operation = 5 properties. Зменшує surface для 1С-розробника.

2. **Reuse `НомерВходящегоДокументаЭлектронногоОбмена` як `ВнішнІД` для документів.** Не додавати новий реквізит у `ЗаказПокупателя`/`ПКО`. Це доменно правильно — поле уже існує саме для цього.

3. **Acknowledge у docs:** S66 outbound layer (`/api/sync/products|prices|lots|categories|rates|orders/import|orders/export`) **уже є target для existing 1С `ЗаданиеОбменССайтом` scheduled job**. M1.6 "inbound polling" з мого backlog — **не потрібен як new feature**. Можливо потрібен як re-validation того що 1С scheduled job дійсно шле дані (треба BSL audit `ПроцедурыОбменаССайтом.bsl`).

**Не roll back:**

- `services/manager-sync` Fastify proxy — лишається. Useful as SOAP client + idempotency cache + mock-mode для CI.
- `MgrSyncJob` queue + cron — лишається. Useful as DLQ + retries.
- `lib/sync/enqueue.ts` + `proxy-client.ts` — лишаються. JSON payload shapes — лишаються.
- Усі 1050 tests — лишаються.

**Що змінюється:**

- `docs/1C_SYNC_MODULES_SPEC.md` — переписати §3 (consolidate 3 ops → 2 ops), оновити §5 checklist
- `services/manager-sync/src/soap/client.ts::updateClientViaSoap` / `updateOrderViaSoap` / `updatePaymentViaSoap` — порефакторити на один `executeTransactionViaSoap(packetType, payload)`
- `apps/store/lib/sync/proxy-client.ts` — мінімальна зміна switch
- `services/manager-sync/src/routes/sync-clients.ts|orders.ts|payments.ts` — лишаються, але внутрішньо викликають same proxy
- Spec doc + tests для нової signature — ~2 годин роботи

**Risk score:** низький. Усе тестується у mock-mode. Реальний 1С call — після BSL implementation, який все одно потребує живої сесії з 1С-розробником.

---

## 5. BSL до дотягування — top critical files

Зараз `docs/1c-export-full/` має 148 CommonModule metadata XML, але **0 Module.bsl** (через robocopy фільтр що виключив усі `*/Ext/*` шляхи окрім корінних XML). Це блокує підтвердження стратегії.

### 5.1 Список top-9 файлів (priority order)

| #   | Файл                                                                  | Чому критично                                                                                                                                                                                            | Min lines очікувано |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1   | `CommonModules/ПроцедурыОбменаССайтом/Ext/Module.bsl`                 | **Сердце outbound 1С → site channel.** Підтверджує format payload що шле scheduled job. Без цього файлу ми не знаємо чи S66 endpoints дійсно target цього job. Можливо payload — не той що очікуємо.     | 500-2000            |
| 2   | `WebServices/MobileExchange/Ext/Module.bsl`                           | Підтверджує signature кожної з 23 operations. Конкретно: чи `ОбновитьКлиента` (1030-1082) реально `ОбновитьИдентификаторКлиента` (як у mobile-export 5%) чи повний картка-update. Diff vs mobile-export. | 200-500             |
| 3   | `CommonModules/УправлениеКонтрагентами/Ext/Module.bsl`                | API через який ми (Option C) можемо викликати `СоздатьКонтрагента`/`ОбновитьКонтрагента` reuse. Mobile-export Module.bsl line 4181 робить це inline — можливо вже extracted у цей модуль.                | 300-1000            |
| 4   | `CommonModules/УправлениеЗаказами/Ext/Module.bsl`                     | Те саме для `СоздатьЗаказ` reuse. У mobile line 3388 inline — можливо також refactored.                                                                                                                  | 300-1000            |
| 5   | `CommonModules/УправлениеТоварами/Ext/Module.bsl`                     | Confirm shape data при outbound товар-push (для S66 audit).                                                                                                                                              | 300-1000            |
| 6   | `Catalogs/Контрагенты/Ext/ManagerModule.bsl` (або `ObjectModule.bsl`) | Hook-логіка при write контрагента — звідси triggers OnWrite EventSubscription. Підтверджує які scenario тригерять site sync.                                                                             | 100-500             |
| 7   | `HTTPServices/Боты/Ext/Module.bsl`                                    | URL handlers `pingGETping`/`SendPOSTSend`/etc. Релевантно для M1.8 chat-bots (не M1.5), але важко для audit (вже active)                                                                                 | 50-300              |
| 8   | `CommonModules/ОбменАндроид/Ext/Module.bsl` (CENTRAL, не mobile!)     | Auth function `ПолучитьПродавцаПоКодуПартнера` що використовується у MobileExchange. Підтверджує password-vs-agent mapping що теж нам потрібний для Option C.                                            | 200-500             |
| 9   | `Catalogs/СерииНоменклатуры/Ext/ManagerModule.bsl`                    | Hooks для lots — підтверджує що `НомерВходящегоДокументаЭлектронногоОбмена` працює як ми очікуємо. (low priority — можна skip якщо timeline tight)                                                       | 50-200              |

### 5.2 Robocopy команда для дотягування

Поточний фільтр у експорті, очевидно, виключив `*/Ext/*Module.bsl`. Виправлений робочий процес:

1. На Windows Server: ще раз `Конфигуратор → LTEX → Конфигурация → Выгрузить конфигурацию в файлы → E:\ltex-ecosystem\docs\1c-export-full-bsl\`
2. Filtered copy тільки top-9 paths:

```powershell
$src = "E:\ltex-ecosystem\docs\1c-export-full-bsl"  # fresh export
$dst = "E:\ltex-ecosystem\docs\1c-export-full"      # existing target

$paths = @(
  "CommonModules\ПроцедурыОбменаССайтом\Ext\Module.bsl",
  "WebServices\MobileExchange\Ext\Module.bsl",
  "CommonModules\УправлениеКонтрагентами\Ext\Module.bsl",
  "CommonModules\УправлениеЗаказами\Ext\Module.bsl",
  "CommonModules\УправлениеТоварами\Ext\Module.bsl",
  "Catalogs\Контрагенты\Ext\ManagerModule.bsl",
  "Catalogs\Контрагенты\Ext\ObjectModule.bsl",
  "HTTPServices\Боты\Ext\Module.bsl",
  "CommonModules\ОбменАндроид\Ext\Module.bsl",
  "Catalogs\СерииНоменклатуры\Ext\ManagerModule.bsl"
)

foreach ($p in $paths) {
  $srcFile = Join-Path $src $p
  $dstFile = Join-Path $dst $p
  $dstDir = Split-Path $dstFile -Parent
  if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
  if (Test-Path $srcFile) {
    Copy-Item $srcFile $dstFile -Force
    Write-Host "Copied: $p"
  } else {
    Write-Warning "NOT FOUND: $p"
  }
}
```

Очікую +10 BSL файлів, ~50-200 КБ total. Commit + push.

---

## 6. Risks / open questions

### Risks

1. **R1 (high):** Якщо `CommonModule.ПроцедурыОбменаССайтом.Module.bsl` показує що outbound 1С → site йде у format відмінний від S66 expected (наприклад використовує `ValueStorage` замість JSON, або шле прямо на legacy Netlify URL) — наш S66 layer **не отримує даних з 1С зараз**, і всі 805 продуктів у DB йшли через manual S71 Excel import. Це потребує BSL audit (item #1 у §5.1).

2. **R2 (medium):** `ОбновитьКлиента` у real MobileExchange може бути ще більш degenerate ніж mobile-export (там 5% — оновлює тільки identifier). Тоді Option C reuse через `ОбменАРМ.ОбновитьКонтрагентов` line 4181 — це наш єдиний шлях. Mobile-export line 4181-4528 показує що ця функція **повна** (340 рядків з phone matching, address, tariffs etc.) — це reusable.

3. **R3 (low):** Mobile-agent сам у production. Якщо ми додамо new operations у MobileExchange (Option A) і випадково break parsing — mobile-agent v1.15.3 на ~200 пристроях зламається. Mitigation: Option C створює окремий WebService `ManagerSync.1cws` — нульовий impact на mobile-agent.

4. **R4 (medium):** `ЗаданиеОбменССайтом` scheduled job — без BSL не знаємо чи він активний (Use=true у XML, але це default flag — реальний schedule не у metadata). Можливо job disabled / failed silently і ми думаємо що sync працює. Mitigation: BSL audit + audit `apps/store/scripts/sync-stats.ts` (якщо існує) на reception timestamps.

5. **R5 (low):** `НомерВходящегоДокументаЭлектронногоОбмена` (поле документа `ЗаказПокупателя`) уже використовується mobile-agent flow. Якщо ми пишемо туди наш `orderInternalId` — є collision. Mitigation: prefix наш ID, наприклад `MGR-<cuid>` vs mobile `MA-<cuid>`. Easy.

### Open questions (need BSL or 1С-developer answer)

- **Q1:** Як `ЗаданиеОбменССайтом` shipping payload to site? POST до якого URL? Який заголовок auth? Це `/api/sync/*` (S66 endpoints) чи legacy `/.netlify/functions/*`?
- **Q2:** Чи виконується `ЗаданиеОбменССайтом` зараз у production (active scheduled job logs)?
- **Q3:** `MobileExchange.ОбновитьКлиента` — реальна реалізація: тільки identifier update чи повна картка?
- **Q4:** Чи можливо додати JSON-paired operations у existing MobileExchange без зламу mobile-agent v1.15.3 (testing scope)?
- **Q5:** Що повертає `СоздатьВнутренниеЗаказы` коли `ЗаказПокупателя.НомерВходящегоДокументаЭлектронногоОбмена` collision detected (existing з тим самим номером)?
- **Q6:** HTTPService `Боты` — який bot це? Telegram / Viber / both? Якщо обидва — як distinguish requests? Це не блокує M1.5 але потрібне для M1.8.

### Recommended next steps

1. **Worker session M1.5.2 (BSL pull):** дотягнути top-9 BSL файлів (§5.2), commit як addition до `docs/1c-export-full/`
2. **Orchestrator session M1.5.3 (re-audit):** після BSL pull — verify Option C feasibility, оновити `docs/1C_SYNC_MODULES_SPEC.md` за §4.4 recommendations
3. **1С-developer engagement:** дати оновлений M1.5 spec + 5-6 open questions з §6 → отримати estimate на BSL implementation (`СинкВхідний` module + WebService `ManagerSync.1cws`)
4. **Real-wire test:** після BSL implementation — perform handshake test з 1 client update, validate idempotency, switch `SYNC_MOCK_MODE=false`

---

## See also

- `docs/1C_SYNC_MODULES_SPEC.md` — M1.5 spec (потребує re-write Phase 5)
- `docs/M1.5_SYNC_ARCHITECTURE.md` — client-side queue arch (без змін)
- `docs/1C_SYNC_GUIDE.md` — S66 outbound (existing target для `ЗаданиеОбменССайтом`)
- `docs/1c-export-full/WebServices/MobileExchange.xml` — 23 operations confirmed reference
- `docs/1c-export-full/EventSubscriptions/ПриЗаписи*ОбменССайтом.xml` — registered objects
- `docs/1c-export-mobile/Central/CommonModules/ОбменАРМ/Ext/Module.bsl` — full mobile-agent BSL, reference for `ОбновитьКонтрагентов`/`СоздатьВнутренниеЗаказы`/`СоздатьПКО` patterns to reuse
