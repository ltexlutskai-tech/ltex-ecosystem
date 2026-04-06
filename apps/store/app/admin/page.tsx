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
  type OrderStatus,
} from "@ltex/shared";
import { ShoppingCart, Package, Boxes, TrendingUp } from "lucide-react";

async function getStats() {
  const [
    ordersCount,
    ordersByStatus,
    totalRevenue,
    productsCount,
    lotsCount,
    lotsByStatus,
    recentOrders,
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
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { customer: true, _count: { select: { items: true } } },
    }),
  ]);

  return {
    ordersCount,
    ordersByStatus: Object.fromEntries(
      ordersByStatus.map((g) => [g.status, g._count.id]),
    ) as Record<string, number>,
    totalRevenue: totalRevenue._sum.totalEur ?? 0,
    productsCount,
    lotsCount,
    lotsByStatus: Object.fromEntries(
      lotsByStatus.map((g) => [g.status, g._count.id]),
    ) as Record<string, number>,
    recentOrders,
  };
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
        .map(([status, count]) => `${status}: ${count}`)
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
