import Link from "next/link";
import { ClientStatusBadge } from "./client-status-badge";
import { DebtCell } from "./debt-cell";
import { DaysSinceCell } from "./days-since-cell";
import type { ClientListItem } from "./types";

export function ClientListTable({ items }: { items: ClientListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-gray-500">
        Клієнтів не знайдено за вибраними фільтрами.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2">Клієнт</th>
            <th className="px-4 py-2">Борг</th>
            <th className="px-4 py-2">Статус</th>
            <th className="px-4 py-2">Канал</th>
            <th className="px-4 py-2">Днів</th>
            <th className="px-4 py-2">Останній запис</th>
            <th className="px-4 py-2">Менеджер</th>
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
                <td className="px-4 py-2">
                  <Link
                    href={`/manager/customers/${c.id}`}
                    className="block text-gray-900 hover:text-blue-600"
                  >
                    <div className="font-medium">
                      {c.name}
                      {c.phonePrimary && (
                        <span className="ml-1 text-xs text-gray-500">
                          ({c.phonePrimary})
                        </span>
                      )}
                    </div>
                    {(c.region || c.city) && (
                      <div className="text-xs text-gray-500">
                        {[c.region, c.city].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <DebtCell value={c.debt} />
                </td>
                <td className="px-4 py-2">
                  <ClientStatusBadge status={c.statusGeneral} />
                </td>
                <td className="px-4 py-2 text-gray-700">
                  {c.searchChannel?.label ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <DaysSinceCell days={c.daysSinceLastPurchase} />
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {c.lastPurchaseAt
                    ? new Date(c.lastPurchaseAt).toLocaleDateString("uk-UA", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-2 text-gray-700">
                  {c.assignedManager?.fullName ?? (
                    <span className="text-xs text-gray-400">не призначено</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
