import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { formatOrderNumber } from "@/lib/manager/order-number";
import { OrderStatusBadge } from "../../customers/[id]/_components/order-status-badge";
import type { RowHandlers } from "../../_components/use-list-context-menu";

export interface OrdersRowData {
  id: string;
  code1C: string | null;
  number1C: string | null;
  status: string;
  totalEur: number;
  totalUah: number;
  archived: boolean;
  isActual: boolean;
  source: string;
  agentName: string | null;
  assignedAgentName: string | null;
  deliveryMethod: string | null;
  /** Лейбл способу доставки — резолвиться на сервері (довідник, 7.3). */
  deliveryLabel: string;
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

export function OrdersRow({
  order,
  rowHandlers,
}: {
  order: OrdersRowData;
  rowHandlers?: RowHandlers;
}) {
  const date = new Date(order.createdAt).toLocaleDateString("uk-UA");
  // Архівні (проведені в 1С) — приглушені, як у 1С ФормаСписка.
  const dimmed = order.archived || order.status === "posted";

  return (
    <tr
      {...rowHandlers}
      className={`border-b last:border-b-0 hover:bg-gray-50 ${
        dimmed ? "bg-gray-50 text-gray-400" : ""
      }`}
    >
      <td
        data-col="code"
        data-value={formatOrderNumber(order)}
        className={`px-2.5 py-1.5 font-mono text-sm ${
          dimmed ? "text-gray-400" : "text-gray-700"
        }`}
      >
        <Link
          href={`/manager/orders/${order.id}`}
          className="hover:text-blue-600"
        >
          {formatOrderNumber(order)}
        </Link>
        {order.source === "site" && (
          <span
            className="ml-1.5 inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-blue-700"
            title="Замовлення з сайту"
          >
            Сайт
          </span>
        )}
      </td>
      <td
        data-col="client"
        data-value={order.customer.name}
        className={`px-2.5 py-1.5 text-sm ${
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
      <td
        data-col="city"
        data-value={order.customer.city ?? ""}
        className="px-2.5 py-1.5 text-sm text-gray-600"
      >
        {order.customer.city ?? "—"}
      </td>
      <td
        data-col="region"
        data-value={order.customer.region ?? ""}
        className="px-2.5 py-1.5 text-sm text-gray-600"
      >
        {order.customer.region ?? "—"}
      </td>
      <td
        data-col="date"
        data-value={date}
        className="px-2.5 py-1.5 text-sm whitespace-nowrap text-gray-600"
      >
        {date}
      </td>
      <td data-col="status" data-value={order.status} className="px-2.5 py-1.5">
        <OrderStatusBadge status={order.status} />
      </td>
      <td
        data-col="actual"
        data-value={order.isActual ? "Актуальний" : "Неактуальний"}
        className="px-2.5 py-1.5 text-center"
      >
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
      <td
        data-col="agent"
        data-value={order.agentName ?? order.assignedAgentName ?? ""}
        className={`px-2.5 py-1.5 text-sm ${dimmed ? "text-gray-400" : "text-gray-700"}`}
      >
        {order.agentName ?? order.assignedAgentName ?? "—"}
      </td>
      <td
        data-col="delivery"
        data-value={order.deliveryLabel}
        className={`px-2.5 py-1.5 text-sm ${dimmed ? "text-gray-400" : "text-gray-600"}`}
      >
        {order.deliveryLabel}
      </td>
      <td
        data-col="positions"
        data-value={String(order.itemCount)}
        className="px-2.5 py-1.5 text-center text-sm whitespace-nowrap text-gray-700"
      >
        {order.itemCount}
      </td>
      <td
        data-col="sum"
        data-value={order.totalEur.toFixed(2)}
        className={`px-2.5 py-1.5 text-right text-sm font-medium whitespace-nowrap ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        <div className="whitespace-nowrap">
          {order.totalEur.toLocaleString("uk-UA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          €
        </div>
        <div className="text-xs font-normal whitespace-nowrap text-gray-400">
          {Math.round(order.totalUah).toLocaleString("uk-UA")} ₴
        </div>
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
