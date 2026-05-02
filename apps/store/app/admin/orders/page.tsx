export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@ltex/shared";
import Link from "next/link";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";
import { SortHeader } from "@/components/admin/sort-header";
import { ExportCsvButton } from "@/components/admin/export-csv";
import { AdminPagination } from "@/components/admin/pagination";
import { OrderDetailRow } from "./order-detail-row";

const statusColors: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline" | "accent"
> = {
  draft: "secondary",
  pending: "outline",
  confirmed: "accent",
  processing: "default",
  shipped: "default",
  delivered: "default",
  cancelled: "destructive",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const status = params.status;
  const page = parseInt(params.page ?? "1", 10);
  const sort = params.sort ?? "createdAt";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const perPage = 20;

  const where = status ? { status } : {};

  const orderByMap: Record<string, Record<string, string>> = {
    createdAt: { createdAt: dir },
    totalEur: { totalEur: dir },
  };
  const orderBy = orderByMap[sort] ?? { createdAt: "desc" };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: true,
        items: {
          include: {
            product: { select: { name: true } },
            lot: { select: { barcode: true } },
          },
        },
      },
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);
  const baseParams = new URLSearchParams();
  if (status) baseParams.set("status", status);
  if (sort !== "createdAt") {
    baseParams.set("sort", sort);
    baseParams.set("dir", dir);
  }

  function sortUrl(field: string) {
    const sp = new URLSearchParams(baseParams);
    sp.set("sort", field);
    sp.set("dir", sort === field && dir === "asc" ? "desc" : "asc");
    sp.delete("page");
    return `/admin/orders?${sp.toString()}`;
  }

  function pageHref(p: number) {
    const sp = new URLSearchParams(baseParams);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    return `/admin/orders?${sp.toString()}`;
  }

  const csvData = orders.map((o) => ({
    code: o.code1C ?? o.id.slice(0, 8),
    customer: o.customer.name,
    status: ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status,
    totalEur: o.totalEur.toFixed(2),
    totalUah: o.totalUah.toFixed(2),
    items: o.items.length,
    date: new Date(o.createdAt).toLocaleDateString("uk-UA"),
  }));

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs items={[{ label: "Замовлення" }]} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Замовлення ({total})</h1>
        <ExportCsvButton
          data={csvData}
          filename="orders"
          headers={[
            "code",
            "customer",
            "status",
            "totalEur",
            "totalUah",
            "items",
            "date",
          ]}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/orders"
          className={`rounded-md border px-3 py-1 text-sm ${!status ? "border-green-200 bg-green-50 text-green-700" : "hover:bg-gray-50"}`}
        >
          Всі
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded-md border px-3 py-1 text-sm ${status === s ? "border-green-200 bg-green-50 text-green-700" : "hover:bg-gray-50"}`}
          >
            {ORDER_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">Замовлень не знайдено</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="w-8 px-4 py-3"></th>
                <th className="px-4 py-3 font-medium">Код</th>
                <th className="px-4 py-3 font-medium">Клієнт</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <SortHeader
                  label="Сума EUR"
                  field="totalEur"
                  currentSort={sort}
                  currentDir={dir}
                  href={sortUrl("totalEur")}
                />
                <th className="px-4 py-3 font-medium">Сума UAH</th>
                <th className="px-4 py-3 font-medium">Позицій</th>
                <SortHeader
                  label="Дата"
                  field="createdAt"
                  currentSort={sort}
                  currentDir={dir}
                  href={sortUrl("createdAt")}
                />
                <th className="px-4 py-3 font-medium">Дії</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <OrderDetailRow
                  key={order.id}
                  order={{
                    id: order.id,
                    code1C: order.code1C,
                    status: order.status,
                    totalEur: order.totalEur,
                    totalUah: order.totalUah,
                    notes: order.notes,
                    createdAt: order.createdAt.toISOString(),
                    customerName: order.customer.name,
                    customerPhone: order.customer.phone,
                    itemCount: order.items.length,
                    items: order.items.map((item) => ({
                      id: item.id,
                      productName: item.product.name,
                      barcode: item.lot?.barcode ?? null,
                      weight: item.weight,
                      priceEur: item.priceEur,
                      quantity: item.quantity,
                    })),
                  }}
                  statusColor={
                    statusColors[order.status as OrderStatus] ?? "secondary"
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        baseHref="/admin/orders"
        buildHref={pageHref}
      />
    </div>
  );
}
