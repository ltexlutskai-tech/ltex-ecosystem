import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { getCatalogProducts } from "@/lib/catalog";
import { loadProductAttributeOptions } from "@/lib/manager/product-attributes";
import { ProductCard } from "@/components/store/product-card";
import { CatalogSidebar } from "@/components/store/catalog-sidebar";
import { Pagination } from "@/components/store/pagination";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CatalogLayoutToggle } from "@/components/store/catalog-layout-toggle";

// Cookie-aware (прайс-гейт S73): сторінка МУСИТЬ рендеритись на кожен запит —
// ISR закешував би одну версію для гостя й залогіненого. Раніше revalidate=60
// «рятував» лише side-effect: getCatalogProducts читає cookies(). Фіксуємо явно.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug } = await params;
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
  });
  if (!category) return {};
  const description = `${category.name} гуртом від 10 кг. Секонд хенд, сток, оригінал з Англії, Німеччини, Канади, Польщі. L-TEX — доставка по Україні.`;
  return {
    title: `${category.name} — секонд хенд та сток гуртом`,
    description,
    alternates: {
      canonical: `${SITE_URL}/catalog/${categorySlug}`,
    },
    openGraph: {
      title: `${category.name} — L-TEX`,
      description,
      url: `${SITE_URL}/catalog/${categorySlug}`,
      siteName: "L-TEX",
      locale: "uk_UA",
      type: "website",
    },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { categorySlug } = await params;
  const sp = await searchParams;
  const getStr = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const page = parseInt(getStr(sp.page) ?? "1", 10);
  const layout: "grid" | "list" =
    getStr(sp.layout) === "list" ? "list" : "grid";

  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
    include: {
      children: { orderBy: { position: "asc" } },
    },
  });

  if (!category) notFound();

  const childIds = category.children.map((c) => c.id);
  const categoryIds = [category.id, ...childIds];

  const parseFloatParam = (raw: string | undefined): number | undefined => {
    if (!raw) return undefined;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const priceMinStr = getStr(sp.priceMin);
  const priceMaxStr = getStr(sp.priceMax);
  const unitsMinStr = getStr(sp.unitsPerKgMin);
  const unitsMaxStr = getStr(sp.unitsPerKgMax);
  const weightMinStr = getStr(sp.unitWeightMin);
  const weightMaxStr = getStr(sp.unitWeightMax);
  const priceMin = parseFloatParam(priceMinStr);
  const priceMax = parseFloatParam(priceMaxStr);
  const unitsPerKgMin = parseFloatParam(unitsMinStr);
  const unitsPerKgMax = parseFloatParam(unitsMaxStr);
  const unitWeightMin = parseFloatParam(weightMinStr);
  const unitWeightMax = parseFloatParam(weightMaxStr);

  // Validate the subcategory slug against actual children to avoid silent
  // empty results when an unknown slug is pinned in the URL.
  const subParam = getStr(sp.sub);
  const subcategorySlug =
    subParam && category.children.some((c) => c.slug === subParam)
      ? subParam
      : undefined;
  const inStockOnly = getStr(sp.inStock) === "true";

  const { products, total, totalPages } = await getCatalogProducts({
    categoryIds,
    subcategorySlug,
    quality: getStr(sp.quality),
    season: getStr(sp.season),
    country: getStr(sp.country),
    gender: getStr(sp.gender),
    unitsPerKgMin,
    unitsPerKgMax,
    unitWeightMin,
    unitWeightMax,
    q: getStr(sp.q),
    sort: getStr(sp.sort),
    priceMin,
    priceMax,
    inStockOnly,
    page,
  });

  const attributeOptions = await loadProductAttributeOptions();

  const filterParams = new URLSearchParams();
  const qParam = getStr(sp.quality);
  if (qParam) filterParams.set("quality", qParam);
  const seasonParam = getStr(sp.season);
  if (seasonParam) filterParams.set("season", seasonParam);
  const countryParam = getStr(sp.country);
  if (countryParam) filterParams.set("country", countryParam);
  const genderParam = getStr(sp.gender);
  if (genderParam) filterParams.set("gender", genderParam);
  if (unitsMinStr) filterParams.set("unitsPerKgMin", unitsMinStr);
  if (unitsMaxStr) filterParams.set("unitsPerKgMax", unitsMaxStr);
  if (weightMinStr) filterParams.set("unitWeightMin", weightMinStr);
  if (weightMaxStr) filterParams.set("unitWeightMax", weightMaxStr);
  const qSearch = getStr(sp.q);
  if (qSearch) filterParams.set("q", qSearch);
  const sortParam = getStr(sp.sort);
  if (sortParam) filterParams.set("sort", sortParam);
  if (priceMinStr) filterParams.set("priceMin", priceMinStr);
  if (priceMaxStr) filterParams.set("priceMax", priceMaxStr);
  if (subcategorySlug) filterParams.set("sub", subcategorySlug);
  if (inStockOnly) filterParams.set("inStock", "true");
  const baseHref = filterParams.toString()
    ? `/catalog/${categorySlug}?${filterParams.toString()}`
    : `/catalog/${categorySlug}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Головна",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Каталог",
        item: `${SITE_URL}/catalog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: category.name,
        item: `${SITE_URL}/catalog/${categorySlug}`,
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
          { label: category.name },
        ]}
      />

      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{category.name}</h1>
          <p className="mt-1 text-gray-500">{total} товарів</p>
        </div>
        <CatalogLayoutToggle currentLayout={layout} />
      </div>

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

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <CatalogSidebar
          subcategories={category.children.map((c) => ({
            slug: c.slug,
            name: c.name,
          }))}
          attributeOptions={attributeOptions}
        />

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
