import Link from "next/link";

interface Item {
  id: string;
  docNumber: string;
  docDate: Date;
  status: string;
  currency: string;
  totalAmount: number;
  totalWeight: number;
  totalQuantity: number;
  supplier: { name: string } | null;
  warehouse: { name: string } | null;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: "Чернетка", color: "bg-gray-100 text-gray-700" },
  posted: { label: "Проведено", color: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Скасовано", color: "bg-red-100 text-red-700" },
};

export function ReceivingsTable({
  items,
  total,
  page,
  pageSize,
  statusFilter,
  searchQuery,
}: {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
  statusFilter: string;
  searchQuery: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
        Поки немає документів. Натисніть «Створити поступлення» щоб додати
        перший.
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2.5 py-1.5">№</th>
              <th className="px-2.5 py-1.5">Дата</th>
              <th className="px-2.5 py-1.5">Постачальник</th>
              <th className="px-2.5 py-1.5">Склад</th>
              <th className="px-2.5 py-1.5 text-right">Мішків</th>
              <th className="px-2.5 py-1.5 text-right">Вага, кг</th>
              <th className="px-2.5 py-1.5 text-right">Сума</th>
              <th className="px-2.5 py-1.5">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((r) => {
              const st = STATUS_LABEL[r.status] ?? {
                label: r.status,
                color: "bg-gray-100 text-gray-700",
              };
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-2.5 py-1.5 font-medium">
                    <Link
                      href={`/manager/receivings/${r.id}`}
                      className="text-emerald-700 hover:underline"
                    >
                      {r.docNumber}
                    </Link>
                  </td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-700">
                    {formatDate(r.docDate)}
                  </td>
                  <td className="px-2.5 py-1.5 text-gray-700">
                    {r.supplier?.name ?? "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-gray-600">
                    {r.warehouse?.name ?? "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-gray-700">
                    {r.totalQuantity}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-gray-700">
                    {r.totalWeight.toFixed(1)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-gray-700 whitespace-nowrap">
                    {r.totalAmount.toFixed(2)} {r.currency}
                  </td>
                  <td className="px-2.5 py-1.5">
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${st.color}`}
                    >
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600">
            Показано {items.length} з {total} документів
          </div>
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2,
              )
              .map((p) => {
                const params = new URLSearchParams();
                if (statusFilter) params.set("status", statusFilter);
                if (searchQuery) params.set("q", searchQuery);
                params.set("page", String(p));
                return (
                  <Link
                    key={p}
                    href={`?${params.toString()}`}
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      p === page
                        ? "border-emerald-400 bg-emerald-50 font-medium"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {p}
                  </Link>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}
