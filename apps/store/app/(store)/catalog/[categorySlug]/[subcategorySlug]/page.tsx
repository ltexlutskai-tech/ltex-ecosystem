import type { Metadata } from "next";
import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { CATEGORIES, OVERSIZE_SLUG } from "@ltex/shared";
import { getCatalogProducts } from "@/lib/catalog";
import { loadProductAttributeOptions } from "@/lib/manager/product-attributes";
import { ProductCard } from "@/components/store/product-card";
import { CatalogSidebar } from "@/components/store/catalog-sidebar";
import { Pagination } from "@/components/store/pagination";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CatalogLayoutToggle } from "@/components/store/catalog-layout-toggle";

export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

interface Props {
  params: Promise<{ categorySlug: string; subcategorySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug, subcategorySlug } = await params;
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

  if (subcategorySlug === OVERSIZE_SLUG) {
    const parent = CATEGORIES.find((c) => c.slug === categorySlug);
    const sub = parent?.subcategories.find((s) => s.slug === OVERSIZE_SLUG);
    if (!parent || !sub) return {};
    const description = `${sub.name} — товари великих розмірів з категорії ${parent.name} гуртом від 10 кг. L-TEX.`;
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

  const [parent, sub] = await Promise.all([
    prisma.category.findUnique({ where: { slug: categorySlug } }),
    prisma.category.findUnique({ where: { slug: subcategorySlug } }),
  ]);
  if (!parent || !sub) return {};
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
  const getStr = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const page = parseInt(getStr(sp.page) ?? "1", 10);
  const layout: "grid" | "list" =
    getStr(sp.layout) === "list" ? "list" : "grid";

  const isOversize = subcategorySlug === OVERSIZE_SLUG;

  // Cross-cutting pseudo-subcategory — resolved via constants, not DB,
  // because no Category row exists for it.
  const resolved: {
    parent: { id?: string; slug: string; name: string };
    subcategory: { id?: string; slug: string; name: string };
  } = await (async () => {
    if (isOversize) {
      const parentDef = CATEGORIES.find((c) => c.slug === categorySlug);
      const subDef = parentDef?.subcategories.find(
        (s) => s.slug === OVERSIZE_SLUG,
      );
      if (!parentDef || !subDef) notFound();
      return {
        parent: { slug: parentDef.slug, name: parentDef.name },
        subcategory: { slug: subDef.slug, name: subDef.name },
      };
    }
    const [parentRow, subRow] = await Promise.all([
      prisma.category.findUnique({ where: { slug: categorySlug } }),
      prisma.category.findUnique({ where: { slug: subcategorySlug } }),
    ]);
    if (!parentRow || !subRow || subRow.parentId !== parentRow.id) notFound();
    return { parent: parentRow, subcategory: subRow };
  })();
  const parent = resolved.parent;
  const subcategory = resolved.subcategory;

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

  const { products, total, totalPages } = await getCatalogProducts({
    ...(isOversize
      ? { subcategorySlug: OVERSIZE_SLUG }
      : { categoryId: subcategory.id }),
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
        <CatalogSidebar attributeOptions={attributeOptions} />

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
