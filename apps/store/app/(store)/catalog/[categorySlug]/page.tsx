import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/store/product-card";
import { CatalogFilters } from "@/components/store/catalog-filters";
import { Pagination } from "@/components/store/pagination";
import { Breadcrumbs } from "@/components/store/breadcrumbs";

export const revalidate = 60;

interface Props {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug } = await params;
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
  });
  if (!category) return {};
  return {
    title: `${category.name} — секонд хенд та сток гуртом`,
    description: `${category.name} гуртом від 10 кг. Секонд хенд, сток, оригінал з Англії, Німеччини, Канади, Польщі. L-TEX — доставка по Україні.`,
    alternates: {
      canonical: `${SITE_URL}/catalog/${categorySlug}`,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { categorySlug } = await params;
  const sp = await searchParams;
  const page = parseInt(sp.page ?? "1", 10);

  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
    include: {
      children: { orderBy: { position: "asc" } },
    },
  });

  if (!category) notFound();

  const childIds = category.children.map((c) => c.id);
  const categoryIds = [category.id, ...childIds];

  const priceMin = sp.priceMin ? parseFloat(sp.priceMin) : undefined;
  const priceMax = sp.priceMax ? parseFloat(sp.priceMax) : undefined;

  const { products, total, totalPages } = await getCatalogProducts({
    categoryIds,
    quality: sp.quality,
    season: sp.season,
    country: sp.country,
    q: sp.q,
    sort: sp.sort,
    priceMin: priceMin && !isNaN(priceMin) ? priceMin : undefined,
    priceMax: priceMax && !isNaN(priceMax) ? priceMax : undefined,
    page,
  });

  const filterParams = new URLSearchParams();
  if (sp.quality) filterParams.set("quality", sp.quality);
  if (sp.season) filterParams.set("season", sp.season);
  if (sp.country) filterParams.set("country", sp.country);
  if (sp.q) filterParams.set("q", sp.q);
  if (sp.sort) filterParams.set("sort", sp.sort);
  if (sp.priceMin) filterParams.set("priceMin", sp.priceMin);
  if (sp.priceMax) filterParams.set("priceMax", sp.priceMax);
  const baseHref = filterParams.toString()
    ? `/catalog/${categorySlug}?${filterParams.toString()}`
    : `/catalog/${categorySlug}`;

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs
        items={[
          { label: "Каталог", href: "/catalog" },
          { label: category.name },
        ]}
      />

      <h1 className="mt-4 text-3xl font-bold">{category.name}</h1>
      <p className="mt-1 text-gray-500">{total} товарів</p>

      {category.children.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {category.children.map((sub) => (
            <Link
              key={sub.slug}
              href={`/catalog/${categorySlug}/${sub.slug}`}
              className="rounded-full border px-3 py-1 text-sm transition-colors hover:border-green-500 hover:text-green-700"
            >
              {sub.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6">
        <CatalogFilters />
      </div>

      {products.length === 0 ? (
        <p className="mt-12 text-center text-gray-500">
          Товарів не знайдено.
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
