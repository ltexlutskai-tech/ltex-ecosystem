import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import {
  mobileProductInclude,
  mapMobileProduct,
  type MobileRawProduct,
} from "@/lib/mobile-product-shape";
import {
  getHiddenCategoryIds,
  hiddenCategoryProductFilter,
} from "@/lib/catalog-visibility";

// Force dynamic rendering: this route hits the database, so it must not
// prerender at build time (CI does not have DATABASE_URL). The 60s edge
// cache is delivered via the Cache-Control header instead of Next.js ISR.
export const dynamic = "force-dynamic";

export async function GET() {
  // Приховані категорії (7.2): не показуємо їхні товари в жодній рейці.
  const hiddenSet = new Set(await getHiddenCategoryIds());
  const visibleFilter = await hiddenCategoryProductFilter();

  const [
    banners,
    featuredEntries,
    onSaleProducts,
    newProducts,
    videoProducts,
    categories,
  ] = await Promise.all([
    prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        ctaLabel: true,
        ctaHref: true,
      },
    }),
    prisma.featuredProduct.findMany({
      where: { product: visibleFilter },
      orderBy: { position: "asc" },
      take: 12,
      include: { product: { include: mobileProductInclude } },
    }),
    prisma.product.findMany({
      where: {
        inStock: true,
        ...visibleFilter,
        prices: { some: { priceType: "akciya" } },
      },
      take: 12,
      orderBy: { createdAt: "desc" },
      include: mobileProductInclude,
    }),
    prisma.product.findMany({
      where: { inStock: true, ...visibleFilter },
      take: 12,
      orderBy: { createdAt: "desc" },
      include: mobileProductInclude,
    }),
    prisma.product.findMany({
      where: { inStock: true, ...visibleFilter, videoUrl: { not: null } },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: mobileProductInclude,
    }),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: { position: "asc" },
      include: {
        _count: { select: { products: { where: { inStock: true } } } },
      },
    }),
  ]);

  return NextResponse.json(
    {
      banners,
      featured: featuredEntries
        .filter(
          (entry): entry is typeof entry & { product: MobileRawProduct } =>
            entry.product != null,
        )
        .map((entry) => mapMobileProduct(entry.product)),
      onSale: onSaleProducts.map(mapMobileProduct),
      newArrivals: newProducts.map(mapMobileProduct),
      videoReviews: videoProducts.map(mapMobileProduct),
      categories: categories
        .filter((c) => !hiddenSet.has(c.id))
        .map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          productCount: c._count.products,
        })),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
