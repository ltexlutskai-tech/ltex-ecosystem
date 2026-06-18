# Сесія 5.6 — Автономний беклог (що Claude робить САМ, без user/сервера)

> Контекст: усі 8 фаз паритету 1С — у `main`@`dfbf3277`, задеплоєно. `cost-reg`
> (собівартість, 77674 рухів) і борг — перенесено. User тимчасово недоступний.
> Нижче — роботи, що НЕ потребують ані сервера, ані живого MSSQL, ані деплою —
> лише код у пісочниці + офлайн-дамп схеми `docs/1c-mssql-schema/`.

## ✅ МОЖУ ЗРОБИТИ САМ (sandbox-only)

### A. Декодування кодів MSSQL з офлайн-дампу (розблоковує ВСІ імпорти)

Дамп `docs/1c-mssql-schema/` містить `dbnames.txt` (UUID↔метадані), `columns.tsv`
(11.7к колонок), `tables.tsv`, `indexes.tsv` — цього достатньо, щоб декодувати
`_Fld`/`_AccumRg`/`_Document`/`_Reference` коди офлайн (як уже зроблено для
`_AccumRg5634` cost і `_AccumRg5269` debt). Заповнити мапи в `import-1c-historical.ts`
для:

- **sales-reg** (`AccumRg Продажи`) — виміри/ресурси (Номенклатура/Клієнт/Агент/Вес/Стоимость).
- **cashflow-reg** (`ДвиженияДенежныхСредств`) — Рахунок/Стаття/ПриходРасход/Сумма/СуммаУпр + Enum ПриходРасход.
- **stock-reg** (`ОстаткиТоваров` + `_AccumRg6608` вага) — Склад/Номенклатура/Качество/Кількість/Вес.
- **orders-reg** (`ЗаказыПокупателей`).
- **rates** (`_InfoRg4655 КурсыВалют`) — підтвердити коди EUR/USD.
- **dictionaries-full** — `_Reference` для Units/Cities/Regions/TradeAgents/ViberContacts.
- **bankdocs/cashtransfers** — `_Document` ПлатежноеПоручение Вх/Вих + ВнутреннееПеремещениеНаличных.
- **stock-documents** — `_Document` Возврат/ВозвратОтПокупателя/Перепаковка/Списание/Оприходование/Инвентаризация/Перемещение.
- **misc** — НормыЗапасов/СтатусДня (якщо знайдуться у дампі).
  Кожен код — з позначкою впевненості; entity лишаються поза `DEFAULT_ORDER`
  (user потім робить `--dry-run --confirm-prod` для звірки кількостей перед записом).
  **Результат:** user повертається й одразу ганяє імпорти без декодування на сервері.

### B. Крос-фазова інтеграція (воркери не могли — працювали ізольовано від бази)

- **Проведення документів Фази 5 → StockMovement.** Тепер обидві моделі в одній
  гілці. Вписати hooks: WriteOff/Repacking/Transfer/Inventory/StockAdjustment/
  Returns при проведенні пишуть рухи у `StockMovement` (як борг-hook).
- **ProductReturnFromCustomer → StockMovement(+)** (зараз лише борг-рух; склад TODO).
- **SalesMovement.costEur ← CostMovement** (опц. бекфіл для прямого джойну маржі).

### C. Полір Фази 7 (відкладено при інтеграції)

- Тематичне групування хабу «Звіти» (Продажі/Фінанси/Склад/Борг) + поле `theme`
  на всіх записах `REPORTS` у `registry-catalog.ts` + ReportTheme.
- Catalog-derived навігація `reports-nav` (зараз хардкод TABS).
- Кнопки XLSX на сторінках звітів Фаз 2/6 (sales-summary/cashflow/stock-balance/
  reconciliation) — зараз XLSX лише на generic-route звітах.

### D. Дрібні follow-ups

- **Customer.cityId/regionId FK** + backfill за назвою (Фаза 1 лишила як рядки).
- **unit на OrderItem/SaleItem/Lot** (Фаза 1 додала довідник Unit, але поле ніде не пишеться).
- Резолв назв вимірів у переглядачах регістрів (product/client hex → назва, batch-lookup).
- Тести на нові мапери/хелпери, де бракує.
- Прибрати дубль switch (csv-роут vs resolve-report) — уніфікувати на resolveReport.

### E. Документація

- `docs/1C_MSSQL_CODES.md` — карта декодованих кодів (entity → таблиця/колонки + впевненість).
- Уточнити деплой-runbook для решти entity.

## ⛔ ПОТРЕБУЄ USER/СЕРВЕРА (НЕ можу сам)

- Запуск імпортів проти живого MSSQL + прод-БД (`--entity ... --confirm-prod`).
- Звірка кількостей перенесеного з 1С-звітами.
- Деплой на Windows-сервер (`deploy.ps1`, `prisma migrate deploy`).
- Підтвердження декодованих кодів на живій базі (`sp_help`), де офлайн-дамп неоднозначний.
- Ротація пароля `ltex_app_reader`.

## Порядок виконання (автономно)

A (декодування) + B (hooks) + C (Phase 7 полір) паралельно → D (follow-ups) → E (docs).
Усе на гілку `claude/charming-ptolemy-40syy0` → merge у `main` (деплой робить user).
