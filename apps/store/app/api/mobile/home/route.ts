import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export const revalidate = 60;

const productInclude = {
  images: { take: 1, orderBy: { position: "asc" as const } },
  prices: {
    where: { priceType: { in: ["wholesale", "akciya"] as string[] } },
    take: 5,
  },
  _count: { select: { lots: true } },
};

interface RawProduct {
  id: string;
  slug: string;
  name: string;
  quality: string;
  season: string | null;
  priceUnit: string;
  country: string | null;
  videoUrl: string | null;
  createdAt: Date;
  images: { url: string; alt: string | null }[];
  prices: { amount: number; currency: string; priceType: string }[];
  _count: { lots: number };
}

function mapProduct(p: RawProduct) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    quality: p.quality,
    season: p.season ?? "",
    priceUnit: p.priceUnit,
    country: p.country ?? "",
    videoUrl: p.videoUrl,
    createdAt: p.createdAt.toISOString(),
    images: p.images.map((img) => ({ url: img.url, alt: img.alt ?? "" })),
    prices: p.prices.map((price) => ({
      amount: Number(price.amount),
      currency: price.currency,
      priceType: price.priceType,
    })),
    _count: { lots: p._count.lots },
  };
}

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
        include: { product: { include: productInclude } },
      }),
      prisma.product.findMany({
        where: {
          inStock: true,
          prices: { some: { priceType: "akciya" } },
        },
        take: 12,
        orderBy: { createdAt: "desc" },
        include: productInclude,
      }),
      prisma.product.findMany({
        where: { inStock: true },
        take: 12,
        orderBy: { createdAt: "desc" },
        include: productInclude,
      }),
    ]);

  return NextResponse.json({
    banners,
    featured: featuredEntries
      .filter(
        (entry): entry is typeof entry & { product: RawProduct } =>
          entry.product != null,
      )
      .map((entry) => mapProduct(entry.product)),
    onSale: onSaleProducts.map(mapProduct),
    newArrivals: newProducts.map(mapProduct),
  });
}
