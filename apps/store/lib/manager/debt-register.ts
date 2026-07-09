import { prisma, type PrismaClient } from "@ltex/db";

// Округлення до 2 знаків (гроші EUR). Дзеркалить round2 з інших модулів каси.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Поріг простроки (днів). Прострочений борг = баланс боргу на момент
 * `сьогодні − OVERDUE_DAYS`. Дефолт 30 днів — **узгодити з user** (у 1С
 * термін оплати брався з умов контрагента; тут поки єдина константа).
 */
export const OVERDUE_DAYS = 30;

/**
 * Мінімальний клієнт БД, якого достатньо для резолву клієнта та запису руху
 * боргу. Задовольняється і повним `PrismaClient`, і `Prisma.TransactionClient`
 * (об'єкт `tx` усередині `prisma.$transaction`) — тому один хелпер працює і
 * поза транзакцією, і всередині неї.
 */
type DebtDbClient = Pick<
  PrismaClient,
  "customer" | "mgrClient" | "mgrDebtMovement"
>;

/**
 * Перебудовує кеш `MgrClient.debt` = Σ `MgrDebtMovement.amountEur` по клієнту,
 * а також `MgrClient.overdueDebt` — прострочену частину боргу.
 *
 * Регістр рухів боргу — джерело істини; `MgrClient.debt`/`overdueDebt` лише
 * кешують суми для швидких списків/фільтрів. Цей хелпер вирівнює кеш з рухами.
 *
 * **Прострочений борг** (наближення 1С `ОтриматиБорг`): беремо баланс боргу
 * *на момент порогу* — Σ рухів з `occurredAt < сьогодні − OVERDUE_DAYS`
 * (усе, що мало бути сплачене до порогу). Оскільки свіжі оплати гасять
 * найстарший борг першими (FIFO-старіння), прострочене = та частина цього
 * історичного балансу, що досі не покрита:
 *   `overdueDebt = max(0, min(поточний борг, історичний баланс на момент порогу))`.
 *
 * @param clientIds  Якщо задано — перераховує лише цих клієнтів (ті з них, у кого
 *                   немає рухів, отримають debt=0/overdueDebt=0). Якщо НЕ задано —
 *                   повний прогін: спершу всі клієнти обнуляються, потім
 *                   застосовуються суми (щоб клієнти без рухів теж стали 0).
 * @returns Кількість оновлених клієнтів.
 */
export async function recomputeDebtForClients(
  prisma: PrismaClient,
  clientIds?: string[],
): Promise<number> {
  // Повний прогін: спершу обнуляємо всіх, щоб клієнти без рухів стали 0.
  // Точкова перебудова: обнуляємо лише задану підмножину (через update нижче).
  if (!clientIds) {
    await prisma.mgrClient.updateMany({ data: { debt: 0, overdueDebt: 0 } });
  } else if (clientIds.length === 0) {
    return 0;
  }

  const scopeWhere = clientIds ? { clientId: { in: clientIds } } : undefined;

  const groups = await prisma.mgrDebtMovement.groupBy({
    by: ["clientId"],
    _sum: { amountEur: true },
    where: scopeWhere,
  });

  // Історичний баланс на момент порогу (рухи, старші за OVERDUE_DAYS) —
  // основа для розрахунку простроченого боргу.
  const threshold = new Date(Date.now() - OVERDUE_DAYS * 24 * 60 * 60 * 1000);
  const overdueGroups = await prisma.mgrDebtMovement.groupBy({
    by: ["clientId"],
    _sum: { amountEur: true },
    where: { ...(scopeWhere ?? {}), occurredAt: { lt: threshold } },
  });

  const oldBalanceByClient = new Map<string, number>();
  for (const g of overdueGroups) {
    const bal = g._sum.amountEur ? Number(g._sum.amountEur) : 0;
    oldBalanceByClient.set(g.clientId, round2(bal));
  }

  const sumByClient = new Map<string, number>();
  for (const g of groups) {
    const sum = g._sum.amountEur ? Number(g._sum.amountEur) : 0;
    sumByClient.set(g.clientId, round2(sum));
  }

  // Прострочене = непокрита частина історичного балансу, обмежена поточним
  // боргом і знизу нулем (переплата/свіже гасіння не роблять борг простроченим).
  function overdueFor(clientId: string, debt: number): number {
    const oldBalance = oldBalanceByClient.get(clientId) ?? 0;
    return round2(Math.max(0, Math.min(debt, oldBalance)));
  }

  let updated = 0;

  // Застосовуємо суми рухів.
  for (const [clientId, debt] of sumByClient) {
    await prisma.mgrClient.update({
      where: { id: clientId },
      data: { debt, overdueDebt: overdueFor(clientId, debt) },
    });
    updated++;
  }

  // Точкова перебудова: задані клієнти без рухів → debt=0 (їх немає у groupBy).
  if (clientIds) {
    for (const id of clientIds) {
      if (sumByClient.has(id)) continue;
      await prisma.mgrClient.update({
        where: { id },
        data: { debt: 0, overdueDebt: 0 },
      });
      updated++;
    }
  }

  return updated;
}

/**
 * Best-effort перерахунок кешу боргу ПІСЛЯ коміту документа. Кеш похідний
 * (джерело — рухи `MgrDebtMovement`, які вже записані у транзакції документа),
 * тож помилка перерахунку НЕ має валити основну операцію: логуємо warn і
 * покладаємось на нічний `recompute-client-debt` як страхувальник.
 */
export async function recomputeDebtForClientsSafe(
  clientIds: string[],
): Promise<void> {
  try {
    await recomputeDebtForClients(prisma, clientIds);
  } catch (e: unknown) {
    console.warn("[L-TEX] Failed to recompute debt cache", {
      clientIds,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ─── 5.4.5b: live-рухи боргу при проведенні документів ───────────────────────

/**
 * Резолвить `MgrClient.id` за `Customer.id` через спільний `code1C`
 * (`MgrClient.code1C === Customer.code1C`, НЕ FK). Повертає null, якщо у
 * Customer немає code1C або немає дзеркала у MgrClient.
 */
export async function resolveClientIdByCustomer(
  db: DebtDbClient,
  customerId: string,
): Promise<string | null> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { code1C: true },
  });
  if (!customer?.code1C) return null;
  const mgr = await db.mgrClient.findUnique({
    where: { code1C: customer.code1C },
    select: { id: true },
  });
  return mgr?.id ?? null;
}

export interface DebtMovementInput {
  /** Документ посилається на Customer; резолвимо у MgrClient через code1C. */
  customerId: string;
  /** Знак: + борг зростає, − зменшується. */
  amountEur: number;
  kind: "sale" | "payment" | "correction";
  /** "sale" | "cash_order" | "manual". */
  sourceType: string;
  sourceId: string;
  occurredAt: Date;
  note?: string | null;
  createdByUserId?: string | null;
}

/**
 * Транзакційна версія: записує рух боргу ВСЕРЕДИНІ переданого `db` (об'єкт `tx`
 * з `prisma.$transaction`), тож рух і документ комітяться **атомарно**.
 * Резолвить MgrClient за `customerId` (через `code1C`), робить ідемпотентний
 * upsert руху (unique `kind+sourceType+sourceId`) і повертає resolved
 * `clientId` — щоб викликач після коміту оновив кеш `MgrClient.debt`
 * (`recomputeDebtForClientsSafe`). Якщо клієнта не знайдено — рух НЕ пишеться,
 * повертає null.
 *
 * НА ВІДМІНУ від `applyDebtMovementSafe` — **може кинути** (помилка відкотить
 * усю транзакцію документа, тобто документ без руху не збережеться) і кеш
 * `MgrClient.debt` тут НЕ чіпає (це роблять ПІСЛЯ коміту, поза транзакцією).
 */
export async function applyDebtMovementTx(
  db: DebtDbClient,
  input: DebtMovementInput,
): Promise<string | null> {
  const clientId = await resolveClientIdByCustomer(db, input.customerId);
  if (!clientId) {
    console.warn(
      `[L-TEX] MgrClient не знайдено для customerId=${input.customerId}, рух боргу пропущено`,
      {
        kind: input.kind,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    );
    return null;
  }

  const amountEur = round2(input.amountEur);

  await db.mgrDebtMovement.upsert({
    where: {
      mgr_debt_movement_source: {
        kind: input.kind,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    create: {
      clientId,
      amountEur,
      kind: input.kind,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      occurredAt: input.occurredAt,
      note: input.note ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    update: {
      amountEur,
      clientId,
    },
  });

  return clientId;
}

/**
 * Fire-and-forget best-effort: резолвить MgrClient за `customerId`, upsert-ить
 * рух боргу (ідемпотентно за unique `kind+sourceType+sourceId`) і перераховує
 * кеш `MgrClient.debt` для цього клієнта. НІКОЛИ не кидає — лише логує warn.
 *
 * Дзеркалить локальний патерн `recordClientEventSafe` (побічний ефект, що не
 * блокує й не валить основну операцію) — жодних обмінів із 1С немає, це суто
 * локальна логіка. `recompute-client-debt` лишається страхувальником
 * консистентності кешу.
 *
 * ⚠️ Для проведення реалізації/оплати перевагу має `applyDebtMovementTx`
 * (атомарно з документом). Ця Safe-версія лишається для інших місць
 * (напр. `stock-documents.ts`), де рух пишеться окремо від документа.
 *
 * Викликається ПІСЛЯ коміту документа, тому використовує singleton `prisma`
 * (НЕ tx).
 */
export function applyDebtMovementSafe(input: DebtMovementInput): void {
  void (async () => {
    const clientId = await resolveClientIdByCustomer(prisma, input.customerId);
    if (!clientId) {
      console.warn(
        `[L-TEX] MgrClient не знайдено для customerId=${input.customerId}, рух боргу пропущено`,
        {
          kind: input.kind,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      );
      return;
    }

    const amountEur = round2(input.amountEur);

    await prisma.mgrDebtMovement.upsert({
      where: {
        mgr_debt_movement_source: {
          kind: input.kind,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      },
      create: {
        clientId,
        amountEur,
        kind: input.kind,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        occurredAt: input.occurredAt,
        note: input.note ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
      update: {
        amountEur,
        clientId,
      },
    });

    await recomputeDebtForClients(prisma, [clientId]);
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to apply debt movement", {
      kind: input.kind,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
