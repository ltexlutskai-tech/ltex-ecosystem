import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { prisma, Prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";
import {
  buildOrdersWhere,
  orderRowInclude,
  serializeOrderRow,
} from "@/lib/manager/orders-list";
import { EmptyState } from "../_components/empty-state";
import { ListPagination } from "../customers/_components/list-pagination";
import { OrdersTable } from "./_components/orders-table";
import { OrdersToolbar } from "./_components/orders-toolbar";
import { parseOrdersFilterFromSearchParams } from "./_components/orders-filter-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Замовлення — L-TEX Manager" };

function buildOrderBy(
  sort: string,
  dir: "asc" | "desc",
): Prisma.OrderOrderByWithRelationInput {
  switch (sort) {
    case "sum":
      return { totalUah: dir };
    case "code":
      return { code1C: dir };
    case "client":
      return { customer: { name: dir } };
    case "city":
      return { customer: { city: dir } };
    case "status":
      return { status: dir };
    case "positions":
      return { items: { _count: dir } };
    case "actual":
      return { isActual: dir };
    case "agent":
      return { agentName: dir };
    case "delivery":
      return { deliveryMethod: dir };
    case "date":
    default:
      return { createdAt: dir };
  }
}

export default async function ManagerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const filter = parseOrdersFilterFromSearchParams(sp);

  const myCodes = await getMyClientCodes1C(user);

  // Manager scope з 0 клієнтами / або filter по чужому клієнту → empty
  if (
    myCodes !== null &&
    (myCodes.length === 0 ||
      (filter.clientCode1C && !myCodes.includes(filter.clientCode1C)))
  ) {
    return renderEmpty(filter.clientCode1C);
  }

  const fromDate = filter.from ? new Date(filter.from) : undefined;
  const toDate = filter.to ? new Date(filter.to) : undefined;

  const where = buildOrdersWhere({
    customerCodes: myCodes,
    clientCode1C: filter.clientCode1C || undefined,
    q: filter.search,
    status: filter.status,
    actuality: filter.actuality,
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
    showArchived: filter.showArchived,
    clientName: filter.clientName || undefined,
    city: filter.city || undefined,
    agent: filter.agent || undefined,
  });

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: buildOrderBy(filter.sort, filter.dir),
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: orderRowInclude,
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));

  const rows = items.map((o) => serializeOrderRow(o));

  // Область клієнта — окремий batch-lookup (Customer не має region; беремо з
  // MgrClient за спільним ключем code1C).
  const codes = Array.from(
    new Set(
      rows
        .map((r) => r.customer.code1C)
        .filter((c): c is string => c != null && c.length > 0),
    ),
  );
  if (codes.length > 0) {
    const mgrRows = await prisma.mgrClient.findMany({
      where: { code1C: { in: codes } },
      select: { code1C: true, region: true },
    });
    const regionByCode = new Map<string, string | null>(
      mgrRows.map((m) => [m.code1C as string, m.region]),
    );
    for (const r of rows) {
      r.customer.region = r.customer.code1C
        ? (regionByCode.get(r.customer.code1C) ?? null)
        : null;
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Замовлення</h1>
          <p className="mt-1 text-sm text-gray-600">
            Усього: {total}
            {totalPages > 1 ? ` · сторінка ${filter.page} з ${totalPages}` : ""}
          </p>
        </div>
        <Link
          href="/manager/orders/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus className="mr-1 h-4 w-4" />
          Створити замовлення
        </Link>
      </header>

      <OrdersToolbar />

      {rows.length === 0 ? (
        <EmptyState
          message="Замовлень за обраними фільтрами не знайдено"
          hint="Спробуйте змінити фільтри або очистити їх."
        />
      ) : (
        <>
          <OrdersTable items={rows} />
          <ListPagination page={filter.page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}

function renderEmpty(clientCode1C: string): React.ReactElement {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Замовлення</h1>
        <Link
          href="/manager/orders/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus className="mr-1 h-4 w-4" />
          Створити замовлення
        </Link>
      </header>
      <OrdersToolbar />
      <EmptyState
        message={
          clientCode1C
            ? "Цей клієнт належить іншому менеджеру"
            : "У вас поки немає призначених клієнтів"
        }
        hint={
          clientCode1C
            ? "До M1.3f розширення немає доступу до замовлень чужих клієнтів."
            : "Адміністратор має призначити вам клієнтів у розділі «Клієнти»."
        }
      />
    </div>
  );
}
