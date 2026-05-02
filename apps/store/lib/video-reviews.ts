import { prisma } from "@ltex/db";

export {
  extractYouTubeId,
  getYouTubeThumbnail,
  getYouTubeEmbedUrl,
} from "@/lib/youtube";

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
