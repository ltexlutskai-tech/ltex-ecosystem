# Nova Poshta + Checkbox інтеграція — план

Гілка: `claude/nova-poshta-checkbox-integration-615lsn`. Дата старту: 2026-07-20.

## Бізнес-мета

Менеджер створює реалізацію → при проведенні автоматично створюється ТТН у Новій Пошті
(звести помилки складу до мінімуму) → склад фіналізує місця/габарити й тисне «Готово» →
у цей момент: (а) для NovaPay-накладок створюється проєкт чека у Checkbox (ETTN), (б) менеджер
отримує сповіщення, (в) клієнту (хто писав боту) йде повідомлення у Viber/Telegram, (г) у кабінеті
клієнта оновлюється трекінг.

## Ключові рішення користувача (зафіксовано)

1. Габарити місць вписує **склад у нашій системі**; ми оновлюємо ТТН через API НП. (пит.1а)
2. «Назва для чека» — **вільне текстове поле** `receiptName` у картці товару + скрипт переносу з 1С
   (атрибут `Номенклатура.Название`, напр. «Одяг вживаний»). (пит.2в)
3. Кількість місць/габарити визначає **склад** (пакують у мініпалету/палету або розпаковують). ТТН
   при проведенні створюється з орієнтовними даними (вага = сума ваг лотів), склад фіналізує. (пит.3/8)
4. Автовідстеження оплат NovaPay + списання боргів — **пізніше, окремий етап (Фаза 5)**. (пит.4)
5. Накладка завжди через NovaPay (гроші на рахунок ФОП Мельник за договором з НП) → чек ETTN підходить. (пит.5)
6. Клієнту в бот пишемо лише тим, хто **вже писав** нашому боту; решті — стандартні СМС НП. (пит.6)
7. Відправник: Волинська обл, с. Піддубці, вул. Київська 1б, Нова Пошта №1; ФОП Мельник Роман Іванович,
   +380632396395. (пит.7)
8. У реалізації при доставці НП — **довідник відділень НП** (менеджер обирає реальне відділення) або
   адреса при адресній доставці. (пит.7)

## Типові налаштування (підтверджено)

- Оголошена цінність ТТН = сума реалізації (₴), з можливістю вимкнути перемикачем.
- Опис у ТТН = загальна назва (та сама, що у чеку).
- ПДВ у чеку — «Без ПДВ» (ФОП на єдиному податку) → код Checkbox `8` (мапа з 1С: БезНДС→8, НДС20→0, інше→7).
- Чек створюється **лише** для NovaPay-накладок.

## Секрети (лише у `.env` на сервері, НЕ в репозиторії)

```
NOVA_POSHTA_API_KEY=...
NP_SENDER_CITY_REF=...            # Піддубці (резолвимо/фіксуємо при налаштуванні)
NP_SENDER_WAREHOUSE_REF=...       # Нова Пошта №1 Піддубці
NP_SENDER_PHONE=+380632396395
# лічильник-контрагент відправника резолвиться з API (Counterparty.getCounterparties Sender), кешується
CHECKBOX_PIN_CODE=...
CHECKBOX_LICENSE_KEY=...
CHECKBOX_CLIENT_NAME=Експрес-накладна (API)
CHECKBOX_CLIENT_VERSION=1.0
CHECKBOX_BASE_URL=https://api.checkbox.ua/api/v1
```

## Референс із 1С (що портуємо)

- Checkbox ETTN-чек: `Documents/РеализацияТоваровУслуг/Ext/ObjectModule.bsl`
  - Auth: `POST /api/v1/cashier/signinPinCode` (headers `X-Client-Name`, `X-Client-Version`, `X-License-Key`, body `{pin_code}`) → `access_token`.
  - Чек: `POST /api/v1/np/ettn`, headers + `Authorization: Bearer`. Payload:
    `receipt_body.goods[]` (good.code «1»/«2»/«3» за категорією, good.name = загальна назва, price у копійках, tax:[код]),
    `payments[]` (type `ETTN`, label «Платіж через інтегратора NovaPay», value = сума накладки×100, ettn = №ТТН),
    `discounts[]` (балансування goods vs payment), `footer`.
  - Гроші: копійки (×100), кількість: мілі-одиниці (×1000).
  - Загальна назва = `Номенклатура.Название`; good.code: «Одяг вживаний»→«1», інакше «2» (розширюємо на 3 категорії).

## Дані (Prisma) — зміни

**Продукт:**

- `Product.receiptName String?` — «Назва для друку та інтеграції».

**Реалізація (Sale) — структуровані поля НП-отримувача + ТТН:**

- `npCityRef`, `npCityName`, `npWarehouseRef`, `npWarehouseName` (відділення-отримувач),
- `ttnRef` (InternetDocument Ref НП), `ttnNumber` (= expressWaybill, лишаємо),
- `ttnCreatedAt`, `ttnError`, `declaredValueUah`, `declaredValueEnabled Boolean @default(true)`,
- `npDeliveryType` (WarehouseWarehouse | WarehouseDoors | ... ).

**Місця (габарити) — новий `WarehouseTaskSeat`:**

- `taskId`, `weight`, `lengthCm`, `widthCm`, `heightCm`, `note?`, `position`.

**Чек Checkbox — новий `CheckboxReceipt`:**

- `saleId @unique`, `receiptId?`, `status` (pending|created|failed), `ettn`, `fiscalCode?`, `error?`,
  `payloadSnapshot Json?`, `createdAt`, `updatedAt`.

## Сервіси (нові)

- `apps/store/lib/delivery/nova-poshta.ts` — клієнт НП API: `searchSettlements`, `getWarehouses`,
  `getSenderCounterparty` (кеш), `getSenderContact`, `ensureRecipient` (PrivatePerson), `createTtn`,
  `updateTtn` (місця/габарити), `deleteTtn`, `trackTtn`. Проксі-пошук відділень (без великих таблиць у БД).
- `apps/store/lib/fiscal/checkbox.ts` — `signinPinCode` (кеш токена), `createEttnReceipt`,
  `buildEttnPayload` (чистий білдер: групування позицій за `receiptName` у 1–3 рядки, копійки, ПДВ-код).
- `apps/store/lib/manager/receipt-name.ts` — резолвер загальної назви: `receiptName` → фолбек за деревом
  категорій (Взуття/Товари для дому/Одяг). Чиста функція + тести (за зразком `product-group.ts`).

## Потік

**Проведення реалізації** (хук у `sale-create.ts`, поряд з `createWarehouseTaskForSale`):

- Якщо доставка = Нова Пошта і є відділення/адреса отримувача → `createTtn` (best-effort, не блокує
  проведення; помилку пишемо в `Sale.ttnError`, показуємо кнопку «Повторити»). Місця=орієнтовно (лоти),
  вага=сума ваг лотів, cost=оголошена цінність, опис=загальна назва, BackwardDeliveryData Money=накладка.
- Зберігаємо `ttnRef`/`ttnNumber` на Sale + WarehouseTask. Завдання складу показує № ТТН + лінк на кабінет НП.

**Склад фіналізує (кнопка «Готово»/send):**

1. Редактор місць (мініпалета/палета/власні), кожне — вага + Д×Ш×В.
2. `updateTtn` з реальними SeatsAmount + OptionsSeat + загальна вага.
3. Якщо NovaPay-накладка → `createEttnReceipt` (Checkbox) → зберегти `CheckboxReceipt`.
4. `notifyManagerAboutTask` (MgrReminder).
5. Сповіщення клієнту (бот, якщо є розмова) + `Notification` + оновлення `Shipment`/трекінгу на повʼязаному Order.

## Фази (кожна = міграції + код + тести → merge у main → деплой)

- **Фаза 0 — Фундамент ✅ (merged, міграція `20260807`):** `Product.receiptName` + поле в картці товару +
  скрипт переносу з 1С (`--entity product-receipt-names`, `Номенклатура.Название` = `_Fld7773`); резолвер
  загальної назви (`lib/manager/receipt-name.ts`); клієнт НП API (`lib/delivery/nova-poshta.ts`) + проксі
  пошуку відділень; конфіг env + `scripts/np-resolve-sender.ts`; структуровані НП-поля на Sale; довідник
  відділень НП у формі реалізації (`np-warehouse-picker.tsx`, заміна вільного тексту).
- **Фаза 1 — ТТН при проведенні ✅ (merged, міграція `20260808`):** хук `lib/delivery/create-ttn-for-sale.ts`
  (best-effort, ідемпотентний, chained після `createWarehouseTaskForSale`); поля отримувача (ПІБ/телефон/
  платник) + перемикач оголошеної цінності у формі (префіл з картки клієнта); № ТТН + трекінг + «Повторити»
  на картці реалізації (`np-ttn-status.tsx`); № ТТН у завданні складу; ендпоінт `POST /sales/[id]/create-ttn`.
  Sender refs (Піддубці №1) — у `.env` (`NP_SENDER_CITY_REF`/`NP_SENDER_WAREHOUSE_REF`/`NP_SENDER_PHONE`).
  ⚠️ Cargo type = "Parcel", місць = к-сть рядків, вага = сума ваг — орієнтовно; склад фіналізує у Фазі 2.
- **Фаза 2 — Місця/габарити + фіналізація ТТН + друк етикетки + «Готово» ✅ (merged, міграція `20260809`):**
  `WarehouseTaskSeat` + редактор місць (пресети мініпалета/палета/коробка); `updateTtnForSale` (SeatsAmount +
  OptionsSeat); **друк етикетки НП 100×100 з нашої системи** (`fetchMarkingPdf` серверно, ключ прихований;
  `GET .../label`); `WarehouseTask.labelPrintedAt`; «Готово» (send) гейтиться на друк етикетки для НП;
  сповіщення менеджеру (наявне). Спільний `buildTtnInputForSale` для create/update.
- **Фаза 3 — Чек Checkbox при «Готово» (лише NovaPay-накладка):** `CheckboxReceipt` + `lib/fiscal/checkbox.ts`;
  групування позицій за загальною назвою; статус чека на реалізації/завданні.
- **Фаза 4 — Сповіщення + трекінг у кабінеті:** бот Viber/Telegram; `Notification`; `Shipment` на Order;
  таймлайн змін у кабінеті клієнта.
- **Фаза 5 (пізніше) — Автовідстеження оплат NovaPay** → прихідні платіжні доручення + списання боргу.

## Нотатки

- Гроші/ваги: НП API — вага у кг, габарити у метрах (OptionsSeat volumetric\* у метрах). Checkbox — копійки/мілі-одиниці.
- Отримувач-приватна особа створюється на льоту (`Counterparty.save` PrivatePerson) → contact ref → адреса = warehouse ref.
- Ідемпотентність: ТТН не створюється вдруге (перевірка `Sale.ttnRef`); чек — `CheckboxReceipt.saleId @unique`.
- Best-effort скрізь: збій НП/Checkbox не валить проведення/«Готово»; показуємо помилку + кнопку повтору.
