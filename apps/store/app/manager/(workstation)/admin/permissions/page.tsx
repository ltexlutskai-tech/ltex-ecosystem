import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  ROLE_PERMISSIONS,
  RESOURCES,
} from "@/lib/permissions/role-permissions";
import type { ManagerRole } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Матриця прав | L-TEX Manager",
};

const ROLES_ORDER: ManagerRole[] = [
  "admin",
  "owner",
  "manager",
  "supervisor",
  "analyst",
  "warehouse",
  "bookkeeper",
];

const ROLE_LABEL: Record<ManagerRole, string> = {
  manager: "Менеджер",
  senior_manager: "Старший менеджер",
  admin: "Адмін",
  owner: "Власник",
  supervisor: "Супервайзер",
  analyst: "Аналітик",
  warehouse: "Склад",
  bookkeeper: "Бухгалтер",
};

const RESOURCE_LABEL: Record<string, string> = {
  clients: "Клієнти",
  orders: "Замовлення",
  sales: "Реалізації",
  payments: "Оплати / каса",
  route_sheets: "Маршрутні листи",
  prices: "Прайс",
  products: "Товари",
  lots: "Лоти (мішки)",
  receivings: "Поступлення",
  repackings: "Перепаковки",
  categories: "Категорії",
  suppliers: "Постачальники",
  reminders: "Нагадування",
  presentations: "Презентації",
  chat: "Чат-інбокс",
  reports: "Звіти",
  finance: "Фінанси / маржа",
  users: "Користувачі",
  permissions: "Матриця прав",
  settings: "Налаштування",
  audit_log: "Журнал дій",
  exchange_rates: "Курси валют",
};

function actionsCell(perm: {
  view: string;
  create: boolean;
  edit: string;
  delete: string;
  export: boolean;
}): string {
  if (perm.view === "none") return "—";
  const parts: string[] = [];
  parts.push(perm.view === "all" ? "👁️ усі" : "👁️ свої");
  if (perm.create) parts.push("➕");
  if (perm.edit === "all") parts.push("✏️ усі");
  else if (perm.edit === "mine") parts.push("✏️ свої");
  if (perm.delete === "all") parts.push("🗑️ усі");
  else if (perm.delete === "mine") parts.push("🗑️ свої");
  if (perm.export) parts.push("📤");
  return parts.join(" ");
}

export default async function PermissionsMatrixPage() {
  const user = await requireRole(["admin", "owner"]);
  if (!user) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Матриця прав за ролями</h1>
        <p className="mt-1 text-sm text-gray-500">
          Які дії дозволені для кожної ролі по кожному розділу системи. Read-
          only довідник — реальні права закладені в коді
          (`lib/permissions/role-permissions.ts`). Індивідуальні override-и
          ставляться у картці користувача.
        </p>
      </div>

      <div className="space-y-1 rounded-md border bg-amber-50 p-3 text-xs text-amber-900">
        <div>
          <span className="font-medium">Легенда:</span> 👁️ перегляд · ➕
          створення · ✏️ редагування · 🗑️ видалення · 📤 експорт ·{" "}
          <span className="font-medium">усі</span> = усі записи ·{" "}
          <span className="font-medium">свої</span> = тільки де поточний user —
          призначений агент
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2">
                Розділ
              </th>
              {ROLES_ORDER.map((r) => (
                <th key={r} className="px-3 py-2 text-center">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {RESOURCES.map((res) => (
              <tr key={res}>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-gray-900">
                  {RESOURCE_LABEL[res] ?? res}
                </td>
                {ROLES_ORDER.map((role) => {
                  const perm = ROLE_PERMISSIONS[role][res];
                  return (
                    <td
                      key={role}
                      className={`px-3 py-2 text-center text-xs ${
                        perm.view === "none"
                          ? "text-gray-300"
                          : perm.view === "all"
                            ? "text-emerald-700"
                            : "text-amber-700"
                      }`}
                    >
                      {actionsCell(perm)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
