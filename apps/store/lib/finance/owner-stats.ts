import { prisma } from "@ltex/db";

/**
 * Фінансова статистика для Owner-кабінету (← Тиждень 3 блоку Ролі).
 *
 * Виручка = сума `Sale.totalEur` за період (тільки проведені реалізації).
 * Маржа   = виручка − собівартість (lots.purchasePriceEur × kg). Поки що
 *           маржа доступна лише для лотів створених через нашу систему
 *           Поступлення (Тиждень 2). Legacy-лоти не мають purchasePriceEur,
 *           тому маржа є частковою — показуємо `marginEurKnown` як такий що
 *           відомий + лічильник "невідомі лоти".
 * Борг    = сума MgrClient.debt усіх активних клієнтів.
 *
 * Періоди (preset): today / week / month / year / custom.
 * За замовч. — поточний місяць.
 */

export type PeriodPreset = "today" | "week" | "month" | "year" | "all";

export interface FinanceStats {
  period: { from: Date; to: Date; label: string };
  revenueEur: number;
  // Маржа = revenue - cost_known. cost_known рахується тільки де є purchasePriceEur.
  marginEurKnown: number;
  // Скільки лотів у періоді без purchasePriceEur (legacy) — для UX-підказки.
  lotsWithoutCost: number;
  totalDebtEur: number;
  salesCount: number;
  activeClientsCount: number;
  // Топ-10 клієнтів за виручкою
  topClients: {
    id: string;
    name: string;
    revenueEur: number;
    salesCount: number;
  }[];
  // Виручка по місяцях за останні 12 місяців (для графіка)
  monthlyRevenue: {
    yearMonth: string; // "YYYY-MM"
    revenueEur: number;
  }[];
}

export function resolvePeriod(
  preset: PeriodPreset,
  now: Date = new Date(),
): {
  from: Date;
  to: Date;
  label: string;
} {
  const to = now;
  const from = new Date(now);
  switch (preset) {
    case "today":
      from.setHours(0, 0, 0, 0);
      return { from, to, label: "Сьогодні" };
    case "week":
      from.setDate(from.getDate() - 7);
      return { from, to, label: "Останній тиждень" };
    case "month":
      from.setMonth(from.getMonth() - 1);
      return { from, to, label: "Останній місяць" };
    case "year":
      from.setFullYear(from.getFullYear() - 1);
      return { from, to, label: "Останній рік" };
    case "all":
      return { from: new Date(2020, 0, 1), to, label: "Весь час" };
  }
}

export async function getFinanceStats(
  preset: PeriodPreset = "month",
): Promise<FinanceStats> {
  const period = resolvePeriod(preset);

  const [salesAgg, debtAgg, activeClientsCount, topClientsRaw] =
    await Promise.all([
      // Виручка + кількість продажів
      prisma.sale.aggregate({
        where: {
          status: "posted",
          createdAt: { gte: period.from, lte: period.to },
        },
        _sum: { totalEur: true },
        _count: { _all: true },
      }),
      // Сумарний борг по активних клієнтах
      prisma.mgrClient.aggregate({
        _sum: { debt: true },
      }),
      prisma.mgrClient.count(),
      // Топ-10 клієнтів за виручкою у періоді — через групування по customerId
      prisma.sale.groupBy({
        by: ["customerId"],
        where: {
          status: "posted",
          createdAt: { gte: period.from, lte: period.to },
        },
        _sum: { totalEur: true },
        _count: { _all: true },
        orderBy: { _sum: { totalEur: "desc" } },
        take: 10,
      }),
    ]);

  // Маржа — рахуємо через окремий запит на SaleItem×Lot, де lot має purchase.
  // Це дорого, але виконується раз на render дашборду.
  const marginItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        status: "posted",
        createdAt: { gte: period.from, lte: period.to },
      },
      lot: { isNot: null },
    },
    select: {
      priceEur: true,
      weight: true,
      lot: { select: { purchasePriceEur: true } },
    },
  });

  let marginEurKnown = 0;
  let lotsWithoutCost = 0;
  for (const it of marginItems) {
    const cost = it.lot?.purchasePriceEur ?? null;
    if (cost === null) {
      lotsWithoutCost++;
      continue;
    }
    // priceEur — сума по рядку (€); cost × weight = собівартість рядка.
    marginEurKnown += it.priceEur - cost * it.weight;
  }

  // Резолв імен клієнтів для топ-10
  const topCustomerIds = topClientsRaw.map((t) => t.customerId);
  const customers =
    topCustomerIds.length > 0
      ? await prisma.customer.findMany({
          where: { id: { in: topCustomerIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  const topClients = topClientsRaw.map((t) => ({
    id: t.customerId,
    name: nameById.get(t.customerId) ?? "Без імені",
    revenueEur: t._sum.totalEur ?? 0,
    salesCount: t._count._all,
  }));

  // Виручка по місяцях (12 місяців назад)
  const monthlyFrom = new Date();
  monthlyFrom.setMonth(monthlyFrom.getMonth() - 11);
  monthlyFrom.setDate(1);
  monthlyFrom.setHours(0, 0, 0, 0);

  const monthlySales = await prisma.sale.findMany({
    where: {
      status: "posted",
      createdAt: { gte: monthlyFrom },
    },
    select: { createdAt: true, totalEur: true },
  });
  const monthMap = new Map<string, number>();
  // Заповнюємо всі 12 місяців нулями
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, 0);
  }
  for (const s of monthlySales) {
    const key = `${s.createdAt.getFullYear()}-${String(s.createdAt.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + s.totalEur);
  }
  const monthlyRevenue = [...monthMap.entries()].map(
    ([yearMonth, revenueEur]) => ({
      yearMonth,
      revenueEur: round2(revenueEur),
    }),
  );

  return {
    period,
    revenueEur: round2(salesAgg._sum.totalEur ?? 0),
    marginEurKnown: round2(marginEurKnown),
    lotsWithoutCost,
    totalDebtEur: round2(debtAgg._sum.debt ? Number(debtAgg._sum.debt) : 0),
    salesCount: salesAgg._count._all,
    activeClientsCount,
    topClients: topClients.map((t) => ({
      ...t,
      revenueEur: round2(t.revenueEur),
    })),
    monthlyRevenue,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
