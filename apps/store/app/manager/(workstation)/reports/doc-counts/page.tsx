import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, Prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { ReportsNav } from "../_components/reports-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Кількості документів | L-TEX" };

/** Парс `YYYY-MM-DD` → Date | undefined (безпечно). */
function parseDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Фільтр по `createdAt` у межах [from, to] (кінець дня включно). */
function createdAtFilter(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  const gte = parseDate(from);
  const toDate = parseDate(to);
  if (!gte && !toDate) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (gte) f.gte = gte;
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    f.lte = end;
  }
  return f;
}

export default async function DocCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
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
  const occurred = createdAtFilter(sp.from, sp.to);
  const where = occurred ? { createdAt: occurred } : {};

  const [orders, sales, cashOrders, routeSheets, clientsTotal] =
    await Promise.all([
      prisma.order.count({ where }),
      prisma.sale.count({ where }),
      prisma.mgrCashOrder.count({ where }),
      prisma.routeSheet.count({ where }),
      prisma.mgrClient.count(),
    ]);

  const hasPeriod = Boolean(occurred);
  const rows: { label: string; count: number; note?: string }[] = [
    { label: "Замовлення", count: orders },
    { label: "Реалізації", count: sales },
    { label: "Касові ордери", count: cashOrders },
    { label: "Маршрутні листи", count: routeSheets },
    {
      label: "Клієнти (усього)",
      count: clientsTotal,
      note: "за весь час (без періоду)",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← На дашборд
        </Link>
      </div>

      <h1 className="text-2xl font-semibold">Кількості документів</h1>
      <ReportsNav />

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-md border bg-white p-3"
      >
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-500">Період з</span>
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="h-8 w-40 rounded-md border border-gray-300 px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-500">по</span>
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="h-8 w-40 rounded-md border border-gray-300 px-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="h-8 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Показати
        </button>
      </form>

      <p className="text-sm text-gray-500">
        {hasPeriod
          ? "Кількість документів за обраний період (за датою документа)."
          : "Кількість документів за весь час. Оберіть період для звірки з 1С."}
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Документ</th>
              <th className="px-4 py-2 text-right font-medium">Кількість</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.label} className="hover:bg-gray-50/60">
                <td className="px-4 py-2 text-gray-800">
                  {r.label}
                  {r.note && (
                    <span className="ml-2 text-xs text-gray-400">{r.note}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">
                  {r.count.toLocaleString("uk-UA")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
