import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { prisma, Prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/sale-ownership";
import {
  buildCashOrdersWhere,
  cashOrderRowInclude,
  normalizeCashOrderType,
  serializeCashOrderRow,
} from "@/lib/manager/cash-orders-list";
import { EmptyState } from "../_components/empty-state";
import { ListPagination } from "../customers/_components/list-pagination";
import { PaymentsTable } from "./_components/payments-table";
import { PaymentsToolbar } from "./_components/payments-toolbar";
import { parsePaymentsFilterFromSearchParams } from "./_components/payments-filter-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Оплати — L-TEX Manager" };

function buildOrderBy(
  sort: string,
  dir: "asc" | "desc",
): Prisma.MgrCashOrderOrderByWithRelationInput {
  switch (sort) {
    case "code":
      return { docNumber: dir };
    case "type":
      return { type: dir };
    case "sum":
      return { documentSumEur: dir };
    case "client":
      return { customer: { name: dir } };
    case "article":
      return { cashFlowArticleRef: { name: dir } };
    case "account":
      return { bankAccountRef: { name: dir } };
    case "date":
    default:
      return { paidAt: dir };
  }
}

export default async function ManagerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const filter = parsePaymentsFilterFromSearchParams(sp);

  const myCodes = await getMyClientCodes1C(user);

  const header = (
    <header className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Оплати</h1>
        <p className="mt-1 text-sm text-gray-600">Каса · касові ордери</p>
      </div>
      <Link
        href="/manager/payments/new"
        className="inline-flex h-10 items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
      >
        <Plus className="mr-1 h-4 w-4" />
        Створити
      </Link>
    </header>
  );

  // Manager без призначених клієнтів → порожній список.
  if (myCodes !== null && myCodes.length === 0) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        {header}
        <PaymentsToolbar />
        <EmptyState
          message="У вас поки немає призначених клієнтів"
          hint="Адміністратор має призначити вам клієнтів у розділі «Клієнти»."
        />
      </div>
    );
  }

  const fromDate = filter.from ? new Date(filter.from) : undefined;
  const toDate = filter.to ? new Date(filter.to) : undefined;

  const where = buildCashOrdersWhere({
    scope: myCodes,
    search: filter.search || undefined,
    type: normalizeCashOrderType(filter.type || undefined),
    archived: filter.archived,
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    client: filter.client || undefined,
    article: filter.article || undefined,
    account: filter.account || undefined,
  });

  const [items, total] = await Promise.all([
    prisma.mgrCashOrder.findMany({
      where,
      orderBy: buildOrderBy(filter.sort, filter.dir),
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: cashOrderRowInclude,
    }),
    prisma.mgrCashOrder.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
  const rows = items.map((o) => serializeCashOrderRow(o));

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Оплати</h1>
          <p className="mt-1 text-sm text-gray-600">
            Усього: {total}
            {totalPages > 1 ? ` · сторінка ${filter.page} з ${totalPages}` : ""}
          </p>
        </div>
        <Link
          href="/manager/payments/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus className="mr-1 h-4 w-4" />
          Створити
        </Link>
      </header>

      <PaymentsToolbar />

      {rows.length === 0 ? (
        <EmptyState
          message="Оплат за обраними фільтрами не знайдено"
          hint="Спробуйте змінити фільтри або очистити їх."
        />
      ) : (
        <>
          <PaymentsTable items={rows} />
          <ListPagination page={filter.page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
