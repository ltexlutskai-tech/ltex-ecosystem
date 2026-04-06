import type { Metadata } from "next";
import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/store/product-card";
import { CatalogFilters } from "@/components/store/catalog-filters";
import { Pagination } from "@/components/store/pagination";
import { Breadcrumbs } from "@/components/store/breadcrumbs";

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
  return {
    title: `${sub.name} (${parent.name}) — секонд хенд та сток гуртом`,
    description: `${sub.name} з категорії ${parent.name} гуртом від 10 кг. Секонд хенд, сток з Англії, Німеччини, Канади. L-TEX.`,
  };
}

export default async function SubcategoryPage({ params, searchParams }: Props) {
  const { categorySlug, subcategorySlug } = await params;
  const sp = await searchParams;
  const page = parseInt(sp.page ?? "1", 10);

  const [parent, subcategory] = await Promise.all([
    prisma.category.findUnique({ where: { slug: categorySlug } }),
    prisma.category.findUnique({ where: { slug: subcategorySlug } }),
  ]);

  if (!parent || !subcategory || subcategory.parentId !== parent.id) notFound();

  const where: Record<string, unknown> = {
    categoryId: subcategory.id,
    inStock: true,
  };
  if (sp.quality) where.quality = sp.quality;
  if (sp.season) where.season = sp.season;
  if (sp.country) where.country = sp.country;
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { articleCode: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const perPage = 24;
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        images: { take: 1, orderBy: { position: "asc" } },
        prices: { where: { priceType: "wholesale" }, take: 1 },
        _count: { select: { lots: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.product.count({ where }),
  ]);
  const totalPages = Math.ceil(total / perPage);

  const filterParams = new URLSearchParams();
  if (sp.quality) filterParams.set("quality", sp.quality);
  if (sp.season) filterParams.set("season", sp.season);
  if (sp.country) filterParams.set("country", sp.country);
  if (sp.q) filterParams.set("q", sp.q);
  const base = `/catalog/${categorySlug}/${subcategorySlug}`;
  const baseHref = filterParams.toString()
    ? `${base}?${filterParams.toString()}`
    : base;

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs
        items={[
          { label: "Каталог", href: "/catalog" },
          { label: parent.name, href: `/catalog/${categorySlug}` },
          { label: subcategory.name },
        ]}
      />

      <h1 className="mt-4 text-3xl font-bold">{subcategory.name}</h1>
      <p className="mt-1 text-gray-500">{total} товарів</p>

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
