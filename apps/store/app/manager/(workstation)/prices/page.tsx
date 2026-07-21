import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageCatalog } from "@/lib/manager/catalog-permissions";
import { serializeFields } from "@/lib/manager/bulk-edit/registry";
import { getHiddenCategoryIds } from "@/lib/catalog-visibility";
import { getCurrentRate } from "@/lib/exchange-rate";
import type { PriceSort, SortDir } from "@/lib/manager/prices";
import { PricesToolbar } from "./_components/prices-toolbar";
import { PricesList } from "./_components/prices-list";
import { ListPagination } from "../customers/_components/list-pagination";
import { PageSizeSelect } from "../customers/_components/page-size-select";
import {
  loadCategoriesForFilter,
  loadCategoryNodes,
  loadPrices,
  resolveCategoryAccess,
} from "./_lib/load-prices";

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

  const categoryId = pickString(sp.categoryId);
  const [categories, categoryNodes, rateUah] = await Promise.all([
    loadCategoriesForFilter(),
    loadCategoryNodes(),
    getCurrentRate(),
  ]);

  // Піддерево обраної категорії + приховані для ролі (каркас доступів 5.7).
  const { categorySubtreeIds, hiddenCategoryIds } = resolveCategoryAccess(
    categoryNodes,
    { categoryId, role: user.role },
  );

  // Приховані з каталогу категорії (7.2): ховаємо від торгових агентів, але
  // НЕ від ролей каталогу (admin/owner/warehouse — щоб змінити категорію).
  const catalogHidden = canManageCatalog(user.role)
    ? []
    : await getHiddenCategoryIds();
  const mergedHidden = Array.from(
    new Set([...(hiddenCategoryIds ?? []), ...catalogHidden]),
  );

  const list = await loadPrices({
    q: pickString(sp.q),
    categoryId,
    categorySubtreeIds,
    hiddenCategoryIds: mergedHidden.length > 0 ? mergedHidden : undefined,
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
  });

  // Поля для «Групової обробки» — лише дозволені ролі; опції категорії з дерева.
  const bulkFields = serializeFields("product", user.role, {
    categoryId: categories.map((c) => ({
      value: c.id,
      label: `${"— ".repeat(c.depth)}${c.name}`,
    })),
  });

  return (
    <div className="max-w-none space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Прайс</h1>
          <p className="mt-1 text-sm text-gray-600">
            Усього: {list.total} · сторінка {list.page} з {list.totalPages}
          </p>
        </div>
        {canManageCatalog(user.role) && (
          <Link
            href="/manager/products/new"
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            + Створити товар
          </Link>
        )}
      </header>
      <PricesToolbar categories={categories} totalCount={list.total} />
      <PricesList
        items={list.items}
        rateUah={rateUah}
        sellerName={user.fullName}
        bulkFields={bulkFields}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageSizeSelect pageSize={pageSize} />
        <ListPagination page={list.page} totalPages={list.totalPages} />
      </div>
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
