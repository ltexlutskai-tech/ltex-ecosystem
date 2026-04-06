"use client";

interface StatusCount {
  status: string;
  count: number;
}

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

const STATUS_LABELS: Record<string, string> = {
  draft: "Чернетка",
  pending: "Очікує",
  confirmed: "Підтверджено",
  processing: "В обробці",
  shipped: "Відправлено",
  delivered: "Доставлено",
  cancelled: "Скасовано",
};

const FUNNEL_COLORS = [
  "bg-primary",
  "bg-primary/80",
  "bg-primary/60",
  "bg-primary/40",
  "bg-accent",
  "bg-green-500",
  "bg-destructive/60",
];

// ─── Funnel Chart ────────────────────────────────────────────────────────────

export function FunnelChart({ data }: { data: StatusCount[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">Воронка замовлень</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Немає даних</p>
      ) : (
        <div className="space-y-2">
          {data.map((item, i) => {
            const width = (item.count / maxCount) * 100;
            return (
              <div key={item.status} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-sm">
                  {STATUS_LABELS[item.status] ?? item.status}
                </span>
                <div className="flex-1">
                  <div
                    className={`h-7 rounded ${FUNNEL_COLORS[i % FUNNEL_COLORS.length]} flex items-center px-2 text-xs font-medium text-white`}
                    style={{ width: `${Math.max(width, 8)}%` }}
                  >
                    {item.count}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Top Products Table ──────────────────────────────────────────────────────

export function TopProductsTable({ data }: { data: TopProduct[] }) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">Топ-10 товарів</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Немає даних</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Товар</th>
                <th className="pb-2 text-right font-medium">Замовлень</th>
                <th className="pb-2 text-right font-medium">Сума, &euro;</th>
              </tr>
            </thead>
            <tbody>
              {data.map((product, i) => (
                <tr key={product.productId} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 max-w-[200px] truncate">{product.productName}</td>
                  <td className="py-1.5 text-right">{product.orderCount}</td>
                  <td className="py-1.5 text-right">{product.totalEur.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Revenue Chart (line chart via SVG) ──────────────────────────────────────

export function RevenueChart({ data }: { data: DailyRevenue[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">Виручка за 30 днів, &euro;</h3>
        <p className="text-sm text-muted-foreground">Немає даних</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const width = 400;
  const height = 150;
  const padding = 4;

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (d.revenue / maxRevenue) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;

  // Area fill
  const areaD = `${pathD} L ${padding + ((data.length - 1) / Math.max(data.length - 1, 1)) * (width - padding * 2)},${height - padding} L ${padding},${height - padding} Z`;

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-1 font-semibold">Виручка за 30 днів</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Всього: {totalRevenue.toFixed(2)} &euro;
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" preserveAspectRatio="none">
        <path d={areaD} fill="hsl(142 72% 29% / 0.1)" />
        <path d={pathD} fill="none" stroke="hsl(142 72% 29%)" strokeWidth="2" />
        {data.map((d, i) => {
          const x = padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
          const y = height - padding - (d.revenue / maxRevenue) * (height - padding * 2);
          return (
            <circle key={i} cx={x} cy={y} r="3" fill="hsl(142 72% 29%)" />
          );
        })}
      </svg>
    </div>
  );
}

// ─── New Customers Chart ─────────────────────────────────────────────────────

export function NewCustomersChart({ data }: { data: DailyCustomers[] }) {
  const totalNew = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-1 font-semibold">Нові клієнти за 30 днів</h3>
      <p className="mb-3 text-sm text-muted-foreground">Всього: {totalNew}</p>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Немає даних</p>
      ) : (
        <div className="flex h-32 items-end gap-1">
          {data.map((d, i) => {
            const max = Math.max(...data.map((x) => x.count), 1);
            const height = (d.count / max) * 100;
            return (
              <div
                key={i}
                className="flex-1 rounded-t bg-accent"
                style={{ height: `${Math.max(height, 4)}%` }}
                title={`${String(d.date).slice(0, 10)}: ${d.count}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
