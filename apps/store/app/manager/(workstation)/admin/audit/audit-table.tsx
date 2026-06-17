import Link from "next/link";
import type { AuditLogQueryResult } from "@/lib/audit/audit-log";

const ROLE_LABEL: Record<string, string> = {
  manager: "Менеджер",
  senior_manager: "Старший менеджер",
  admin: "Адмін",
  owner: "Власник",
  supervisor: "Супервайзер",
  analyst: "Аналітик",
  warehouse: "Склад",
  expeditor: "Експедитор",
  bookkeeper: "Бухгалтер",
  anonymous: "—",
};

const ACTION_LABEL: Record<string, string> = {
  create: "Створено",
  update: "Змінено",
  delete: "Видалено",
  login: "Вхід",
  logout: "Вихід",
  failed_login: "Невдалий вхід",
  password_reset: "Скидання пароля",
  permission_change: "Зміна прав",
  export: "Експорт",
  post: "Проведено",
};

const RESOURCE_LABEL: Record<string, string> = {
  order: "Замовлення",
  client: "Клієнт",
  lot: "Лот",
  product: "Товар",
  sale: "Реалізація",
  payment: "Оплата",
  route_sheet: "Маршрутний лист",
  receiving: "Поступлення",
  reminder: "Нагадування",
  user: "Користувач",
  auth: "Авторизація",
  permissions: "Права",
};

export function AuditLogTable({ result }: { result: AuditLogQueryResult }) {
  if (result.items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
        Немає записів за обраними фільтрами.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2.5 py-1.5">Час</th>
              <th className="px-2.5 py-1.5">Користувач</th>
              <th className="px-2.5 py-1.5">Роль</th>
              <th className="px-2.5 py-1.5">Дія</th>
              <th className="px-2.5 py-1.5">Ресурс</th>
              <th className="px-2.5 py-1.5">Опис</th>
              <th className="px-2.5 py-1.5">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {result.items.map((it) => (
              <tr key={it.id} className={it.isOwnerAction ? "bg-amber-50" : ""}>
                <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-700">
                  {formatDateTime(it.createdAt)}
                </td>
                <td className="px-2.5 py-1.5 text-gray-900">
                  {it.userEmail ?? "—"}
                </td>
                <td className="px-2.5 py-1.5">
                  <span className="text-xs text-gray-700">
                    {ROLE_LABEL[it.userRole] ?? it.userRole}
                  </span>
                  {it.isOwnerAction ? (
                    <span className="ml-1 rounded-sm bg-amber-200 px-1 py-px text-[10px] font-semibold uppercase text-amber-900">
                      owner
                    </span>
                  ) : null}
                </td>
                <td className="px-2.5 py-1.5 text-gray-700">
                  {ACTION_LABEL[it.action] ?? it.action}
                </td>
                <td className="px-2.5 py-1.5 text-gray-700">
                  <span>{RESOURCE_LABEL[it.resource] ?? it.resource}</span>
                  {it.resourceId ? (
                    <span className="ml-1 text-xs text-gray-400">
                      {it.resourceId.slice(0, 8)}
                    </span>
                  ) : null}
                </td>
                <td className="px-2.5 py-1.5 text-gray-700">
                  {it.summary ?? "—"}
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap text-xs text-gray-500">
                  {it.ip ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            Показано {result.items.length} з {result.total} записів
          </div>
          <div className="flex gap-2">
            {Array.from({ length: result.totalPages }, (_, i) => i + 1)
              .filter(
                (p) =>
                  p === 1 ||
                  p === result.totalPages ||
                  Math.abs(p - result.page) <= 2,
              )
              .map((p) => (
                <Link
                  key={p}
                  href={`?page=${p}`}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    p === result.page
                      ? "border-amber-400 bg-amber-50 font-medium"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {p}
                </Link>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yy} ${hh}:${mi}`;
}
