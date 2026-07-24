import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { getCashBalances } from "@/lib/manager/cash-count";
import { CashCountForm } from "./_components/cash-count-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Каса — щоденне підбиття — L-TEX Manager" };

const HISTORY_LIMIT = 30;

function fmt(n: number): string {
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function diffCell(actual: number, expected: number) {
  const diff = Math.round((actual - expected) * 100) / 100;
  if (diff === 0) return <span className="text-emerald-600">0.00 ✓</span>;
  return <span className="text-red-600">{fmt(diff)}</span>;
}

/**
 * «Каса (підбиття)» — Крок 4 банкінгу: щоденна звірка готівки ₴/€/$.
 * Обліковий залишок = живі рухи ДДС по касі (проведені касові ордери й
 * переміщення). Доступ — фінансовий контур.
 */
export default async function CashCountPage() {
  const user = await requireRole(["bookkeeper", "admin", "owner"]);
  if (!user) redirect("/manager");

  const [expected, history] = await Promise.all([
    getCashBalances(),
    prisma.cashCountSession.findMany({
      orderBy: { countDate: "desc" },
      take: HISTORY_LIMIT,
    }),
  ]);

  return (
    <div className="max-w-5xl space-y-4">
      <header>
        <h1 className="text-xl font-bold text-gray-800">
          Каса — щоденне підбиття
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Порахуйте готівку в касі по кожній валюті, внесіть фактичні суми —
          система звірить з обліком і підкаже, який документ створити при
          розбіжності.
        </p>
      </header>

      <CashCountForm expected={expected} />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Історія підбиттів
        </h2>
        {history.length === 0 ? (
          <p className="rounded-md border bg-white p-4 text-sm text-gray-500">
            Підбиттів ще не було — перше зʼявиться тут.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Дата</th>
                  <th className="px-3 py-2 text-right">₴ факт</th>
                  <th className="px-3 py-2 text-right">₴ різниця</th>
                  <th className="px-3 py-2 text-right">€ факт</th>
                  <th className="px-3 py-2 text-right">€ різниця</th>
                  <th className="px-3 py-2 text-right">$ факт</th>
                  <th className="px-3 py-2 text-right">$ різниця</th>
                  <th className="px-3 py-2">Хто</th>
                  <th className="px-3 py-2">Коментар</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                      {s.countDate.toLocaleString("uk-UA", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(Number(s.actualUah))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {diffCell(Number(s.actualUah), Number(s.expectedUah))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(Number(s.actualEur))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {diffCell(Number(s.actualEur), Number(s.expectedEur))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(Number(s.actualUsd))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {diffCell(Number(s.actualUsd), Number(s.expectedUsd))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                      {s.createdByName ?? "—"}
                    </td>
                    <td className="max-w-[240px] px-3 py-2 text-gray-500">
                      {s.comment ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400">
        Обліковий залишок рахується з проведених касових документів живої
        системи (з моменту переходу з 1С). Якщо стартовий залишок каси ще не
        внесено — створіть разовий прихідний касовий ордер на фактичну суму.
      </p>
    </div>
  );
}
