import Link from "next/link";
import {
  MARGIN_GROUPS,
  MARGIN_GROUP_LABELS,
  type MarginGroupBy,
} from "@/lib/reports/margin-report";
import type { PeriodPreset } from "@/lib/finance/owner-stats";

/**
 * Перемикач групування звіту маржі (товари / клієнти / агенти / категорії).
 * Зберігає поточний період у посиланні.
 */
export function MarginGroupNav({
  current,
  period,
}: {
  current: MarginGroupBy;
  period: PeriodPreset;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-gray-500">Групувати по:</span>
      {MARGIN_GROUPS.map((g) => (
        <Link
          key={g}
          href={`?group=${g}&period=${period}`}
          aria-current={g === current ? "true" : undefined}
          className={`rounded-md border px-3 py-1 text-sm ${
            g === current
              ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
          }`}
        >
          {MARGIN_GROUP_LABELS[g]}
        </Link>
      ))}
    </div>
  );
}
