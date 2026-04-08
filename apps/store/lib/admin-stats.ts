import { prisma } from "@ltex/db";

export interface TopProduct {
  productId: string;
  productName: string;
  orderCount: number;
  totalEur: number;
}

export interface DailyRevenue {
  date: Date;
  revenue: number;
}

export interface DailyCustomers {
  date: Date;
  count: number;
}

export interface DailyAvgOrder {
  date: Date;
  avgEur: number;
}

export interface CategoryStat {
  categoryName: string;
  orderCount: number;
}

export interface CityStat {
  city: string;
  customerCount: number;
}

export type Period = "7d" | "30d" | "90d" | "1y";

function getPeriodDate(period: Period): Date {
  const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[period];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function getPeriodLabel(period: Period): string {
  return { "7d": "7 днів", "30d": "30 днів", "90d": "90 днів", "1y": "рік" }[
    period
  ];
}

export async function getAdminStats(period: Period = "30d") {
  const periodDate = getPeriodDate(period);

  const [
    ordersCount,
    ordersByStatus,
    totalRevenue,
    productsCount,
    lotsCount,
    lotsByStatus,
    productsByQuality,
    recentOrders,
    ordersInPeriod,
    topProducts,
    revenueInPeriod,
    newCustomersInPeriod,
    avgOrderInPeriod,
    topCategories,
    topCities,
    conversionData,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.order.aggregate({
      _sum: { totalEur: true },
    }),
    prisma.product.count(),
    prisma.lot.count(),
    prisma.lot.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.product.groupBy({
      by: ["quality"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { customer: true, _count: { select: { items: true } } },
    }),
    prisma.$queryRaw<{ day: Date; count: bigint; total: number }[]>`
      SELECT DATE(created_at) as day,
             COUNT(*)::bigint as count,
             COALESCE(SUM(total_eur), 0) as total
      FROM orders
      WHERE created_at >= ${periodDate}
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
    prisma.$queryRawUnsafe<TopProduct[]>(
      `SELECT oi.product_id AS "productId", p.name AS "productName",
              COUNT(DISTINCT oi.order_id)::int AS "orderCount",
              ROUND(SUM(oi.price_eur * oi.quantity)::numeric, 2)::float AS "totalEur"
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= $1
       GROUP BY oi.product_id, p.name
       ORDER BY "orderCount" DESC
       LIMIT 10`,
      periodDate,
    ),
    prisma.$queryRawUnsafe<DailyRevenue[]>(
      `SELECT DATE(created_at) AS date,
              ROUND(SUM(total_eur)::numeric, 2)::float AS revenue
       FROM orders WHERE created_at >= $1 AND status != 'cancelled'
       GROUP BY DATE(created_at) ORDER BY date`,
      periodDate,
    ),
    prisma.$queryRawUnsafe<DailyCustomers[]>(
      `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
       FROM customers WHERE created_at >= $1
       GROUP BY DATE(created_at) ORDER BY date`,
      periodDate,
    ),
    // Average order value per day
    prisma.$queryRawUnsafe<DailyAvgOrder[]>(
      `SELECT DATE(created_at) AS date,
              ROUND(AVG(total_eur)::numeric, 2)::float AS "avgEur"
       FROM orders WHERE created_at >= $1 AND status != 'cancelled'
       GROUP BY DATE(created_at) ORDER BY date`,
      periodDate,
    ),
    // Top categories by orders
    prisma.$queryRawUnsafe<CategoryStat[]>(
      `SELECT c.name AS "categoryName",
              COUNT(DISTINCT oi.order_id)::int AS "orderCount"
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= $1
       GROUP BY c.name
       ORDER BY "orderCount" DESC
       LIMIT 8`,
      periodDate,
    ),
    // Top cities by customers
    prisma.$queryRawUnsafe<CityStat[]>(
      `SELECT COALESCE(city, 'Не вказано') AS city,
              COUNT(*)::int AS "customerCount"
       FROM customers
       WHERE city IS NOT NULL AND city != ''
       GROUP BY city
       ORDER BY "customerCount" DESC
       LIMIT 10`,
    ),
    // Conversion: carts vs orders
    Promise.all([
      prisma.cart.count(),
      prisma.order.count({ where: { createdAt: { gte: periodDate } } }),
    ]),
  ]);

  const [totalCarts, ordersInPeriodCount] = conversionData;

  // Build funnel data from ordersByStatus
  const funnelOrder = [
    "draft",
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];
  const ordersByStatusMap = Object.fromEntries(
    ordersByStatus.map((g) => [g.status, g._count.id]),
  ) as Record<string, number>;
  const funnelData = funnelOrder
    .filter((s) => (ordersByStatusMap[s] ?? 0) > 0)
    .map((status) => ({ status, count: ordersByStatusMap[status] ?? 0 }));

  return {
    period,
    periodLabel: getPeriodLabel(period),
    ordersCount,
    ordersByStatus: ordersByStatusMap,
    totalRevenue: totalRevenue._sum.totalEur ?? 0,
    productsCount,
    lotsCount,
    lotsByStatus: Object.fromEntries(
      lotsByStatus.map((g) => [g.status, g._count.id]),
    ) as Record<string, number>,
    productsByQuality: productsByQuality.map((g) => ({
      quality: g.quality,
      count: g._count.id,
    })),
    recentOrders,
    ordersLast30Days: ordersInPeriod.map((d) => ({
      day: new Date(d.day).toLocaleDateString("uk-UA", {
        day: "2-digit",
        month: "2-digit",
      }),
      count: Number(d.count),
      total: Number(d.total),
    })),
    topProducts,
    funnelData,
    revenueLast30Days: revenueInPeriod,
    newCustomersLast30Days: newCustomersInPeriod,
    avgOrderByDay: avgOrderInPeriod,
    topCategories,
    topCities,
    conversion: {
      carts: totalCarts,
      orders: ordersInPeriodCount,
      rate:
        totalCarts > 0
          ? Math.round((ordersInPeriodCount / totalCarts) * 100)
          : 0,
    },
  };
}
