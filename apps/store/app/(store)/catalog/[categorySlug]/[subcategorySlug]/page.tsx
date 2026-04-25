import type { Metadata } from "next";
import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { getCatalogProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/store/product-card";
import { CatalogSidebar } from "@/components/store/catalog-sidebar";
import { Pagination } from "@/components/store/pagination";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CatalogLayoutToggle } from "@/components/store/catalog-layout-toggle";

export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

interface Props {
  params: Promise<{ categorySlug: string; subcategorySlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug, subcategorySlug } = await params;
  const [parent, sub] = await Promise.all([
    prisma.category.findUnique({ where: { slug: categorySlug } }),
    prisma.category.findUnique({ where: { slug: subcategorySlug } }),
  ]);
  if (!parent || !sub) return {};
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";
  const description = `${sub.name} з категорії ${parent.name} гуртом від 10 кг. Секонд хенд, сток з Англії, Німеччини, Канади. L-TEX.`;
  return {
    title: `${sub.name} (${parent.name}) — секонд хенд та сток гуртом`,
    description,
    alternates: {
      canonical: `${SITE_URL}/catalog/${categorySlug}/${subcategorySlug}`,
    },
    openGraph: {
      title: `${sub.name} — ${parent.name} — L-TEX`,
      description,
      url: `${SITE_URL}/catalog/${categorySlug}/${subcategorySlug}`,
      siteName: "L-TEX",
      locale: "uk_UA",
      type: "website",
    },
  };
}

export default async function SubcategoryPage({ params, searchParams }: Props) {
  const { categorySlug, subcategorySlug } = await params;
  const sp = await searchParams;
  const page = parseInt(sp.page ?? "1", 10);
  const layout: "grid" | "list" = sp.layout === "list" ? "list" : "grid";

  const [parent, subcategory] = await Promise.all([
    prisma.category.findUnique({ where: { slug: categorySlug } }),
    prisma.category.findUnique({ where: { slug: subcategorySlug } }),
  ]);

  if (!parent || !subcategory || subcategory.parentId !== parent.id) notFound();

  const priceMin = sp.priceMin ? parseFloat(sp.priceMin) : undefined;
  const priceMax = sp.priceMax ? parseFloat(sp.priceMax) : undefined;

  const { products, total, totalPages } = await getCatalogProducts({
    categoryId: subcategory.id,
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
  const base = `/catalog/${categorySlug}/${subcategorySlug}`;
  const baseHref = filterParams.toString()
    ? `${base}?${filterParams.toString()}`
    : base;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Головна", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Каталог",
        item: `${SITE_URL}/catalog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: parent.name,
        item: `${SITE_URL}/catalog/${categorySlug}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: subcategory.name,
        item: `${SITE_URL}/catalog/${categorySlug}/${subcategorySlug}`,
      },
    ],
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Breadcrumbs
        items={[
          { label: "Каталог", href: "/catalog" },
          { label: parent.name, href: `/catalog/${categorySlug}` },
          { label: subcategory.name },
        ]}
      />

      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{subcategory.name}</h1>
          <p className="mt-1 text-gray-500">{total} товарів</p>
        </div>
        <CatalogLayoutToggle currentLayout={layout} />
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <CatalogSidebar />

        <div className="min-w-0 flex-1">
          {products.length === 0 ? (
            <p className="mt-12 text-center text-gray-500">
              Товарів не знайдено.
            </p>
          ) : layout === "list" ? (
            <div className="flex flex-col gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} mode="list" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} mode="grid" />
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
      </div>
    </div>
  );
}
