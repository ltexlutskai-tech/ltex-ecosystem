"use client";

import { UserRowActions } from "./user-row-actions";

type Role =
  | "manager"
  | "senior_manager"
  | "admin"
  | "owner"
  | "supervisor"
  | "analyst"
  | "warehouse"
  | "expeditor"
  | "bookkeeper";

export interface ManagerUserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastSeenAt: string | null;
  telegramLinked: boolean;
  createdAt: string;
  tradeAgentName: string | null;
  tradeAgentCode1C: string | null;
}

const ROLE_LABELS: Record<Role, string> = {
  manager: "Менеджер",
  senior_manager: "Старший менеджер",
  admin: "Адміністратор",
  owner: "Власник",
  supervisor: "Супервайзер",
  analyst: "Аналітик",
  warehouse: "Склад",
  expeditor: "Експедитор",
  bookkeeper: "Бухгалтер",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UsersTable({
  initial,
  currentUserId,
}: {
  initial: ManagerUserRow[];
  currentUserId: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-2.5 py-1.5">ПІБ</th>
            <th className="px-2.5 py-1.5">Email</th>
            <th className="px-2.5 py-1.5">Роль</th>
            <th className="px-2.5 py-1.5">Торговий агент (1С)</th>
            <th className="px-2.5 py-1.5">Статус</th>
            <th className="px-2.5 py-1.5">Останній вхід</th>
            <th className="px-2.5 py-1.5 text-right">Дії</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {initial.map((u) => (
            <tr key={u.id} className="hover:bg-gray-50">
              <td className="px-2.5 py-1.5 font-medium text-gray-800">
                {u.fullName}
                {u.id === currentUserId && (
                  <span className="ml-2 rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700">
                    Ви
                  </span>
                )}
              </td>
              <td className="px-2.5 py-1.5 text-gray-600">{u.email}</td>
              <td className="px-2.5 py-1.5 text-gray-600">
                {ROLE_LABELS[u.role]}
              </td>
              <td className="px-2.5 py-1.5 text-gray-600">
                {u.tradeAgentName ? (
                  <span>
                    {u.tradeAgentName}
                    {u.tradeAgentCode1C && (
                      <span className="ml-1 font-mono text-xs text-gray-400">
                        {u.tradeAgentCode1C}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-2.5 py-1.5">
                {u.isActive ? (
                  <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                    Активний
                  </span>
                ) : (
                  <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                    Вимкнено
                  </span>
                )}
              </td>
              <td className="px-2.5 py-1.5 text-gray-500">
                {formatDate(u.lastSeenAt)}
              </td>
              <td className="px-2.5 py-1.5 text-right">
                <UserRowActions user={u} isSelf={u.id === currentUserId} />
              </td>
            </tr>
          ))}
          {initial.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                Немає користувачів.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
