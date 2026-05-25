import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildRouteSheetsWhere,
  routeSheetRowInclude,
  serializeRouteSheetRow,
} from "@/lib/manager/route-sheets-list";
import { EmptyState } from "../_components/empty-state";
import { ListPagination } from "../customers/_components/list-pagination";
import { RouteSheetsTable } from "./_components/route-sheets-table";
import { RouteSheetsToolbar } from "./_components/route-sheets-toolbar";
import { parseRouteSheetsFilterFromSearchParams } from "./_components/route-sheets-filter-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Маршрутні листи — L-TEX Manager" };

export default async function ManagerRouteSheetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const filter = parseRouteSheetsFilterFromSearchParams(sp);

  const fromDate = filter.from ? new Date(filter.from) : undefined;
  const toDate = filter.to ? new Date(filter.to) : undefined;

  const where = buildRouteSheetsWhere({
    search: filter.search,
    status: filter.status,
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    archived: filter.archived,
  });

  const [items, total] = await Promise.all([
    prisma.routeSheet.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: routeSheetRowInclude,
    }),
    prisma.routeSheet.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));

  const rows = items.map((r) => {
    const row = serializeRouteSheetRow(r);
    return {
      ...row,
      date: row.date.toISOString(),
      arrivalDate: row.arrivalDate ? row.arrivalDate.toISOString() : null,
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Маршрутні листи</h1>
          <p className="mt-1 text-sm text-gray-600">
            Усього: {total}
            {totalPages > 1 ? ` · сторінка ${filter.page} з ${totalPages}` : ""}
          </p>
        </div>
        <Link
          href="/manager/routes/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus className="mr-1 h-4 w-4" />
          Створити
        </Link>
      </header>

      <RouteSheetsToolbar />

      {rows.length === 0 ? (
        <EmptyState
          message="Маршрутних листів за обраними фільтрами не знайдено"
          hint="Спробуйте змінити фільтри або створіть новий маршрутний лист."
        />
      ) : (
        <>
          <RouteSheetsTable items={rows} />
          <ListPagination page={filter.page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}
