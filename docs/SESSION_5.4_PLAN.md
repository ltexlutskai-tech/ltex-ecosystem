# SESSION 5.4 PLAN — добудова паритету з 1С (старт із 5.4.0)

## Контекст із 5.3 (2026-06-10)

Фаза A (3 баги імпорту) — код готовий на гілці `claude/modest-franklin-qvo4kk`:
A1 дати (`_YearOffset` віднімається), A2 суми (тотали з рядків), A3 дочірні
VT маршрутного. **User мав зробити реімпорт на сервері** (orders, sales,
cashorders, routesheets) — звірити, що дати = 2021-2026, суми ≠ 0, вкладки
маршрутного заповнені. ⚠️ Якщо ще не зроблено — зробити перед 5.4.

Фаза B — повний аудит паритетності: `docs/PARITY_AUDIT_{orders,sales,cash,
routes,client,prices}.md` + зведення `docs/PARITY_SUMMARY.md` (пріоритетна
черга §3).

**Рішення user (2026-06-10):** 5.4 починаємо з **5.4.0 — additive міграції +
розширення імпортера** (`PARITY_SUMMARY §0`).

---

## 5.4.0 — Additive міграції + імпортер (ця сесія, перша)

Мета: додати поля, яких бракує проти 1С, ДО будь-якого нового дозбору з 1С
(інакше дані губляться). Усі міграції **additive, idempotent** (патерн
`DO $$ ... EXCEPTION` / `IF NOT EXISTS`, як попередні).

### Схема (`packages/db/prisma/schema.prisma` + нова міграція)

| Модель | Нові поля | 1С-джерело (колонка) |
|---|---|---|
| `MgrClient` | `email String?`, `legalType String?` (ЮрФізЛицо), `inn String?`, `edrpou String?`, `fullName String?` (НаименованиеПолное), `comment String?` (Комментарий), `additionalDescription String?` (ДополнительноеОписание), `parentClientId String?` (ГоловнойКонтрагент, self-FK), `workingHours String?` (РасписаниеРаботыСтрокой) | `_Reference66` — uточнити `_Fld` номери через `docs/1c-mssql-schema/columns.tsv` + `Catalogs/Контрагенты.xml` |
| `Lot` | `onAir Boolean @default(false)` (Ефір `_Fld7729`), `onAirDelivery Boolean @default(false)` (ЕфірНаДоставку `_Fld7730`) | `_Reference113` |
| `Sale` | `orderId String?` (FK Order, Сделка/Заказ) | `_Document189` — знайти FK-колонку на `_Document130` через columns.tsv |
| `OrderItem` | `unitPriceEur Float?` (ЦінаПродажіВес), `discountPercent Float?` (ПроцентСкидкиНаценки) | `_Document130_VT1098` (`_Fld6618` вже читаємо як ЦінаПродажіВес — тепер persist) |

⚠️ Перед написанням міграції — **знайти точні `_Fld`-номери** нових полів
`Контрагента` (email/ИНН/ЕДРПОУ/full name/parent/working hours) через
`Catalogs/Контрагенты.xml` (UUID атрибута) → `dbnames.txt` (`"Fld",N`) →
перевірити у `columns.tsv` (`_Reference66`). Той самий recipe, що для маршрутних VT.

### Імпортер (`apps/store/scripts/import-1c-historical.ts`)

- `importCustomers`: дописати нові `MgrClient` поля (email/inn/edrpou/fullName/
  comment/additionalDescription/workingHours) + `parentClientId` (резолв
  ГоловнойКонтрагент hex → Customer/MgrClient; 2-pass або post-link, бо
  батько може йти після дитини).
- `importLots`: дописати `onAir`/`onAirDelivery`.
- `importSales`: резолвити Сделка/Заказ → `Sale.orderId` (hex → Order; orders
  імпортуються перед sales — резолв через ctx.orders/target DB).
- `importOrders`: persist `OrderItem.unitPriceEur` (= вже зчитуваний `_Fld6618`)
  + `discountPercent` (знайти колонку).
- Реімпорт після міграції: `customers, lots, orders, sales` (idempotent upsert).

### Перевірка (orchestrator)
`prettier --check` + (typecheck/тести **не** ганяються у пісочниці — немає
node_modules; CI зробить після install). Звірити nullability нових полів.

---

## Далі (черга §3, після 5.4.0) — за рішенням user перед кожною

- **5.4.1 Картка клієнта** (швидкі перемоги): Історія продаж tab + показ полів + нові поля у формі.
- **5.4.2 Реалізація↔Замовлення** (T2): Sale.orderId UI + «Продано» + форма «реалізація із замовлення» + блок «Закриття старих замовлень».
- **5.4.3 Маршрутний лист**: дії при «Відправлено» (бронь/актуальність) + Витрати + поля Авто/Склад/ЦінаЗаКМ + курс-знімок.
- **5.4.4 Друк-підсистема** (T1): спільний PDF → Накладна / Рахунок / КО-1,2 / Маршрутний.
- **5.4.5 Борг + Каса-структура** (T3): перерахунок боргу при проведенні + мульти-валютна каса + корекція боргу. (Повний debt-імпорт з `_AccumRg…` — окремо.)

## Робочий процес — без змін
Orchestrator: план → спека воркеру (Agent) → перевірка (`git diff` +
prettier; тести/typecheck у CI) → коміт на feature-гілку → мердж у main →
диктує деплой user-у (для DB-міграцій: `prisma migrate deploy`). Воркери
кодять. Спілкування з user — простою мовою.
