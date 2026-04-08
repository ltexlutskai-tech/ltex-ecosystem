export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import { LOT_STATUSES, LOT_STATUS_LABELS } from "@ltex/shared";
import Link from "next/link";
import { LotsTable } from "./lots-table";

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const status = params.status;
  const page = parseInt(params.page ?? "1", 10);
  const perPage = 30;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (query) {
    where.OR = [
      { barcode: { contains: query, mode: "insensitive" } },
      { product: { name: { contains: query, mode: "insensitive" } } },
    ];
  }

  const [lots, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      include: { product: { select: { name: true, slug: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.lot.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Лоти ({total})</h1>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/lots"
          className={`rounded-md border px-3 py-1 text-sm ${!status ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
        >
          Всі
        </Link>
        {LOT_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/lots?status=${s}`}
            className={`rounded-md border px-3 py-1 text-sm ${status === s ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
          >
            {LOT_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <form className="flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={query}
          placeholder="Пошук по штрихкоду або назві товару..."
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
        >
          Шукати
        </button>
      </form>

      <LotsTable lots={lots} />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from(
            { length: Math.min(totalPages, 20) },
            (_, i) => i + 1,
          ).map((p) => {
            const searchP = new URLSearchParams();
            if (query) searchP.set("q", query);
            if (status) searchP.set("status", status);
            searchP.set("page", String(p));
            return (
              <Link
                key={p}
                href={`/admin/lots?${searchP.toString()}`}
                className={`rounded-md border px-3 py-1 text-sm ${p === page ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-gray-50"}`}
              >
                {p}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
