import { getSaleStatusMeta } from "@/lib/manager/sale-status";

const COLOR_CLASSES: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  yellow: "bg-yellow-50 text-yellow-700 ring-yellow-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  red: "bg-red-50 text-red-700 ring-red-200",
};

export function SaleStatusBadge({ status }: { status: string }) {
  const meta = getSaleStatusMeta(status);
  const cls = COLOR_CLASSES[meta.color] ?? COLOR_CLASSES.gray;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {meta.label}
    </span>
  );
}
