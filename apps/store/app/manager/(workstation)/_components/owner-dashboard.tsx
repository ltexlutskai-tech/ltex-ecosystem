import Link from "next/link";
import type { FinanceStats, PeriodPreset } from "@/lib/finance/owner-stats";

/**
 * Owner-кабінет — фінансовий дашборд (← Тиждень 3 блоку Ролі).
 *
 * Узгоджено з user 2026-06-02:
 *   - Повний доступ + дії логуються (вже зроблено через `isOwnerAction`).
 *   - Аналог 1С звітів «Аналіз продаж по клієнтам», «Прострочені борги» тощо.
 */
const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Сьогодні",
  week: "Тиждень",
  month: "Місяць",
  year: "Рік",
  all: "Весь час",
};

export function OwnerDashboard({
  fullName,
  stats,
  currentPreset,
}: {
  fullName: string;
  stats: FinanceStats;
  currentPreset: PeriodPreset;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Вітаємо, {fullName}!</h1>
        <p className="mt-1 text-sm text-gray-500">
          Фінансовий дашборд — період {stats.period.label.toLowerCase()}.
        </p>
      </div>

      {/* Період */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Період:</span>
        {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
          <Link
            key={p}
            href={`?period=${p}`}
            className={`rounded-md border px-3 py-1 text-sm ${
              p === currentPreset
                ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
            }`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </div>

      {/* 4 KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Виручка"
          value={`${fmt(stats.revenueEur)} €`}
          sub={`${stats.salesCount} реалізацій`}
          accent="emerald"
        />
        <Kpi
          label="Маржа"
          value={`${fmt(stats.marginEurKnown)} €`}
          sub={
            stats.lotsWithoutCost > 0
              ? `⚠ ${stats.lotsWithoutCost} рядків без закупки`
              : "повний розрахунок"
          }
          accent="indigo"
        />
        <Kpi
          label="Борги клієнтів"
          value={`${fmt(stats.totalDebtEur)} €`}
          sub="сумарно по базі"
          accent="amber"
        />
        <Kpi
          label="Активні клієнти"
          value={String(stats.activeClientsCount)}
          sub="у базі"
          accent="sky"
        />
      </div>

      {/* Графік виручки за 12 місяців */}
      <section className="rounded-md border bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">
          Виручка за останні 12 місяців
        </h2>
        <RevenueChart data={stats.monthlyRevenue} />
      </section>

      {/* Топ-10 клієнтів */}
      <section className="rounded-md border bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">
          Топ-10 клієнтів за виручкою ({stats.period.label.toLowerCase()})
        </h2>
        {stats.topClients.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
            За цей період реалізацій немає.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Клієнт</th>
                  <th className="px-2 py-1.5 text-right">Виручка, €</th>
                  <th className="px-2 py-1.5 text-right">Реалізацій</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.topClients.map((c, idx) => (
                  <tr key={c.id}>
                    <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-gray-900">{c.name}</td>
                    <td className="px-2 py-1.5 text-right font-medium">
                      {fmt(c.revenueEur)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-600">
                      {c.salesCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const ACCENT_COLOR: Record<string, string> = {
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-900",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
  sky: "bg-sky-50 border-sky-200 text-sky-900",
};

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: keyof typeof ACCENT_COLOR;
}) {
  return (
    <div className={`rounded-md border p-3 ${ACCENT_COLOR[accent]}`}>
      <div className="text-xs uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs opacity-75">{sub}</div>
    </div>
  );
}

function RevenueChart({
  data,
}: {
  data: { yearMonth: string; revenueEur: number }[];
}) {
  if (data.length === 0) {
    return <div className="text-sm text-gray-500">Немає даних для графіка</div>;
  }
  const max = Math.max(...data.map((d) => d.revenueEur), 1);
  const w = 800;
  const h = 220;
  const padding = { l: 40, r: 10, t: 10, b: 30 };
  const barW = (w - padding.l - padding.r) / data.length;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* осі */}
      <line
        x1={padding.l}
        y1={h - padding.b}
        x2={w - padding.r}
        y2={h - padding.b}
        stroke="#e5e7eb"
      />
      <line
        x1={padding.l}
        y1={padding.t}
        x2={padding.l}
        y2={h - padding.b}
        stroke="#e5e7eb"
      />
      {/* стовпчики */}
      {data.map((d, i) => {
        const barH = (d.revenueEur / max) * (h - padding.t - padding.b);
        const x = padding.l + i * barW + 4;
        const y = h - padding.b - barH;
        const [year, month] = d.yearMonth.split("-");
        return (
          <g key={d.yearMonth}>
            <rect
              x={x}
              y={y}
              width={Math.max(barW - 8, 4)}
              height={barH}
              fill="#10b981"
              opacity="0.85"
            >
              <title>
                {d.yearMonth}: {d.revenueEur.toLocaleString("uk-UA")} €
              </title>
            </rect>
            {/* підпис місяця знизу */}
            <text
              x={x + (barW - 8) / 2}
              y={h - padding.b + 14}
              fontSize="10"
              textAnchor="middle"
              fill="#6b7280"
            >
              {month}.{year?.slice(2)}
            </text>
          </g>
        );
      })}
      {/* шкала зліва */}
      <text
        x={padding.l - 4}
        y={padding.t + 8}
        fontSize="10"
        textAnchor="end"
        fill="#6b7280"
      >
        {fmt(max)} €
      </text>
      <text
        x={padding.l - 4}
        y={h - padding.b - 2}
        fontSize="10"
        textAnchor="end"
        fill="#6b7280"
      >
        0
      </text>
    </svg>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}
