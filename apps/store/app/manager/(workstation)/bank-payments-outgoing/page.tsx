import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  docStatusClass,
  docStatusLabel,
  fmtAmount,
  fmtEur,
  formatDocNo,
} from "@/lib/manager/financial-docs";
import { EmptyState } from "../_components/empty-state";
import { ListPagination } from "../customers/_components/list-pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Платіжні доручення вихідні — L-TEX Manager" };

const PAGE_SIZE = 30;

export default async function BankPaymentsOutgoingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole(["bookkeeper", "admin", "owner"]);
  if (!user) redirect("/manager");

  const sp = await searchParams;
  const pageRaw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
  const showArchived =
    (Array.isArray(sp.archived) ? sp.archived[0] : sp.archived) === "1";

  const where = showArchived ? {} : { archived: false };

  const [items, total] = await Promise.all([
    prisma.bankPaymentOutgoing.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number1C: true,
        docNumber: true,
        paidAt: true,
        amount: true,
        currency: true,
        amountEur: true,
        status: true,
        customer: { select: { name: true } },
        bankAccountRef: { select: { name: true } },
      },
    }),
    prisma.bankPaymentOutgoing.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-none space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            Платіжні доручення вихідні
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Безготівкові оплати / витрати · усього: {total}
          </p>
        </div>
        <Link
          href="/manager/bank-payments-outgoing/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + Створити
        </Link>
      </header>

      <div className="flex items-center gap-3 text-sm">
        <Link
          href={
            showArchived
              ? "/manager/bank-payments-outgoing"
              : "/manager/bank-payments-outgoing?archived=1"
          }
          className="text-emerald-700 hover:underline"
        >
          {showArchived ? "Сховати архівні" : "Показати архівні"}
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          message="Вихідних платіжок немає"
          hint="Документи переносяться з 1С (--entity bankdocs) або створюються вручну."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">№</th>
                  <th className="px-3 py-2">Дата</th>
                  <th className="px-3 py-2">Контрагент</th>
                  <th className="px-3 py-2">Рахунок</th>
                  <th className="px-3 py-2 text-right">Сума</th>
                  <th className="px-3 py-2 text-right">€</th>
                  <th className="px-3 py-2">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/manager/bank-payments-outgoing/${d.id}`}
                        className="text-emerald-700 hover:underline"
                      >
                        {formatDocNo(d.number1C, d.docNumber)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.paidAt.toLocaleDateString("uk-UA")}
                    </td>
                    <td className="px-3 py-2">{d.customer?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {d.bankAccountRef?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtAmount(d.amount, d.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                      {fmtEur(d.amountEur)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusClass(
                          d.status,
                        )}`}
                      >
                        {docStatusLabel(d.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPagination page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
