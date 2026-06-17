import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CashOrderTypeBadge } from "./cash-order-type-badge";
import { formatDocNumber } from "@/lib/manager/order-number";
import type { RowHandlers } from "../../_components/use-list-context-menu";

export interface PaymentsRowData {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  type: string;
  documentSumEur: number;
  archived: boolean;
  paidAt: Date;
  customerName: string;
  customerId: string | null;
  bankAccountName: string | null;
  cashFlowArticleName: string | null;
}

export function PaymentsRow({
  order,
  rowHandlers,
}: {
  order: PaymentsRowData;
  rowHandlers?: RowHandlers;
}) {
  const date = new Date(order.paidAt).toLocaleDateString("uk-UA");
  // Архівні ордери приглушені сірим, як у 1С ФормаСписка.
  const dimmed = order.archived;

  return (
    <tr
      {...rowHandlers}
      className={`border-b last:border-b-0 hover:bg-gray-50 ${
        dimmed ? "bg-gray-50 text-gray-400" : ""
      }`}
    >
      <td
        data-col="date"
        data-value={date}
        className="px-2.5 py-1.5 text-sm whitespace-nowrap text-gray-600"
      >
        {date}
      </td>
      <td
        data-col="code"
        data-value={formatDocNumber(order)}
        className={`px-2.5 py-1.5 font-mono text-sm ${
          dimmed ? "text-gray-400" : "text-gray-700"
        }`}
      >
        <Link
          href={`/manager/payments/${order.id}`}
          className="hover:text-blue-600"
        >
          {formatDocNumber(order)}
        </Link>
      </td>
      <td data-col="type" data-value={order.type} className="px-2.5 py-1.5">
        <CashOrderTypeBadge type={order.type} />
      </td>
      <td
        data-col="client"
        data-value={order.customerName}
        className={`px-2.5 py-1.5 text-sm ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        {order.customerId ? (
          <Link
            href={`/manager/customers/${order.customerId}`}
            className="hover:text-blue-600"
          >
            {order.customerName}
          </Link>
        ) : (
          order.customerName
        )}
      </td>
      <td
        data-col="article"
        data-value={order.cashFlowArticleName ?? ""}
        className="px-2.5 py-1.5 text-sm text-gray-600"
      >
        {order.cashFlowArticleName ?? "—"}
      </td>
      <td
        data-col="sum"
        data-value={order.documentSumEur.toFixed(2)}
        className={`px-2.5 py-1.5 text-right text-sm font-medium whitespace-nowrap ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        {order.documentSumEur.toLocaleString("uk-UA", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}{" "}
        €
      </td>
      <td
        data-col="account"
        data-value={order.bankAccountName ?? ""}
        className="px-2.5 py-1.5 text-sm text-gray-600"
      >
        {order.bankAccountName ?? "—"}
      </td>
      <td className="px-2.5 py-1.5 text-right">
        <Link
          href={`/manager/payments/${order.id}`}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          aria-label="Відкрити касовий ордер"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}
