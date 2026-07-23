import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  buildWarehouseTasksWhere,
  buildWarehouseTasksOrderBy,
} from "@/lib/manager/warehouse-tasks-list";
import { AutoRefresh } from "../_components/auto-refresh";
import { TaskTypeTabs } from "../_components/task-type-tabs";
import { WarehouseTasksToolbar } from "./_components/warehouse-tasks-toolbar";
import { TaskSortHeader } from "./_components/task-sort-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Завдання складу — L-TEX Manager" };

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

const DEFAULT_STATUS = { label: "Нове", cls: "bg-amber-100 text-amber-700" };
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  new: DEFAULT_STATUS,
  received: { label: "В роботі", cls: "bg-blue-100 text-blue-700" },
  sent: { label: "Відправлено", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Скасовано", cls: "bg-gray-100 text-gray-500" },
};

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function WarehouseTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;

  // Склад/адмін/власник — усі завдання; менеджер — свої (за реалізацією).
  const isWarehouse = WAREHOUSE_ROLES.includes(user.role);
  // За замовчуванням показуємо лише активні (без завершених/скасованих), щоб
  // «Готово» прибирало завдання зі списку. `status=all` — показати всі.
  const statusParam = firstParam(sp.status);
  const where = buildWarehouseTasksWhere({
    managerUserId: isWarehouse ? null : user.id,
    status: statusParam === "all" ? undefined : statusParam,
    openOnly: !statusParam,
    customerName: firstParam(sp.customerName),
    deliveryMethod: firstParam(sp.deliveryMethod),
  });

  const tasks = await prisma.warehouseTask.findMany({
    where,
    orderBy: buildWarehouseTasksOrderBy(
      firstParam(sp.sort),
      firstParam(sp.dir),
    ),
    include: { _count: { select: { items: true } } },
    take: 200,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <AutoRefresh intervalMs={20_000} />
      <TaskTypeTabs role={user.role} active="warehouse" />
      <header>
        <h1 className="text-2xl font-bold text-gray-800">
          Підготовка відправлень
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Підготувати товари до відправлення + перевірити/створити ТТН. Завдання
          створюється при проведенні реалізації.
        </p>
      </header>

      <WarehouseTasksToolbar />

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-gray-50 px-4 py-12 text-center text-sm text-gray-500">
          Немає завдань за обраними фільтрами.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2 font-medium">
                  <TaskSortHeader sortKey="customerName" label="Клієнт" />
                </th>
                <th className="px-4 py-2 font-medium">Доставка</th>
                <th className="px-4 py-2 text-center font-medium">Позицій</th>
                <th className="px-4 py-2 font-medium">
                  <TaskSortHeader sortKey="status" label="Статус" />
                </th>
                <th className="px-4 py-2 font-medium">
                  <TaskSortHeader sortKey="createdAt" label="Створено" />
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const st = STATUS_LABEL[t.status] ?? DEFAULT_STATUS;
                const delivery =
                  [
                    t.deliveryLabel,
                    t.novaPoshtaBranch && `№ ${t.novaPoshtaBranch}`,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—";
                const isNovaPoshta = t.deliveryMethod === "post";
                return (
                  <tr
                    key={t.id}
                    className="border-b last:border-b-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/manager/warehouse-tasks/${t.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        {t.customerName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      <div>{delivery}</div>
                      {t.expressWaybill &&
                        (isNovaPoshta ? (
                          <a
                            href={`https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(
                              t.expressWaybill,
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            ТТН {t.expressWaybill}
                          </a>
                        ) : (
                          <div className="mt-0.5 font-mono text-xs font-semibold text-gray-700">
                            ТТН {t.expressWaybill}
                          </div>
                        ))}
                    </td>
                    <td className="px-4 py-2 text-center text-gray-700">
                      {t._count.items}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(t.createdAt).toLocaleString("uk-UA")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
