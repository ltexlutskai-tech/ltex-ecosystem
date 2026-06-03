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
}

const ROLE_LABELS: Record<Role, string> = {
  manager: "Менеджер",
  senior_manager: "Старший менеджер",
  admin: "Адміністратор",
  owner: "Власник",
  supervisor: "Супервайзер",
  analyst: "Аналітик",
  warehouse: "Склад",
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
            <th className="px-4 py-2">ПІБ</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2">Роль</th>
            <th className="px-4 py-2">Статус</th>
            <th className="px-4 py-2">Останній вхід</th>
            <th className="px-4 py-2 text-right">Дії</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {initial.map((u) => (
            <tr key={u.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-800">
                {u.fullName}
                {u.id === currentUserId && (
                  <span className="ml-2 rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700">
                    Ви
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-gray-600">{u.email}</td>
              <td className="px-4 py-2 text-gray-600">{ROLE_LABELS[u.role]}</td>
              <td className="px-4 py-2">
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
              <td className="px-4 py-2 text-gray-500">
                {formatDate(u.lastSeenAt)}
              </td>
              <td className="px-4 py-2 text-right">
                <UserRowActions user={u} isSelf={u.id === currentUserId} />
              </td>
            </tr>
          ))}
          {initial.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                Немає користувачів.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
