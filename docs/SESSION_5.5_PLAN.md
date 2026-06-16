# SESSION 5.5 — PLAN

Орієнтир: `docs/PARITY_SUMMARY.md` (тема T3), `docs/PARITY_AUDIT_cash.md`.
Гілка: `claude/charming-ptolemy-40syy0`.

Черга (затверджено user-ом):

1. ✅ **Звірка знаку боргу** — дія user-а на проді (рецепт у чаті). Лишає
   `DEBT_SIGN=1` або інвертує на `-1` + реімпорт `--entity debt`.
2. ✅ **Фаза 2 — ретро-прив'язка** (коміт `c459d6bc`): імпортер backfill-ить
   `Order/Sale.assignedAgentUserId` через `User.code1C`=hex 1С-агента.
   Деплой: реімпорт `--entity orders,sales`.
3. ⏳ **5.4.5 — Борг/каса як живий регістр** (цей план, нижче).
4. ⏳ Зауваження user-а по блоках — наприкінці, по черзі.

---

## 5.4.5 — Борг / каса як живий регістр

### Проблема

`MgrClient.debt` — статичний знімок з 1С (`_AccumRg5269`, імпорт 5.4.6).
Проведення реалізації/оплати **не** змінює борг → після першого продажу/оплати
у нашій системі борг розходиться з реальністю. Корекція боргу (`debtCorrection`)
зберігається, але нікуди не впливає.

### Архітектурна розвилка

- **A) Просте число.** При проведенні документа `+/−` міняємо `MgrClient.debt`
  напряму. Швидко, мало коду. Крихко: реімпорт історії / правка / відкат
  документа можуть розсинхронити; немає аудиту «звідки взявся борг».
- **B) Регістр рухів (рекомендовано).** Окрема таблиця рухів боргу — кожне
  проведення пише підписаний рядок; `MgrClient.debt` = Σ рухів (кеш). Дзеркалить
  1С `_AccumRg5269`. Надійно, ідемпотентно, дає вкладку «Рухи боргу», природно
  лягає на історичний імпорт. Трохи більше роботи.

> **Рекомендація orchestrator: B.** Раз ми повністю замінюємо 1С, борг має бути
> таким же надійним регістром, як у 1С. Решта плану — під варіант B.

### Модель (B)

```
model MgrDebtMovement {
  id            String   @id @default(cuid())
  clientId      String                      // FK → MgrClient
  amountEur     Decimal  @db.Decimal(12,2)  // знак: + борг клієнта зростає, − зменшується
  kind          MgrDebtMovementKind         // opening | sale | payment | correction
  sourceType    String?                     // "sale" | "cash_order" | "accum_rg5269" | "manual"
  sourceId      String?                     // Sale.id / MgrCashOrder.id / hex / cuid
  occurredAt    DateTime                    // дата документа
  note          String?
  createdByUserId String?
  createdAt     DateTime @default(now())

  @@unique([kind, sourceType, sourceId])    // ідемпотентність: 1 рух на джерело
  @@index([clientId, occurredAt])
}
```

- `MgrClient.debt` лишається — **кеш** (= Σ amountEur по клієнту), оновлюється у
  тій самій транзакції, що й вставка/зміна руху.
- Скрипт `scripts/recompute-client-debt.ts` перебудовує `debt` з рухів (запуск
  після будь-якого імпорту; ідемпотентний).

### Підстадії (воркери, по черзі)

**5.4.5a — Фундамент (модель + імпорт + recompute).**

- Міграція `MgrDebtMovement` + enum `MgrDebtMovementKind`.
- Rework `importDebt`: замість запису одного числа — upsert ОДНОГО `opening`-руху
  на клієнта (`kind=opening`, `sourceType=accum_rg5269`, `sourceId=hex(client)`,
  `amountEur = DEBT_SIGN * net`). Реімпорт оновлює суму, не дублює (unique-ключ).
- `scripts/recompute-client-debt.ts`: `MgrClient.debt = Σ рухів`.
- Знак `DEBT_SIGN` — той самий, що user підтвердив у п.1.

**5.4.5b — Hooks проведення.**

- Реалізація `draft→posted`: у тій же транзакції — upsert `sale`-руху
  `+totalEur` + оновлення кешу `debt`. `reopen` (розпровести) — знімає рух.
- Каса income (`createPaymentOrders`): upsert `payment`-руху на суму, що пішла в
  погашення = `−(reduceToEur(paid) − reduceChangeToEur(change))` (= скільки реально
  зайшло в рахунок боргу; здача не зменшує борг). Перевірити формулу проти
  `computeBalanceEur`.
- Усі рухи резолвлять клієнта: `Sale/CashOrder.customerId` → `Customer.code1C`
  → `MgrClient`. Якщо MgrClient не знайдено — рух не пишемо (best-effort, лог).
- Тести на знак і суму.

**5.4.5c — Корекція боргу + UI.**

- Операція «Корекція боргу» на картці клієнта: endpoint
  `POST /api/v1/manager/clients/[id]/debt-correction { amountEur, note }` →
  `correction`-рух (± сума) + оновлення кешу + timeline-запис
  (`recordClientEventSafe`, kind="debt_correction"). Покриває 1С
  `КорректировкаДолга / СписаниеЗадолженності` без каси.
- Вкладка/блок «Рухи боргу» на картці клієнта: список рухів (дата / тип /
  сума / документ-лінк), пагінація. Foreign-masking як інші вкладки.

### Поза 5.4.5 (свідомо — це POST_1C / 1С-sync структура або окремі теми)

- Роздільні ПКО per валюта + безнал→ПлатежноеПоручениеВходящее (cash audit
  #2,3) — потрібні лише для sync-back у 1С (мертвий sync).
- НДС / КО-1 / КО-2 друк (cash audit #9,12).
- Курс з маршрутного листа (T4) — окремий дрібний gap.
- Повний помашиний імпорт боргових рухів з `_AccumRg5269` (зараз — один
  агрегат-`opening` на клієнта; достатньо для коректного балансу).

### Деплой 5.4.5

`prisma migrate deploy` (нова таблиця) → `recompute-client-debt.ts` (перебудувати
кеш) → `deploy.ps1`. Реімпорт `--entity debt` (вже як opening-рухи).
