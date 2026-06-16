import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { SaleStatusBadge } from "./sale-status-badge";
import { formatDocNumber } from "@/lib/manager/order-number";
import { deliveryLabel } from "@/lib/manager/order-delivery";
import type { RowHandlers } from "../../_components/use-list-context-menu";

export interface SalesRowData {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  status: string;
  totalEur: number;
  totalUah: number;
  archived: boolean;
  isActual: boolean;
  agentName: string | null;
  deliveryMethod: string | null;
  expressWaybill: string | null;
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

export function SalesRow({
  sale,
  rowHandlers,
}: {
  sale: SalesRowData;
  rowHandlers?: RowHandlers;
}) {
  const date = new Date(sale.createdAt).toLocaleDateString("uk-UA");
  // Архівні (проведені в 1С) — приглушені, як у 1С ФормаСписка.
  const dimmed = sale.archived || sale.status === "posted";

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
        className="px-4 py-3 text-sm text-gray-600"
      >
        {date}
      </td>
      <td
        data-col="code"
        data-value={formatDocNumber(sale)}
        className={`px-4 py-3 font-mono text-sm ${
          dimmed ? "text-gray-400" : "text-gray-700"
        }`}
      >
        <Link
          href={`/manager/sales/${sale.id}`}
          className="hover:text-blue-600"
        >
          {formatDocNumber(sale)}
        </Link>
      </td>
      <td
        data-col="client"
        data-value={sale.customer.name}
        className={`px-4 py-3 text-sm ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        <Link
          href={`/manager/customers/${sale.customer.id}`}
          className="hover:text-blue-600"
        >
          {sale.customer.name}
        </Link>
      </td>
      <td
        data-col="city"
        data-value={sale.customer.city ?? ""}
        className="px-4 py-3 text-sm text-gray-600"
      >
        {sale.customer.city ?? "—"}
      </td>
      <td
        data-col="region"
        data-value={sale.customer.region ?? ""}
        className="px-4 py-3 text-sm text-gray-600"
      >
        {sale.customer.region ?? "—"}
      </td>
      <td data-col="status" data-value={sale.status} className="px-4 py-3">
        <SaleStatusBadge status={sale.status} />
      </td>
      <td
        data-col="actual"
        data-value={sale.isActual ? "Актуальний" : "Неактуальний"}
        className="px-4 py-3 text-center"
      >
        {sale.isActual ? (
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
        data-value={sale.agentName ?? ""}
        className={`px-4 py-3 text-sm ${dimmed ? "text-gray-400" : "text-gray-700"}`}
      >
        {sale.agentName ?? "—"}
      </td>
      <td
        data-col="delivery"
        data-value={deliveryLabel(sale.deliveryMethod)}
        className={`px-4 py-3 text-sm ${dimmed ? "text-gray-400" : "text-gray-600"}`}
      >
        {deliveryLabel(sale.deliveryMethod)}
      </td>
      <td
        data-col="waybill"
        data-value={sale.expressWaybill ?? ""}
        className={`px-4 py-3 font-mono text-sm ${dimmed ? "text-gray-400" : "text-gray-600"}`}
      >
        {sale.expressWaybill ?? "—"}
      </td>
      <td
        data-col="positions"
        data-value={String(sale.itemCount)}
        className="px-4 py-3 text-center text-sm text-gray-700"
      >
        {sale.itemCount}
      </td>
      <td
        data-col="sum"
        data-value={sale.totalEur.toFixed(2)}
        className={`px-4 py-3 text-right text-sm font-medium ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        <div>
          {sale.totalEur.toLocaleString("uk-UA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          €
        </div>
        <div className="text-xs font-normal text-gray-400">
          {Math.round(sale.totalUah).toLocaleString("uk-UA")} ₴
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/manager/sales/${sale.id}`}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          aria-label="Відкрити реалізацію"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}
