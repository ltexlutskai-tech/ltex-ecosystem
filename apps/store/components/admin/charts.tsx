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
                  <td className="py-1.5 max-w-[200px] truncate">
                    {product.productName}
                  </td>
                  <td className="py-1.5 text-right">{product.orderCount}</td>
                  <td className="py-1.5 text-right">
                    {product.totalEur.toFixed(2)}
                  </td>
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
    const x =
      padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y =
      height - padding - (d.revenue / maxRevenue) * (height - padding * 2);
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
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-36 w-full"
        preserveAspectRatio="none"
      >
        <path d={areaD} fill="hsl(142 72% 29% / 0.1)" />
        <path d={pathD} fill="none" stroke="hsl(142 72% 29%)" strokeWidth="2" />
        {data.map((d, i) => {
          const x =
            padding +
            (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
          const y =
            height -
            padding -
            (d.revenue / maxRevenue) * (height - padding * 2);
          return <circle key={i} cx={x} cy={y} r="3" fill="hsl(142 72% 29%)" />;
        })}
      </svg>
    </div>
  );
}

// ─── Avg Order Value Chart ───────────────────────────────────────────────────

interface DailyAvgOrder {
  date: Date;
  avgEur: number;
}

export function AvgOrderChart({
  data,
  periodLabel,
}: {
  data: DailyAvgOrder[];
  periodLabel: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">Середній чек ({periodLabel})</h3>
        <p className="text-sm text-muted-foreground">Немає даних</p>
      </div>
    );
  }

  const maxAvg = Math.max(...data.map((d) => d.avgEur), 1);
  const overallAvg = data.reduce((s, d) => s + d.avgEur, 0) / data.length;
  const width = 400;
  const height = 150;
  const padding = 4;

  const points = data.map((d, i) => {
    const x =
      padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (d.avgEur / maxAvg) * (height - padding * 2);
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(" L ")}`;

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-1 font-semibold">Середній чек ({periodLabel})</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Середнє: €{overallAvg.toFixed(2)}
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-36 w-full"
        preserveAspectRatio="none"
      >
        <path d={pathD} fill="none" stroke="hsl(220 72% 50%)" strokeWidth="2" />
        {data.map((d, i) => {
          const x =
            padding +
            (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
          const y =
            height - padding - (d.avgEur / maxAvg) * (height - padding * 2);
          return <circle key={i} cx={x} cy={y} r="3" fill="hsl(220 72% 50%)" />;
        })}
      </svg>
    </div>
  );
}

// ─── Category Pie Chart (SVG) ───────────────────────────────────────────────

interface CategoryStat {
  categoryName: string;
  orderCount: number;
}

const PIE_COLORS = [
  "#16a34a",
  "#2563eb",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#ca8a04",
  "#4f46e5",
];

export function CategoryPieChart({
  data,
  periodLabel,
}: {
  data: CategoryStat[];
  periodLabel: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">Категорії ({periodLabel})</h3>
        <p className="text-sm text-muted-foreground">Немає даних</p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.orderCount, 0);
  const size = 160;
  const center = size / 2;
  const radius = 60;

  let cumulativeAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const angle = (d.orderCount / total) * 2 * Math.PI;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    const endAngle = cumulativeAngle;

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return {
      path,
      color: PIE_COLORS[i % PIE_COLORS.length],
      name: d.categoryName,
      count: d.orderCount,
    };
  });

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">Категорії ({periodLabel})</h3>
      <div className="flex items-start gap-4">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s, i) => (
            <path
              key={i}
              d={s.path}
              fill={s.color}
              stroke="#fff"
              strokeWidth="1"
            />
          ))}
        </svg>
        <div className="space-y-1 text-xs">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: s.color }}
              />
              <span className="truncate">{s.name}</span>
              <span className="font-medium">({s.count})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Geography Bar Chart ────────────────────────────────────────────────────

interface CityStat {
  city: string;
  customerCount: number;
}

export function GeographyChart({ data }: { data: CityStat[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">Географія клієнтів (топ-10)</h3>
        <p className="text-sm text-muted-foreground">Немає даних</p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.customerCount), 1);

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">Географія клієнтів (топ-10)</h3>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.city} className="flex items-center gap-2">
            <span className="w-28 truncate text-xs text-gray-600">
              {item.city}
            </span>
            <div className="flex-1">
              <div
                className="h-5 rounded bg-blue-500 transition-all"
                style={{
                  width: `${(item.customerCount / max) * 100}%`,
                  minWidth: item.customerCount > 0 ? "4px" : "0px",
                }}
              />
            </div>
            <span className="w-10 text-right text-xs font-medium">
              {item.customerCount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Conversion Card ────────────────────────────────────────────────────────

interface ConversionData {
  carts: number;
  orders: number;
  rate: number;
}

export function ConversionCard({
  data,
  periodLabel,
}: {
  data: ConversionData;
  periodLabel: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">Конверсія ({periodLabel})</h3>
      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold">{data.carts}</p>
          <p className="text-xs text-muted-foreground">Кошиків</p>
        </div>
        <div className="text-2xl text-muted-foreground">→</div>
        <div className="text-center">
          <p className="text-2xl font-bold">{data.orders}</p>
          <p className="text-xs text-muted-foreground">Замовлень</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-green-600">{data.rate}%</p>
          <p className="text-xs text-muted-foreground">Конверсія</p>
        </div>
      </div>
    </div>
  );
}

// ─── Period Filter ──────────────────────────────────────────────────────────

interface PeriodFilterProps {
  currentPeriod: string;
}

const PERIODS = [
  { value: "7d", label: "7 днів" },
  { value: "30d", label: "30 днів" },
  { value: "90d", label: "90 днів" },
  { value: "1y", label: "Рік" },
];

export function PeriodFilter({ currentPeriod }: PeriodFilterProps) {
  return (
    <div className="flex gap-1">
      {PERIODS.map((p) => (
        <a
          key={p.value}
          href={`/admin?period=${p.value}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            currentPeriod === p.value
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {p.label}
        </a>
      ))}
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
