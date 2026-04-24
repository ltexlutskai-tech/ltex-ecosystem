import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@ltex/shared";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/store/product-card";
import { CatalogFilters } from "@/components/store/catalog-filters";
import { Pagination } from "@/components/store/pagination";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { InfiniteScrollCatalog } from "@/components/store/infinite-scroll-catalog";
import { CatalogViewToggle } from "@/components/store/catalog-view-toggle";
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

  const priceMin = params.priceMin ? parseFloat(params.priceMin) : undefined;
  const priceMax = params.priceMax ? parseFloat(params.priceMax) : undefined;

  const inStockOnly = params.inStock === "true";

  const { products, total, totalPages } = await getCatalogProducts({
    quality: params.quality,
    season: params.season,
    country: params.country,
    q: params.q,
    sort: params.sort,
    priceMin: priceMin && !isNaN(priceMin) ? priceMin : undefined,
    priceMax: priceMax && !isNaN(priceMax) ? priceMax : undefined,
    inStockOnly,
    page,
  });

  const filterParams = new URLSearchParams();
  if (params.quality) filterParams.set("quality", params.quality);
  if (params.season) filterParams.set("season", params.season);
  if (params.country) filterParams.set("country", params.country);
  if (params.q) filterParams.set("q", params.q);
  if (params.sort) filterParams.set("sort", params.sort);
  if (params.priceMin) filterParams.set("priceMin", params.priceMin);
  if (params.priceMax) filterParams.set("priceMax", params.priceMax);
  if (inStockOnly) filterParams.set("inStock", "true");
  const baseHref = filterParams.toString()
    ? `/catalog?${filterParams.toString()}`
    : "/catalog";

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
        <CatalogViewToggle currentView={view} />
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

      <div className="mt-6">
        <CatalogFilters />
      </div>

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
        />
      ) : (
        <>
          <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
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
  );
}
