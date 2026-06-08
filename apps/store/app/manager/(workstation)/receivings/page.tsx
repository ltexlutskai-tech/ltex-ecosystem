import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { ReceivingsTable } from "./_components/receivings-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Поступлення товарів | L-TEX Manager" };

export default async function ReceivingsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const user = await requireRole([
    "warehouse",
    "admin",
    "owner",
    "supervisor",
    "analyst",
    "bookkeeper",
  ]);
  if (!user) notFound();

  const sp = await searchParams;
  const status = sp.status ?? "";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? "1"));
  const pageSize = 30;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { docNumber: { contains: q, mode: "insensitive" } },
      { inboundDocNumber: { contains: q, mode: "insensitive" } },
      { supplier: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.receiving.count({ where }),
    prisma.receiving.findMany({
      where,
      orderBy: { docDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        docNumber: true,
        docDate: true,
        status: true,
        currency: true,
        totalAmount: true,
        totalWeight: true,
        totalQuantity: true,
        supplier: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    }),
  ]);

  const canCreate =
    user.role === "warehouse" || user.role === "admin" || user.role === "owner";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Поступлення товарів</h1>
          <p className="mt-1 text-sm text-gray-500">
            Документи приймання товарів від постачальників. При проведенні
            автоматично створюються лоти у Прайсі.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/manager/receivings/new"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            ➕ Створити поступлення
          </Link>
        )}
      </div>

      <form
        action="/manager/receivings"
        className="flex flex-wrap items-center gap-2 rounded-md border bg-white p-3"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Пошук: № документа, постачальник…"
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— Усі статуси —</option>
          <option value="draft">Чернетка</option>
          <option value="posted">Проведено</option>
          <option value="cancelled">Скасовано</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Шукати
        </button>
        {(q || status) && (
          <Link
            href="/manager/receivings"
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Скинути
          </Link>
        )}
      </form>

      <ReceivingsTable
        items={items}
        total={total}
        page={page}
        pageSize={pageSize}
        statusFilter={status}
        searchQuery={q}
      />
    </div>
  );
}
