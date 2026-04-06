import { prisma } from "@ltex/db";
import type { Prisma } from "@ltex/db";

interface CatalogParams {
  categoryId?: string;
  quality?: string;
  season?: string;
  country?: string;
  q?: string;
  sort?: string;
  page?: number;
  perPage?: number;
}

export async function getCatalogProducts(params: CatalogParams) {
  const {
    categoryId,
    quality,
    season,
    country,
    q,
    sort,
    page = 1,
    perPage = 24,
  } = params;

  const where: Prisma.ProductWhereInput = { inStock: true };

  if (categoryId) where.categoryId = categoryId;
  if (quality) where.quality = quality;
  if (season) where.season = season;
  if (country) where.country = country;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { articleCode: { contains: q, mode: "insensitive" } },
    ];
  }

  let orderBy: Prisma.ProductOrderByWithRelationInput = { updatedAt: "desc" };
  if (sort === "name_asc") orderBy = { name: "asc" };
  else if (sort === "newest") orderBy = { createdAt: "desc" };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        images: { take: 1, orderBy: { position: "asc" } },
        prices: { where: { priceType: "wholesale" }, take: 1 },
        _count: { select: { lots: true } },
      },
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.product.count({ where }),
  ]);

  // Sort by price if needed (requires post-fetch sort since price is in related table)
  if (sort === "price_asc" || sort === "price_desc") {
    products.sort((a, b) => {
      const pa = a.prices[0]?.amount ?? 0;
      const pb = b.prices[0]?.amount ?? 0;
      return sort === "price_asc" ? pa - pb : pb - pa;
    });
  }

  return { products, total, totalPages: Math.ceil(total / perPage) };
}
