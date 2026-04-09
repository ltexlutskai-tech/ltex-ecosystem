import { prisma } from "@ltex/db";

export async function getVideoReviewProducts(limit = 12) {
  return prisma.product.findMany({
    where: {
      inStock: true,
      videoUrl: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      images: { take: 1, orderBy: { position: "asc" } },
      prices: {
        where: { priceType: { in: ["wholesale", "akciya"] } },
        take: 5,
      },
      _count: { select: { lots: true } },
    },
  });
}

/**
 * Extracts a YouTube video ID from a URL.
 * Supports: youtube.com/watch?v=XXX, youtu.be/XXX, youtube.com/embed/XXX, youtube.com/shorts/XXX
 */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/,
  );
  return match?.[1] ?? null;
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
