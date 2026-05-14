import type { ClientAssortmentItem } from "./types";

export function ClientAssortmentTab({
  items,
}: {
  items: ClientAssortmentItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-gray-500 shadow-sm">
        Для цього клієнта ще немає історії асортименту.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2">Артикул</th>
            <th className="px-4 py-2">Назва товару</th>
            <th className="px-4 py-2">Останнє замовлення</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((it) => (
            <tr key={it.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-mono text-xs text-gray-700">
                {it.productCode}
              </td>
              <td className="px-4 py-2 text-gray-800">
                {it.productName ?? "—"}
              </td>
              <td className="px-4 py-2 text-xs text-gray-500">
                {it.lastOrderedAt
                  ? new Date(it.lastOrderedAt).toLocaleDateString("uk-UA")
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
