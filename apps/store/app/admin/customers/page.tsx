export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import Link from "next/link";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const page = parseInt(params.page ?? "1", 10);
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

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        _count: { select: { orders: true } },
        orders: {
          select: { totalEur: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.customer.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Клієнти ({total})</h1>

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
              <th className="px-4 py-3 font-medium">Ім&apos;я</th>
              <th className="px-4 py-3 font-medium">Телефон</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Telegram</th>
              <th className="px-4 py-3 font-medium">Місто</th>
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
              href={`/admin/customers?${query ? `q=${query}&` : ""}page=${p}`}
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
