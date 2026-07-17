import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@ltex/shared";
import { getCatalogProducts } from "@/lib/catalog";
import { loadProductAttributeOptions } from "@/lib/manager/product-attributes";
import { ProductCard } from "@/components/store/product-card";
import { CatalogSidebar } from "@/components/store/catalog-sidebar";
import { Pagination } from "@/components/store/pagination";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { InfiniteScrollCatalog } from "@/components/store/infinite-scroll-catalog";
import { CatalogLayoutToggle } from "@/components/store/catalog-layout-toggle";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Каталог — секонд хенд, сток, іграшки гуртом",
  description:
    "Каталог товарів L-TEX: секонд хенд, сток, іграшки, Bric-a-Brac, взуття, аксесуари гуртом від 10 кг. Доставка по Україні.",
  alternates: {
    canonical: `${SITE_URL}/catalog`,
  },
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const getStr = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  const page = parseInt(getStr(params.page) ?? "1", 10);
  const view = getStr(params.view) ?? "pagination";
  const layout: "grid" | "list" =
    getStr(params.layout) === "list" ? "list" : "grid";

  const parseFloatParam = (raw: string | undefined): number | undefined => {
    if (!raw) return undefined;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const priceMinStr = getStr(params.priceMin);
  const priceMaxStr = getStr(params.priceMax);
  const unitsMinStr = getStr(params.unitsPerKgMin);
  const unitsMaxStr = getStr(params.unitsPerKgMax);
  const weightMinStr = getStr(params.unitWeightMin);
  const weightMaxStr = getStr(params.unitWeightMax);

  const priceMin = parseFloatParam(priceMinStr);
  const priceMax = parseFloatParam(priceMaxStr);
  const unitsPerKgMin = parseFloatParam(unitsMinStr);
  const unitsPerKgMax = parseFloatParam(unitsMaxStr);
  const unitWeightMin = parseFloatParam(weightMinStr);
  const unitWeightMax = parseFloatParam(weightMaxStr);

  const inStockOnly = getStr(params.inStock) === "true";

  const { products, total, totalPages } = await getCatalogProducts({
    quality: getStr(params.quality),
    season: getStr(params.season),
    country: getStr(params.country),
    gender: getStr(params.gender),
    unitsPerKgMin,
    unitsPerKgMax,
    unitWeightMin,
    unitWeightMax,
    q: getStr(params.q),
    sort: getStr(params.sort),
    priceMin,
    priceMax,
    inStockOnly,
    page,
  });

  const attributeOptions = await loadProductAttributeOptions();

  const filterParams = new URLSearchParams();
  const qParam = getStr(params.quality);
  if (qParam) filterParams.set("quality", qParam);
  const seasonParam = getStr(params.season);
  if (seasonParam) filterParams.set("season", seasonParam);
  const countryParam = getStr(params.country);
  if (countryParam) filterParams.set("country", countryParam);
  const genderParam = getStr(params.gender);
  if (genderParam) filterParams.set("gender", genderParam);
  if (unitsMinStr) filterParams.set("unitsPerKgMin", unitsMinStr);
  if (unitsMaxStr) filterParams.set("unitsPerKgMax", unitsMaxStr);
  if (weightMinStr) filterParams.set("unitWeightMin", weightMinStr);
  if (weightMaxStr) filterParams.set("unitWeightMax", weightMaxStr);
  const qSearch = getStr(params.q);
  if (qSearch) filterParams.set("q", qSearch);
  const sortParam = getStr(params.sort);
  if (sortParam) filterParams.set("sort", sortParam);
  if (priceMinStr) filterParams.set("priceMin", priceMinStr);
  if (priceMaxStr) filterParams.set("priceMax", priceMaxStr);
  if (inStockOnly) filterParams.set("inStock", "true");
  const baseHref = filterParams.toString()
    ? `/catalog?${filterParams.toString()}`
    : "/catalog";

  // `?view=infinite` is retained as a URL-only feature; UI toggle was
  // replaced in S31 by the grid/list layout toggle.
  const isInfiniteScroll = view === "infinite";

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs items={[{ label: "Каталог" }]} />

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{dict.catalog.title}</h1>
          <p className="mt-1 text-gray-500">
            {total} {dict.catalog.products}
          </p>
        </div>
        <CatalogLayoutToggle currentLayout={layout} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={`/catalog/${cat.slug}`}
            className="rounded-full border px-3 py-1 text-sm transition-colors hover:border-green-500 hover:text-green-700"
          >
            {cat.name}
          </Link>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <CatalogSidebar attributeOptions={attributeOptions} />

        <div className="min-w-0 flex-1">
          {products.length === 0 ? (
            <p className="mt-12 text-center text-gray-500">
              {dict.catalog.noResults}
            </p>
          ) : isInfiniteScroll ? (
            <InfiniteScrollCatalog
              initialProducts={products}
              total={total}
              totalPages={totalPages}
              perPage={24}
              filterParams={filterParams.toString()}
              layout={layout}
            />
          ) : (
            <>
              {layout === "list" ? (
                <div className="flex flex-col gap-4">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      mode="list"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      mode="grid"
                    />
                  ))}
                </div>
              )}
              <div className="mt-8">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  baseHref={baseHref}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
