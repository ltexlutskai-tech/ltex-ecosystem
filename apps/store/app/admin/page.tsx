export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@ltex/ui";
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
  AvgOrderChart,
  CategoryPieChart,
  GeographyChart,
  ConversionCard,
  PeriodFilter,
} from "@/components/admin/charts";
import { getAdminStats, type Period } from "@/lib/admin-stats";
import { AutoRefresh } from "@/components/admin/auto-refresh";

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
              style={{
                width: `${(item.value / max) * 100}%`,
                minWidth: item.value > 0 ? "4px" : "0px",
              }}
            />
          </div>
          <span className="w-10 text-right text-xs font-medium">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const VALID_PERIODS: Period[] = ["7d", "30d", "90d", "1y"];

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const period: Period = VALID_PERIODS.includes(params.period as Period)
    ? (params.period as Period)
    : "30d";

  const stats = await getAdminStats(period);

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
        .map(
          ([status, count]) =>
            `${LOT_STATUS_LABELS[status as LotStatus] ?? status}: ${count}`,
        )
        .join(", "),
    },
  ];

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Дашборд</h1>
        <PeriodFilter currentPeriod={period} />
      </div>

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

      {/* Charts Row 1: Orders, Quality, Lots */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Замовлення ({stats.periodLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.ordersLast30Days.length === 0 ? (
              <p className="text-sm text-gray-500">Немає даних</p>
            ) : (
              <div className="flex items-end gap-1" style={{ height: 120 }}>
                {stats.ordersLast30Days.map((d) => {
                  const max = Math.max(
                    ...stats.ordersLast30Days.map((x) => x.count),
                    1,
                  );
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Лоти за статусом</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={Object.entries(stats.lotsByStatus).map(
                ([status, count]) => ({
                  label: status,
                  value: count,
                }),
              )}
              labels={LOT_STATUS_LABELS as unknown as Record<string, string>}
            />
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Funnel + Revenue + Avg Order */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <FunnelChart data={stats.funnelData} />
        <RevenueChart data={stats.revenueLast30Days} />
        <AvgOrderChart
          data={stats.avgOrderByDay}
          periodLabel={stats.periodLabel}
        />
      </div>

      {/* Charts Row 3: Categories + Geography + Conversion */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <CategoryPieChart
          data={stats.topCategories}
          periodLabel={stats.periodLabel}
        />
        <GeographyChart data={stats.topCities} />
        <ConversionCard
          data={stats.conversion}
          periodLabel={stats.periodLabel}
        />
      </div>

      {/* Charts Row 4: Top products + New customers */}
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
