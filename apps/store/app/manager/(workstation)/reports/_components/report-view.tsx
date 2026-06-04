import Link from "next/link";
import type { ReportShape } from "@/lib/reports/analyst-reports";
import type { PeriodPreset } from "@/lib/finance/owner-stats";

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Сьогодні",
  week: "Тиждень",
  month: "Місяць",
  year: "Рік",
  all: "Весь час",
};

/**
 * Універсальний рендерер табличного звіту (← Тиждень 5 блоку Ролі).
 *
 * Один компонент для всіх звітів — даних обробляється у lib/reports/.
 * Кнопка «Завантажити CSV» викликає `/api/v1/manager/reports/{id}/csv`.
 */
export function ReportView({
  report,
  reportId,
  currentPreset,
  showPeriodSelector = true,
}: {
  report: ReportShape;
  reportId: string;
  currentPreset?: PeriodPreset;
  showPeriodSelector?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm">
        <Link
          href="/manager"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← На дашборд
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{report.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Період: {report.period.label}
          </p>
        </div>
        <a
          href={`/api/v1/manager/reports/${reportId}/csv${currentPreset ? `?period=${currentPreset}` : ""}`}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          📥 Завантажити Excel (CSV)
        </a>
      </div>

      {showPeriodSelector && currentPreset && (
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
      )}

      {report.rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          За цей період даних немає.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                {report.headers.map((h) => (
                  <th key={h} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.rows.map((r, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  {r.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-3 py-2 ${
                        typeof cell === "number" ? "text-right" : ""
                      }`}
                    >
                      {formatCell(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Всього рядків: {report.rows.length}
      </p>
    </div>
  );
}

function formatCell(v: string | number | Date | null): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const yy = String(v.getFullYear()).slice(-2);
    return `${dd}.${mm}.${yy}`;
  }
  if (typeof v === "number") {
    return v.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
  }
  return String(v);
}
