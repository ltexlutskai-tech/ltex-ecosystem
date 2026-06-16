import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { buildOverdueDebtsReport } from "@/lib/reports/overdue-debts";
import { EmptyState } from "../../_components/empty-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Прострочені борги | L-TEX" };

const DEFAULT_THRESHOLD = 14;

function parseThreshold(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(value ?? "", 10);
  if (Number.isNaN(n)) return DEFAULT_THRESHOLD;
  return Math.min(3650, Math.max(0, n));
}

function eur(n: number): string {
  return `${n.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ threshold?: string | string[] }>;
}) {
  const user = await requireRole([
    "analyst",
    "admin",
    "owner",
    "supervisor",
    "bookkeeper",
  ]);
  if (!user) notFound();

  const { threshold: thresholdRaw } = await searchParams;
  const threshold = parseThreshold(thresholdRaw);
  const report = await buildOverdueDebtsReport(threshold);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← На дашборд
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          Прострочені борги по договорам
        </h1>
        <a
          href={`/api/v1/manager/reports/debts/csv?threshold=${threshold}`}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          📥 Експорт CSV
        </a>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-md border bg-white p-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Поріг прострочки, днів</span>
          <input
            name="threshold"
            type="number"
            min={0}
            max={3650}
            defaultValue={threshold}
            className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900"
        >
          Сформувати
        </button>
      </form>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
        <span>
          Боржників: <strong>{report.rows.length}</strong>
        </span>
        <span>
          Σ борг: <strong>{eur(report.totalDebtEur)}</strong>
        </span>
        <span>
          Σ прострочка:{" "}
          <strong className="text-red-700">
            {eur(report.totalOverdueEur)}
          </strong>
        </span>
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          message="Боржників немає"
          hint="Жоден контрагент не має боргу > 0."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Контрагент</th>
                <th className="px-3 py-2 text-right">Борг €</th>
                <th className="px-3 py-2 text-right">Прострочений борг €</th>
                <th className="px-3 py-2 text-right">Днів</th>
                <th className="px-3 py-2">Діяльність</th>
                <th className="px-3 py-2">Торговий агент</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.rows.map((r) => (
                <tr
                  key={r.clientId}
                  className={r.isOverdue ? "bg-red-50" : "hover:bg-gray-50"}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/manager/customers/${r.clientId}`}
                      className="text-emerald-700 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {eur(r.debtEur)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {eur(r.overdueEur)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.daysSinceLastPurchase ?? ""}
                  </td>
                  <td className="px-3 py-2">
                    {r.isOverdue && (
                      <span className="font-medium text-red-700">
                        Претензійна робота!
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.agentName ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
