import type { PrismaClient } from "@ltex/db";

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
