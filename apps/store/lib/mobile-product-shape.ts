/**
 * Shared product shape for mobile API endpoints.
 *
 * Extracted so that `/api/mobile/home`, `/api/mobile/recommendations`,
 * and any future rail/listing endpoint return identical product objects
 * to the client (see `WebCatalogProduct` in apps/mobile-client/src/lib/api.ts).
 */

export const mobileProductInclude = {
  images: { take: 1, orderBy: { position: "asc" as const } },
  prices: {
    where: { priceType: { in: ["wholesale", "akciya"] as string[] } },
    take: 5,
  },
  _count: { select: { lots: true } },
};

export interface MobileRawProduct {
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

export function mapMobileProduct(p: MobileRawProduct) {
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
