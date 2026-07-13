import { prisma } from "@ltex/db";
import { resolvePeriod, type PeriodPreset } from "./owner-stats";

/**
 * Статистика для Supervisor-кабінету (← Тиждень 4 блоку Ролі).
 *
 * Supervisor бачить ВСІХ менеджерів і їхню ефективність:
 *   - К-сть призначених клієнтів
 *   - Виручка за період (по реалізаціях де agent = manager)
 *   - К-сть активних замовлень
 *   - Прострочені замовлення (Етап 3 Замовлень — нагадування 3д/7д/90д)
 *
 * Аналог 1С звіту «Аналіз продаж по торговим агентам».
 */

export interface ManagerKpi {
  userId: string;
  fullName: string;
  email: string;
  clientCount: number;
  revenueEur: number;
  salesCount: number;
  activeOrdersCount: number;
}

export interface SupervisorStats {
  period: { from: Date; to: Date; label: string };
  managers: ManagerKpi[];
  totalRevenueEur: number;
  totalSalesCount: number;
  totalManagers: number;
}

export async function getSupervisorStats(
  preset: PeriodPreset = "month",
): Promise<SupervisorStats> {
  const period = resolvePeriod(preset);

  // Усі менеджери (manager + senior_manager)
  const managers = await prisma.user.findMany({
    where: {
      role: { in: ["manager", "senior_manager"] },
      isActive: true,
    },
    select: { id: true, fullName: true, email: true, code1C: true },
  });

  // Кількість клієнтів кожного менеджера через ClientAssignment
  const clientCounts = await prisma.clientAssignment.groupBy({
    by: ["userId"],
    _count: { _all: true },
  });
  const clientCountByUserId = new Map(
    clientCounts.map((c) => [c.userId, c._count._all]),
  );

  // Виручка за період — групуємо по assignedAgentUserId на Sale
  const revenueAgg = await prisma.sale.groupBy({
    by: ["assignedAgentUserId"],
    where: {
      status: "posted",
      createdAt: { gte: period.from, lte: period.to },
      assignedAgentUserId: { not: null },
    },
    _sum: { totalEur: true },
    _count: { _all: true },
  });
  const revenueByUserId = new Map<string, { sum: number; count: number }>();
  for (const r of revenueAgg) {
    if (r.assignedAgentUserId) {
      revenueByUserId.set(r.assignedAgentUserId, {
        sum: r._sum.totalEur ?? 0,
        count: r._count._all,
      });
    }
  }

  // Активні замовлення кожного менеджера
  const activeOrdersAgg = await prisma.order.groupBy({
    by: ["assignedAgentUserId"],
    where: {
      status: { in: ["draft", "not_posted", "pending"] },
      archived: false,
      assignedAgentUserId: { not: null },
    },
    _count: { _all: true },
  });
  const activeOrdersByUserId = new Map<string, number>();
  for (const o of activeOrdersAgg) {
    if (o.assignedAgentUserId) {
      activeOrdersByUserId.set(o.assignedAgentUserId, o._count._all);
    }
  }

  // Збираємо
  const managerKpis: ManagerKpi[] = managers.map((m) => {
    const rev = revenueByUserId.get(m.id) ?? { sum: 0, count: 0 };
    return {
      userId: m.id,
      fullName: m.fullName,
      email: m.email,
      clientCount: clientCountByUserId.get(m.id) ?? 0,
      revenueEur: round2(rev.sum),
      salesCount: rev.count,
      activeOrdersCount: activeOrdersByUserId.get(m.id) ?? 0,
    };
  });

  // Сортуємо за виручкою
  managerKpis.sort((a, b) => b.revenueEur - a.revenueEur);

  const totalRevenueEur = round2(
    managerKpis.reduce((s, m) => s + m.revenueEur, 0),
  );
  const totalSalesCount = managerKpis.reduce((s, m) => s + m.salesCount, 0);

  return {
    period,
    managers: managerKpis,
    totalRevenueEur,
    totalSalesCount,
    totalManagers: managers.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
