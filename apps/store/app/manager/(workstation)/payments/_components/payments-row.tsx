import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CashOrderTypeBadge } from "./cash-order-type-badge";
import { formatDocNumber } from "@/lib/manager/order-number";

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

export function PaymentsRow({ order }: { order: PaymentsRowData }) {
  const date = new Date(order.paidAt).toLocaleDateString("uk-UA");
  // Архівні ордери приглушені сірим, як у 1С ФормаСписка.
  const dimmed = order.archived;

  return (
    <tr
      className={`border-b last:border-b-0 hover:bg-gray-50 ${
        dimmed ? "bg-gray-50 text-gray-400" : ""
      }`}
    >
      <td className="px-4 py-3 text-sm text-gray-600">{date}</td>
      <td
        className={`px-4 py-3 font-mono text-sm ${
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
      <td className="px-4 py-3">
        <CashOrderTypeBadge type={order.type} />
      </td>
      <td
        className={`px-4 py-3 text-sm ${
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
      <td className="px-4 py-3 text-sm text-gray-600">
        {order.cashFlowArticleName ?? "—"}
      </td>
      <td
        className={`px-4 py-3 text-right text-sm font-medium ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        {order.documentSumEur.toLocaleString("uk-UA", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}{" "}
        €
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {order.bankAccountName ?? "—"}
      </td>
      <td className="px-4 py-3 text-right">
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
