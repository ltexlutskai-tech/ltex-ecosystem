import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { OrderStatusBadge } from "../../customers/[id]/_components/order-status-badge";

export interface OrdersRowData {
  id: string;
  code1C: string | null;
  status: string;
  totalEur: number;
  totalUah: number;
  archived: boolean;
  isActual: boolean;
  itemCount: number;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    code1C: string | null;
    city: string | null;
    region: string | null;
  };
}

export function OrdersRow({ order }: { order: OrdersRowData }) {
  const date = new Date(order.createdAt).toLocaleDateString("uk-UA");
  // Архівні (проведені в 1С) — приглушені, як у 1С ФормаСписка.
  const dimmed = order.archived || order.status === "posted";

  return (
    <tr
      className={`border-b last:border-b-0 hover:bg-gray-50 ${
        dimmed ? "bg-gray-50 text-gray-400" : ""
      }`}
    >
      <td
        className={`px-4 py-3 font-mono text-sm ${
          dimmed ? "text-gray-400" : "text-gray-700"
        }`}
      >
        <Link
          href={`/manager/orders/${order.id}`}
          className="hover:text-blue-600"
        >
          {order.code1C ?? order.id.slice(0, 8)}
        </Link>
      </td>
      <td
        className={`px-4 py-3 text-sm ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        <Link
          href={`/manager/customers/${order.customer.id}`}
          className="hover:text-blue-600"
        >
          {order.customer.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {order.customer.city ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {order.customer.region ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{date}</td>
      <td className="px-4 py-3">
        <OrderStatusBadge status={order.status} />
      </td>
      <td className="px-4 py-3 text-center">
        {order.isActual ? (
          <Check
            className="mx-auto h-4 w-4 text-green-600"
            aria-label="Актуальний"
          />
        ) : (
          <Minus
            className="mx-auto h-4 w-4 text-gray-300"
            aria-label="Неактуальний"
          />
        )}
      </td>
      <td className="px-4 py-3 text-center text-sm text-gray-700">
        {order.itemCount}
      </td>
      <td
        className={`px-4 py-3 text-right text-sm font-medium ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        {Math.round(order.totalUah).toLocaleString("uk-UA")} ₴
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/manager/orders/${order.id}`}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          aria-label="Відкрити замовлення"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}
