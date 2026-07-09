# Маршрутний лист — доробка до паритету з центральною 1С (Блоки А/Б)

> Гілка `claude/route-block-audit-l32h5w` (перебазована на актуальний `main`).
> Аудит-основа: `docs/ROUTE_SHEET_BLOCK_AUDIT.md` + 3 дослідження сесії.
>
> **⚠️ Блок В (живі рухи продажів/каси) НЕ входить** — його вже реалізовано в
> `main` (`sale-movement-hooks.ts` + `cashflow-register.ts`). Ця гілка додає лише
> два унікальні блоки: пробіг→витрати (Б) і товар-у-дорозі (А).

## Блок Б — витрати на пробіг → рух грошей (міграція `20260713`)

**Проблема:** поля кілометражу були, але ні на що не перетворювались (у 1С пробіг
× ЦінаЗаКМ → витрата у грошові регістри).

- Схема: `RouteSheet.pricePerKm`; `RouteSheetExpense.{cashFlowArticleId, currency,
isMileage}`.
- `lib/manager/route-sheet-expenses.ts`: `computeMileage`/`computeMileageExpenseAmount`
  (чисті); `rebuildMileageExpense` — авто-рядок «Пальне/пробіг» = пробіг × ціна/км,
  стаття авто-резолвиться (пальне); `applyRouteSheetExpensesSafe` — при завершенні
  МЛ пише `CashFlowMovement` (розхід) на кожен рядок витрат (ключ `rsexp:{id}`).
- UI: кілометраж (початок/кінець) + ціна за км редаговані; вкладка «Витрати»
  редагована (стаття з довідника + сума; авто-рядок пробігу read-only з бейджем);
  друкована форма — ціна за км + таблиця витрат.
- API: `POST/DELETE /route-sheets/[id]/expenses` (ручні рядки; lock при completed).

## Блок А — регістр «товар у дорозі» (міграція `20260714`)

**Проблема:** лот при відправці одразу ставав `sold`, без проміжного стану (у 1С —
регістр ТоварыВДороге).

- Схема: модель `TransitMovement` (регістр «в дорозі», recordKind 0=в дорогу /
  1=з дороги; recorder = `RouteSheet.id`).
- Життєвий цикл лота (`route-sheet-actions.ts`):
  `free → (відправка) in_transit → (продаж) sold | (повернення) free`.
  - `dispatchRouteSheetLots` — завантажені лоти → `in_transit` (бронь знято);
  - `settleRouteSheetTransit` — при завершенні: продані у реалізаціях МЛ → `sold`,
    решта → `free` (назад на склад);
  - `returnRouteSheetLotsToStock` — розблокування у чернетку → `in_transit`→`free`.
- Рухи (`route-sheet-transit.ts`, best-effort): **лише** `TransitMovement`
  (+при відправці / −при завершенні). **Склад НЕ рухаємо** — складський баланс
  веде хук реалізації (`sale-movement-hooks.ts`, main), який списує проданий лот
  (у т.ч. маршрутний). Транзит — окремий паралельний регістр «що зараз у машинах»,
  без подвійного обліку.
- UI: лот `in_transit` показується бейджем «У дорозі».

## Деплой

`git pull` → `pnpm install` → `prisma migrate deploy` (`20260713_route_sheet_expenses`,
`20260714_transit_movements`) → `prisma generate` → `deploy.ps1 -SkipInstall`.
Обидві міграції additive/idempotent.

## Відкриті хвости (свідомо)

- Реверс рухів транзиту при розпроведенні спрощено (через lot-статус, не рухи).
- Стаття пального: авто-резолв за назвою (пальне/пробіг/ПММ) — user може задати вручну.
