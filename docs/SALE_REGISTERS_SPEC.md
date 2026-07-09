# ТЗ — Проведення реалізації в регістри + доробки форми продажу

> **Для:** Claude Code (worker).
> **Гілка розробки:** `claude/realizacii-functionality-audit-hg9den`.
> **Основа:** аудит блоку «Реалізації» (`docs/REALIZATION_BLOCK_AUDIT.md`, `docs/REALIZATION_BLOCK_PLAN.md`) + звіт про регістри накопичення.
> **⚠️ Міграцій НЕ потрібно** — усі таблиці регістрів (`SalesMovement`, `StockMovement`, `CostMovement`, `MgrDebtMovement`) уже існують у схемі. Це лише application-код.

---

## 0. Мета і філософія

L-TEX **не веде бухгалтерію** — тому синхронізацію/вивантаження в 1С та бухгалтерські регістри (ПДВ, каса, партіонний облік регламентний) **НЕ робимо**. Але **управлінський облік** — залишки складу, обороти продажів, собівартість/маржа — треба довести до паритету з 1С: коли менеджер **проводить реалізацію** у нашій системі, документ має **рухати регістри** так само, як це робить проведення в 1С.

**Зараз (проблема):** проведення реалізації (`status=posted`) пише live лише **рух боргу** (`MgrDebtMovement`). Регістри `SalesMovement` (продажі/виручка), `StockMovement` (склад/залишки), `CostMovement` (собівартість) наповнені **тільки історичним імпортом з 1С** — нові продажі туди не потрапляють. Через це звіти «Залишки складу», «Обороти продажів», «Маржа/Валовий прибуток» не бачать продажів, зроблених у нашій системі.

**Після цього ТЗ:** проведення реалізації додатково пише `StockMovement` (розхід), `SalesMovement` (продаж), `CostMovement` (собівартість) — і всі три звіти автоматично почнуть відображати нові продажі.

**Патерн-зразок для дзеркалення:** `apps/store/lib/manager/stock-movement-hooks.ts` (`applyStockDocumentMovements` / `removeStockDocumentMovements`) + `apps/store/lib/manager/debt-register.ts` (`applyDebtMovementSafe`). Робимо точно за цим стилем: **fire-and-forget, best-effort, ніколи не кидає (лише `console.warn`), ідемпотентно.**

---

## Обсяг

| #     | Задача                                                                                                   | Пріоритет  |
| ----- | -------------------------------------------------------------------------------------------------------- | :--------: |
| **A** | Проведення реалізації → рухи `StockMovement` + `SalesMovement` + `CostMovement` (+ реверс при видаленні) | 🔴 головне |
| **B** | Контроль відхилення ціни > 0.20 EUR (попередження перед проведенням)                                     |     🟢     |
| **C** | Перевірка чужої броні мішка при скані ШК                                                                 |     🟢     |
| **D** | «Повторити ціну» — **верифікувати** (вже реалізовано) + опційне контекст-меню                            |     🟢     |

**НЕ робимо** (за рішенням user — немає живого 1С): реальний sync/вивантаження в 1С; регламентну бухгалтерію (ПДВ, книги, партіонний облік). Прапорець `exportTo1C` **залишаємо як є** — він керує лише семантикою «проводити/не проводити» і зберігається на документі, нікуди не передається.

---

## Частина A — Проведення реалізації в регістри (головне)

### A1. Новий модуль `apps/store/lib/manager/sale-movement-hooks.ts`

Створити за зразком `stock-movement-hooks.ts`. Дві публічні функції:

```ts
export function applySaleMovements(saleId: string): void; // fire-and-forget
export function removeSaleMovements(saleId: string): void; // fire-and-forget
```

#### `applySaleMovements(saleId)`

1. Завантажити реалізацію з рядками:
   ```ts
   const sale = await prisma.sale.findUnique({
     where: { id: saleId },
     select: {
       id: true,
       code1C: true,
       createdAt: true,
       assignedAgentUserId: true,
       customer: { select: { code1C: true } },
       items: {
         select: {
           id: true,
           productId: true,
           lotId: true,
           barcode: true,
           weight: true,
           quantity: true,
           priceEur: true,
           product: { select: { code1C: true, priceUnit: true } },
           lot: { select: { purchasePriceEur: true } },
         },
       },
     },
   });
   if (!sale || sale.items.length === 0) return;
   ```
2. **Ключ реєстратора** (важливо): `const recorder = sale.code1C ?? sale.id;`
   - Нові реалізації мають `code1C = null` → використовуємо `sale.id` (cuid). Колізій з історичними hex-реєстраторами немає.
3. **Собівартість рядка** (€/кг): `lot.purchasePriceEur` якщо є; інакше — остання закупівельна ціна товару з `PurchasePrice` (див. A2); інакше `0`.
4. Для кожного рядка (`lineNo` = індекс+1) сформувати три рухи:

   **StockMovement — розхід зі складу** (`recordKind = 1`):

   ```ts
   {
     occurredAt: sale.createdAt,
     recorderCode1C: recorder,
     lineNo,
     warehouseCode1C: null,                 // реалізація не фіксує склад
     productCode1C: product.code1C ?? item.barcode ?? `sale-item:${item.id}`,
     productId: item.productId,
     lotCode1C: item.barcode ?? null,
     quality: null,
     qty: round3(item.quantity),            // к-сть мішків/одиниць
     weightKg: item.product.priceUnit === "kg"
       ? round3(item.weight * item.quantity) // сумарна вага рядка
       : null,
     recordKind: 1,
   }
   ```

   **SalesMovement — продаж** (`recordKind = 0`):

   ```ts
   {
     occurredAt: sale.createdAt,
     recorderCode1C: recorder,
     lineNo,
     productCode1C: product.code1C ?? item.barcode ?? `sale-item:${item.id}`,
     productId: item.productId,
     lotCode1C: item.barcode ?? null,
     clientCode1C: sale.customer?.code1C ?? null,
     agentCode1C: agentCode1C,              // резолв assignedAgentUserId→User.code1C (A3); null якщо нема
     orderCode1C: null,
     saleCode1C: recorder,
     qty: round3(item.quantity),
     weightKg: item.product.priceUnit === "kg" ? round3(item.weight * item.quantity) : null,
     revenueEur: round2(item.priceEur),                    // priceEur рядка = сумарна ціна позиції
     revenueNoDiscountEur: round2(item.priceEur),          // знижок у нас немає → те саме
     costEur: null,                                        // собівартість читається з CostMovement, тут null
     recordKind: 0,
   }
   ```

   **CostMovement — собівартість**:

   ```ts
   {
     recorderCode1C: recorder,
     lineNo,
     productCode1C: product.code1C ?? item.barcode ?? `sale-item:${item.id}`,
     productId: item.productId,
     qty: round3(item.quantity),
     costEur: round2(costPerKg * item.weight * item.quantity), // аналогічно виручці
     occurredAt: sale.createdAt,
   }
   ```

5. **Запис — delete-then-create** (щоб при повторному проведенні/редагуванні не лишалось «мертвих» рядків, бо `SaleItem` замінюються повністю):
   ```ts
   await prisma.$transaction([
     prisma.stockMovement.deleteMany({ where: { recorderCode1C: recorder } }),
     prisma.salesMovement.deleteMany({ where: { recorderCode1C: recorder } }),
     prisma.costMovement.deleteMany({ where: { recorderCode1C: recorder } }),
     prisma.stockMovement.createMany({ data: stockRows }),
     prisma.salesMovement.createMany({ data: salesRows }),
     prisma.costMovement.createMany({ data: costRows }),
   ]);
   ```
   (Це надійніше за `upsert` по рядках і уникає stale-рядків — на відміну від наявного `applyStockDocumentMovements`, який може лишати зайві рядки при зменшенні кількості позицій.)
6. Обгорнути все у `void (async () => {...})().catch((e) => console.warn("[L-TEX] Failed to apply sale movements", {...}))`.

> **Одиниці:** для вагового товару (`priceUnit === "kg"`) заповнюємо `weightKg` (сумарна вага рядка); для штучного/парного (`шт`/`пара`) — `weightKg = null`, а `qty` = кількість одиниць. `costEur`/`revenueEur` рахуються однаково як `perUnit × weight × quantity` — щоб маржа й виручка сходилися рядок-у-рядок.

#### `removeSaleMovements(saleId)`

Прибирає всі рухи документа (при видаленні). Реєстратор той самий (`sale.code1C ?? sale.id`) — але оскільки при DELETE документ ще існує до транзакції, можна прийняти `recorder` як параметр або обчислити з `saleId` до видалення. Просте рішення — приймати обидва ключі:

```ts
export function removeSaleMovements(recorder: string): void {
  void (async () => {
    await prisma.$transaction([
      prisma.stockMovement.deleteMany({ where: { recorderCode1C: recorder } }),
      prisma.salesMovement.deleteMany({ where: { recorderCode1C: recorder } }),
      prisma.costMovement.deleteMany({ where: { recorderCode1C: recorder } }),
    ]);
  })().catch((e) => console.warn("[L-TEX] Failed to remove sale movements", { recorder, error: ... }));
}
```

Хелпери `round2`/`round3` — скопіювати локально (як у сусідніх модулях).

### A2. Джерело собівартості (costPerKg)

Пріоритет:

1. `item.lot.purchasePriceEur` (€/кг конкретної партії) — якщо `lotId` заданий і поле не null.
2. Остання закупівельна ціна товару: `PurchasePrice` за `productId`, `orderBy: { validFrom: "desc" }`, `take: 1` → `priceEur`. (Та сама логіка, що в endpoint `apps/store/app/api/v1/manager/warehouse/last-purchase-price/route.ts`, але напряму через `prisma.purchasePrice`, batch-ом для всіх productId рядків одразу.)
3. `0` (рух усе одно пишемо — щоб кількість/склад рахувались; маржа по такому рядку = 100%, це прийнятно, краще ніж «пропала» позиція).

Батч-резолв: зібрати `productId` усіх рядків без `lot.purchasePriceEur` → один запит по `PurchasePrice`.

### A3. Під'єднання у `apps/store/lib/manager/sale-create.ts`

Додати виклик `applySaleMovements(sale.id)` **поруч із наявним `applyDebtMovementSafe`** у двох місцях:

- `createSaleWithItems` — у блоці `if (post) { ... }` (після `applyDebtMovementSafe`, рядок ~172).
- `updateSaleWithItems` — у блоці `if (becomesArchived) { ... }` (після `applyDebtMovementSafe`, рядок ~249).

Резолв `agentCode1C` (для SalesMovement): якщо `sale.assignedAgentUserId` → підвантажити `User.code1C`. Можна робити всередині `applySaleMovements` (додати в select `assignedAgentUserId`, потім `prisma.user.findUnique({where:{id}, select:{code1C:true}})`). Якщо агента немає — `null`.

### A4. Реверс у DELETE-роуті `apps/store/app/api/v1/manager/sales/[id]/route.ts`

У наявному `DELETE` (рядки 233-309) вже реверсується борг. Додати прибирання рухів регістрів. Порядок:

1. Перед видаленням прочитати `code1C`: розширити `existing` select на `code1C`.
2. Обчислити `const recorder = existing.code1C ?? existing.id;`
3. Після успішної транзакції видалення (після `recomputeDebtForClients`) викликати `removeSaleMovements(recorder)` (fire-and-forget).

> **Розпроведення posted→draft відсутнє** (граф статусів: `posted` термінальний). Тому єдиний шлях зняти проведення — DELETE. Скасування (`cancelled`) можливе лише з `draft`/`sent`, які рухів не створювали, тож там реверс не потрібен. Нічого додатково по cancel робити не треба.

### A5. Правка звіту маржі `apps/store/lib/reports/margin-flex.ts`

Звіт собівартості джойнить `CostMovement` по `recorderCode1C = Sale.code1C`. Нові реалізації мають `code1C = null` → їхня собівартість не підтягнеться. Виправити на fallback `code1C ?? id`:

- Додати `id: true` у select реалізацій (там, де вже беруться `sale.code1C`, `sale.createdAt`, `customer`).
- У циклі побудови `saleCustomerByCode` замість `const code = it.sale.code1C;` використати `const code = it.sale.code1C ?? it.sale.id;`.
- `saleCodes` (ключ для `costMovement.findMany({ where: { recorderCode1C: { in: saleCodes } } })`) відповідно міститиме `id` для нових реалізацій — збіжиться з тим, що пише `applySaleMovements`.

> `sales-flex.ts` (Обороти продажів) читає `SalesMovement` напряму — нові рухи з'являться автоматично, змін не треба.
> `stock-flex.ts` (Залишки складу) робить `stockMovement.groupBy` зі знаком за `recordKind` — розхід (`recordKind=1`) нових реалізацій автоматично зменшить залишок, змін не треба.

### A6. Тести (Частина A)

- `sale-movement-hooks.test.ts`: чистий білдер рядків (винести побудову рядків у чисту функцію `buildSaleMovementRows(sale, costByProductId)` — як `buildStockMovementRows`): перевірити `recordKind`, `recorder = code1C ?? id`, `weightKg` для kg vs шт, `costEur` з lot.purchasePriceEur vs fallback vs 0, `lineNo` послідовність.
- Інтеграційний (mock prisma або окрема db-fixture, як наявні): проведення створює рухи в 3 регістрах; повторне проведення (edit) не дублює (delete-then-create); DELETE прибирає рухи.
- `margin-flex.test.ts`: додати кейс — нова реалізація (`code1C = null`) з `CostMovement` по `recorder = id` потрапляє у звіт.

---

## Частина B — Контроль відхилення ціни > 0.20 EUR

**Мета (1С `ПеревіркаЦіни`):** якщо менеджер вручну поставив ціну/кг, що відхиляється від еталонної (з типу цін) більш ніж на **0.20 EUR** — попередити перед проведенням: «Товар X: ціна має бути Y €, введено Z €. Дійсно провести?».

**Де:** клієнтська перевірка у `apps/store/app/manager/(workstation)/sales/new/_components/sale-form.tsx`, у момент **«Зберегти та провести»** (submit з `post=true`). Для «Зберегти» (draft) — не перевіряти (чернетка).

**Логіка:**

1. Для кожного рядка обчислити еталон: `ref = unitPriceForType(row.prices, "wholesale")` (з `apps/store/lib/manager/order-pricing.ts`). Якщо `ref == null` — пропустити рядок (немає з чим порівнювати).
2. `deviation = Math.abs(row.pricePerKg - ref)`. Якщо `deviation > 0.20` — додати рядок у список порушників.
3. Якщо список не порожній — показати діалог-підтвердження (реюз наявного портального `useDocDelete`-подібного діалогу або простий inline-confirm компонент, БЕЗ `window.confirm` — він тихо блокується в iframe-shell менеджерки) зі списком: `Назва — має бути {ref}€, введено {pricePerKg}€`. Кнопки «Все одно провести» / «Скасувати». Тільки при підтвердженні — реальний submit.
4. Винести чисту функцію `collectPriceDeviations(items, threshold = 0.2): Array<{name, expected, actual}>` у `sale-types.ts` або новий util + юніт-тест.

> Поле `Знижка` на рядку у нас відсутнє (за рішенням user) — тому перевіряються **усі** рядки з відомим еталоном.

---

## Частина C — Перевірка чужої броні мішка при скані ШК

**Мета (1С `АктивнаБроньМішка`):** якщо відсканований мішок заброньований **іншим** користувачем і бронь ще активна — показати попередження «Активна бронь мішка до {дата}» і **не додавати** рядок (своя бронь не блокує).

**Готовність:** endpoint `apps/store/app/api/v1/manager/lots/by-barcode/route.ts` **вже повертає** поля броні лота (`reservedByUserId`, `reservedByName`, `reservedUntil`). Тип `BarcodeLookupResponse` у формі їх уже містить. Треба лише додати перевірку на клієнті.

**Де:** `sale-form.tsx`, функція `onBarcode(code)` — між отриманням `data` (рядок ~346) і створенням draft-рядка (рядок ~370), поряд із наявною перевіркою дубля.

**Логіка:**

```ts
const r = data.lot;
const now = Date.now();
const active = r.reservedUntil && new Date(r.reservedUntil).getTime() > now;
if (active && r.reservedByUserId && r.reservedByUserId !== currentUserId) {
  // показати попередження (toast / inline-alert), НЕ додавати рядок
  setScanError(
    `Активна бронь мішка до ${formatDate(r.reservedUntil)}` +
      (r.reservedByName ? ` (заброньовано: ${r.reservedByName})` : ""),
  );
  return;
}
```

**`currentUserId` у формі:** переконатися, що форма отримує id поточного менеджера. Якщо ще не передається — прокинути пропом із серверної сторінки `sales/new/page.tsx` (і `sales/[id]/page.tsx`) через `getCurrentUser`. Винести чисту функцію `isForeignActiveReservation(lot, currentUserId, now): boolean` + юніт-тест (своя бронь → false; чужа активна → true; протермінована → false; без броні → false).

---

## Частина D — «Повторити ціну» (верифікація)

**Статус: уже реалізовано.** У `apps/store/app/manager/(workstation)/sales/new/_components/sale-items-editor.tsx` є кнопка «Повторити ціну» (іконка Copy), що показується коли в документі > 1 рядка того самого товару, і викликає `repeatPriceForProduct(items, uid)` — копіює ціну/кг поточного рядка на всі рядки тієї ж номенклатури.

**Завдання:**

1. **Верифікувати** роботу (є юніт-тест на `repeatPriceForProduct`? якщо ні — додати).
2. **Опційно** (лише якщо просто): додати правий клік / long-press як альтернативний тригер тієї самої дії (контекст-меню), реюз патерну ПКМ із списків Замовлень/Реалізацій (`use-context-menu` чи наявний компонент). Якщо реалізація контекст-меню нетривіальна — **пропустити**, наявної inline-кнопки достатньо; зафіксувати це у звіті.

---

## Файли (орієнтовний перелік)

**Нове:**

- `apps/store/lib/manager/sale-movement-hooks.ts` (+ чиста `buildSaleMovementRows`)
- `apps/store/lib/manager/sale-movement-hooks.test.ts`
- (опц.) util для `collectPriceDeviations` + `isForeignActiveReservation` (+ тести)

**Змінюємо:**

- `apps/store/lib/manager/sale-create.ts` — 2 виклики `applySaleMovements`
- `apps/store/app/api/v1/manager/sales/[id]/route.ts` — `removeSaleMovements` у DELETE (+ `code1C` у select)
- `apps/store/lib/reports/margin-flex.ts` — recorder fallback `code1C ?? id`
- `apps/store/app/manager/(workstation)/sales/new/_components/sale-form.tsx` — контроль відхилення (B) + перевірка броні (C) + `currentUserId`
- `apps/store/app/manager/(workstation)/sales/new/page.tsx` та `.../sales/[id]/page.tsx` — прокинути `currentUserId` (якщо ще не прокинуто)
- (D) `sale-items-editor.tsx` — лише якщо додаємо контекст-меню

---

## Deploy

**⚠️ Міграцій НЕ потрібно** — таблиці `stock_movements` / `sales_movements` / `cost_movements` / `mgr_debt_movements` уже існують. Деплой: `git pull` → `deploy.ps1 -SkipInstall` (без `prisma migrate deploy`).

**Історичні дані:** наявні рухи з 1С-імпорту **не чіпаємо**. Нові реалізації додаватимуть рухи з реєстратором `sale.id`; історичні лишаються з hex-реєстраторами — вони не конфліктують.

---

## Acceptance criteria (критерії приймання)

1. Проведення нової реалізації (`Зберегти та провести`) створює рядки у `StockMovement` (розхід), `SalesMovement` (продаж), `CostMovement` — по одному на позицію, з `recorderCode1C = sale.id`.
2. Повторне проведення відредагованої реалізації **не дублює** рухів (стара пачка видаляється, пишеться нова).
3. Видалення реалізації прибирає її рухи з усіх трьох регістрів **і** реверсує борг (як зараз).
4. Звіт **«Залишки складу»** зменшується на продані позиції; **«Обороти продажів»** показує нову виручку; **«Маржа/Валовий прибуток»** показує виручку − собівартість по новій реалізації (маржа коректна, коли є `purchasePriceEur`/`PurchasePrice`).
5. Провести реалізацію з ціною, що відхиляється > 0.20 € від типу цін, — з'являється попередження зі списком позицій; без підтвердження проведення не відбувається.
6. Скан мішка, заброньованого іншим менеджером (бронь активна), — рядок не додається, показано «Активна бронь до …»; свій/протермінований — додається без перешкод.
7. `pnpm --filter @ltex/store run typecheck` + `vitest run` (store) + `prettier --check` — чисто; 0 нових `any`.
8. Магазин, історичний імпорт, блок Замовлень — не зачеплені.
