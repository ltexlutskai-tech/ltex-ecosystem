export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ltex/ui";
import {
  ORDER_STATUS_LABELS,
  QUALITY_LABELS,
  type OrderStatus,
  type QualityLevel,
} from "@ltex/shared";
import { LOT_STATUS_LABELS, type LotStatus } from "@ltex/shared";
import { ShoppingCart, Package, Boxes, TrendingUp } from "lucide-react";
import {
  FunnelChart,
  TopProductsTable,
  RevenueChart,
  NewCustomersChart,
} from "@/components/admin/charts";

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

async function getStats() {
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

    // Top 10 products by order count
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

    // Revenue last 30 days
    prisma.$queryRawUnsafe<DailyRevenue[]>(
      `SELECT DATE(created_at) AS date,
              ROUND(SUM(total_eur)::numeric, 2)::float AS revenue
       FROM orders WHERE created_at >= $1 AND status != 'cancelled'
       GROUP BY DATE(created_at) ORDER BY date`,
      thirtyDaysAgo,
    ),

    // New customers last 30 days
    prisma.$queryRawUnsafe<DailyCustomers[]>(
      `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
       FROM customers WHERE created_at >= $1
       GROUP BY DATE(created_at) ORDER BY date`,
      thirtyDaysAgo,
    ),
  ]);

  // Build funnel data from ordersByStatus
  const funnelOrder = ["draft", "pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
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
      day: new Date(d.day).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }),
      count: Number(d.count),
      total: Number(d.total),
    })),
    topProducts,
    funnelData,
    revenueLast30Days,
    newCustomersLast30Days,
  };
}

const BAR_COLORS: Record<string, string> = {
  free: "bg-green-500",
  reserved: "bg-amber-500",
  on_sale: "bg-blue-500",
  extra: "bg-purple-500",
  cream: "bg-pink-500",
  first: "bg-green-500",
  second: "bg-amber-500",
  stock: "bg-blue-500",
  mix: "bg-gray-500",
};

function BarChart({
  data,
  labelKey,
  valueKey,
  labels,
}: {
  data: { label: string; value: number }[];
  labelKey?: string;
  valueKey?: string;
  labels?: Record<string, string>;
}) {
  void labelKey;
  void valueKey;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-24 truncate text-xs text-gray-600">
            {labels?.[item.label] ?? item.label}
          </span>
          <div className="flex-1">
            <div
              className={`h-5 rounded ${BAR_COLORS[item.label] ?? "bg-green-500"} transition-all`}
              style={{ width: `${(item.value / max) * 100}%`, minWidth: item.value > 0 ? "4px" : "0px" }}
            />
          </div>
          <span className="w-10 text-right text-xs font-medium">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminDashboard() {
  const stats = await getStats();

  const cards = [
    {
      title: "Замовлення",
      value: stats.ordersCount,
      icon: ShoppingCart,
      detail: Object.entries(stats.ordersByStatus)
        .map(
          ([status, count]) =>
            `${ORDER_STATUS_LABELS[status as OrderStatus] ?? status}: ${count}`,
        )
        .join(", "),
    },
    {
      title: "Виручка (EUR)",
      value: `€${stats.totalRevenue.toFixed(2)}`,
      icon: TrendingUp,
      detail: "Загальна сума замовлень",
    },
    {
      title: "Товари",
      value: stats.productsCount,
      icon: Package,
      detail: "В каталозі",
    },
    {
      title: "Лоти",
      value: stats.lotsCount,
      icon: Boxes,
      detail: Object.entries(stats.lotsByStatus)
        .map(([status, count]) => `${LOT_STATUS_LABELS[status as LotStatus] ?? status}: ${count}`)
        .join(", "),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Дашборд</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="mt-1 text-xs text-gray-500">{card.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1: Existing */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Orders last 30 days */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Замовлення (30 днів)</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.ordersLast30Days.length === 0 ? (
              <p className="text-sm text-gray-500">Немає даних</p>
            ) : (
              <div className="flex items-end gap-1" style={{ height: 120 }}>
                {stats.ordersLast30Days.map((d) => {
                  const max = Math.max(...stats.ordersLast30Days.map((x) => x.count), 1);
                  const height = (d.count / max) * 100;
                  return (
                    <div
                      key={d.day}
                      className="group relative flex-1"
                      title={`${d.day}: ${d.count} замовл., €${d.total.toFixed(0)}`}
                    >
                      <div
                        className="w-full rounded-t bg-green-500 transition-colors hover:bg-green-600"
                        style={{ height: `${Math.max(height, 2)}%` }}
                      />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white group-hover:block">
                        {d.day}: {d.count} зам.
                        <br />€{d.total.toFixed(0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quality distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Товари за якістю</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={stats.productsByQuality.map((q) => ({
                label: q.quality,
                value: q.count,
              }))}
              labels={QUALITY_LABELS as unknown as Record<string, string>}
            />
          </CardContent>
        </Card>

        {/* Lots by status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Лоти за статусом</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={Object.entries(stats.lotsByStatus).map(([status, count]) => ({
                label: status,
                value: count,
              }))}
              labels={LOT_STATUS_LABELS as unknown as Record<string, string>}
            />
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Funnel + Revenue */}
      <div className="grid gap-4 md:grid-cols-2">
        <FunnelChart data={stats.funnelData} />
        <RevenueChart data={stats.revenueLast30Days} />
      </div>

      {/* Charts Row 3: Top products + New customers */}
      <div className="grid gap-4 md:grid-cols-2">
        <TopProductsTable data={stats.topProducts} />
        <NewCustomersChart data={stats.newCustomersLast30Days} />
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Останні замовлення</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentOrders.length === 0 ? (
            <p className="text-sm text-gray-500">Замовлень поки немає</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 font-medium">ID</th>
                    <th className="pb-2 font-medium">Клієнт</th>
                    <th className="pb-2 font-medium">Статус</th>
                    <th className="pb-2 font-medium">Сума (EUR)</th>
                    <th className="pb-2 font-medium">Позицій</th>
                    <th className="pb-2 font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentOrders.map((order) => (
                    <tr key={order.id} className="border-b">
                      <td className="py-2 font-mono text-xs">
                        {order.code1C ?? order.id.slice(0, 8)}
                      </td>
                      <td className="py-2">{order.customer.name}</td>
                      <td className="py-2">
                        {ORDER_STATUS_LABELS[order.status as OrderStatus] ??
                          order.status}
                      </td>
                      <td className="py-2">€{order.totalEur.toFixed(2)}</td>
                      <td className="py-2">{order._count.items}</td>
                      <td className="py-2">
                        {new Date(order.createdAt).toLocaleDateString("uk-UA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
