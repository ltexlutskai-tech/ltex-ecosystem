import { prisma } from "@ltex/db";

export async function getFeaturedProducts(limit = 12) {
  const entries = await prisma.featuredProduct.findMany({
    orderBy: { position: "asc" },
    take: limit,
    include: {
      product: {
        include: {
          images: { take: 1, orderBy: { position: "asc" } },
          prices: {
            where: { priceType: { in: ["wholesale", "akciya"] } },
            take: 5,
          },
          _count: { select: { lots: true } },
        },
      },
    },
  });

  // Filter out any entries whose product was deleted (shouldn't happen with
  // onDelete: Cascade, but safety)
  return entries.filter((e) => e.product).map((e) => e.product);
}
