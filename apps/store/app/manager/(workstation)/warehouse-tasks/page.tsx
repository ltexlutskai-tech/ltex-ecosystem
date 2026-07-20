import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type Prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { AutoRefresh } from "../_components/auto-refresh";

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

export default async function WarehouseTasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  // Склад/адмін/власник — усі завдання; менеджер — свої (за реалізацією).
  const isWarehouse = WAREHOUSE_ROLES.includes(user.role);
  const where: Prisma.WarehouseTaskWhereInput = isWarehouse
    ? {}
    : { managerUserId: user.id };

  const tasks = await prisma.warehouseTask.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { items: true } } },
    take: 200,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <AutoRefresh intervalMs={20_000} />
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Завдання складу</h1>
        <p className="mt-1 text-sm text-gray-600">
          Підготувати товари до відправлення + перевірити/створити ТТН. Завдання
          створюється при проведенні реалізації.
        </p>
      </header>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-gray-50 px-4 py-12 text-center text-sm text-gray-500">
          Немає завдань.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2 font-medium">Клієнт</th>
                <th className="px-4 py-2 font-medium">Доставка</th>
                <th className="px-4 py-2 text-center font-medium">Позицій</th>
                <th className="px-4 py-2 font-medium">Статус</th>
                <th className="px-4 py-2 font-medium">Створено</th>
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
