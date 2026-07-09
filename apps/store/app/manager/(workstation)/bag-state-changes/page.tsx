import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma, prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { BagStateStatusBadge } from "./_components/status-badge";

export const dynamic = "force-dynamic";

export const metadata = { title: "Зміна стану мішка | L-TEX Manager" };

const VIEW_ROLES = [
  "manager",
  "senior_manager",
  "supervisor",
  "admin",
  "owner",
  "warehouse",
  "analyst",
  "bookkeeper",
  "expeditor",
] as const;

const WRITE_ROLES = ["warehouse", "admin", "owner"];

const PAGE_SIZE = 30;

export default async function BagStateListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const user = await requireRole([...VIEW_ROLES]);
  if (!user) notFound();

  const sp = await searchParams;
  const status = sp.status ?? "";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const where: Prisma.BagStateChangeWhereInput = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { docNumber: { contains: q, mode: "insensitive" } },
      { number1C: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.bagStateChange.findMany({
      where,
      orderBy: { docDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        docNumber: true,
        number1C: true,
        docDate: true,
        status: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.bagStateChange.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canCreate = WRITE_ROLES.includes(user.role);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Зміна стану мішка</h1>
          <p className="mt-1 text-sm text-gray-500">
            Пакетний редактор мішків:
            відкритий/відео/цільовий/ефір/бронь/сектор.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/manager/bag-state-changes/new"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            ➕ Створити
          </Link>
        )}
      </div>

      <form
        action="/manager/bag-state-changes"
        className="flex flex-wrap items-center gap-2 rounded-md border bg-white p-3"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Пошук: № документа…"
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
            href="/manager/bag-state-changes"
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Скинути
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">№ документа</th>
              <th className="px-3 py-2">Дата</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 text-right">Мішків</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                  Документів немає
                </td>
              </tr>
            )}
            {items.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link
                    href={`/manager/bag-state-changes/${d.id}`}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {d.number1C ?? d.docNumber}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {formatDate(d.docDate)}
                </td>
                <td className="px-3 py-2">
                  <BagStateStatusBadge status={d.status} />
                </td>
                <td className="px-3 py-2 text-right">{d._count.items}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={pageHref(q, status, page - 1)}
              className="rounded-md border px-3 py-1 hover:bg-gray-50"
            >
              ← Попередня
            </Link>
          )}
          <span className="text-gray-500">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageHref(q, status, page + 1)}
              className="rounded-md border px-3 py-1 hover:bg-gray-50"
            >
              Наступна →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function pageHref(q: string, status: string, page: number) {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (status) sp.set("status", status);
  sp.set("page", String(page));
  return `/manager/bag-state-changes?${sp.toString()}`;
}

function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}
