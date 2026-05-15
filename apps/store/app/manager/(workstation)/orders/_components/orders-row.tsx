import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { OrderStatusBadge } from "../../customers/[id]/_components/order-status-badge";

export interface OrdersRowData {
  id: string;
  code1C: string | null;
  status: string;
  totalEur: number;
  totalUah: number;
  itemCount: number;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    code1C: string | null;
  };
}

export function OrdersRow({ order }: { order: OrdersRowData }) {
  const date = new Date(order.createdAt).toLocaleDateString("uk-UA");
  return (
    <tr className="border-b last:border-b-0 hover:bg-gray-50">
      <td className="px-4 py-3 font-mono text-sm text-gray-700">
        <Link
          href={`/manager/orders/${order.id}`}
          className="hover:text-blue-600"
        >
          {order.code1C ?? order.id.slice(0, 8)}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-gray-800">
        <Link
          href={`/manager/customers/${order.customer.id}`}
          className="hover:text-blue-600"
        >
          {order.customer.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{date}</td>
      <td className="px-4 py-3">
        <OrderStatusBadge status={order.status} />
      </td>
      <td className="px-4 py-3 text-center text-sm text-gray-700">
        {order.itemCount}
      </td>
      <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">
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
