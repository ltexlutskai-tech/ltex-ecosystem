import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatOrderNumber } from "@/lib/manager/order-number";
import { OrderStatusBadge } from "./order-status-badge";

export interface ClientOrderRowData {
  id: string;
  code1C: string | null;
  number1C: string | null;
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
      <td className="px-2.5 py-1.5 font-mono text-sm text-gray-700">
        {formatOrderNumber(order)}
      </td>
      <td className="px-2.5 py-1.5 text-sm whitespace-nowrap text-gray-600">
        {date}
      </td>
      <td className="px-2.5 py-1.5">
        <OrderStatusBadge status={order.status} />
      </td>
      <td className="px-2.5 py-1.5 text-center text-sm whitespace-nowrap text-gray-700">
        {order.itemCount}
      </td>
      <td className="px-2.5 py-1.5 text-right text-sm font-medium whitespace-nowrap text-gray-800">
        {Math.round(order.totalUah).toLocaleString("uk-UA")} ₴
      </td>
      <td className="px-2.5 py-1.5 text-right">
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
