import { PaymentsRow, type PaymentsRowData } from "./payments-row";

export function PaymentsTable({ items }: { items: PaymentsRowData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Дата</th>
            <th className="px-4 py-2 font-medium">Номер</th>
            <th className="px-4 py-2 font-medium">Вид</th>
            <th className="px-4 py-2 font-medium">Клієнт</th>
            <th className="px-4 py-2 font-medium">Стаття</th>
            <th className="px-4 py-2 text-right font-medium">Сума</th>
            <th className="px-4 py-2 font-medium">Рахунок</th>
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
