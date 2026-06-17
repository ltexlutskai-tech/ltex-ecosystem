import Link from "next/link";
import type { PeriodPreset } from "@/lib/finance/owner-stats";
import type { MarginGroupBy } from "@/lib/reports/margin-report";

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Сьогодні",
  week: "Тиждень",
  month: "Місяць",
  year: "Рік",
  all: "Весь час",
};

/**
 * Перемикач періоду звіту маржі. Зберігає поточне групування у посиланні
 * (стандартний `ReportView` цього не вміє — він скидає `group`).
 */
export function MarginPeriodNav({
  current,
  group,
}: {
  current: PeriodPreset;
  group: MarginGroupBy;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-gray-500">Період:</span>
      {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
        <Link
          key={p}
          href={`?group=${group}&period=${p}`}
          className={`rounded-md border px-3 py-1 text-sm ${
            p === current
              ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
          }`}
        >
          {PERIOD_LABELS[p]}
        </Link>
      ))}
    </div>
  );
}
