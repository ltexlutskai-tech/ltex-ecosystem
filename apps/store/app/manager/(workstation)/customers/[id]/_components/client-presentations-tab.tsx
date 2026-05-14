import type { ClientPresentationItem } from "./types";

export function ClientPresentationsTab({
  items,
}: {
  items: ClientPresentationItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-gray-500 shadow-sm">
        Презентацій для цього клієнта ще не було.
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
            <th className="px-4 py-2">Остання презентація</th>
            <th className="px-4 py-2">Тип запису</th>
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
                {it.lastPresentedAt
                  ? new Date(it.lastPresentedAt).toLocaleDateString("uk-UA")
                  : "—"}
              </td>
              <td className="px-4 py-2 text-xs">
                {it.notDirectInput ? (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                    авто
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                    ручний
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
