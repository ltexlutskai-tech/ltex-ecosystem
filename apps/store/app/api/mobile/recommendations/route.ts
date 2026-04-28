import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { tryMobileSession } from "@/lib/mobile-auth";
import {
  mobileProductInclude,
  mapMobileProduct,
  type MobileRawProduct,
} from "@/lib/mobile-product-shape";

export const dynamic = "force-dynamic";

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RECENT_VIEW_LIMIT = 20;
const RESULT_LIMIT = 12;

/**
 * GET /api/mobile/recommendations — up to 12 product cards.
 *
 * Algorithm:
 *   1. If logged in and has views in the last 30 days → newest in-stock
 *      products from the same categories the user browsed, excluding products
 *      they already saw.
 *   2. Otherwise fall back to newest in-stock products across the catalogue.
 *
 * Response is edge-cached for 60s (matching `/api/mobile/home`); per-user
 * personalisation is acceptable to leak across that small window because the
 * recommendation set changes only when the user views new products.
 */
export async function GET(request: NextRequest) {
  const session = tryMobileSession(request);
  const customerId = session?.customerId ?? null;

  let products: MobileRawProduct[] | null = null;

  if (customerId) {
    const recentViews = await prisma.viewLog.findMany({
      where: {
        customerId,
        viewedAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) },
      },
      include: { product: { select: { categoryId: true } } },
      orderBy: { viewedAt: "desc" },
      take: RECENT_VIEW_LIMIT,
    });

    const seenProductIds = recentViews.map((v) => v.productId);
    const seenCategoryIds = [
      ...new Set(
        recentViews
          .map((v) => v.product?.categoryId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];

    if (seenCategoryIds.length > 0) {
      products = (await prisma.product.findMany({
        where: {
          inStock: true,
          categoryId: { in: seenCategoryIds },
          id: { notIn: seenProductIds },
        },
        take: RESULT_LIMIT,
        orderBy: { createdAt: "desc" },
        include: mobileProductInclude,
      })) as unknown as MobileRawProduct[];
    }
  }

  if (!products || products.length === 0) {
    products = (await prisma.product.findMany({
      where: { inStock: true },
      take: RESULT_LIMIT,
      orderBy: { createdAt: "desc" },
      include: mobileProductInclude,
    })) as unknown as MobileRawProduct[];
  }

  return NextResponse.json(
    { products: products.map(mapMobileProduct) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
