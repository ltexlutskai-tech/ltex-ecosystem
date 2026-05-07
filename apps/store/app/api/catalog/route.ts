import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCatalogProducts } from "@/lib/catalog";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const parseFloatParam = (key: string): number | undefined => {
    const raw = searchParams.get(key);
    if (raw == null || raw === "") return undefined;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const priceMin = parseFloatParam("priceMin");
  const priceMax = parseFloatParam("priceMax");
  const unitsPerKgMin = parseFloatParam("unitsPerKgMin");
  const unitsPerKgMax = parseFloatParam("unitsPerKgMax");
  const unitWeightMin = parseFloatParam("unitWeightMin");
  const unitWeightMax = parseFloatParam("unitWeightMax");

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
    gender: searchParams.get("gender") ?? undefined,
    sizes: searchParams.get("sizes") ?? undefined,
    unitsPerKgMin,
    unitsPerKgMax,
    unitWeightMin,
    unitWeightMax,
    q: searchParams.get("q") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    priceMin,
    priceMax,
    inStockOnly: searchParams.get("inStock") === "true",
    page,
  });

  return NextResponse.json({ products, total, totalPages, page });
}
