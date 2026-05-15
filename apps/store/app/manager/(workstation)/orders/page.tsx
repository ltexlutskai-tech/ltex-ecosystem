import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";
import { EmptyState } from "../_components/empty-state";
import { ListPagination } from "../customers/_components/list-pagination";
import { OrdersTable } from "./_components/orders-table";
import { OrdersToolbar } from "./_components/orders-toolbar";
import { parseOrdersFilterFromSearchParams } from "./_components/orders-filter-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Замовлення — L-TEX Manager" };

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

  const where: Prisma.OrderWhereInput = {};

  const customerWhere: Prisma.CustomerWhereInput = {};
  if (myCodes !== null) customerWhere.code1C = { in: myCodes };
  if (filter.clientCode1C) customerWhere.code1C = filter.clientCode1C;
  if (Object.keys(customerWhere).length > 0) where.customer = customerWhere;

  if (filter.search) {
    where.OR = [
      { code1C: { contains: filter.search, mode: "insensitive" } },
      {
        customer: { name: { contains: filter.search, mode: "insensitive" } },
      },
    ];
  }

  if (filter.status) where.status = filter.status;

  if (filter.from || filter.to) {
    const fromDate = filter.from ? new Date(filter.from) : null;
    const toDate = filter.to ? new Date(filter.to) : null;
    where.createdAt = {
      ...(fromDate && !Number.isNaN(fromDate.getTime())
        ? { gte: fromDate }
        : {}),
      ...(toDate && !Number.isNaN(toDate.getTime()) ? { lte: toDate } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: {
        customer: { select: { id: true, name: true, code1C: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));

  const rows = items.map((o) => ({
    id: o.id,
    code1C: o.code1C,
    status: o.status,
    totalEur: o.totalEur,
    totalUah: o.totalUah,
    itemCount: o._count.items,
    createdAt: o.createdAt,
    customer: {
      id: o.customer.id,
      name: o.customer.name,
      code1C: o.customer.code1C,
    },
  }));

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
