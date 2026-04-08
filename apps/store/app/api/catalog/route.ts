import { NextRequest, NextResponse } from "next/server";
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

  const { products, total, totalPages } = await getCatalogProducts({
    quality: searchParams.get("quality") ?? undefined,
    season: searchParams.get("season") ?? undefined,
    country: searchParams.get("country") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    priceMin: priceMin && !isNaN(priceMin) ? priceMin : undefined,
    priceMax: priceMax && !isNaN(priceMax) ? priceMax : undefined,
    page,
  });

  return NextResponse.json({ products, total, totalPages, page });
}
