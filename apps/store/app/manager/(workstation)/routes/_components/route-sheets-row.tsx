import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RouteSheetStatusBadge } from "./route-sheet-status-badge";

export interface RouteSheetsRowData {
  id: string;
  code1C: string | null;
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

/** Номер документа: code1C з central, інакше локальний docNumber «№N». */
function formatDocNumber(r: RouteSheetsRowData): string {
  if (r.code1C) return r.code1C;
  return `№${r.docNumber}`;
}

export function RouteSheetsRow({ sheet }: { sheet: RouteSheetsRowData }) {
  const date = new Date(sheet.date).toLocaleDateString("uk-UA");
  const dimmed = sheet.archived;

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
          href={`/manager/routes/${sheet.id}`}
          className="hover:text-blue-600"
        >
          {formatDocNumber(sheet)}
        </Link>
      </td>
      <td
        className={`px-4 py-3 text-sm ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        {sheet.routeName ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {sheet.expeditor?.fullName ?? "—"}
      </td>
      <td className="px-4 py-3">
        <RouteSheetStatusBadge status={sheet.status} />
      </td>
      <td
        className={`px-4 py-3 text-right text-sm font-medium ${
          dimmed ? "text-gray-400" : "text-gray-800"
        }`}
      >
        <div>{Math.round(sheet.totalUah).toLocaleString("uk-UA")} ₴</div>
        <div className="text-xs font-normal text-gray-400">
          {sheet.totalEur.toLocaleString("uk-UA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          €
        </div>
      </td>
      <td className="px-4 py-3 text-right">
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
