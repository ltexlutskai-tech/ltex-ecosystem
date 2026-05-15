import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { OrderStatusBadge } from "./order-status-badge";

export interface ClientOrderRowData {
  id: string;
  code1C: string | null;
  status: string;
  totalEur: number;
  totalUah: number;
  itemCount: number;
  createdAt: Date;
}

export function ClientOrdersRow({ order }: { order: ClientOrderRowData }) {
  const date = new Date(order.createdAt).toLocaleDateString("uk-UA");
  return (
    <tr className="border-b last:border-b-0 hover:bg-gray-50">
      <td className="px-4 py-3 font-mono text-sm text-gray-700">
        {order.code1C ?? order.id.slice(0, 8)}
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
