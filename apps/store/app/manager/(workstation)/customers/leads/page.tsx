import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, Prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { convertLeadToClient, rejectLead } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ліди з сайту — L-TEX Manager" };

const STATUS_LABEL: Record<string, string> = {
  new: "Новий",
  contacted: "Був контакт",
  converted: "Клієнт",
  rejected: "Відхилено",
};

const FILTERS = [
  { key: "active", label: "Активні" },
  { key: "converted", label: "Конвертовані" },
  { key: "rejected", label: "Відхилені" },
  { key: "all", label: "Усі" },
] as const;

function whereForFilter(filter: string): Prisma.MgrLeadWhereInput {
  if (filter === "converted") return { status: "converted" };
  if (filter === "rejected") return { status: "rejected" };
  if (filter === "all") return {};
  return { status: { in: ["new", "contacted"] } }; // active (default)
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const filterRaw = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter;
  const filter = FILTERS.some((f) => f.key === filterRaw)
    ? (filterRaw as string)
    : "active";

  const [leads, activeCount] = await Promise.all([
    prisma.mgrLead.findMany({
      where: whereForFilter(filter),
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.mgrLead.count({ where: { status: { in: ["new", "contacted"] } } }),
  ]);

  return (
    <div className="max-w-none space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Ліди з сайту</h1>
          <p className="mt-1 text-sm text-gray-600">
            Реєстрації на сайті. Активних: {activeCount}. Конвертуйте у клієнта
            після контакту (при замовленні — конвертуються самі).
          </p>
        </div>
        <Link
          href="/manager/customers"
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← До клієнтів
        </Link>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/manager/customers/leads?filter=${f.key}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              filter === f.key
                ? "bg-green-600 text-white"
                : "border bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {leads.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-sm text-gray-400">
          Лідів немає.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Імʼя</th>
                <th className="px-3 py-2 font-medium">Телефон</th>
                <th className="px-3 py-2 font-medium">Місто</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Дата</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const active =
                  lead.status === "new" || lead.status === "contacted";
                return (
                  <tr key={lead.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {lead.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">
                      {lead.phone ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {lead.city ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {STATUS_LABEL[lead.status] ?? lead.status}
                      </span>
                      {lead.status === "converted" &&
                        lead.convertedClientId && (
                          <Link
                            href={`/manager/customers/${lead.convertedClientId}`}
                            className="ml-2 text-xs text-blue-600 hover:underline"
                          >
                            картка →
                          </Link>
                        )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                      {new Date(lead.createdAt).toLocaleDateString("uk-UA")}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {active && (
                        <div className="flex justify-end gap-2">
                          <form
                            action={convertLeadToClient.bind(null, lead.id)}
                          >
                            <button
                              type="submit"
                              className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
                            >
                              Створити клієнта
                            </button>
                          </form>
                          <form action={rejectLead.bind(null, lead.id)}>
                            <button
                              type="submit"
                              className="rounded-md border px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                            >
                              Відхилити
                            </button>
                          </form>
                        </div>
                      )}
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
