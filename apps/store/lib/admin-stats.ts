import { prisma } from "@ltex/db";

interface TopProduct {
  productId: string;
  productName: string;
  orderCount: number;
  totalEur: number;
}

interface DailyRevenue {
  date: Date;
  revenue: number;
}

interface DailyCustomers {
  date: Date;
  count: number;
}

export async function getAdminStats() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    ordersCount,
    ordersByStatus,
    totalRevenue,
    productsCount,
    lotsCount,
    lotsByStatus,
    productsByQuality,
    recentOrders,
    ordersLast30Days,
    topProducts,
    revenueLast30Days,
    newCustomersLast30Days,
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
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `,
    prisma.$queryRawUnsafe<TopProduct[]>(
      `SELECT oi.product_id AS "productId", p.name AS "productName",
              COUNT(DISTINCT oi.order_id)::int AS "orderCount",
              ROUND(SUM(oi.price_eur * oi.quantity)::numeric, 2)::float AS "totalEur"
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       GROUP BY oi.product_id, p.name
       ORDER BY "orderCount" DESC
       LIMIT 10`,
    ),
    prisma.$queryRawUnsafe<DailyRevenue[]>(
      `SELECT DATE(created_at) AS date,
              ROUND(SUM(total_eur)::numeric, 2)::float AS revenue
       FROM orders WHERE created_at >= $1 AND status != 'cancelled'
       GROUP BY DATE(created_at) ORDER BY date`,
      thirtyDaysAgo,
    ),
    prisma.$queryRawUnsafe<DailyCustomers[]>(
      `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
       FROM customers WHERE created_at >= $1
       GROUP BY DATE(created_at) ORDER BY date`,
      thirtyDaysAgo,
    ),
  ]);

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
    ordersLast30Days: ordersLast30Days.map((d) => ({
      day: new Date(d.day).toLocaleDateString("uk-UA", {
        day: "2-digit",
        month: "2-digit",
      }),
      count: Number(d.count),
      total: Number(d.total),
    })),
    topProducts,
    funnelData,
    revenueLast30Days,
    newCustomersLast30Days,
  };
}
