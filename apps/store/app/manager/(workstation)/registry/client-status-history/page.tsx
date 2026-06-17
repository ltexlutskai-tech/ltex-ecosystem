import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildStatusHistoryWhere,
  mapStatusHistoryToRow,
} from "@/lib/manager/misc-register-view";
import { ListPagination } from "../../customers/_components/list-pagination";
import { RegSearchFilter } from "../_components/reg-search-filter";
import { StatusHistoryTable } from "./_components/status-history-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регістр: Історія статусів клієнтів" };

const PAGE_SIZE = 50;
const ALLOWED = ["admin", "owner", "analyst"] as const;

export default async function ClientStatusHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  if (!(ALLOWED as readonly string[]).includes(user.role)) {
    redirect("/manager");
  }

  const sp = await searchParams;
  const where = buildStatusHistoryWhere(sp);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [total, history] = await Promise.all([
    prisma.clientStatusHistory.count({ where }),
    prisma.clientStatusHistory.findMany({
      where,
      orderBy: { changedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        clientCode1C: true,
        statusCode1C: true,
        operationalStatus: true,
        changedAt: true,
      },
    }),
  ]);

  const rows = history.map(mapStatusHistoryToRow);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Регістр: Історія статусів клієнтів
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Зміни статусу контрагента в часі (1С «ИсторияСтатусовКонтрагентов»).
        </p>
      </div>

      <RegSearchFilter
        searchLabel="Пошук за 1С-кодом контрагента"
        withDateRange
      />
      <StatusHistoryTable rows={rows} total={total} />
      <ListPagination page={page} totalPages={totalPages} />
    </div>
  );
}
