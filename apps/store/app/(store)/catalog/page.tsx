import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@ltex/shared";
import { getCatalogProducts } from "@/lib/catalog";
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
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const view = params.view ?? "pagination";
  const layout: "grid" | "list" = params.layout === "list" ? "list" : "grid";

  const parseFloatParam = (raw: string | undefined): number | undefined => {
    if (!raw) return undefined;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const priceMin = parseFloatParam(params.priceMin);
  const priceMax = parseFloatParam(params.priceMax);
  const unitsPerKgMin = parseFloatParam(params.unitsPerKgMin);
  const unitsPerKgMax = parseFloatParam(params.unitsPerKgMax);
  const unitWeightMin = parseFloatParam(params.unitWeightMin);
  const unitWeightMax = parseFloatParam(params.unitWeightMax);

  const inStockOnly = params.inStock === "true";

  const { products, total, totalPages } = await getCatalogProducts({
    quality: params.quality,
    season: params.season,
    country: params.country,
    gender: params.gender,
    sizes: params.sizes,
    unitsPerKgMin,
    unitsPerKgMax,
    unitWeightMin,
    unitWeightMax,
    q: params.q,
    sort: params.sort,
    priceMin,
    priceMax,
    inStockOnly,
    page,
  });

  const filterParams = new URLSearchParams();
  if (params.quality) filterParams.set("quality", params.quality);
  if (params.season) filterParams.set("season", params.season);
  if (params.country) filterParams.set("country", params.country);
  if (params.gender) filterParams.set("gender", params.gender);
  if (params.sizes) filterParams.set("sizes", params.sizes);
  if (params.unitsPerKgMin)
    filterParams.set("unitsPerKgMin", params.unitsPerKgMin);
  if (params.unitsPerKgMax)
    filterParams.set("unitsPerKgMax", params.unitsPerKgMax);
  if (params.unitWeightMin)
    filterParams.set("unitWeightMin", params.unitWeightMin);
  if (params.unitWeightMax)
    filterParams.set("unitWeightMax", params.unitWeightMax);
  if (params.q) filterParams.set("q", params.q);
  if (params.sort) filterParams.set("sort", params.sort);
  if (params.priceMin) filterParams.set("priceMin", params.priceMin);
  if (params.priceMax) filterParams.set("priceMax", params.priceMax);
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
        <CatalogSidebar />

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
