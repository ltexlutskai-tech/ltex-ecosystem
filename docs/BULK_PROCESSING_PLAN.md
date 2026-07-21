# План: «Групова обробка» (bulk-edit) довідників та документів

Аналог 1С-обробки **«Групповая обработка справочников и документов»** — вибрати
багато об'єктів (товари, клієнти, документи), масово встановити значення
реквізиту або виконати дію над усім набором одразу.

Статус: **дослідження + план**. Код застосунку НЕ змінювався.

---

## 1. Як це працює в 1С

### Ключові файли

| Що                               | Шлях                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Метадані обробки                 | `docs/1c-export-2026-06-02/DataProcessors/ГрупповаяОбработкаСправочниковИДокументов.xml`                       |
| Головна форма (логіка)           | `.../ГрупповаяОбработкаСправочниковИДокументов/Forms/Форма/Ext/Form.bin` (бінарна, 1С 8.2 — BSL нечитабельний) |
| Вибір таблиці/об'єкта            | `.../Forms/ФормаВыбораТаблицы.xml` + `.../ФормаВыбораТаблицы/Ext/Form.bin`                                     |
| Вибір реквізиту для зміни        | `.../Forms/ФормаВыбораРеквизита.xml` + `.../Ext/Form.bin`                                                      |
| Форма налаштувань                | `.../Forms/ФормаНастройки.xml`                                                                                 |
| ObjectModule (лише друк реєстру) | `.../Ext/ObjectModule.bsl` → процедура `ПечатьРеестра(МассивДокументов, …)`                                    |

> Форми зберігаються у бінарному `Form.bin` (стара конфігурація на 1С 8.2), тому
> точний BSL форми недоступний. Проте це **типова універсальна обробка 1С**, її
> модель однозначно читається з реквізитів метаданих + назв форм.

### Модель обробки (з реквізитів `ГрупповаяОбработкаСправочниковИДокументов.xml`)

Атрибути самої обробки (`grep <Name>`):

- `ВыполнятьВТранзакции` — виконувати зміни у транзакції (все або нічого).
- `ФлагИзмененияРеквизитов` — режим: **міняти реквізити** vs **виконувати дію**.
- `ПоказыватьВсеКолонки` — показувати всі колонки знайдених об'єктів.
- `ОтборПоСвойствам`, `ОтборПоКатегориям` — додаткові фільтри (по властивостях
  об'єкта та категоріях).
- `ОграничениеНаСтрокиНеограниченнойДлины` — тех. обмеження на довгі рядки.

### Робочий цикл користувача (класика 1С)

1. **Вибір об'єкта обробки** (`ФормаВыбораТаблицы`) — обрати тип: довідник
   (`Справочник.Номенклатура`, `Справочник.Контрагенты`, …) або документ, і
   конкретну таблицю/табличну частину.
2. **Побудова відбору (Отбор)** — умови (`поле` `вид порівняння` `значення`)
   - `ОтборПоСвойствам`/`ОтборПоКатегориям` → визначають, які об'єкти потраплять
     у набір.
3. **«Отобрать»** — заповнюється таблиця знайдених об'єктів із **прапорцями**
   (галочка на кожному рядку — можна зняти окремі).
4. **Обробка** — два режими (`ФлагИзмененияРеквизитов`):
   - **Зміна реквізитів**: обрати реквізит (`ФормаВыбораРеквизита`) → задати нове
     значення → застосувати до всіх відмічених.
   - **Дії над об'єктами**: стандартні — `Провести`, `Отменить проведение`,
     `Установить пометку удаления`, `Снять пометку удаления`, друк реєстру
     (`ПечатьРеестра` з `ObjectModule.bsl`).
5. **«Выполнить»** — застосувати; за прапорцем `ВыполнятьВТранзакции` — атомарно.

Ключова суть: **generic reflection над метаданими** — обробка вміє показати будь-який
реквізит будь-якого об'єкта і присвоїти йому значення потрібного типу.

---

## 2. Наш підхід

### 2.1. Reuse vs new — рішення: **узагальнити наявний прецедент**

У нас уже є мінімальна групова обробка для клієнтів (зміна менеджера):

- UI: `apps/store/app/manager/(workstation)/customers/_components/client-list-bulk.tsx`
  — колонка-чекбокс + «вибрати всіх на сторінці» + липка панель дій унизу
  (стан `selected: Set<string>`).
- API: `apps/store/app/api/v1/manager/clients/bulk-assign/route.ts` —
  `requireRole(["admin","owner"])` → `bulkAssignSchema` → фільтр існуючих id →
  `$transaction([deleteMany, createMany])`.

Це **вузько-спеціалізований** (лише менеджер, лише клієнт). Замість плодити такі
ендпоінти під кожне поле, будуємо **один generic механізм «Групова обробка поля»**
і переводимо на нього наявну зміну менеджера як окремий випадок.

### 2.2. Архітектура reusable «bulk field apply»

**Реєстр полів (єдине джерело правди)** — `apps/store/lib/manager/bulk-edit/registry.ts`:

```
type BulkFieldType = "text" | "enum" | "boolean" | "fk" | "number" | "null-set";

interface BulkFieldDef<Entity> {
  key: string;                 // ключ поля у UI/payload (whitelist)
  label: string;               // укр. підпис
  column: string;              // реальне Prisma-поле (для guarded update)
  type: BulkFieldType;
  options?: () => Promise<{ value: string; label: string }[]>; // для enum/fk
  roles: ReadonlySet<ManagerRole>; // хто може масово міняти саме це поле
  // опційна валідація/нормалізація значення
  parse?: (raw: unknown) => unknown;
}

interface BulkEntityDef {
  entity: "product" | "mgr_client";      // ← MVP
  label: string;                          // «Товари», «Клієнти»
  fields: BulkFieldDef[];
  // будівник where для «застосувати до всіх за фільтром»
  buildWhere: (filter: unknown, viewer: Viewer) => Prisma.WhereInput;
  apply: (ids: string[], field, value, tx) => Promise<number>;
}
```

Allow-list полів **у коді, а не з клієнта** — клієнт шле лише `entity`, `fieldKey`,
`value`, і **або** список `ids`, **або** `filter` (для select-all). Сервер сам
резолвить `column` та тип. Це закриває ін'єкцію довільних полів.

**Єдиний ендпоінт**: `POST /api/v1/manager/bulk-edit`

```jsonc
{
  "entity": "product",
  "fieldKey": "packaging",
  "value": "box", // null → скинути значення
  "scope": { "mode": "ids", "ids": ["...", "..."] },
  // АБО: "scope": { "mode": "filter", "filter": { ...ті самі query-параметри списку } }
}
```

Серверний алгоритм:

1. `requireRole` за `field.roles` (не за загальним доступом до entity).
2. Резолвити `entityDef` + `fieldDef` з реєстру; невідоме поле/entity → 400.
3. Нормалізувати/валідувати `value` через `field.parse` + Zod (тип за `field.type`).
4. Визначити набір id:
   - `mode:"ids"` — перетнути з реально наявними (як у `bulk-assign`);
   - `mode:"filter"` — `buildWhere(filter, viewer)` (**той самий** where, що й у
     списку, з урахуванням ownership) → `findMany({ where, select:{ id } })`.
     Ліміт (напр. 5000) + повернути `matched`.
5. `prisma.$transaction` → `updateMany({ where:{ id:{ in: ids } }, data:{ [column]: value } })`
   (для FK-звʼязків типу «менеджер клієнта» — спец-`apply`, бо це не скалярне поле,
   а `ClientAssignment`).
6. `logAuditEvent({ action:"update", resource:`bulk:${entity}.${fieldKey}`, summary:`N об'єктів → value`, dataAfter })`
   (helper уже є: `apps/store/lib/audit/audit-log.ts`).
7. Відповідь `{ updated, matched, skipped }`.

**UI** — reusable `BulkProcessingBar` + `BulkFieldDialog`:

- Узагальнити `client-list-bulk.tsx` → спільний хук `useBulkSelection` (Set id,
  toggle, toggle-all-on-page, clear) + `useSelectAllMatching` (чекбокс «Обрати всі
  N за фільтром» — тримає `mode:"filter"` замість переліку id).
- Липка панель: «Обрано N» → кнопка **«Групова обробка»** → діалог: `select` поля
  (лише дозволені ролі) → контрол значення за `field.type` (text input / `select`
  для enum+fk / checkbox для boolean / «— скинути —» для null-set) → «Застосувати».
- Показувати поля лише ті, що дозволені ролі поточного користувача.

### 2.3. Модель вибірки (selection)

- **Checkbox ids** (за замовчуванням) — точний контроль, як зараз у клієнтів.
- **Select-all-matching-filter** (опційно) — коли обрано «всі на сторінці», зверху
  зʼявляється банер «Обрано 20 на сторінці. **Обрати всі 347 за фільтром →**».
  Тоді scope=`filter`, а сервер сам добирає набір через `buildWhere`. Where-білдери
  вже існують: клієнти — `buildClientsWhere` (`.../customers/_lib/load-clients.ts`),
  товари — `load-prices.ts`. Для товарів менеджерський список — `prices-list.tsx`.

### 2.4. Права (role gates)

- Per-field, не per-entity. Приклад: `packaging`, `receiptName`, `categoryId`,
  `archived`, `inStock`, `markedForDeletion` для товару → `CATALOG_MANAGER_ROLES`
  (`admin/owner/warehouse`, `apps/store/lib/manager/catalog-permissions.ts`);
  зміна `categoryId` (структурна) → `CATALOG_STRUCTURE_ROLES` (`admin/owner`).
- Клієнти: зміна менеджера/статусу/тегів → `admin/owner` (як наявний `bulk-assign`),
  або відповідні ролі за політикою RBAC (`getSidebarSections`/middleware-manager).
- Для `mode:"filter"` ownership обовʼязково через той самий `buildWhere(viewer)`,
  щоб менеджер не зачепив чужих клієнтів.

### 2.5. Аудит

Кожна масова операція → один запис `audit_logs` (`logAuditEvent`, append-only) із
`resource="bulk:<entity>.<field>"`, `summary` (значення + кількість), `dataAfter`.
Достатньо для «хто/коли/що масово змінив». Опційно — зберігати перелік id у
`dataBefore` для потенційного відкату (див. ризики).

---

## 3. Сутності та поля для масового редагування (MVP: Product + MgrClient)

Джерело схеми: `packages/db/prisma/schema.prisma`.

### Product (номенклатура)

| Поле (column)       | fieldKey          | Тип значення            | Роль                    | Нотатки                                                          |
| ------------------- | ----------------- | ----------------------- | ----------------------- | ---------------------------------------------------------------- |
| `packaging`         | packaging         | enum: `box`/`bag`/null  | catalog                 | **Пріоритет user** — коробка/мішок для авто-РО (спец-вантаж НП). |
| `receiptName`       | receiptName       | text                    | catalog                 | Назва для друку/чеків Checkbox.                                  |
| `categoryId`        | category          | fk (Category, каскадер) | structure (admin/owner) | Структурна зміна; впливає на видимість.                          |
| `producer`          | producer          | fk/text (MgrProducer)   | catalog                 | Виробник.                                                        |
| `quality`           | quality           | enum (список сортів)    | catalog                 | Екстра/Крем/1-й/…                                                |
| `inStock`           | inStock           | boolean                 | catalog                 | В наявності.                                                     |
| `archived`          | archived          | boolean                 | structure               | ТЗ 8.0 архів/soft-delete.                                        |
| `markedForDeletion` | markedForDeletion | boolean                 | structure               | Позначка на вилучення.                                           |
| `isOversize`        | isOversize        | boolean                 | catalog                 | Габаритний.                                                      |
| `season`            | season            | enum                    | catalog                 | Сезон.                                                           |
| `country`           | country           | enum                    | catalog                 | Країна.                                                          |
| `gender`            | gender            | enum                    | catalog                 | Стать.                                                           |

### MgrClient (контрагенти)

| Поле (column)                                 | fieldKey          | Тип значення           | Роль        | Нотатки                                                            |
| --------------------------------------------- | ----------------- | ---------------------- | ----------- | ------------------------------------------------------------------ |
| менеджер (`ClientAssignment` + `agentUserId`) | manager           | fk (User)/null         | admin/owner | **Наявний випадок** — перевести на generic.                        |
| `statusGeneralId`                             | statusGeneral     | fk (MgrClientStatus)   | admin/owner | Статус клієнта.                                                    |
| `statusOperationalId`                         | statusOperational | fk                     | admin/owner | Оперативний статус.                                                |
| `deliveryMethodId`                            | deliveryMethod    | fk (MgrDeliveryMethod) | admin/owner | Спосіб доставки.                                                   |
| `categoryTTId`                                | categoryTT        | fk                     | admin/owner | Категорія ТТ.                                                      |
| `primaryRouteId`                              | primaryRoute      | fk (MgrRoute)          | admin/owner | Маршрут.                                                           |
| `keywords`                                    | keywords          | text (append/replace)  | admin/owner | Теги — розглянути режим «додати тег» до наявних (не лише replace). |
| `archived`                                    | archived          | boolean                | admin/owner | Архів.                                                             |
| `markedForDeletion`                           | markedForDeletion | boolean                | admin/owner | Позначка на вилучення.                                             |

> `npAddressMatchedAt`, борги (`debt`/`overdueDebt`), `phoneKey` — **не** для ручного
> масового редагування (обчислювані/системні), у реєстр не додаємо.

### Документи — пізніший етап

Замовлення / Реалізації / Оплати: масові дії (не «зміна поля»): `archived`,
`isActual`, `status`-переходи (напр. масове «закрити»), масове призначення агента.
Дії мають ту саму guarded-логіку, але через доменні хелпери (наприклад
`route-sheet-actions`, order-status transitions), не сирим `updateMany` — бо
проведення документа рухає регістри.

---

## 4. Поетапність

**MVP (етап 1) — Product bulk-set.** Реєстр `bulk-edit/registry.ts` + ендпоінт
`POST /api/v1/manager/bulk-edit` + `BulkProcessingBar`/`BulkFieldDialog`, підключені
до менеджерського списку товарів (`prices-list.tsx`). Поля: **`packaging`
(коробка/мішок)**, `receiptName`, `categoryId`. Scope: checkbox ids +
select-all-page (без filter-scope спершу). Аудит + role gates.

**Етап 2 — select-all-matching-filter.** Додати `scope:"filter"` через
`buildWhere`, банер «Обрати всі N за фільтром», ліміт + `matched`.

**Етап 3 — MgrClient.** Перевести наявну зміну менеджера на generic реєстр
(`bulk-assign` → тонкий adapter або депрекейт), додати статуси/доставку/теги.
Режим «додати тег» для `keywords`.

**Етап 4 — документи.** Масові дії над Замовленнями/Реалізаціями через доменні
хелпери (не сирий `updateMany`): архів, закриття, призначення агента.

**Етап 5 (опційно) — паритет 1С.** Друк реєстру відібраних (аналог `ПечатьРеестра`),
збереження «вибірок» обробки, прапорець «у транзакції» як явна опція UI.

---

## 5. Ризики та обмеження

- **Масштаб апдейту.** `updateMany` по тисячах рядків у транзакції може блокувати
  таблицю. Пом'якшення: ліміт набору (напр. 5000), батчі, індекси на where-полях
  (для товарів вони переважно є).
- **Права.** Небезпека дати менеджеру масову зміну чужих обʼєктів — тому role gate
  **per-field** + ownership у `buildWhere` для filter-scope обовʼязкові. Whitelist
  полів **лише серверний**.
- **Скасування (undo).** `updateMany` не зберігає попередні значення пофайлово.
  Для справжнього відкату треба спершу зчитати `id → old value` і покласти у
  `dataBefore` аудиту (дорого при великих наборах). MVP: без авто-undo, лише аудит-
  слід; для критичних полів (`categoryId`, `archived`) — писати `dataBefore`.
- **Побічні ефекти доменних полів.** `categoryId` змінює видимість у каталозі
  (`getHiddenCategoryIds`); проведення/статуси документів рухають регістри. Тому
  такі поля — через доменні хелпери + `revalidatePath`, не сирий апдейт.
- **Ідемпотентність.** Операція природно ідемпотентна (встановлення значення). Для
  режиму «додати тег» (`keywords`) потрібна дедуплікація, щоб повтор не дублював тег.
- **Tailwind purge / iframe-нюанси** менеджерки (див. CLAUDE.md) — діалог робити на
  наявних `@ltex/ui` компонентах; уникати `window.confirm` (блокується в iframe) —
  підтвердження робити inline-діалогом.
