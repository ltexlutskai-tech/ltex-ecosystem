# План: документ «Зміна стану мішка» (Изменение состояния мешка)

Статус: **план, чекає реалізації.** Гілка: `claude/bag-repackaging-doc-analysis-iavsyu`.
Джерело 1С: `docs/1c-export-2026-06-02/Documents/ИзменениеСостоянияМешка/` (XML метадані + `Ext/ObjectModule.bsl`).

---

## 0. Простими словами (для user)

«Зміна стану мішка» — це **пакетний редактор мішків**. Комірник відкриває документ, сканує підряд багато мішків (штрихкодів) — і бачить таблицю, де для кожного мішка одним проходом виставляє:

- відкритий / закритий;
- є відео / нема;
- «цільовий» (targeted);
- посилання на YouTube;
- опис;
- бронь: на якого **торгового агента** та на якого **клієнта**, і **до якої дати**;
- «ефір» / «ефір на доставку»;
- сектор на складі;
- коментар.

Коли документ **зберігають** — усі ці значення записуються в самі мішки (лоти). Коли **проводять** — додатково пишеться **журнал історії** (хто, коли, що змінив у мішку). Плюс розумна дрібниця з 1С: якщо на мішку **вперше з'явилось відео** і мішок заброньований на клієнта — система сама створює нагадування «скинути відео у Viber» відповідному агенту.

**Що вже є в нас:** усі ці поля вже існують на моделі `Lot`, і є редагування **по одному мішку** (Прайс→Лоти) + кнопка «Замовити відео». **Чого немає:** окремого документа для пакетного редагування та журналу історії.

**Рішення user (зафіксовано):**

- будуємо **повний документ + історію** (як 1С);
- сектор → **довідник секторів + історія** (в якому секторі лежить мішок);
- доступ: **тільки склад + адмін/власник**.

---

## 1. Аналіз документа 1С

### 1.1. Шапка

| Реквізит   | Тип                                  | Наше поле                                                         |
| ---------- | ------------------------------------ | ----------------------------------------------------------------- |
| `Номер`    | рядок 9, автонумерація (`L00014168`) | `docNumber` (авто `LT-BSC-YYYYMM-NNNN`) + `number1C?` для історії |
| `Дата`     | дата-час                             | `docDate`                                                         |
| `Коментар` | рядок 250                            | `notes`                                                           |

Проведення: `Posting=Allow`, реальний час. При проведенні пише 2 регістри: `InformationRegister.ІсторіяЗміниСтануМішка` + `InformationRegister.Сектори`.

### 1.2. Таблична частина `Товары` (рядок = один мішок)

| Колонка 1С                   | Тип 1С                                  | Наше поле на `Lot`                                           |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| `Номенклатура`               | `CatalogRef.Номенклатура`               | `productId` (похідне від лота)                               |
| `ХарактеристикаНоменклатуры` | `CatalogRef.ХарактеристикиНоменклатуры` | сам `Lot` (ідентифікуємо за `barcode`)                       |
| `Штрихкод`                   | набір типів ШК                          | `Lot.barcode` (ключ пошуку рядка)                            |
| `Открыт`                     | boolean                                 | `isOpen`                                                     |
| `ЕстьВидео`                  | boolean                                 | похідне: `videoUrl` присутнє (див. §3.3)                     |
| `Целевой`                    | boolean                                 | `isTarget`                                                   |
| `СсылкаНаYouTube`            | рядок 127                               | `videoUrl`                                                   |
| `Описание`                   | рядок                                   | `description`                                                |
| `Бронь`                      | `CatalogRef.ТорговыеАгенты` (агент)     | `reservedByUserId` + `reservedByName`                        |
| `ПериодБрони`                | дата (кінець дня)                       | `reservedUntil`                                              |
| `Контрагент`                 | `CatalogRef.Контрагенты` (клієнт)       | `reservedForClientId` + `reservedForName`                    |
| `Ефір`                       | boolean                                 | `onAir`                                                      |
| `ЕфірНаДоставку`             | boolean                                 | `onAirDelivery`                                              |
| `Коментар`                   | рядок                                   | `comment`                                                    |
| `СекторНаСкладі`             | рядок 10                                | `sector` (текст) + новий `sectorId` (FK → `WarehouseSector`) |

### 1.3. Логіка `ПередЗаписью` (BSL, рядки 3–61)

1. **Обмеження «лише сьогоднішній документ»**: якщо документ не новий і `Дата < НачалоДня(ТекущаяДата())` → відмова + попередження «Можна міняти лише сьогоднишный документ. Створіть новий!».
2. Для кожного рядка `Товары`: бере об'єкт `ХарактеристикаНоменклатуры` (= лот) і **прямо оновлює** його поля: `ЕстьВидео/Открыт/Целевой/СсылкаНаYouTube/Описание/Бронь/ПериодБрони (кінець дня)/Контрагент/СекторНаСкладі/Коментар/Ефір/ЕфірНаДоставку` → `Записать()`.
3. **Тригер відео → нагадування**: якщо `Строка.ЕстьВидео` і `НЕ БылоВидеоДоЗаписи` (тобто відео з'явилось уперше) і `Контрагент` заповнений і `Бронь` (агент) заповнений → створює запис у `РегистрыСведений.ОчередьНапоминанийСДействием` з дією `ОтправкаСообщенияВайберОВидео` + лог.

### 1.4. Логіка `ОбработкаПроведения` (BSL, рядки 74–119)

1. Регістр **`ІсторіяЗміниСтануМішка`** — очищає й пише по одному руху на рядок: усі поля стану мішка + `Регистратор` (=документ) + `Дата` + `Відповідальний` (=користувач) + `Активность=Истина` + `Период`.
2. Регістр **`Сектори`** — для рядків з непорожнім `СекторНаСкладі`: `ХарактеристикаНоменклатуры` + `Сектор` (`ОблікСекторів.ОтриматиСектор(name)` = знайти-або-створити елемент довідника `Сектори` за кодом).

### 1.5. `ПриКопировании`

При копіюванні документа поля рядків підтягуються з поточного стану характеристик — нам не критично (можна не робити «Копіювати»).

---

## 2. Наш поточний стан (аудит)

- `Lot` (schema.prisma) вже має всі цільові поля: `isOpen, isTarget, videoUrl, videoDate, description, comment, onAir, onAirDelivery, sector, reservedForClientId, reservedForName, reservedByUserId, reservedByName, reservedUntil, arrivalDate, barcode`.
- Редагування по одному мішку: `lib/manager/lot-edit.ts` (whitelist `sector/isOpen/comment/description/isTarget/videoDate`), `PATCH /api/v1/manager/lots/[id]`. **Рухів/аудиту не пише.**
- Бронь: `lib/manager/lot-booking.ts` + `POST /lots/[id]/book|unbook`.
- «Замовити відео»: `order-video-button.tsx` → `POST /api/v1/manager/reminders {orderVideo:true, periodicity:"event", clientId, productId, lotId}` → cron `generate-reminders.ts` перетворює на нагадування «Скинути Viber», коли з'явиться `videoUrl`.
- Довідник секторів: `WarehouseSector` існує (`GET /api/v1/manager/warehouse/sectors`), але `Lot.sector` — вільний рядок (не FK).
- **Немає** таблиці історії зміни стану мішка (найближче — універсальний `AuditLog`, але для лотів у нього нічого не пише).

**Патерн для дзеркалення:** виділений документ (`Sale`/`RouteSheet`) — модель + child-items + роути `manager/(workstation)/<doc>/{page,new,[id]}` + API `api/v1/manager/<doc>/...` + хук проведення `apply.../remove...` + статуси `draft/posted/cancelled`.

---

## 3. Пропонована реалізація

### 3.1. Модель даних (Prisma) — 1 нова міграція `20260713_bag_state_change`

```prisma
model BagStateChange {
  id             String    @id @default(cuid())
  docNumber      String    @unique @map("doc_number")   // LT-BSC-YYYYMM-NNNN
  number1C       String?   @map("number_1c")            // для історичного імпорту (опц.)
  code1C         String?   @unique @map("code_1c")
  docDate        DateTime  @default(now()) @map("doc_date")
  status         String    @default("draft")            // draft | posted | cancelled
  notes          String?
  warehouseId    String?   @map("warehouse_id")
  createdByUserId String?  @map("created_by_user_id")
  postedAt       DateTime? @map("posted_at")
  postedByUserId String?   @map("posted_by_user_id")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  items          BagStateChangeItem[]

  @@index([status])
  @@index([docDate(sort: Desc)])
  @@map("mgr_bag_state_changes")
}

model BagStateChangeItem {
  id            String   @id @default(cuid())
  documentId    String   @map("document_id")
  lineNo        Int      @map("line_no")
  lotId         String?  @map("lot_id")          // резолв за barcode
  barcode       String                            // ключ пошуку мішка
  productId     String?  @map("product_id")
  // Стан мішка (усі редаговані поля):
  isOpen        Boolean  @default(false) @map("is_open")
  hasVideo      Boolean  @default(false) @map("has_video")
  isTarget      Boolean  @default(false) @map("is_target")
  youtubeUrl    String?  @map("youtube_url")
  description   String?
  comment       String?
  onAir         Boolean  @default(false) @map("on_air")
  onAirDelivery Boolean  @default(false) @map("on_air_delivery")
  reservedAgentUserId String? @map("reserved_agent_user_id")   // «Бронь» = агент
  reservedClientId    String? @map("reserved_client_id")       // «Контрагент»
  reservedUntil       DateTime? @map("reserved_until")
  sector        String?
  sectorId      String?  @map("sector_id")        // FK → WarehouseSector
  createdAt     DateTime @default(now()) @map("created_at")

  document BagStateChange @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([barcode])
  @@map("mgr_bag_state_change_items")
}

// Регістр історії (= 1С InformationRegister.ІсторіяЗміниСтануМішка)
model LotStateHistory {
  id            String   @id @default(cuid())
  lotId         String?  @map("lot_id")
  barcode       String
  productId     String?  @map("product_id")
  recorderDocId String?  @map("recorder_doc_id")   // BagStateChange.id (реєстратор)
  occurredAt    DateTime @map("occurred_at")
  changedByUserId String? @map("changed_by_user_id")  // «Відповідальний»
  // Знімок стану:
  isOpen        Boolean  @default(false) @map("is_open")
  hasVideo      Boolean  @default(false) @map("has_video")
  isTarget      Boolean  @default(false) @map("is_target")
  youtubeUrl    String?  @map("youtube_url")
  description   String?
  comment       String?
  onAir         Boolean  @default(false) @map("on_air")
  onAirDelivery Boolean  @default(false) @map("on_air_delivery")
  reservedAgentUserId String? @map("reserved_agent_user_id")
  reservedClientId    String? @map("reserved_client_id")
  reservedUntil DateTime? @map("reserved_until")
  sector        String?
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([lotId])
  @@index([barcode])
  @@index([recorderDocId])
  @@index([occurredAt(sort: Desc)])
  @@map("lot_state_history")
}
```

Плюс до `Lot`: додати `sectorId String? @map("sector_id")` (FK → `WarehouseSector`, `onDelete: SetNull`) — паралельно до текстового `sector` (сумісність). До `WarehouseSector` додати `code String? @unique` (=назва) для find-or-create за назвою (дзеркало 1С `Справочники.Сектори.НайтиПоКоду`).

> **Історія сектора** («в якому секторі лежить мішок» = 1С регістр `Сектори`) реалізується через ту саму `LotStateHistory` (поле `sector`) + актуальний `Lot.sectorId`. Окрема таблиця не потрібна: «останній сектор» = найсвіжіший запис історії / поточний `Lot.sectorId`.

### 3.2. Файли (дзеркалимо патерн Sale)

- `lib/manager/bag-state.ts` — конфіг, генератор номера `LT-BSC-...`, `createBagStateChange`, `updateBagStateChange`.
- `lib/manager/bag-state-hooks.ts` — **чисте ядро** `buildBagStateApply(doc)` + `applyBagStateChange(id)` / `removeBagStateChange(id)` (проведення/реверс).
- `lib/validations/bag-state.ts` — Zod схеми.
- API: `app/api/v1/manager/bag-state-changes/{route.ts, [id]/route.ts, [id]/post/route.ts}` (list/create; get/update/delete; провести).
- Роут пошуку мішка за ШК уже є: `GET /api/v1/manager/lots/by-barcode` (перевикористати).
- UI: `app/manager/(workstation)/bag-state-changes/{page.tsx (список), new/page.tsx, [id]/page.tsx}` + `_components/{bag-state-form.tsx, bag-state-row.tsx, post-button.tsx, status-badge.tsx}`.
- Пункт меню + плитка в хабі складських документів або окремо (узгодити навігацію).

### 3.3. Логіка проведення (`applyBagStateChange`) — дзеркало §1.3–1.4

У `$transaction`, ідемпотентно (delete-then-write історії за `recorderDocId`):

1. Гард «сьогоднішній документ»: якщо `docDate < startOfToday` і статус змінюється — блок для звичайних ролей, **дозвіл admin/owner** (пом'якшуємо жорсткість 1С).
2. Для кожного рядка:
   - знайти `Lot` за `barcode`; якщо нема — зібрати помилку рядка (показати у формі, не проводити).
   - `previousHadVideo = !!lot.videoUrl`.
   - оновити лот: `isOpen, isTarget, description, comment, onAir, onAirDelivery`; `videoUrl = youtubeUrl`, `videoDate = docDate` якщо `hasVideo`; бронь: `reservedByUserId/reservedByName` (з агента), `reservedForClientId/reservedForName` (з клієнта), `reservedUntil = endOfDay(reservedUntil)`; сектор: `sectorId` (find-or-create `WarehouseSector` за назвою) + `sector` (текст).
   - **тригер відео**: якщо `hasVideo && !previousHadVideo && reservedAgentUserId && reservedClientId` → створити event-нагадування «скинути Viber про відео» (перевикористати наявний механізм `auto_video`: `POST reminders {orderVideo, periodicity:"event", clientId, lotId, productId}` або пряме створення `MgrReminder`).
   - записати `LotStateHistory` (знімок + `changedByUserId = user`, `occurredAt = now`, `recorderDocId = doc.id`).
3. `status = "posted"`, `postedAt`, `postedByUserId`.

**Реверс `removeBagStateChange`** (при `cancel`/видаленні): видалити `LotStateHistory` за `recorderDocId`; **стан лотів не відкочуємо** (як і 1С — це «остання відома правда»; попередній стан лишається у попередніх записах історії). Це узгоджується з семантикою «журнал змін».

### 3.4. UI-форма (дзеркало екрана 1С зі скріншота)

- Шапка: `Номер` (авто, read-only), `Дата`, `Коментар`.
- Тулбар: **поле сканера ШК** (+камера) → додає рядок мішка; кнопки «Додати всі залишки» (як 1С «Добавить все остатки» — завантажити всі вільні лоти), «Заповнити сектор» (масово виставити сектор на виділені), «Друк етикеток» (перевикористати наявний друк ШК).
- Таблиця рядків: колонки як у 1С (Артикул/Номенклатура/Характеристика(вага)/ШК/Відкрит/Є відео/Цільовий/Ефір/Ефір на доставку/YouTube/Опис/Бронь(агент)/Контрагент/Період броні/Коментар/Сектор).
  - Бронь = селект **торгового агента** (User); Контрагент = **ClientPicker**; Сектор = селект `WarehouseSector` (+додати новий); булеві — чекбокси; Період броні — дата.
- Дві дії: **«Зберегти»** (чернетка) + **«Зберегти та провести»** (застосувати до лотів + історія).
- Портальні діалоги (не `window.confirm`, бо iframe-shell) для попереджень (напр. «мішок за ШК не знайдено»).

### 3.5. Права

Створення/проведення: `warehouse`, `admin`, `owner`. Інші ролі — лише перегляд (list/картка). Гард на рівні API (`requireRole`) + приховати кнопки в UI.

### 3.6. Тести

- Чисте ядро `buildBagStateApply`: мапінг полів, `endOfDay(reservedUntil)`, тригер відео (тільки коли newly-video + агент + клієнт), find-or-create сектора.
- API: create/update/post/cancel, гард ролей, гард «сьогоднішній документ», ідемпотентність історії.
- Реверс: видалення історії за реєстратором.

---

## 4. Кроки реалізації (для воркера)

1. **Міграція** `20260713_bag_state_change` (моделі + `Lot.sectorId` + `WarehouseSector.code`).
2. Backend: `bag-state.ts`, `bag-state-hooks.ts` (+ юніт-тести ядра), `validations/bag-state.ts`.
3. API-роути (list/create/get/update/post/cancel) + тести.
4. UI (список/форма/картка) + сканер ШК + селекти агента/клієнта/сектора + друк етикеток.
5. Навігація (пункт меню, доступ рольовий).
6. `typecheck` + `vitest` + `prettier` — зелені.

**Деплой:** `prisma migrate deploy` (`20260713`) → `prisma generate` → `deploy.ps1 -SkipInstall`. Реімпорт історії з 1С (опційно) — окремим `--entity bag-state` пізніше.

---

## 5. Відкриті дрібниці (дефолти, не блокують)

- «Копіювати документ» — **не робимо** (можна додати пізніше).
- Історичний імпорт `ИзменениеСостоянияМешка` з 1С MSSQL — окремим entity після основного функціоналу (модель готова прийняти `number1C/code1C`).
- Кнопка «Друк етикеток» — перевикористати наявний Code-39/label з блоку Поступлення.
