import { ClientOrdersRow, type ClientOrderRowData } from "./client-orders-row";

export function ClientOrdersList({ orders }: { orders: ClientOrderRowData[] }) {
  if (orders.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs tracking-wide text-gray-500 uppercase">
            <th className="px-2.5 py-1.5 font-medium">№</th>
            <th className="px-2.5 py-1.5 font-medium">Дата</th>
            <th className="px-2.5 py-1.5 font-medium">Статус</th>
            <th className="px-2.5 py-1.5 text-center font-medium">Позицій</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Сума</th>
            <th className="w-12 px-2.5 py-1.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <ClientOrdersRow key={o.id} order={o} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
