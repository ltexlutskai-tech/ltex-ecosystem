import Link from "next/link";
import type { BookkeeperStats } from "@/lib/finance/bookkeeper-stats";
import type { PeriodPreset } from "@/lib/finance/owner-stats";

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Сьогодні",
  week: "Тиждень",
  month: "Місяць",
  year: "Рік",
  all: "Весь час",
};

export function BookkeeperDashboard({
  fullName,
  stats,
  currentPreset,
}: {
  fullName: string;
  stats: BookkeeperStats;
  currentPreset: PeriodPreset;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Вітаємо, {fullName}!</h1>
        <p className="mt-1 text-sm text-gray-500">
          Каса і взаєморозрахунки — період {stats.period.label.toLowerCase()}.
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Надходження каси"
          value={`${fmt(stats.cashInEur)} €`}
          sub="за період"
          accent="emerald"
        />
        <Kpi
          label="Витрати каси"
          value={`${fmt(stats.cashOutEur)} €`}
          sub="за період"
          accent="red"
        />
        <Kpi
          label="Сальдо каси"
          value={`${fmt(stats.cashBalanceEur)} €`}
          sub={`${stats.cashOrdersCount} касових ордерів`}
          accent={stats.cashBalanceEur >= 0 ? "indigo" : "red"}
        />
        <Kpi
          label="Сумарний борг"
          value={`${fmt(stats.totalDebtEur)} €`}
          sub="по всіх клієнтах"
          accent="amber"
        />
      </div>

      {/* Курси валют */}
      <section className="rounded-md border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Поточні курси</h2>
          <Link
            href="/manager/registry/rates"
            className="text-xs text-emerald-700 hover:underline"
          >
            Переглянути →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border bg-gray-50 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              EUR → UAH
            </div>
            <div className="mt-1 text-xl font-bold">
              {stats.rates.eur ? fmt(stats.rates.eur) : "—"}
            </div>
          </div>
          <div className="rounded-md border bg-gray-50 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              USD → UAH
            </div>
            <div className="mt-1 text-xl font-bold">
              {stats.rates.usd ? fmt(stats.rates.usd) : "—"}
            </div>
          </div>
        </div>
        {stats.rates.updatedAt && (
          <p className="mt-2 text-xs text-gray-500">
            Оновлено: {formatDate(stats.rates.updatedAt)}
          </p>
        )}
      </section>

      <section className="rounded-md border bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">
          Топ-10 боржників ({stats.topDebtors.length})
        </h2>
        {stats.topDebtors.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
            Боргів немає — усі клієнти оплатили.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Клієнт</th>
                  <th className="px-2 py-1.5 text-right">Борг, €</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.topDebtors.map((d, idx) => (
                  <tr key={d.id}>
                    <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/manager/customers/${d.id}`}
                        className="text-emerald-700 hover:underline"
                      >
                        {d.name}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-amber-700">
                      {fmt(d.debt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">Останні 20 реалізацій</h2>
        {stats.recentSales.length === 0 ? (
          <div className="text-sm text-gray-500">Реалізацій немає.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-1.5">№</th>
                  <th className="px-2 py-1.5">Дата</th>
                  <th className="px-2 py-1.5">Клієнт</th>
                  <th className="px-2 py-1.5 text-right">Сума, €</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/manager/sales/${s.id}`}
                        className="text-emerald-700 hover:underline"
                      >
                        L{String(s.docNumber).padStart(7, "0")}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-gray-600">
                      {formatDate(s.createdAt)}
                    </td>
                    <td className="px-2 py-1.5 text-gray-900">
                      {s.customerName}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium">
                      {fmt(s.totalEur)}
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
  red: "bg-red-50 border-red-200 text-red-900",
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

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}
