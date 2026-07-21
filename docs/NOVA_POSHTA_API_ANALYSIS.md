# Аналіз API «Нова Пошта» v2.0 для L-TEX

> Дослідницький документ. **Код застосунку НЕ змінювався** — це лише аналіз + рекомендації.
>
> Мета: точні назви полів API + допустимі значення + обмеження для нашого сценарію: авто-створення чернеток ТТН (`InternetDocument.save`/`update`), друк етикеток, «Контроль оплати» (AfterpaymentOnGoodsCost) і потенційне розширення (пакування мішків з ручною обробкою, попередній розрахунок, статуси, реєстри).
>
> **Джерела.** Офіційний портал `developers.novaposhta.ua` / `devcenter.novaposhta.ua` — це JS-SPA, що віддає 403 автоматичним зчитувачам. Тому точні назви полів взяті з відкритих SDK на GitHub (де структури дзеркалять офіційний контракт) + довідкові дзеркала. Основні джерела наведені інлайн.
>
> Позначка **⚠ перевірити** — факт не вдалося підтвердити першоджерелом, потрібна ручна звірка в кабінеті/пісочниці НП.

---

## 1. Ручна обробка (SpecialCargo) — ГОЛОВНЕ

### 1.1. Точне розташування поля

**`specialCargo` — це НЕ поле рівня документа. Воно живе ВСЕРЕДИНІ масиву `OptionsSeat[]`, окремо для кожного місця (мішка).**

Підтверджено кодом Laravel SDK `sashalenz/nova-poshta-api`, який дзеркалить офіційний контракт `InternetDocument.save`. Клас `OptionSeatData` (тіло елемента масиву `OptionsSeat`) містить рівно такі поля:

| Поле (API)         | Тип             | Призначення                                              |
| ------------------ | --------------- | -------------------------------------------------------- |
| `weight`           | string          | вага місця, кг                                           |
| `volumetricLength` | string          | довжина, см                                              |
| `volumetricWidth`  | string          | ширина, см                                               |
| `volumetricHeight` | string          | висота, см                                               |
| `volumetricVolume` | string (опц.)   | об'єм, м³ (рахується автоматично, можна не слати)        |
| **`specialCargo`** | **bool (опц.)** | **ручна обробка місця: `1`/true = ТАК, `0`/false = НІ**  |
| `packRef`          | string (опц.)   | Ref пакування (з `AdditionalService`/довідника пакувань) |

Джерело: `src/ApiModels/InternetDocument/RequestData/OptionSeatData.php` — https://github.com/sashalenz/nova-poshta-api (пошук по коду GitHub підтвердив `public Optional|bool $specialCargo`).

**Повний конструктор `SaveInternetDocumentRequest` НЕ містить документного `specialCargo`** — перевірено покроково по всіх полях класу `src/ApiModels/InternetDocument/RequestData/SaveInternetDocumentRequest.php`. Тобто прапорець ручної обробки задається лише на рівні місця.

Довідкове дзеркало офіційного порталу теж підтверджує: «параметр `specialCargo` (ручна обробка): `1` = так, `0` = ні; використовується всередині масиву `OptionsSeat`, який містить параметри кожного місця відправлення» — devcenter.novaposhta.ua (операція `InternetDocument.save`, доступна лише через дзеркала, бо портал 403-нить).

> ⚠ перевірити: у ДУЖЕ старих інтеграціях трапляється згадка документного `SpecialCargo` (0/1). Актуальний і послідовний по всіх сучасних SDK варіант — **per-seat у `OptionsSeat[].specialCargo`**. Використовувати саме його.

### 1.2. Що вмикає ручна обробка та її обмеження

«Ручна обробка» — режим для відправлень, які **не запаковані в коробку/картон із рівним дном** і не є «плоскою упаковкою одягу»: насипні/м'які вантажі, мішки в стрейчі. Саме наш кейс.

Обмеження (підтверджено довідкою KeyCRM, help.keycrm.app):

- **Габарити:** з увімкненою ручною обробкою жодна сторона місця (Д/Ш/В) **не може перевищувати 120 см**.
- **Маршрут:** таке місце можна відправляти **лише вантажне відділення → вантажне відділення** (або на адресу/двері). На звичайне поштове відділення — НЕ можна.
- **Типова помилка API:** `"Special Cargo seat ..."` — виникає, коли намагаєшся оформити доставку з увімкненою ручною обробкою на ЗВИЧАЙНЕ відділення. Такий тип упаковки приймається/видається тільки на вантажних відділеннях.

Джерела: FAQ Нова Пошта — https://help.keycrm.app/uk/integrations-with-delivery-services/faq-nova-poshta ; підтвердження use-case «насипні товари в мішках» там само.

### 1.3. Взаємодія з CargoType та типом відділення

- `CargoType` (тип вантажу рівня документа) і `specialCargo` (прапорець місця) — **різні речі**. Для мішків залишаємо `CargoType = "Cargo"` (вантаж) — це не «Parcel» (посилка в коробці). `specialCargo=1` додатково маркує, що місце потребує ручної обробки.
- **Тип відділення отримувача.** Щоб посилка поїхала на ОБРАНЕ вантажне відділення (а не авто-маршрутизувалась на найближче вантажне), треба:
  1. у `OptionsSeat[].specialCargo = 1` для кожного мішка;
  2. `Recipient`-відділення обрати саме **вантажне відділення** (Ref конкретного вантажного відділення з `Address.getWarehouses`);
  3. розміри кожного місця ≤ 120 см.

  У довіднику відділень (`Address.getWarehouses`) вантажні відділення відрізняються полями категорії/типу відділення (`CategoryOfWarehouse` / `TypeOfWarehouse` + ліміти `PlaceMaxWeightAllowed`, `TotalMaxWeightAllowed`, `ReceivingLimitationsOnDimensions`) — ⚠ перевірити точні значення `CategoryOfWarehouse` для «Вантажне відділення» на реальному довіднику (gitbook alexpseha та api.pdf НП описують метод `getWarehouses`, але точний код категорії треба звірити в пісочниці).

### 1.4. Рекомендація для L-TEX

**Ідея на столі підтверджується технічно:** прапорець у картці товару/відправлення «пакування: коробка / мішок».

- `коробка` → `CargoType="Parcel"`, `OptionsSeat[].specialCargo=0`, отримувач — будь-яке відділення/поштомат (у межах лімітів).
- `мішок` → `CargoType="Cargo"`, `OptionsSeat[].specialCargo=1` для КОЖНОГО місця, отримувач — **лише вантажне відділення** (або адреса), габарити кожного місця ≤ 120 см.

**Конфлікт, який треба закласти в UI:** якщо хоч одне місце — «мішок» (`specialCargo=1`), то селектор відділення отримувача мусить **дозволяти/вимагати вантажне відділення** і блокувати вибір звичайного відділення/поштомата — інакше НП поверне помилку `Special Cargo seat...`. Тобто вибір «мішок» і фільтр довідника відділень мають бути пов'язані.

Оскільки L-TEX відправляє мішки в стрейчі — **default для оптових відправлень доцільно ставити «мішок» + вантажне відділення**, а «коробку» лишити для дрібних/штучних позицій.

---

## 2. Правила створення чернетки ТТН (обмеження)

Метод: `InternetDocument.save` (модель `InternetDocument`, `calledMethod: "save"`). Оновлення — `InternetDocument.update` (працює лише поки ТТН ще не в руках НП). Видалення — `InternetDocument.delete`.

Повний перелік полів рівня документа (з `SaveInternetDocumentRequest`, sashalenz SDK — дзеркало офіційного контракту):

`senderWarehouseIndex`, `recipientWarehouseIndex`, `payerType`, `paymentMethod`, `dateTime`, `cargoType`, `serviceType`, `volumeGeneral`, `weight`, `seatsAmount`, `optionsSeat[]`, `cargoDetails[]`, `description`, `cost`, `afterpaymentOnGoodsCost`, `citySender`, `sender`, `senderAddress`, `contactSender`, `sendersPhone`, `cityRecipient`, `recipient`, `recipientAddress`, `contactRecipient`, `recipientsPhone`, `infoRegClientBarcodes`, `newAddress`, `cash2Card`, `recipientCityName`, `recipientArea`, `recipientAreaRegions`, `recipientAddressName`, `recipientHouse`, `recipientFlat`, `settlementType`, `backwardDeliveryData[]`, `accompanyingDocuments`, `additionalInformation`, `paramsOptionsSeats`, `promocode`.

### 2.1. Таблиця обмежень і правил

| Поле / правило           | Значення / обмеження                                                                                                                                                                                  | Нотатки, джерело                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Weight` (документ)      | вага в кг; має дорівнювати сумі ваг місць. Мінімум для розрахунку об'ємної ваги — див. нижче                                                                                                          | обов'язкове                                                                                                                                 |
| Об'ємна вага             | формула: `Д × Ш × В (см) / 4000` = кг за місце. Береться більше з фактичної/об'ємної                                                                                                                  | стандарт НП, ⚠ звірити коефіцієнт 4000 в пісочниці                                                                                          |
| Габарити місця           | **мін. 5 см** на сторону (підтверджено). **Макс. без ручної обробки — за типом відділення/поштомата**; **з `specialCargo=1` — ≤ 120 см** на сторону                                                   | KeyCRM FAQ                                                                                                                                  |
| `CargoType`              | `Cargo`, `Parcel`, `Documents`, `TiresWheels`, `Pallet`, `Money`, `SignedDocuments`, `Trays`                                                                                                          | точні значення з `Enums/CargoType.php` sashalenz. Для мішків — `Cargo`; для палет обов'язково `Pallet` (+ `OptionsSeat` з розмірами палети) |
| `ServiceType`            | `WarehouseWarehouse`, `WarehouseDoors`, `DoorsWarehouse`, `DoorsDoors`, `WarehousePostomat`, `DoorsPostomat`                                                                                          | точні значення з `Enums/ServiceType.php` sashalenz                                                                                          |
| `PayerType`              | `Sender` \| `Recipient` \| `ThirdPerson` (default `Recipient`)                                                                                                                                        | хто платить за доставку                                                                                                                     |
| `PaymentMethod`          | `Cash` \| `NonCash` (default `Cash`)                                                                                                                                                                  |                                                                                                                                             |
| `SeatsAmount`            | ціле, к-сть місць (default 1). Має збігатися з к-стю елементів `OptionsSeat`                                                                                                                          |                                                                                                                                             |
| `OptionsSeat[]`          | масив по місцях: `weight`, `volumetricWidth/Length/Height`, `volumetricVolume`(опц.), `specialCargo`(опц.), `packRef`(опц.)                                                                           | обов'язковий, коли передаємо габарити місць / ручну обробку / поштомат                                                                      |
| `paramsOptionsSeats`     | bool — прапорець, що документ використовує деталізацію по місцях `OptionsSeat`                                                                                                                        | ⚠ перевірити семантику (нове поле в save-контракті)                                                                                         |
| `Cost`                   | оголошена вартість, грн (ціле в грн). Впливає на страховий платіж                                                                                                                                     | мін/макс — ⚠ перевірити (історично макс. оголошена вартість обмежена договором; страховка = % від `Cost`)                                   |
| `VolumeGeneral`          | загальний об'єм, м³ (default ≈ 0.004)                                                                                                                                                                 | рекомендоване                                                                                                                               |
| `Description`            | текстовий опис вантажу (з довідника `CommonGeneral.getCargoDescriptionList` бажано)                                                                                                                   | обов'язкове                                                                                                                                 |
| Поштомат                 | макс. вага **30 кг** + обмеження габаритів комірки; `ServiceType` = `WarehousePostomat`/`DoorsPostomat`, отримувач-відділення типу «Поштомат», `OptionsSeat` обов'язковий                             | web-джерела; точні габарити комірки ⚠ перевірити                                                                                            |
| Адресна доставка (двері) | `NewAddress=1` + `RecipientCityName`/`RecipientArea`/`RecipientAddressName`(вулиця)/`RecipientHouse`/`RecipientFlat`, АБО заздалегідь створена адреса через `Address.save` → `RecipientAddress` (Ref) | два шляхи: inline-поля або Ref                                                                                                              |
| `InfoRegClientBarcodes`  | зв'язка з нашими внутрішніми ШК/номерами                                                                                                                                                              | опц.                                                                                                                                        |

Джерела значень enum: `Enums/CargoType.php` та `Enums/ServiceType.php` у https://github.com/sashalenz/nova-poshta-api ; поля save — `SaveInternetDocumentRequest.php` там само; ліміти ручної обробки/поштомата — https://help.keycrm.app/uk/integrations-with-delivery-services/faq-nova-poshta .

---

## 3. Контроль оплати (AfterpaymentOnGoodsCost) та COD

### 3.1. `AfterpaymentOnGoodsCost` — «Контроль оплати»

- **Поле рівня документа** `afterpaymentOnGoodsCost` (підтверджено в `SaveInternetDocumentRequest` sashalenz). Це сума контролю оплати для підприємців (гроші за товар повертаються на рахунок ФОП).
- **Пріоритет над післяплатою:** контроль оплати має пріоритет перед «наложкою» (`BackwardDeliveryData` з `CargoType="Money"`) — не можна одночасно оформити ТТН із контролем оплати ТА зворотною доставкою грошей. Джерело: коментар daaner/NovaPoshta («контроль оплаты имеет приоритет перед наложкой») + FAQ 1b.app.
- **Вимоги акаунта:** сервіс доступний лише за наявності договору з Нова Пошта + NovaPay і **увімкненого сервісу контролю оплати** на акаунті-відправнику. Інакше API поверне помилку `AfterpaymentOnGoodsCost unavailable`. Джерело: FAQ NP (KeyCRM), 1b.app forum.
- L-TEX уже успішно використовує `AfterpaymentOnGoodsCost` → договір/сервіс налаштовані.

### 3.2. Різниця vs післяплата (`BackwardDeliveryData` / COD)

«Післяплата» (класичний COD) — це **зворотна доставка** через `BackwardDeliveryData[]`:

| Поле `BackwardDeliveryData` | Значення                                                           |
| --------------------------- | ------------------------------------------------------------------ |
| `PayerType`                 | хто платить за зворотну доставку (`Sender`/`Recipient`)            |
| `CargoType`                 | `Money` (гроші назад), або `Documents` (підписані документи назад) |
| `RedeliveryString`          | сума до повернення (для `Money`)                                   |

- `AfterpaymentOnGoodsCost` (контроль оплати) ≠ `BackwardDeliveryData Money` (післяплата). Перше — контроль оплати товару для ФОП, друге — фізичне повернення готівки відправнику.
- **Не можна поєднувати** `AfterpaymentOnGoodsCost` із `BackwardDeliveryData CargoType=Money`.

Джерела: https://github.com/lis-dev/nova-poshta-api-2 (README/код), https://help.keycrm.app/uk/integrations-with-delivery-services/faq-nova-poshta , https://1b.app/en/forum/integrations-with-delivery-services/5525-novaya-pochta-kontrol-oplati-oshibka/ .

---

## 4. Функції кабінету НП vs покриття API

| Функція кабінету                                    | Модель.метод API                                                                                                        | Чи є в нас       | Пріоритет  | Нотатки                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Створити чернетку ТТН                               | `InternetDocument.save`                                                                                                 | ✅ так           | must       | базовий сценарій                                                                                                                                      |
| Редагувати ТТН                                      | `InternetDocument.update`                                                                                               | ⚠ частково       | must       | лише поки ТТН не в руках НП                                                                                                                           |
| Видалити/скасувати ТТН                              | `InternetDocument.delete`                                                                                               | ⚠ перевірити     | should     | скасування чернетки                                                                                                                                   |
| Друк етикетки/маркування                            | `InternetDocument.printMarking100x100` (Zebra 100×100), `printDocument` (html/pdf)                                      | ✅ друк етикеток | must       | `printDocument` приймає масив Ref + тип `html`/`pdf`                                                                                                  |
| Розрахунок вартості ДО створення                    | `InternetDocument.getDocumentPrice`                                                                                     | ❌ немає         | **should** | параметри: `CitySender`, `CityRecipient`, `Weight`, `ServiceType`, `Cost`, `CargoType`, `SeatsAmount`, `RedeliveryCalculate`                          |
| Розрахунок дати доставки ДО створення               | `InternetDocument.getDocumentDeliveryDate`                                                                              | ❌ немає         | nice       | `DateTime`, `ServiceType`, `CitySender`, `CityRecipient`                                                                                              |
| Трекінг статусів                                    | `TrackingDocument.getStatusDocuments`                                                                                   | ⚠ перевірити     | **should** | масив `{DocumentNumber, Phone}`; **push-вебхуків у НП немає** — лише поллінг                                                                          |
| Підписка на статус (webhook)                        | —                                                                                                                       | ❌ немає нативно | nice       | НП не надає офіційних вебхуків; статуси тягнути поллінгом `getStatusDocuments`. ⚠ перевірити чи з'явився офіційний webhook на api-portal.novapost.com |
| Контрагенти (Приватна особа / Організація з ЄДРПОУ) | `Counterparty.save` (+`getCounterparties`)                                                                              | ⚠ перевірити     | should     | `CounterpartyType` = PrivatePerson/Organization; для організації — `EDRPOU`                                                                           |
| Контакти контрагента                                | `ContactPerson.save`                                                                                                    | ⚠ перевірити     | should     | `ContactSender`/`ContactRecipient` Ref                                                                                                                |
| Адресна книга / створення адреси                    | `Address.save` (вулиця/будинок), `Address.getСities`/`getWarehouses`/`getStreet`                                        | ⚠ частково       | should     | для доставки на двері                                                                                                                                 |
| Повернення / реадресація (redirect)                 | `AdditionalService.save` (`OrderType`: Redirecting / CargoReturn), `CheckPossibilityCreateReturn`, `getReturnReasons`   | ❌ немає         | nice       | ⚠ перевірити точні назви методів реадресації                                                                                                          |
| Багатомісні відправлення                            | `OptionsSeat[]` + `SeatsAmount`                                                                                         | ⚠ частково       | must       | по місцях (кожен мішок = місце)                                                                                                                       |
| Виклик кур'єра (забір)                              | `ScanSheet`/`AdditionalService` — виклик кур'єра ⚠ перевірити метод                                                     | ❌ немає         | nice       |                                                                                                                                                       |
| Реєстри (scan-sheet)                                | `ScanSheet.insertDocuments`, `getScanSheet`, `getScanSheetList`, `removeDocuments`, `deleteScanSheet`, `printScanSheet` | ❌ немає         | **should** | «Реєстр» = групування ТТН для здачі на відділення одним скан-листом                                                                                   |
| Поштомати                                           | `ServiceType` Postomat + відділення типу «Поштомат»                                                                     | ⚠ ні             | nice       | ліміт 30 кг                                                                                                                                           |
| Довідники (міста/відділення/вулиці)                 | `Address.getCities`, `getWarehouses`, `getStreet`, `getSettlements`                                                     | ⚠ перевірити     | must       | кешувати локально, оновлювати ~раз/добу                                                                                                               |

Джерела методів: https://github.com/sashalenz/nova-poshta-api , https://github.com/daaner/NovaPoshta , https://pkg.go.dev/github.com/platx/go-nova-poshta , https://github.com/lis-dev/nova-poshta-api-2 , офіційний портал через дзеркала devcenter.novaposhta.ua.

---

## 5. Рекомендації для обговорення (пріоритезовано)

1. **[MUST] Прапорець «пакування: коробка / мішок» у картці товару/відправлення + логіка SpecialCargo.**
   Мішок → `CargoType="Cargo"` + `OptionsSeat[].specialCargo=1` на кожне місце + отримувач тільки **вантажне відділення** + габарит ≤ 120 см.
   Обов'язково зв'язати з селектором відділення отримувача: при «мішок» показувати/вимагати вантажні відділення (фільтр по `CategoryOfWarehouse`/`TypeOfWarehouse`), інакше — помилка `Special Cargo seat...`.
   _Ефорт: середній_ (UI прапорець + гілка в білдері payload + фільтр довідника відділень). _Чому: прямо усуває ручне перемикання «ручної обробки» і невірну маршрутизацію на найближче вантажне._

2. **[SHOULD] Попередній розрахунок вартості й дати доставки перед створенням ТТН** — `getDocumentPrice` + `getDocumentDeliveryDate`.
   _Ефорт: малий_ (два read-only виклики). _Чому: менеджер бачить ціну/ETA до друку ТТН, менше помилок і переробок._

3. **[SHOULD] Трекінг статусів поллінгом** — `TrackingDocument.getStatusDocuments` по активних ТТН (крон, напр. раз/годину), запис статусу у наш документ; закривати «Контроль оплати» за фактом статусу.
   _Ефорт: середній_ (крон + мапа статусів). _Чому: у НП немає push-вебхуків; поллінг — єдиний шлях автоматично бачити «доставлено/отримано/оплата зарахована»._

4. **[SHOULD] Реєстри (ScanSheet)** — групувати денні ТТН у реєстр (`ScanSheet.insertDocuments` → `printScanSheet`) для здачі на відділення одним листом.
   _Ефорт: середній_. _Чому: пришвидшує здачу партії мішків на вантажне відділення, менше ручної роботи склад/експедитор._

5. **[SHOULD] Валідація лімітів на боці L-TEX перед `save`** — габарит ≤ 120 см при `specialCargo`, поштомат ≤ 30 кг, узгодженість `SeatsAmount` = к-сть `OptionsSeat`, заборона `AfterpaymentOnGoodsCost` разом із `BackwardDeliveryData Money`.
   _Ефорт: малий_ (чисті перевірки перед запитом). _Чому: ловимо помилки до звернення в API, зрозумілі повідомлення менеджеру._

6. **[NICE] Адресна доставка (двері)** — `Address.save` + `ServiceType=WarehouseDoors` для клієнтів, що просять «на адресу».
   _Ефорт: середній_. _Чому: розширює сценарії доставки; зараз, схоже, лише відділення._

7. **[NICE] Реадресація/повернення** — `AdditionalService` (Redirecting/CargoReturn) для нестандартних кейсів.
   _Ефорт: середній, ⚠ уточнити методи_. _Чому: обробка відмов/повернень без дзвінків у НП._

8. **[NICE] Поштомати** для дрібних штучних відправлень (не мішків), у межах 30 кг.
   _Ефорт: малий_ (додати `ServiceType` Postomat + фільтр відділень). _Чому: дешевша опція для легких посилок._

---

### Підсумок по головному питанню (SpecialCargo)

**`specialCargo` — поле рівня МІСЦЯ всередині масиву `OptionsSeat[]` (bool `1`/`0`), а НЕ поле документа.** Для мішків L-TEX: `CargoType="Cargo"`, кожному місцю `specialCargo=1`, габарит ≤ 120 см на сторону, отримувач — **вантажне відділення** (тип відділення з довідника `getWarehouses`). Спроба відправити «ручну обробку» на звичайне відділення дає помилку `Special Cargo seat...`. Тому UI-вибір «мішок» має автоматично обмежувати список відділень отримувача вантажними.

---

## SpecialCargo — точний контракт (діагностика помилки «Special Cargo seat not match in weight»)

> Додано 2026-07-21. Фокус — конкретна помилка **`Special Cargo seat not match in weight`** (саме «in **weight**», не «in size»). Джерела нижче; де першоджерело недоступне (портал `developers.novaposhta.ua`/`devcenter` 403-нить на автозчитувачі), позначка **⚠ не підтверджено першоджерелом**.

### 1. Розташування `specialCargo` — підтверджено: ТІЛЬКИ per-seat

`specialCargo` живе **всередині кожного елемента `OptionsSeat[]`**, окремим прапором місця. **Документного (top-level) `SpecialCargo` НЕ існує** в актуальному контракті `InternetDocument.save`:

- Laravel SDK `sashalenz/nova-poshta-api`: клас елемента `OptionSeatData` має `specialCargo`; конструктор `SaveInternetDocumentRequest` документного `specialCargo` НЕ має.
- Go SDK `platx/go-nova-poshta`: `SaveReq` має `Weight float64`, але **жодного `SpecialCargo`** на рівні документа; прапор — лише в елементі місця.

**Висновок для коду:** наш поточний варіант (`OptionsSeat[].specialCargo = "1"`) — **правильний**. Переносити на рівень документа НЕ треба. Джерела: github.com/sashalenz/nova-poshta-api, pkg.go.dev/github.com/platx/go-nova-poshta/api/internetdocument.

### 2. Що вмикає саме «...not match in **weight**»

Помилка `Special Cargo seat not match in **size**` = якась сторона місця (Д/Ш/В) > 120 см — це **підтверджено** (KeyCRM FAQ, pack.ua). Помилка `...not match in **weight**` — ваговий аналог тієї ж перевірки узгодженості місць; першоджерельного тексту саме про «in weight» знайти не вдалося, тож нижче — ранжовані за доказовістю гіпотези:

- **(a) Вага місця має бути ЦІЛИМ числом кг — найсильніший доказ.** У Go SDK `platx/go-nova-poshta` тип ваги МІСЦЯ — `OptionSeat.Weight **int**`, тоді як вага ДОКУМЕНТА — `SaveReq.Weight **float64**`. Тобто на рівні місця дробова вага не передбачена контрактом → дробова вага мішка (напр. `18.2`) у `OptionsSeat[].weight` = ймовірна причина «not match in weight». **Практична рекомендація: у спец-вантажу слати вагу кожного місця цілим кг (округлення вгору).** ⚠ не підтверджено першоджерелом, але типізація SDK однозначна.
- **(b) Сума ваг місць має дорівнювати документному `Weight`.** Пряме прочитання фрази «seat not match in weight»: місця не «сходяться» із задекларованою вагою відправлення. Тобто `Weight (документ) == Σ OptionsSeat[].weight`. Це стандартна перевірка узгодженості НП. **Рекомендація: рахувати документний `Weight` як точну суму ваг місць (після округлення кожного до цілого — див. (a)).** ⚠ не підтверджено першоджерелом.
- **(c) Вага місця ≥ його об'ємної ваги** (Д×Ш×В/4000). Загальне правило НП для «Вантаж», але зазвичай дає інше повідомлення (перерахунок на об'ємну), не «seat not match». Малоймовірно як корінь саме цієї помилки.
- **(d) `SeatsAmount == к-сть елементів `OptionsSeat``.** Розбіжність тут зазвичай дає окрему помилку про кількість місць, а не «...in weight». Все одно тримати інваріант.

**Найімовірніший фікс (комбо (a)+(b)):** кожне місце — ціла вага в кг; документний `Weight` = сума цих цілих ваг. Перевірити в пісочниці НП, бо точного тексту правила в доступних джерелах немає.

### 3. Габарити/вага спец-вантажу

- **Макс. 120 см на будь-яку сторону** місця при ручній обробці — підтверджено (KeyCRM FAQ; pack.ua «що таке РО»; офіційні пости НП про доплату за габарит >120 см).
- **Мін. 5 см на сторону** — з попередньої версії цього документа, **⚠ не підтверджено** в цьому раунді.
- **Вага місця:** ціле число кг (див. §2(a), доказ — типізація SDK). Явного min/max на місце в джерелах не знайдено; вантажне відділення — «без обмежень ваги» (KeyCRM).

### 4. Вимога вантажного відділення — ПІДТВЕРДЖЕНО (вимога) / ⚠ поле-фільтр не підтверджено значенням

Ручна обробка (спец-вантаж) приймається й видається **лише «вантажне відділення → вантажне відділення»** (або на двері/адресу). На звичайне поштове відділення/поштомат — НЕ можна. Підтверджено: KeyCRM FAQ, pack.ua.

Фільтрувати список у пікері треба за довідником `Address.getWarehouses`. Поля-кандидати у відповіді: **`CategoryOfWarehouse`** та **`TypeOfWarehouse`** (Ref), плюс лімітні поля `PlaceMaxWeightAllowed`, `TotalMaxWeightAllowed`, `ReceivingLimitationsOnDimensions`. **Точне значення `CategoryOfWarehouse` для «Вантажне відділення» встановити з доступних джерел не вдалося — ⚠ не підтверджено** (портал 403). Метод для довідника типів — `Address.getWarehouseTypes` (мапа TypeRef → назва). **Дія:** зняти реальний дамп `getWarehouses` у пісочниці, знайти рядок вантажного відділення (велика `TotalMaxWeightAllowed`/`PlaceMaxWeightAllowed`, назва містить «Вантажне»), зафіксувати його `CategoryOfWarehouse`/`TypeOfWarehouse` і фільтрувати пікер по ньому. Джерела: api-portal.novapost.com (Branch Directory), pkg.go.dev getWarehouses.

### 5. `CargoType` — підтверджено: `Cargo`

Для мішків — `CargoType = "Cargo"` (це окреме поле документа; НЕ `Parcel`/`Pallets`). `specialCargo` — незалежний прапор місця поверх цього. Константи типів вантажу (Go SDK `sirkostya009/go-novapost`): `Parcel`, `Cargo`, `Documents`, `TiresWheels`, `Pallets`, `Money`. Джерело: pkg.go.dev/github.com/sirkostya009/go-novapost.

### Зведений вердикт по 5 питаннях

1. **Розташування:** per-seat `OptionsSeat[].specialCargo` (1/0). Документного `SpecialCargo` немає. Поточний код правильний. — **підтверджено (SDK).**
2. **Тригер «in weight»:** найімовірніше — дробова вага місця (контракт вимагає ЦІЛУ кг на місце) та/або документний `Weight` ≠ сумі ваг місць. — **сильна інференція з типізації SDK, ⚠ не підтверджено першоджерелом.**
3. **Габарити:** ≤ 120 см/сторона — підтверджено; ≥ 5 см — ⚠ не підтверджено; вага місця цілим кг — інференція.
4. **Вантажне відділення:** обов'язкове для відправника й отримувача — **підтверджено**; поле-фільтр `CategoryOfWarehouse`/`TypeOfWarehouse`, але точне значення — **⚠ не підтверджено** (зняти з пісочниці).
5. **CargoType:** `Cargo` — **підтверджено (SDK).**

**Джерела розділу:** github.com/sashalenz/nova-poshta-api; github.com/serj1chen/nova-poshta-sdk-php; pkg.go.dev/github.com/platx/go-nova-poshta/api/internetdocument; pkg.go.dev/github.com/sirkostya009/go-novapost; help.keycrm.app/uk/integrations-with-delivery-services/faq-nova-poshta; pack.ua/uk/articles/.../nova-poshta-scho-take-ro; api-portal.novapost.com (Branch Directory).
