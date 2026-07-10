import Link from "next/link";
import { ArrowRight, Truck } from "lucide-react";
import { RouteSheetStatusBadge } from "./route-sheet-status-badge";
import { formatDocNumber } from "@/lib/manager/order-number";
import type { RowHandlers } from "../../_components/use-list-context-menu";

export interface RouteSheetsRowData {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  date: string;
  arrivalDate: string | null;
  status: string;
  totalUah: number;
  totalEur: number;
  archived: boolean;
  orderCount: number;
  /** Назва маршруту (вільний текст = `comment`). */
  routeName: string | null;
  expeditor: { id: string; fullName: string } | null;
}

export function RouteSheetsRow({
  sheet,
  rowHandlers,
}: {
  sheet: RouteSheetsRowData;
  rowHandlers?: RowHandlers;
}) {
  const date = new Date(sheet.date).toLocaleDateString("uk-UA");
  const dimmed = sheet.archived;

  return (
    <tr
      {...rowHandlers}
      className={`border-b last:border-b-0 hover:bg-gray-50 ${
        dimmed ? "bg-gray-50 text-gray-400" : ""
      }`}
    >
      <td className="px-2.5 py-1.5 text-sm whitespace-nowrap text-gray-600">
        {date}
      </td>
      <td
        className={`px-2.5 py-1.5 font-mono text-sm ${
          dimmed ? "text-gray-400" : "text-gray-700"
        }`}
      >
        <Link
          href={`/manager/routes/${sheet.id}`}
          className="hover:text-blue-600"
        >
          {formatDocNumber(sheet)}
        </Link>
      </td>
      <td
        className={`px-2.5 py-1.5 text-sm ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        {sheet.routeName ?? "—"}
      </td>
      <td className="px-2.5 py-1.5 text-sm text-gray-600">
        {sheet.expeditor?.fullName ?? "—"}
      </td>
      <td className="px-2.5 py-1.5">
        <RouteSheetStatusBadge status={sheet.status} />
      </td>
      <td
        className={`px-2.5 py-1.5 text-right text-sm font-medium whitespace-nowrap ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        <div className="whitespace-nowrap">
          {sheet.totalEur.toLocaleString("uk-UA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          €
        </div>
        <div className="text-xs font-normal whitespace-nowrap text-gray-400">
          {Math.round(sheet.totalUah).toLocaleString("uk-UA")} ₴
        </div>
      </td>
      <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
        <Link
          href={`/manager/routes/${sheet.id}/loading`}
          className="mr-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-green-700"
          aria-label="Завантаження складу"
          title="Завантаження складу"
        >
          <Truck className="h-4 w-4" />
        </Link>
        <Link
          href={`/manager/routes/${sheet.id}`}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          aria-label="Відкрити маршрутний лист"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}
