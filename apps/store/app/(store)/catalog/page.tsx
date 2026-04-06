import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@ltex/shared";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/store/product-card";
import { CatalogFilters } from "@/components/store/catalog-filters";
import { Pagination } from "@/components/store/pagination";
import { Breadcrumbs } from "@/components/store/breadcrumbs";

export const metadata: Metadata = {
  title: "Каталог — секонд хенд, сток, іграшки гуртом",
  description:
    "Каталог товарів L-TEX: секонд хенд, сток, іграшки, Bric-a-Brac, взуття, аксесуари гуртом від 10 кг. Доставка по Україні.",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);

  const { products, total, totalPages } = await getCatalogProducts({
    quality: params.quality,
    season: params.season,
    country: params.country,
    q: params.q,
    sort: params.sort,
    page,
  });

  const filterParams = new URLSearchParams();
  if (params.quality) filterParams.set("quality", params.quality);
  if (params.season) filterParams.set("season", params.season);
  if (params.country) filterParams.set("country", params.country);
  if (params.q) filterParams.set("q", params.q);
  if (params.sort) filterParams.set("sort", params.sort);
  const baseHref = filterParams.toString()
    ? `/catalog?${filterParams.toString()}`
    : "/catalog";

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs items={[{ label: "Каталог" }]} />

      <h1 className="mt-4 text-3xl font-bold">Каталог товарів</h1>
      <p className="mt-1 text-gray-500">{total} товарів</p>

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
          Товарів не знайдено. Спробуйте змінити фільтри.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
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
    </div>
  );
}
