import { OrdersRow, type OrdersRowData } from "./orders-row";

export function OrdersTable({ items }: { items: OrdersRowData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-2 font-medium">№</th>
            <th className="px-4 py-2 font-medium">Клієнт</th>
            <th className="px-4 py-2 font-medium">Місто</th>
            <th className="px-4 py-2 font-medium">Область</th>
            <th className="px-4 py-2 font-medium">Дата</th>
            <th className="px-4 py-2 font-medium">Статус</th>
            <th className="px-4 py-2 text-center font-medium">Актуальний</th>
            <th className="px-4 py-2 text-center font-medium">Позицій</th>
            <th className="px-4 py-2 text-right font-medium">Сума</th>
            <th className="w-12 px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <OrdersRow key={o.id} order={o} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
