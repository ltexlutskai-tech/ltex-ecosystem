# Сесія 5.9 — автономна код-робота (пункти 2–3 продакшн-чек-листа)

> Контекст: `docs/STEP1_RECONCILIATION_CHECKLIST.md` → секція «🚀 ВИХІД У ПРОДАКШН».
> Ця сесія робить лише те, що **не потребує живого MSSQL/сервера/деплою** — код у
> пісочниці на гілці `claude/charming-ptolemy-40syy0` → merge у `main` (деплой + реімпорт робить user).
> Основний скрипт імпорту: `apps/store/scripts/import-1c-historical.ts`.
> Офлайн-схема 1С: `docs/1c-mssql-schema/columns.tsv` + `docs/1C_MSSQL_CODES.md`.
> **Обовʼязково:** `pnpm --filter @ltex/store exec tsc --noEmit` + `vitest run` (зачеплені) + `prettier --write` перед комітом.

## Задача 1 — Назви кас у ДДС (Кассы `_Reference56`)

**Проблема:** у звіті/переглядачі ДДС рахунки-каси показують hex-код замість назви,
бо `accountNameByCode` резолвиться лише з `mgr_bank_accounts` (банк-рахунки `_Reference29`),
а каси — окремий довідник `_Reference56` Кассы, який не імпортується.

**Рішення:** імпортувати Кассы у ту саму модель `MgrBankAccount` (обидва — «рахунки»;
`cashflow-flex.ts::resolveMaps` вже читає `mgrBankAccount` по `code1C`). Схема НЕ міняється.

- `_Reference56` колонки: `_IDRRef`(PK), `_Folder`(0x01=папка→пропустити), `_Code`(nchar9),
  `_Description`(nvarchar), валюта `_Fld6004RRef` (не потрібна тут).
- Новий `importCashRegisters(ctx)` (патерн `importWarehouses`/`importBankAccounts`): upsert у
  `mgrBankAccount` по `code1C`=hex(\_IDRRef), `name`=\_Description||hex, пропускати папки.
  Зареєструвати `ctx.bankAccountByHex.set(hex, id)`.
- Викликати всередині раннера `--entity dictionaries` (`importDictionaries`, поряд з `importBankAccounts`).
- **Реімпорт user:** `--entity dictionaries`.

## Задача 2 — Вага у stock-reg (JOIN `_AccumRg6608`)

**Проблема:** `importStockRegister` пише `weightKg=null` (TODO Фаза 2.1 ~рядок 4640) — ваговий
баланс складу неповний. Вага лежить у окремому регістрі `_AccumRg6608` (ТовариНаСкладахУВазі).

**Рішення:**

- Декодувати колонки `_AccumRg6608` з `columns.tsv` (структура як `_AccumRg5788`: `_RecorderRRef`,
  `_LineNo`, ресурс-вага `_FldNNNN`, `_Active`). Перевірити anchor: ресурс — numeric(15).
- Побудувати мапу `weightByRecorderLine: Map<"<recorderHex>#<lineNo>", number>` з `_AccumRg6608`
  (тільки `_Active=0x01`) ДО стріму `_AccumRg5788`.
- У циклі stock-reg проставити `weightKg = weightByRecorderLine.get(key) ?? null`.
- **Реімпорт user:** `--entity stock-reg`.
- Якщо код ресурсу-ваги неоднозначний — лишити позначку `// TODO: підтвердити _Fld на живому MSSQL`
  і НЕ ламати наявну поведінку (fallback null).

## Задача 3 — Друк касового ордера (КО-1 / КО-2)

**Проблема:** немає друку касового ордера (у Реалізації/Замовлення/Поступлення друк є).

**Рішення:** нова сторінка `app/manager/(workstation)/payments/[id]/print/page.tsx` за патерном
`sales/[id]/print/page.tsx` (A4 + `@media print` + `COMPANY_REQUISITES` з `lib/constants/company.ts`).

- Прибутковий (Приход) → **КО-1**, Видатковий (Расход) → **КО-2** (за `MgrCashOrder` полем виду).
- Показати: №/дата, контрагент, сума (₴ + € довідково), стаття руху, підстава (реалізація),
  «Прийняв/Видав». Дані з `MgrCashOrder` (+ реалізація/клієнт).
- Додати кнопку «Друк» на `payments/[id]/page.tsx`.

## Задача 4 — Друк маршрутного листа

**Проблема:** немає друку маршрутного листа.

**Рішення:** нова сторінка `app/manager/(workstation)/routes/[id]/print/page.tsx` (A4 + `@media print`).

- Шапка: №/дата, експедитор/водій, маршрут (comment), кілометраж.
- Таблиця зупинок/замовлень (RouteSheetOrder/RouteSheetItem) — клієнт/адреса/товари/сума.
- Кнопка «Друк» на `routes/[id]/page.tsx`.

## ⛔ НЕ в цій сесії (потребує user/сервера)

- bankdocs/cashtransfers dry-run+звірка на живому MSSQL (код мапперів вже є; лише перевірити/дочистити за потреби — це можна, але саму звірку робить user).
- Будь-які `--confirm-prod` імпорти, `deploy.ps1`, `prisma migrate deploy`.

## Порядок

Задача 1 + 2 (обидві в `import-1c-historical.ts` — робити послідовно) → 3 + 4 (окремі UI-файли).
Кожна задача: код → typecheck → vitest (зачеплені) → prettier → commit. Наприкінці — оновити
`docs/STEP1_RECONCILIATION_CHECKLIST.md` (позначити пункти 2–3 що зроблено в коді, чекають реімпорту/деплою)

- додати запис у `CLAUDE.md`.
