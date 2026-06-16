import { SalesRow, type SalesRowData } from "./sales-row";
import { SortableHeader } from "../../_components/sortable-header";

export function SalesTable({ items }: { items: SalesRowData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-2 font-medium">
              <SortableHeader sortKey="date" label="Дата" />
            </th>
            <th className="px-4 py-2 font-medium">
              <SortableHeader sortKey="code" label="Номер" />
            </th>
            <th className="px-4 py-2 font-medium">
              <SortableHeader sortKey="client" label="Контрагент" />
            </th>
            <th className="px-4 py-2 font-medium">
              <SortableHeader sortKey="city" label="Місто" />
            </th>
            <th className="px-4 py-2 font-medium">Область</th>
            <th className="px-4 py-2 font-medium">
              <SortableHeader sortKey="status" label="Статус" />
            </th>
            <th className="px-4 py-2 font-medium">
              <SortableHeader sortKey="agent" label="Торговий агент" />
            </th>
            <th className="px-4 py-2 text-center font-medium">
              <SortableHeader
                sortKey="positions"
                label="Позицій"
                align="center"
              />
            </th>
            <th className="px-4 py-2 text-right font-medium">
              <SortableHeader sortKey="sum" label="Сума" align="right" />
            </th>
            <th className="w-12 px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <SalesRow key={s.id} sale={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
