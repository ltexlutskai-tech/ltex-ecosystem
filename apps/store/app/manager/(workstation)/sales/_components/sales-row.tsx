import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { SaleStatusBadge } from "./sale-status-badge";

export interface SalesRowData {
  id: string;
  code1C: string | null;
  docNumber: number;
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
  };
}

/** Номер документа: code1C з central, інакше локальний docNumber «№N». */
function formatDocNumber(sale: SalesRowData): string {
  if (sale.code1C) return sale.code1C;
  return `№${sale.docNumber}`;
}

export function SalesRow({ sale }: { sale: SalesRowData }) {
  const date = new Date(sale.createdAt).toLocaleDateString("uk-UA");
  // Архівні (проведені в 1С) — приглушені, як у 1С ФормаСписка.
  const dimmed = sale.archived || sale.status === "posted";

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
          href={`/manager/sales/${sale.id}`}
          className="hover:text-blue-600"
        >
          {formatDocNumber(sale)}
        </Link>
      </td>
      <td
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
      <td className="px-4 py-3 text-sm text-gray-600">
        {sale.customer.city ?? "—"}
      </td>
      <td className="px-4 py-3">
        <SaleStatusBadge status={sale.status} />
      </td>
      <td className="px-4 py-3 text-center">
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
      <td className="px-4 py-3 text-center text-sm text-gray-700">
        {sale.itemCount}
      </td>
      <td
        className={`px-4 py-3 text-right text-sm font-medium ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        <div>{Math.round(sale.totalUah).toLocaleString("uk-UA")} ₴</div>
        <div className="text-xs font-normal text-gray-400">
          {sale.totalEur.toLocaleString("uk-UA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          €
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
