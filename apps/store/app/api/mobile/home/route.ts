import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import {
  mobileProductInclude,
  mapMobileProduct,
  type MobileRawProduct,
} from "@/lib/mobile-product-shape";

// Force dynamic rendering: this route hits the database, so it must not
// prerender at build time (CI does not have DATABASE_URL). The 60s edge
// cache is delivered via the Cache-Control header instead of Next.js ISR.
export const dynamic = "force-dynamic";

export async function GET() {
  const [banners, featuredEntries, onSaleProducts, newProducts] =
    await Promise.all([
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
        orderBy: { position: "asc" },
        take: 12,
        include: { product: { include: mobileProductInclude } },
      }),
      prisma.product.findMany({
        where: {
          inStock: true,
          prices: { some: { priceType: "akciya" } },
        },
        take: 12,
        orderBy: { createdAt: "desc" },
        include: mobileProductInclude,
      }),
      prisma.product.findMany({
        where: { inStock: true },
        take: 12,
        orderBy: { createdAt: "desc" },
        include: mobileProductInclude,
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
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
