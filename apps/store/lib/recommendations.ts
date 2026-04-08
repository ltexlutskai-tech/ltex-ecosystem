import { prisma } from "@ltex/db";

function productSelect() {
  return {
    id: true,
    slug: true,
    name: true,
    quality: true,
    season: true,
    priceUnit: true,
    country: true,
    videoUrl: true,
    images: {
      select: { url: true, alt: true },
      orderBy: { position: "asc" as const },
      take: 1,
    },
    prices: {
      select: { amount: true, currency: true, priceType: true },
    },
    _count: {
      select: {
        lots: { where: { status: { in: ["free", "on_sale"] as string[] } } },
      },
    },
  };
}

/**
 * Get similar products: same category + quality first, then same category different quality.
 * Ordered by free lot count DESC so products with available lots appear first.
 */
export async function getRecommendations(productId: string, limit = 6) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { categoryId: true, quality: true },
  });

  if (!product) return [];

  // First: same category + same quality
  const sameQuality = await prisma.product.findMany({
    where: {
      id: { not: productId },
      categoryId: product.categoryId,
      quality: product.quality,
      inStock: true,
    },
    select: productSelect(),
    orderBy: { lots: { _count: "desc" } },
    take: limit,
  });

  if (sameQuality.length >= limit) return sameQuality;

  // Fill remaining with same category, different quality
  const existingIds = [
    productId,
    ...sameQuality.map((p: { id: string }) => p.id),
  ];
  const remaining = limit - sameQuality.length;

  const differentQuality = await prisma.product.findMany({
    where: {
      id: { notIn: existingIds },
      categoryId: product.categoryId,
      inStock: true,
    },
    select: productSelect(),
    orderBy: { lots: { _count: "desc" } },
    take: remaining,
  });

  return [...sameQuality, ...differentQuality];
}

/**
 * Products frequently bought together — found in the same orders as this product.
 * Groups order_items by productId where the orderId includes this product.
 */
export async function getFrequentlyBoughtTogether(
  productId: string,
  limit = 4,
) {
  // Find orders that contain this product
  const orderIds = await prisma.orderItem.findMany({
    where: { productId },
    select: { orderId: true },
    distinct: ["orderId"],
  });

  if (orderIds.length === 0) return [];

  // Find other products in those orders, grouped by frequency
  const coProducts = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      orderId: { in: orderIds.map((o: { orderId: string }) => o.orderId) },
      productId: { not: productId },
    },
    _count: { productId: true },
    orderBy: { _count: { productId: "desc" } },
    take: limit,
  });

  if (coProducts.length === 0) return [];

  const products = await prisma.product.findMany({
    where: {
      id: { in: coProducts.map((c: { productId: string }) => c.productId) },
      inStock: true,
    },
    select: productSelect(),
  });

  // Sort by the frequency order from groupBy
  const orderMap = new Map<string, number>(
    coProducts.map((c: { productId: string }, i: number) => [c.productId, i]),
  );
  return products.sort(
    (a: { id: string }, b: { id: string }) =>
      (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99),
  );
}
