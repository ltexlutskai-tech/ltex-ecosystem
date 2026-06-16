import { PaymentsRow, type PaymentsRowData } from "./payments-row";
import { SortableHeader } from "../../_components/sortable-header";

export function PaymentsTable({ items }: { items: PaymentsRowData[] }) {
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
              <SortableHeader sortKey="type" label="Вид" />
            </th>
            <th className="px-4 py-2 font-medium">
              <SortableHeader sortKey="client" label="Клієнт" />
            </th>
            <th className="px-4 py-2 font-medium">
              <SortableHeader sortKey="article" label="Стаття" />
            </th>
            <th className="px-4 py-2 text-right font-medium">
              <SortableHeader sortKey="sum" label="Сума" align="right" />
            </th>
            <th className="px-4 py-2 font-medium">
              <SortableHeader sortKey="account" label="Рахунок" />
            </th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <PaymentsRow key={o.id} order={o} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
