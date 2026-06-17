import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { buildReconciliationReport } from "@/lib/reports/reconciliation";
import { EmptyState } from "../../_components/empty-state";
import { ReportsNav } from "../_components/reports-nav";
import { ReconClientPicker } from "./_components/recon-client-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Акт звірки взаєморозрахунків | L-TEX" };

function eur(n: number): string {
  return `${n.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function parseDate(raw: string | string[] | undefined): Date | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA");
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    clientId?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) {
  const user = await requireRole([
    "analyst",
    "admin",
    "owner",
    "supervisor",
    "bookkeeper",
  ]);
  if (!user) notFound();

  const sp = await searchParams;
  const clientId = Array.isArray(sp.clientId) ? sp.clientId[0] : sp.clientId;
  const from = parseDate(sp.from);
  const to = parseDate(sp.to);

  const report = clientId
    ? await buildReconciliationReport(clientId, from, to)
    : null;

  // Назва обраного клієнта для пікера (коли вже вибрано).
  let initialName: string | null = report?.clientName ?? null;
  if (clientId && !initialName) {
    const c = await prisma.mgrClient.findUnique({
      where: { id: clientId },
      select: { name: true },
    });
    initialName = c?.name ?? null;
  }

  const fromValue = from ? from.toISOString().slice(0, 10) : "";
  const toValue = to ? to.toISOString().slice(0, 10) : "";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← На дашборд
        </Link>
      </div>

      <h1 className="text-2xl font-semibold">Акт звірки взаєморозрахунків</h1>

      <ReportsNav />

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-md border bg-white p-3"
      >
        <ReconClientPicker initialName={initialName} />
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Період з</span>
          <input
            name="from"
            type="date"
            defaultValue={fromValue}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">по</span>
          <input
            name="to"
            type="date"
            defaultValue={toValue}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900"
        >
          Сформувати
        </button>
      </form>

      {!clientId ? (
        <EmptyState
          message="Оберіть контрагента"
          hint="Акт звірки формується по одному контрагенту за період."
        />
      ) : !report ? (
        <EmptyState
          message="Контрагента не знайдено"
          hint="Спробуйте обрати іншого контрагента."
        />
      ) : (
        <>
          <div className="rounded-md border bg-white p-4">
            <h2 className="text-lg font-semibold">{report.clientName}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {report.from || report.to ? (
                <>
                  Період:{" "}
                  {report.from ? report.from.toLocaleDateString("uk-UA") : "…"}{" "}
                  — {report.to ? report.to.toLocaleDateString("uk-UA") : "…"}
                </>
              ) : (
                "За весь час"
              )}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <div className="text-gray-500">Сальдо на початок</div>
                <div className="font-semibold tabular-nums">
                  {eur(report.openingBalanceEur)}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Дебет (реалізації)</div>
                <div className="font-semibold tabular-nums">
                  {eur(report.totalDebitEur)}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Кредит (оплати)</div>
                <div className="font-semibold tabular-nums">
                  {eur(report.totalCreditEur)}
                </div>
              </div>
              <div>
                <div className="text-gray-500">Сальдо на кінець</div>
                <div
                  className={`font-semibold tabular-nums ${
                    report.closingBalanceEur > 0
                      ? "text-red-700"
                      : report.closingBalanceEur < 0
                        ? "text-emerald-700"
                        : ""
                  }`}
                >
                  {eur(report.closingBalanceEur)}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Додатне сальдо — клієнт винен L-TEX; від&apos;ємне — переплата
              клієнта.
            </p>
          </div>

          {report.rows.length === 0 ? (
            <EmptyState
              message="Рухів за період немає"
              hint="За обраний період немає реалізацій чи оплат."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Дата</th>
                    <th className="px-3 py-2">Операція</th>
                    <th className="px-3 py-2">Джерело</th>
                    <th className="px-3 py-2 text-right">Дебет €</th>
                    <th className="px-3 py-2 text-right">Кредит €</th>
                    <th className="px-3 py-2 text-right">Сальдо €</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {fmtDate(r.occurredAt)}
                      </td>
                      <td className="px-3 py-2">{r.kindLabel}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {r.sourceLabel}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.debitEur > 0 ? eur(r.debitEur) : ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.creditEur > 0 ? eur(r.creditEur) : ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {eur(r.runningBalanceEur)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={3}>
                      Разом
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {eur(report.totalDebitEur)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {eur(report.totalCreditEur)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {eur(report.closingBalanceEur)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
