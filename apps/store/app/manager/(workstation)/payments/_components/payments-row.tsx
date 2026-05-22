import Link from "next/link";
import { CashOrderTypeBadge } from "./cash-order-type-badge";

export interface PaymentsRowData {
  id: string;
  code1C: string | null;
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

/** Номер документа: code1C з central, інакше локальний docNumber «№N». */
function formatDocNumber(o: PaymentsRowData): string {
  if (o.code1C) return o.code1C;
  return `№${o.docNumber}`;
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
        {formatDocNumber(order)}
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
    </tr>
  );
}
