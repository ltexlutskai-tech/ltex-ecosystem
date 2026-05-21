import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import type { PriceSort, SortDir } from "@/lib/manager/prices";
import { PricesToolbar } from "./_components/prices-toolbar";
import { PricesList } from "./_components/prices-list";
import { PricesPagination } from "./_components/prices-pagination";
import { loadCategoriesForFilter, loadPrices } from "./_lib/load-prices";

export const dynamic = "force-dynamic";
export const metadata = { title: "Прайс — L-TEX Manager" };

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const page = clampInt(sp.page, 1, 1, 9_999);
  const pageSize = clampInt(sp.pageSize, 50, 10, 100);
  const sort: PriceSort =
    pickString(sp.sort) === "arrival" ? "arrival" : "name";
  const dir: SortDir = pickString(sp.dir) === "desc" ? "desc" : "asc";

  const [categories, list, rateUah] = await Promise.all([
    loadCategoriesForFilter(),
    loadPrices({
      q: pickString(sp.q),
      categoryId: pickString(sp.categoryId),
      arrivalFrom: pickDate(sp.arrivalFrom),
      arrivalTo: pickDate(sp.arrivalTo),
      priceFrom: pickNumber(sp.priceFrom),
      priceTo: pickNumber(sp.priceTo),
      inStock: pickBool(sp.inStock),
      target: pickBool(sp.target),
      onSale: pickBool(sp.onSale),
      isNew: pickBool(sp.isNew),
      hasVideo: pickBool(sp.hasVideo),
      noVideo: pickBool(sp.noVideo),
      sort,
      dir,
      page,
      pageSize,
    }),
    getCurrentRate(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Прайс</h1>
        <p className="mt-1 text-sm text-gray-600">
          Усього: {list.total} · сторінка {list.page} з {list.totalPages}
        </p>
      </header>
      <PricesToolbar categories={categories} totalCount={list.total} />
      <PricesList
        items={list.items}
        rateUah={rateUah}
        sellerName={user.fullName}
      />
      <PricesPagination page={list.page} totalPages={list.totalPages} />
    </div>
  );
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v && v.length > 0 ? v : undefined;
}

function pickBool(v: string | string[] | undefined): boolean | undefined {
  const s = pickString(v);
  if (s === "true") return true;
  if (s === "false") return false;
  return undefined;
}

function pickNumber(v: string | string[] | undefined): number | undefined {
  const s = pickString(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function pickDate(v: string | string[] | undefined): Date | undefined {
  const s = pickString(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function clampInt(
  v: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const s = pickString(v);
  const n = s ? Number(s) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}
