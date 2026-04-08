export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import Link from "next/link";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";
import { SortHeader } from "@/components/admin/sort-header";
import { ExportCsvButton } from "@/components/admin/export-csv";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const page = parseInt(params.page ?? "1", 10);
  const sort = params.sort ?? "updatedAt";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const perPage = 25;

  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { phone: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
          { telegram: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const orderByMap: Record<string, Record<string, string>> = {
    name: { name: dir },
    updatedAt: { updatedAt: dir },
    city: { city: dir },
  };
  const orderBy = orderByMap[sort] ?? { updatedAt: "desc" };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        _count: { select: { orders: true } },
        orders: {
          select: { totalEur: true },
        },
      },
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.customer.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);
  const baseParams = new URLSearchParams();
  if (query) baseParams.set("q", query);

  function sortUrl(field: string) {
    const sp = new URLSearchParams(baseParams);
    sp.set("sort", field);
    sp.set("dir", sort === field && dir === "asc" ? "desc" : "asc");
    return `/admin/customers?${sp.toString()}`;
  }

  const csvData = customers.map((c) => ({
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    telegram: c.telegram ?? "",
    city: c.city ?? "",
    orders: c._count.orders,
    totalEur: c.orders.reduce((sum, o) => sum + o.totalEur, 0).toFixed(2),
    code1C: c.code1C ?? "",
  }));

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs items={[{ label: "Клієнти" }]} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Клієнти ({total})</h1>
        <ExportCsvButton
          data={csvData}
          filename="customers"
          headers={[
            "name",
            "phone",
            "email",
            "telegram",
            "city",
            "orders",
            "totalEur",
            "code1C",
          ]}
        />
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Пошук по імені, телефону, email, Telegram..."
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
        >
          Шукати
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <SortHeader
                label="Ім'я"
                field="name"
                currentSort={sort}
                currentDir={dir}
                href={sortUrl("name")}
              />
              <th className="px-4 py-3 font-medium">Телефон</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Telegram</th>
              <SortHeader
                label="Місто"
                field="city"
                currentSort={sort}
                currentDir={dir}
                href={sortUrl("city")}
              />
              <th className="px-4 py-3 font-medium">Замовлень</th>
              <th className="px-4 py-3 font-medium">Сума EUR</th>
              <th className="px-4 py-3 font-medium">Код 1С</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const totalSpent = customer.orders.reduce(
                (sum, o) => sum + o.totalEur,
                0,
              );
              return (
                <tr key={customer.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{customer.name}</td>
                  <td className="px-4 py-3">{customer.phone ?? "-"}</td>
                  <td className="px-4 py-3">{customer.email ?? "-"}</td>
                  <td className="px-4 py-3">{customer.telegram ?? "-"}</td>
                  <td className="px-4 py-3">{customer.city ?? "-"}</td>
                  <td className="px-4 py-3">{customer._count.orders}</td>
                  <td className="px-4 py-3">€{totalSpent.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {customer.code1C ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/customers?${query ? `q=${query}&` : ""}${sort !== "updatedAt" ? `sort=${sort}&dir=${dir}&` : ""}page=${p}`}
              className={`rounded-md border px-3 py-1 text-sm ${p === page ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
