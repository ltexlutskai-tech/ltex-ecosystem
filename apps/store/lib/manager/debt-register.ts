import { prisma, type PrismaClient } from "@ltex/db";

// Округлення до 2 знаків (гроші EUR). Дзеркалить round2 з інших модулів каси.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Перебудовує кеш `MgrClient.debt` = Σ `MgrDebtMovement.amountEur` по клієнту.
 *
 * Регістр рухів боргу — джерело істини; `MgrClient.debt` лише кешує суму для
 * швидких списків/фільтрів. Цей хелпер вирівнює кеш з рухами.
 *
 * @param clientIds  Якщо задано — перераховує лише цих клієнтів (ті з них, у кого
 *                   немає рухів, отримають debt=0). Якщо НЕ задано — повний прогін:
 *                   спершу всі клієнти обнуляються, потім застосовуються суми
 *                   (щоб клієнти без рухів теж стали 0).
 * @returns Кількість оновлених клієнтів.
 */
export async function recomputeDebtForClients(
  prisma: PrismaClient,
  clientIds?: string[],
): Promise<number> {
  // Повний прогін: спершу обнуляємо всіх, щоб клієнти без рухів стали 0.
  // Точкова перебудова: обнуляємо лише задану підмножину (через update нижче).
  if (!clientIds) {
    await prisma.mgrClient.updateMany({ data: { debt: 0 } });
  } else if (clientIds.length === 0) {
    return 0;
  }

  const groups = await prisma.mgrDebtMovement.groupBy({
    by: ["clientId"],
    _sum: { amountEur: true },
    where: clientIds ? { clientId: { in: clientIds } } : undefined,
  });

  const sumByClient = new Map<string, number>();
  for (const g of groups) {
    const sum = g._sum.amountEur ? Number(g._sum.amountEur) : 0;
    sumByClient.set(g.clientId, round2(sum));
  }

  let updated = 0;

  // Застосовуємо суми рухів.
  for (const [clientId, debt] of sumByClient) {
    await prisma.mgrClient.update({
      where: { id: clientId },
      data: { debt },
    });
    updated++;
  }

  // Точкова перебудова: задані клієнти без рухів → debt=0 (їх немає у groupBy).
  if (clientIds) {
    for (const id of clientIds) {
      if (sumByClient.has(id)) continue;
      await prisma.mgrClient.update({
        where: { id },
        data: { debt: 0 },
      });
      updated++;
    }
  }

  return updated;
}

// ─── 5.4.5b: live-рухи боргу при проведенні документів ───────────────────────

/**
 * Резолвить `MgrClient.id` за `Customer.id` через спільний `code1C`
 * (`MgrClient.code1C === Customer.code1C`, НЕ FK). Повертає null, якщо у
 * Customer немає code1C або немає дзеркала у MgrClient.
 */
export async function resolveClientIdByCustomer(
  prisma: PrismaClient,
  customerId: string,
): Promise<string | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { code1C: true },
  });
  if (!customer?.code1C) return null;
  const mgr = await prisma.mgrClient.findUnique({
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
 * Fire-and-forget best-effort: резолвить MgrClient за `customerId`, upsert-ить
 * рух боргу (ідемпотентно за unique `kind+sourceType+sourceId`) і перераховує
 * кеш `MgrClient.debt` для цього клієнта. НІКОЛИ не кидає — лише логує warn.
 *
 * Дзеркалить патерн `recordClientEventSafe`/`enqueueSaleSyncSafe` (побічний
 * ефект, що не блокує й не валить основну операцію). `recompute-client-debt`
 * лишається страхувальником консистентності кешу.
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
