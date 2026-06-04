import Link from "next/link";
import type { SupervisorStats } from "@/lib/finance/supervisor-stats";
import type { PeriodPreset } from "@/lib/finance/owner-stats";

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Сьогодні",
  week: "Тиждень",
  month: "Місяць",
  year: "Рік",
  all: "Весь час",
};

export function SupervisorDashboard({
  fullName,
  stats,
  currentPreset,
}: {
  fullName: string;
  stats: SupervisorStats;
  currentPreset: PeriodPreset;
}) {
  const maxRevenue = Math.max(...stats.managers.map((m) => m.revenueEur), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Вітаємо, {fullName}!</h1>
        <p className="mt-1 text-sm text-gray-500">
          Огляд менеджерів за період {stats.period.label.toLowerCase()}.
        </p>
      </div>

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

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Загальна виручка"
          value={`${fmt(stats.totalRevenueEur)} €`}
          sub={`${stats.totalSalesCount} реалізацій`}
          accent="emerald"
        />
        <Kpi
          label="Менеджерів"
          value={String(stats.totalManagers)}
          sub="активних"
          accent="indigo"
        />
        <Kpi
          label="Сер. виручка/менеджер"
          value={`${fmt(
            stats.totalManagers > 0
              ? stats.totalRevenueEur / stats.totalManagers
              : 0,
          )} €`}
          sub="за період"
          accent="sky"
        />
      </div>

      <section className="rounded-md border bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">
          Рейтинг менеджерів ({stats.managers.length})
        </h2>
        {stats.managers.length === 0 ? (
          <div className="text-sm text-gray-500">Менеджерів не знайдено.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Менеджер</th>
                  <th className="px-2 py-1.5 text-right">Клієнти</th>
                  <th className="px-2 py-1.5 text-right">Активні зам.</th>
                  <th className="px-2 py-1.5 text-right">Реалізації</th>
                  <th className="px-2 py-1.5 text-right">Виручка, €</th>
                  <th className="px-2 py-1.5">Частка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.managers.map((m, idx) => {
                  const pct = (m.revenueEur / maxRevenue) * 100;
                  return (
                    <tr key={m.userId}>
                      <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium text-gray-900">
                          {m.fullName}
                        </div>
                        <div className="text-xs text-gray-500">{m.email}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-700">
                        {m.clientCount}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-700">
                        {m.activeOrdersCount}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-700">
                        {m.salesCount}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {fmt(m.revenueEur)}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="h-2 w-32 rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}
