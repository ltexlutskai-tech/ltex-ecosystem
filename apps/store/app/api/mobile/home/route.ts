import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { tryMobileSession } from "@/lib/mobile-auth";
import {
  mobileProductInclude,
  mapMobileProduct,
  stripMobilePrices,
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

export async function GET(request: NextRequest) {
  // Прайс-гейт (S73): гість без mobile-сесії цін не отримує (як на сайті).
  const isAuthed = tryMobileSession(request) !== null;
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

  // Гостям — той самий шейп, але з prices: [] (server-side strip, як на вебі).
  const gate = (rows: ReturnType<typeof mapMobileProduct>[]) =>
    isAuthed ? rows : stripMobilePrices(rows);

  return NextResponse.json(
    {
      banners,
      featured: gate(
        featuredEntries
          .filter(
            (entry): entry is typeof entry & { product: MobileRawProduct } =>
              entry.product != null,
          )
          .map((entry) => mapMobileProduct(entry.product)),
      ),
      onSale: gate(onSaleProducts.map(mapMobileProduct)),
      newArrivals: gate(newProducts.map(mapMobileProduct)),
      videoReviews: gate(videoProducts.map(mapMobileProduct)),
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
        // Авторизовану відповідь (з цінами) НЕ можна класти у спільний CDN-кеш
        // — інакше гість отримає закешовані ціни. Гостьова (без цін) — кешується.
        "Cache-Control": isAuthed
          ? "private, no-store"
          : "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
