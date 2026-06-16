import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SaleStatusBadge } from "../../../sales/_components/sale-status-badge";
import { formatDocNumber } from "@/lib/manager/order-number";

export interface ClientSaleRowData {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  status: string;
  totalEur: number;
  totalUah: number;
  itemCount: number;
  createdAt: Date;
}

export function ClientSalesHistoryList({
  sales,
}: {
  sales: ClientSaleRowData[];
}) {
  if (sales.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-2 font-medium">№</th>
            <th className="px-4 py-2 font-medium">Дата</th>
            <th className="px-4 py-2 font-medium">Статус</th>
            <th className="px-4 py-2 text-center font-medium">Позицій</th>
            <th className="px-4 py-2 text-right font-medium">Сума</th>
            <th className="w-12 px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr
              key={s.id}
              className="border-b last:border-b-0 hover:bg-gray-50"
            >
              <td className="px-4 py-3 font-mono text-sm text-gray-700">
                <Link
                  href={`/manager/sales/${s.id}`}
                  className="hover:text-blue-600"
                >
                  {formatDocNumber(s)}
                </Link>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {new Date(s.createdAt).toLocaleDateString("uk-UA")}
              </td>
              <td className="px-4 py-3">
                <SaleStatusBadge status={s.status} />
              </td>
              <td className="px-4 py-3 text-center text-sm text-gray-700">
                {s.itemCount}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">
                {Math.round(s.totalUah).toLocaleString("uk-UA")} ₴
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/manager/sales/${s.id}`}
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                  aria-label="Відкрити реалізацію"
                >
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
