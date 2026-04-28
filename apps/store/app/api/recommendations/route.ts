import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import {
  mobileProductInclude,
  mapMobileProduct,
  type MobileRawProduct,
} from "@/lib/mobile-product-shape";

export const dynamic = "force-dynamic";

const RESULT_LIMIT = 12;
const SEEN_LIMIT = 20;

/**
 * GET /api/recommendations?seen=id1,id2,id3
 *
 * Web-side recommendations. Anonymous (no customer auth yet on web) — the
 * client passes recently-viewed product IDs from localStorage. Server returns
 * up to 12 newest in-stock products from the same categories (excluding the
 * seen list). Falls back to newest in-stock when seen is empty or yields no
 * categories.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const seenRaw = searchParams.get("seen") ?? "";
  const seenIds = seenRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, SEEN_LIMIT);

  let products: MobileRawProduct[] | null = null;

  if (seenIds.length > 0) {
    const seenProducts = await prisma.product.findMany({
      where: { id: { in: seenIds } },
      select: { categoryId: true },
    });
    const seenCategoryIds = [
      ...new Set(
        seenProducts
          .map((p) => p.categoryId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];

    if (seenCategoryIds.length > 0) {
      products = (await prisma.product.findMany({
        where: {
          inStock: true,
          categoryId: { in: seenCategoryIds },
          id: { notIn: seenIds },
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
