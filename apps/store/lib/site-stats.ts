import { prisma } from "@ltex/db";

export interface SiteStats {
  visitsToday: number;
  visits7d: number;
  uniquesToday: number;
  uniques7d: number;
  siteOrders30dCount: number;
  siteOrders30dSumEur: number;
  activeLeads: number;
  topViewed: { productId: string; name: string; views: number }[];
}

/**
 * Статистика сайту для дашборду адмінки (7.2 Блок 4): візити, унікальні,
 * замовлення з кошика, ліди, топ переглядів. Усе — з нашої бази, без 1С.
 */
export async function getSiteStats(): Promise<SiteStats> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T00:00:00.000Z`);
  const d7 = new Date(today);
  d7.setUTCDate(d7.getUTCDate() - 6); // останні 7 днів включно з сьогодні
  const d30 = new Date(now);
  d30.setUTCDate(d30.getUTCDate() - 30);

  const [
    todayRow,
    visits7dAgg,
    uniquesToday,
    uniques7dGroups,
    orders30d,
    activeLeads,
    topGroups,
  ] = await Promise.all([
    prisma.siteVisitDay.findUnique({ where: { day: today } }),
    prisma.siteVisitDay.aggregate({
      _sum: { pageviews: true },
      where: { day: { gte: d7 } },
    }),
    prisma.siteVisitor.count({ where: { day: today } }),
    prisma.siteVisitor.groupBy({
      by: ["visitorHash"],
      where: { day: { gte: d7 } },
    }),
    prisma.order.aggregate({
      _count: { _all: true },
      _sum: { totalEur: true },
      where: { source: "site", createdAt: { gte: d30 } },
    }),
    prisma.mgrLead.count({ where: { status: { in: ["new", "contacted"] } } }),
    prisma.viewLog.groupBy({
      by: ["productId"],
      where: { viewedAt: { gte: d30 } },
      _count: { productId: true },
      orderBy: { _count: { productId: "desc" } },
      take: 5,
    }),
  ]);

  const productIds = topGroups.map((g) => g.productId);
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  const topViewed = topGroups.map((g) => ({
    productId: g.productId,
    name: nameById.get(g.productId) ?? "—",
    views: g._count.productId,
  }));

  return {
    visitsToday: todayRow?.pageviews ?? 0,
    visits7d: visits7dAgg._sum.pageviews ?? 0,
    uniquesToday,
    uniques7d: uniques7dGroups.length,
    siteOrders30dCount: orders30d._count._all,
    siteOrders30dSumEur: orders30d._sum.totalEur ?? 0,
    activeLeads,
    topViewed,
  };
}
