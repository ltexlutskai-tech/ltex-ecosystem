import { RouteSheetsRow, type RouteSheetsRowData } from "./route-sheets-row";

export function RouteSheetsTable({ items }: { items: RouteSheetsRowData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Дата</th>
            <th className="px-4 py-2 font-medium">Номер</th>
            <th className="px-4 py-2 font-medium">Маршрут</th>
            <th className="px-4 py-2 font-medium">Експедитор</th>
            <th className="px-4 py-2 font-medium">Статус</th>
            <th className="px-4 py-2 text-right font-medium">Сума</th>
            <th className="w-12 px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <RouteSheetsRow key={s.id} sheet={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
