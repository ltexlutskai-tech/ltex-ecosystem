import { renderCell } from "../_lib/column-render";
import { COLUMN_LABELS } from "../_lib/filter-labels";
import type { ClientListItem, ConfigItem } from "./types";

interface Props {
  items: ClientListItem[];
  columnsPrefs: ConfigItem[];
}

export function ClientListTable({ items, columnsPrefs }: Props) {
  const visibleCols = columnsPrefs
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-gray-500">
        Клієнтів не знайдено за вибраними фільтрами.
      </div>
    );
  }

  if (visibleCols.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-gray-500">
        Не вибрано жодної колонки. Натисніть "Налаштування" щоб увімкнути
        колонки.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {visibleCols.map((col) => (
              <th key={col.key} className="px-2.5 py-1.5 whitespace-nowrap">
                {COLUMN_LABELS[col.key] ?? col.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((c) => {
            const isInactive = c.statusGeneral?.code === "inactive";
            return (
              <tr
                key={c.id}
                className={
                  isInactive
                    ? "bg-red-50/60 hover:bg-red-100/60"
                    : "hover:bg-gray-50"
                }
              >
                {visibleCols.map((col) => (
                  <td
                    key={col.key}
                    className="px-2.5 py-1.5 align-top text-gray-800"
                  >
                    {renderCell(col.key, c)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
