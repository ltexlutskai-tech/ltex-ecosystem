import { prisma } from "@ltex/db";
import type { Prisma } from "@ltex/db";

interface CatalogParams {
  categoryId?: string;
  categoryIds?: string[];
  quality?: string;
  season?: string;
  country?: string;
  q?: string;
  sort?: string;
  priceMin?: number;
  priceMax?: number;
  page?: number;
  perPage?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CatalogResult = { products: any[]; total: number; totalPages: number };

export async function getCatalogProducts(params: CatalogParams): Promise<CatalogResult> {
  const {
    categoryId,
    categoryIds,
    quality,
    season,
    country,
    q,
    sort,
    priceMin,
    priceMax,
    page = 1,
    perPage = 24,
  } = params;

  // If search query is provided, use full-text search for ranking
  if (q && q.trim().length >= 2) {
    return fullTextSearch({ ...params, q: q.trim(), page, perPage });
  }

  const where: Prisma.ProductWhereInput = { inStock: true };

  if (categoryIds && categoryIds.length > 0) {
    where.categoryId = { in: categoryIds };
  } else if (categoryId) {
    where.categoryId = categoryId;
  }
  if (quality) where.quality = quality;
  if (season) where.season = season;
  if (country) where.country = country;

  // Price range filter
  if (priceMin !== undefined || priceMax !== undefined) {
    where.prices = {
      some: {
        priceType: "wholesale",
        ...(priceMin !== undefined && { amount: { gte: priceMin } }),
        ...(priceMax !== undefined && { amount: { lte: priceMax } }),
      },
    };
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

/**
 * Full-text search using PostgreSQL to_tsvector/to_tsquery.
 * Searches across name, description, and article code.
 * Falls back to ILIKE if tsquery parsing fails.
 */
async function fullTextSearch(params: CatalogParams & { q: string }): Promise<CatalogResult> {
  const {
    categoryId,
    categoryIds,
    quality,
    season,
    country,
    q,
    priceMin,
    priceMax,
    page = 1,
    perPage = 24,
  } = params;

  // Build the tsquery: split words and join with &
  const words = q
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => `${w}:*`)
    .join(" & ");

  if (!words) {
    return getCatalogProducts({ ...params, q: undefined });
  }

  // Build WHERE conditions
  const conditions: string[] = [
    `p.in_stock = true`,
    `(
      to_tsvector('simple', p.name || ' ' || COALESCE(p.description, '') || ' ' || COALESCE(p.article_code, ''))
      @@ to_tsquery('simple', $1)
      OR p.name ILIKE $2
      OR COALESCE(p.article_code, '') ILIKE $2
    )`,
  ];
  const queryParams: (string | number)[] = [words, `%${q}%`];
  let paramIdx = 3;

  if (categoryIds && categoryIds.length > 0) {
    const placeholders = categoryIds.map((_, i) => `$${paramIdx + i}`).join(", ");
    conditions.push(`p.category_id IN (${placeholders})`);
    queryParams.push(...categoryIds);
    paramIdx += categoryIds.length;
  } else if (categoryId) {
    conditions.push(`p.category_id = $${paramIdx}`);
    queryParams.push(categoryId);
    paramIdx++;
  }
  if (quality) {
    conditions.push(`p.quality = $${paramIdx}`);
    queryParams.push(quality);
    paramIdx++;
  }
  if (season) {
    conditions.push(`p.season = $${paramIdx}`);
    queryParams.push(season);
    paramIdx++;
  }
  if (country) {
    conditions.push(`p.country = $${paramIdx}`);
    queryParams.push(country);
    paramIdx++;
  }
  if (priceMin !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id AND pr.price_type = 'wholesale' AND pr.amount >= $${paramIdx})`,
    );
    queryParams.push(priceMin);
    paramIdx++;
  }
  if (priceMax !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id AND pr.price_type = 'wholesale' AND pr.amount <= $${paramIdx})`,
    );
    queryParams.push(priceMax);
    paramIdx++;
  }

  const whereClause = conditions.join(" AND ");

  // Count query
  const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) as count FROM products p WHERE ${whereClause}`,
    ...queryParams,
  );
  const total = Number(countResult[0]?.count ?? 0);

  // Search query with relevance ranking
  const offset = (page - 1) * perPage;
  const productIds = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT p.id,
       ts_rank(
         to_tsvector('simple', p.name || ' ' || COALESCE(p.description, '') || ' ' || COALESCE(p.article_code, '')),
         to_tsquery('simple', $1)
       ) as rank
     FROM products p
     WHERE ${whereClause}
     ORDER BY rank DESC, p.updated_at DESC
     LIMIT ${perPage} OFFSET ${offset}`,
    ...queryParams,
  );

  const ids = productIds.map((r) => r.id);

  // Fetch full products with relations in the order of relevance
  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        include: {
          images: { take: 1, orderBy: { position: "asc" } },
          prices: { where: { priceType: "wholesale" }, take: 1 },
          _count: { select: { lots: true } },
        },
      })
    : [];

  // Preserve relevance order
  const idOrder = new Map(ids.map((id, i) => [id, i]));
  products.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  return { products, total, totalPages: Math.ceil(total / perPage) };
}
