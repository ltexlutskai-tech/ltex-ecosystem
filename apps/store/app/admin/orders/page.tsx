export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { Badge } from "@ltex/ui";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@ltex/shared";
import Link from "next/link";
import { OrderStatusForm } from "./order-status-form";

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
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = params.status;
  const page = parseInt(params.page ?? "1", 10);
  const perPage = 20;

  const where = status ? { status } : {};

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Замовлення</h1>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/orders"
          className={`rounded-md border px-3 py-1 text-sm ${!status ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
        >
          Всі ({total})
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded-md border px-3 py-1 text-sm ${status === s ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
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
                <th className="px-4 py-3 font-medium">Код</th>
                <th className="px-4 py-3 font-medium">Клієнт</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Сума EUR</th>
                <th className="px-4 py-3 font-medium">Сума UAH</th>
                <th className="px-4 py-3 font-medium">Позицій</th>
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Дії</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    {order.code1C ?? order.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">{order.customer.name}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        statusColors[order.status as OrderStatus] ?? "secondary"
                      }
                    >
                      {ORDER_STATUS_LABELS[order.status as OrderStatus] ??
                        order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">€{order.totalEur.toFixed(2)}</td>
                  <td className="px-4 py-3">₴{order.totalUah.toFixed(2)}</td>
                  <td className="px-4 py-3">{order._count.items}</td>
                  <td className="px-4 py-3">
                    {new Date(order.createdAt).toLocaleDateString("uk-UA")}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusForm
                      orderId={order.id}
                      currentStatus={order.status as OrderStatus}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/orders?${status ? `status=${status}&` : ""}page=${p}`}
              className={`rounded-md border px-3 py-1 text-sm ${p === page ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
