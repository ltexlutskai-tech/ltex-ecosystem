export const dynamic = "force-dynamic";

import { prisma } from "@ltex/db";
import {
  LOT_STATUSES,
  LOT_STATUS_LABELS,
  QUALITY_LEVELS,
  QUALITY_LABELS,
} from "@ltex/shared";
import Link from "next/link";
import { LotsTable } from "./lots-table";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";
import { AdminPagination } from "@/components/admin/pagination";
import { FilterSelect } from "@/components/admin/filter-select";
import { PriceRangeFilter } from "./price-range-filter";

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    quality?: string;
    priceMin?: string;
    priceMax?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const status = params.status;
  const quality = params.quality;
  const priceMin = params.priceMin ? parseFloat(params.priceMin) : undefined;
  const priceMax = params.priceMax ? parseFloat(params.priceMax) : undefined;
  const page = parseInt(params.page ?? "1", 10);
  const perPage = 30;

  const conditions: Record<string, unknown>[] = [];
  if (status) conditions.push({ status });
  if (quality) conditions.push({ product: { quality } });
  if (priceMin !== undefined || priceMax !== undefined) {
    conditions.push({
      priceEur: {
        ...(priceMin !== undefined ? { gte: priceMin } : {}),
        ...(priceMax !== undefined ? { lte: priceMax } : {}),
      },
    });
  }
  if (query) {
    conditions.push({
      OR: [
        { barcode: { contains: query, mode: "insensitive" } },
        { product: { name: { contains: query, mode: "insensitive" } } },
      ],
    });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

  const [lots, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      include: {
        product: { select: { name: true, slug: true, quality: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.lot.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  const baseParams = new URLSearchParams();
  if (query) baseParams.set("q", query);
  if (status) baseParams.set("status", status);
  if (quality) baseParams.set("quality", quality);
  if (priceMin !== undefined) baseParams.set("priceMin", String(priceMin));
  if (priceMax !== undefined) baseParams.set("priceMax", String(priceMax));

  function pageHref(p: number) {
    const sp = new URLSearchParams(baseParams);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    return `/admin/lots?${sp.toString()}`;
  }

  function statusHref(s?: string) {
    const sp = new URLSearchParams(baseParams);
    if (s) sp.set("status", s);
    else sp.delete("status");
    sp.delete("page");
    return `/admin/lots?${sp.toString()}`;
  }

  const qualityOptions = QUALITY_LEVELS.map((q) => ({
    value: q,
    label: QUALITY_LABELS[q],
  }));

  const hasFilters =
    query ||
    status ||
    quality ||
    priceMin !== undefined ||
    priceMax !== undefined;

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs items={[{ label: "Лоти" }]} />

      <h1 className="text-2xl font-bold">Лоти ({total})</h1>

      <div className="flex flex-wrap gap-2">
        <Link
          href={statusHref()}
          className={`rounded-md border px-3 py-1 text-sm ${!status ? "border-green-200 bg-green-50 text-green-700" : "hover:bg-gray-50"}`}
        >
          Всі
        </Link>
        {LOT_STATUSES.map((s) => (
          <Link
            key={s}
            href={statusHref(s)}
            className={`rounded-md border px-3 py-1 text-sm ${status === s ? "border-green-200 bg-green-50 text-green-700" : "hover:bg-gray-50"}`}
          >
            {LOT_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        {quality && <input type="hidden" name="quality" value={quality} />}
        {priceMin !== undefined && (
          <input type="hidden" name="priceMin" value={priceMin} />
        )}
        {priceMax !== undefined && (
          <input type="hidden" name="priceMax" value={priceMax} />
        )}
        <input
          name="q"
          defaultValue={query}
          placeholder="Пошук по штрихкоду або назві товару..."
          className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
        >
          Шукати
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          paramName="quality"
          options={qualityOptions}
          placeholder="Всі якості"
        />
        <PriceRangeFilter />
        {hasFilters && (
          <Link
            href="/admin/lots"
            className="rounded-md border px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Скинути фільтри
          </Link>
        )}
      </div>

      <LotsTable lots={lots} />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        baseHref="/admin/lots"
        buildHref={pageHref}
      />
    </div>
  );
}
