import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildDayLogWhere,
  mapDayLogToRow,
} from "@/lib/manager/misc-register-view";
import { ListPagination } from "../../customers/_components/list-pagination";
import { RegSearchFilter } from "../_components/reg-search-filter";
import { DayLogTable } from "./_components/day-log-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регістр: Статус дня агента" };

const PAGE_SIZE = 50;
const ALLOWED = ["admin", "owner", "analyst"] as const;

export default async function AgentDayLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kind?: string;
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
  const where = buildDayLogWhere(sp);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [total, logs] = await Promise.all([
    prisma.agentDayLog.count({ where }),
    prisma.agentDayLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        userId: true,
        code1C: true,
        kind: true,
        at: true,
        date: true,
        note: true,
      },
    }),
  ]);

  // Batch-резолв userId → ПІБ агента (без back-relation на User).
  const userIds = [
    ...new Set(logs.map((l) => l.userId).filter((v): v is string => !!v)),
  ];
  const agentNameById = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    for (const u of users) agentNameById.set(u.id, u.fullName);
  }

  const rows = logs.map((l) => mapDayLogToRow(l, agentNameById));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Регістр: Статус дня агента
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Тайм-трекінг робочого дня агента: початок / кінець (1С «СтатусДня»).
        </p>
      </div>

      <RegSearchFilter
        searchLabel="Пошук за 1С-кодом агента"
        withDateRange
        kindOptions={[
          { value: "start", label: "Початок дня" },
          { value: "end", label: "Кінець дня" },
        ]}
      />
      <DayLogTable rows={rows} total={total} />
      <ListPagination page={page} totalPages={totalPages} />
    </div>
  );
}
