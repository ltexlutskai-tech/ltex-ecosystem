import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCatalogProducts } from "@/lib/catalog";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const priceMin = searchParams.get("priceMin")
    ? parseFloat(searchParams.get("priceMin") as string)
    : undefined;
  const priceMax = searchParams.get("priceMax")
    ? parseFloat(searchParams.get("priceMax") as string)
    : undefined;

  const categorySlug = searchParams.get("categorySlug") ?? undefined;
  const subcategorySlug = searchParams.get("subcategorySlug") ?? undefined;

  // When categorySlug is supplied (and no subcategorySlug overrides it),
  // expand to the parent + all its children so the listing matches the
  // server-rendered /catalog/[categorySlug] page.
  let categoryIds: string[] | undefined;
  if (categorySlug && !subcategorySlug) {
    const category = await prisma.category.findUnique({
      where: { slug: categorySlug },
      include: { children: { select: { id: true } } },
    });
    if (category) {
      categoryIds = [category.id, ...category.children.map((c) => c.id)];
    }
  }

  const { products, total, totalPages } = await getCatalogProducts({
    categoryIds,
    subcategorySlug,
    quality: searchParams.get("quality") ?? undefined,
    season: searchParams.get("season") ?? undefined,
    country: searchParams.get("country") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    priceMin: priceMin && !isNaN(priceMin) ? priceMin : undefined,
    priceMax: priceMax && !isNaN(priceMax) ? priceMax : undefined,
    inStockOnly: searchParams.get("inStock") === "true",
    page,
  });

  return NextResponse.json({ products, total, totalPages, page });
}
