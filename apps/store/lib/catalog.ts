import {
  prisma,
  type Prisma,
  type Product,
  type ProductImage,
  type Price,
} from "@ltex/db";
import { OVERSIZE_SLUG } from "@ltex/shared";
import { getCurrentCustomer } from "./customer-auth";
import { getHiddenCategoryIds } from "./catalog-visibility";

/**
 * Strip wholesale prices for unauthenticated visitors. Server-side
 * scrubbing makes the price gate (S73) effective even when an attacker
 * targets the API directly — the rendered guest tree never holds a price.
 *
 * Returns a fresh array with cloned items so the result is never aliased
 * with cached state held elsewhere.
 */
async function maybeStripPrices(
  products: ProductWithRelations[],
): Promise<ProductWithRelations[]> {
  const customer = await getCurrentCustomer();
  if (customer) return products;
  return products.map((p) => ({ ...p, prices: [] }));
}

interface CatalogParams {
  categoryId?: string;
  categoryIds?: string[];
  subcategorySlug?: string;
  quality?: string | string[];
  season?: string;
  country?: string | string[];
  gender?: string | string[];
  unitsPerKgMin?: number;
  unitsPerKgMax?: number;
  unitWeightMin?: number;
  unitWeightMax?: number;
  q?: string;
  sort?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: boolean;
  page?: number;
  perPage?: number;
}

// Accepts a single value, an array, or a comma-separated string. Returns
// undefined when nothing meaningful was provided so the caller can skip the
// filter entirely.
function parseMultiValue(
  raw: string | string[] | undefined,
): string | string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    const cleaned = raw.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length === 0) return undefined;
    return cleaned.length === 1 ? cleaned[0] : cleaned;
  }
  if (raw.includes(",")) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.length === 1 ? parts[0] : parts;
  }
  return raw.trim() ? raw : undefined;
}

type ProductWithRelations = Product & {
  images: ProductImage[];
  prices: Price[];
  _count: { lots: number };
};

type CatalogResult = {
  products: ProductWithRelations[];
  total: number;
  totalPages: number;
};

export async function getCatalogProducts(
  params: CatalogParams,
): Promise<CatalogResult> {
  const {
    categoryId,
    categoryIds,
    subcategorySlug,
    quality,
    season,
    country,
    gender,
    unitsPerKgMin,
    unitsPerKgMax,
    unitWeightMin,
    unitWeightMax,
    q,
    sort,
    priceMin,
    priceMax,
    inStockOnly,
    page = 1,
    perPage = 24,
  } = params;

  // If search query is provided, use full-text search for ranking
  if (q && q.trim().length >= 2) {
    const result = await fullTextSearch({
      ...params,
      q: q.trim(),
      page,
      perPage,
    });
    return {
      ...result,
      products: await maybeStripPrices(result.products),
    };
  }

  const where: Prisma.ProductWhereInput = { inStock: true };

  // The OVERSIZE_SLUG is a cross-cutting tag — match all products with
  // isOversize=true across every category, ignoring any category filter.
  if (subcategorySlug === OVERSIZE_SLUG) {
    where.isOversize = true;
  } else if (subcategorySlug) {
    // subcategorySlug narrows to an exact sub-category; it takes precedence
    // over categoryIds so that "вибрана підкатегорія" wins over the parent tree.
    where.category = { slug: subcategorySlug };
  } else if (categoryIds && categoryIds.length > 0) {
    where.categoryId = { in: categoryIds };
  } else if (categoryId) {
    where.categoryId = categoryId;
  }
  const qualityValue = parseMultiValue(quality);
  if (qualityValue) {
    where.quality = Array.isArray(qualityValue)
      ? { in: qualityValue }
      : qualityValue;
  }
  if (season) where.season = season;
  const countryValue = parseMultiValue(country);
  if (countryValue) {
    where.country = Array.isArray(countryValue)
      ? { in: countryValue }
      : countryValue;
  }

  const genderValue = parseMultiValue(gender);
  if (genderValue) {
    where.gender = Array.isArray(genderValue)
      ? { in: genderValue }
      : genderValue;
  }

  // Range overlap filters: product is included when its [Min, Max] interval
  // intersects [filterMin, filterMax]. This is equivalent to:
  //   productMax ≥ filterMin AND productMin ≤ filterMax.
  //
  // NULL handling: most products were imported without a parsed numeric
  // range, so unitsPerKgMin/Max and unitWeightMin/Max are NULL. Postgres
  // treats `NULL gte X` as unknown → row excluded, which silently hid ~70%
  // of products as soon as a slider moved off default. We OR-in `null`
  // matches so products without numeric data stay visible. Trade-off: those
  // products always show, even when the slider is narrowed — preferable to
  // hiding the bulk of the catalog.
  const rangeAnd: Prisma.ProductWhereInput[] = [];
  if (unitsPerKgMin != null) {
    rangeAnd.push({
      OR: [{ unitsPerKgMax: { gte: unitsPerKgMin } }, { unitsPerKgMax: null }],
    });
  }
  if (unitsPerKgMax != null) {
    rangeAnd.push({
      OR: [{ unitsPerKgMin: { lte: unitsPerKgMax } }, { unitsPerKgMin: null }],
    });
  }
  if (unitWeightMin != null) {
    rangeAnd.push({
      OR: [{ unitWeightMax: { gte: unitWeightMin } }, { unitWeightMax: null }],
    });
  }
  if (unitWeightMax != null) {
    rangeAnd.push({
      OR: [{ unitWeightMin: { lte: unitWeightMax } }, { unitWeightMin: null }],
    });
  }
  if (rangeAnd.length > 0) {
    where.AND = [
      ...((where.AND as Prisma.ProductWhereInput[]) ?? []),
      ...rangeAnd,
    ];
  }

  // Приховані категорії (7.2): товари з цих категорій не показуємо на сайті.
  const hiddenCategoryIds = await getHiddenCategoryIds();
  if (hiddenCategoryIds.length > 0) {
    where.AND = [
      ...((where.AND as Prisma.ProductWhereInput[]) ?? []),
      { categoryId: { notIn: hiddenCategoryIds } },
    ];
  }

  if (inStockOnly) {
    where.lots = { some: { status: { in: ["free", "on_sale"] } } };
  }

  // Price range filter
  if (priceMin !== undefined || priceMax !== undefined) {
    const amountFilter: { gte?: number; lte?: number } = {};
    if (priceMin !== undefined) amountFilter.gte = priceMin;
    if (priceMax !== undefined) amountFilter.lte = priceMax;
    where.prices = {
      some: {
        priceType: "wholesale",
        amount: amountFilter,
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

  const sanitized = await maybeStripPrices(products);
  return { products: sanitized, total, totalPages: Math.ceil(total / perPage) };
}

/**
 * Full-text search using PostgreSQL to_tsvector/to_tsquery.
 * Searches across name, description, and article code.
 * Falls back to trigram similarity if tsvector gives 0 results,
 * then to ILIKE as last resort.
 */
async function fullTextSearch(
  params: CatalogParams & { q: string },
): Promise<CatalogResult> {
  const {
    categoryId,
    categoryIds,
    subcategorySlug,
    quality,
    season,
    country,
    gender,
    unitsPerKgMin,
    unitsPerKgMax,
    unitWeightMin,
    unitWeightMax,
    q,
    priceMin,
    priceMax,
    inStockOnly,
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

  // Build WHERE conditions for filters (excluding search)
  const filterConditions: string[] = [`p.in_stock = true`];
  const queryParams: (string | number)[] = [words, `%${q}%`];
  let paramIdx = 3;

  if (subcategorySlug === OVERSIZE_SLUG) {
    filterConditions.push(`p.is_oversize = true`);
  } else if (subcategorySlug) {
    filterConditions.push(
      `EXISTS (SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.slug = $${paramIdx})`,
    );
    queryParams.push(subcategorySlug);
    paramIdx++;
  } else if (categoryIds && categoryIds.length > 0) {
    const placeholders = categoryIds
      .map((_, i) => `$${paramIdx + i}`)
      .join(", ");
    filterConditions.push(`p.category_id IN (${placeholders})`);
    queryParams.push(...categoryIds);
    paramIdx += categoryIds.length;
  } else if (categoryId) {
    filterConditions.push(`p.category_id = $${paramIdx}`);
    queryParams.push(categoryId);
    paramIdx++;
  }

  // Приховані категорії (7.2) — виключаємо з пошуку теж.
  const hiddenCategoryIds = await getHiddenCategoryIds();
  if (hiddenCategoryIds.length > 0) {
    const placeholders = hiddenCategoryIds
      .map((_, i) => `$${paramIdx + i}`)
      .join(", ");
    filterConditions.push(`p.category_id NOT IN (${placeholders})`);
    queryParams.push(...hiddenCategoryIds);
    paramIdx += hiddenCategoryIds.length;
  }

  const qualityValue = parseMultiValue(quality);
  if (qualityValue) {
    if (Array.isArray(qualityValue)) {
      const placeholders = qualityValue
        .map((_, i) => `$${paramIdx + i}`)
        .join(", ");
      filterConditions.push(`p.quality IN (${placeholders})`);
      queryParams.push(...qualityValue);
      paramIdx += qualityValue.length;
    } else {
      filterConditions.push(`p.quality = $${paramIdx}`);
      queryParams.push(qualityValue);
      paramIdx++;
    }
  }
  if (season) {
    filterConditions.push(`p.season = $${paramIdx}`);
    queryParams.push(season);
    paramIdx++;
  }
  const countryValue = parseMultiValue(country);
  if (countryValue) {
    if (Array.isArray(countryValue)) {
      const placeholders = countryValue
        .map((_, i) => `$${paramIdx + i}`)
        .join(", ");
      filterConditions.push(`p.country IN (${placeholders})`);
      queryParams.push(...countryValue);
      paramIdx += countryValue.length;
    } else {
      filterConditions.push(`p.country = $${paramIdx}`);
      queryParams.push(countryValue);
      paramIdx++;
    }
  }
  if (priceMin !== undefined) {
    filterConditions.push(
      `EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id AND pr.price_type = 'wholesale' AND pr.amount >= $${paramIdx})`,
    );
    queryParams.push(priceMin);
    paramIdx++;
  }
  if (priceMax !== undefined) {
    filterConditions.push(
      `EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id AND pr.price_type = 'wholesale' AND pr.amount <= $${paramIdx})`,
    );
    queryParams.push(priceMax);
    paramIdx++;
  }
  const genderValue = parseMultiValue(gender);
  if (genderValue) {
    if (Array.isArray(genderValue)) {
      const placeholders = genderValue
        .map((_, i) => `$${paramIdx + i}`)
        .join(", ");
      filterConditions.push(`p.gender IN (${placeholders})`);
      queryParams.push(...genderValue);
      paramIdx += genderValue.length;
    } else {
      filterConditions.push(`p.gender = $${paramIdx}`);
      queryParams.push(genderValue);
      paramIdx++;
    }
  }
  // Range NULL handling: include rows whose numeric column is NULL so we
  // don't silently hide products without parsed range data. See the matching
  // explainer above getCatalogProducts' rangeAnd block.
  if (unitsPerKgMin != null) {
    filterConditions.push(
      `(p.units_per_kg_max >= $${paramIdx} OR p.units_per_kg_max IS NULL)`,
    );
    queryParams.push(unitsPerKgMin);
    paramIdx++;
  }
  if (unitsPerKgMax != null) {
    filterConditions.push(
      `(p.units_per_kg_min <= $${paramIdx} OR p.units_per_kg_min IS NULL)`,
    );
    queryParams.push(unitsPerKgMax);
    paramIdx++;
  }
  if (unitWeightMin != null) {
    filterConditions.push(
      `(p.unit_weight_max >= $${paramIdx} OR p.unit_weight_max IS NULL)`,
    );
    queryParams.push(unitWeightMin);
    paramIdx++;
  }
  if (unitWeightMax != null) {
    filterConditions.push(
      `(p.unit_weight_min <= $${paramIdx} OR p.unit_weight_min IS NULL)`,
    );
    queryParams.push(unitWeightMax);
    paramIdx++;
  }
  if (inStockOnly) {
    filterConditions.push(
      `EXISTS (SELECT 1 FROM lots l WHERE l.product_id = p.id AND l.status IN ('free', 'on_sale'))`,
    );
  }

  const filterClause = filterConditions.join(" AND ");

  // Full WHERE with tsvector + ILIKE search
  const searchCondition = `(
    to_tsvector('simple', p.name || ' ' || COALESCE(p.description, '') || ' ' || COALESCE(p.article_code, ''))
    @@ to_tsquery('simple', $1)
    OR p.name ILIKE $2
    OR COALESCE(p.article_code, '') ILIKE $2
  )`;
  const whereClause = `${filterClause} AND ${searchCondition}`;

  // Count query
  const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) as count FROM products p WHERE ${whereClause}`,
    ...queryParams,
  );
  const total = Number(countResult[0]?.count ?? 0);

  // If tsvector + ILIKE gave 0 results, try trigram similarity fallback
  if (total === 0) {
    return trigramFallbackSearch(
      q,
      filterConditions,
      queryParams.slice(2),
      page,
      perPage,
    );
  }

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
  const idOrder = new Map<string, number>(ids.map((id, i) => [id, i]));
  products.sort(
    (a: { id: string }, b: { id: string }) =>
      (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0),
  );

  return { products, total, totalPages: Math.ceil(total / perPage) };
}

/**
 * Trigram similarity fallback when tsvector gives 0 results.
 * Requires pg_trgm extension and GIN index on name.
 */
async function trigramFallbackSearch(
  q: string,
  filterConditions: string[],
  filterParams: (string | number)[],
  page: number,
  perPage: number,
): Promise<CatalogResult> {
  const sanitized = q.replace(/[^\p{L}\p{N}\s'-]/gu, "").trim();
  if (!sanitized) return { products: [], total: 0, totalPages: 0 };

  // Build params: $1 = search query, then filter params
  const params: (string | number)[] = [sanitized, ...filterParams];
  const filterClause = filterConditions
    .map((cond) => {
      // Shift param indices: filter params were $3+ originally, now $2+
      return cond.replace(/\$(\d+)/g, (_, num) => `$${Number(num)}`);
    })
    .join(" AND ");

  const countResult = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) as count FROM products p
     WHERE ${filterClause} AND similarity(p.name, $1) > 0.3`,
    ...params,
  );
  const total = Number(countResult[0]?.count ?? 0);

  if (total === 0) return { products: [], total: 0, totalPages: 0 };

  const offset = (page - 1) * perPage;
  const productIds = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT p.id, similarity(p.name, $1) AS rank
     FROM products p
     WHERE ${filterClause} AND similarity(p.name, $1) > 0.3
     ORDER BY rank DESC
     LIMIT ${perPage} OFFSET ${offset}`,
    ...params,
  );

  const ids = productIds.map((r) => r.id);
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

  const idOrder = new Map<string, number>(ids.map((id, i) => [id, i]));
  products.sort(
    (a: { id: string }, b: { id: string }) =>
      (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0),
  );

  return { products, total, totalPages: Math.ceil(total / perPage) };
}

/**
 * Autocomplete search for the search dropdown.
 * Combines tsvector prefix matching + trigram similarity, returns top 5.
 */
export interface AutocompleteResult {
  id: string;
  name: string;
  slug: string;
  quality: string;
  rank: number;
}

export async function autocompleteSearch(
  query: string,
): Promise<AutocompleteResult[]> {
  if (!query || query.trim().length < 2) return [];

  const sanitized = query.replace(/[^\p{L}\p{N}\s'-]/gu, "").trim();
  if (!sanitized) return [];

  // Build prefix tsquery
  const words = sanitized
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => `${w}:*`)
    .join(" & ");

  if (!words) return [];

  // Combine tsvector prefix matching + trigram similarity
  const results: AutocompleteResult[] = await (
    prisma.$queryRawUnsafe as (
      query: string,
      ...values: (string | number)[]
    ) => Promise<AutocompleteResult[]>
  )(
    `SELECT DISTINCT ON (id) id, name, slug, quality, score AS rank FROM (
       SELECT id, name, slug, quality,
              ts_rank(to_tsvector('simple', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(article_code, '')),
                      to_tsquery('simple', $1)) * 2 AS score
       FROM products
       WHERE to_tsvector('simple', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(article_code, ''))
             @@ to_tsquery('simple', $1)
             AND in_stock = true
       UNION ALL
       SELECT id, name, slug, quality,
              similarity(name, $2) AS score
       FROM products
       WHERE similarity(name, $2) > 0.2 AND in_stock = true
     ) sub
     ORDER BY id, rank DESC
     LIMIT 5`,
    words,
    sanitized,
  );

  // Re-sort by rank
  results.sort(
    (a: AutocompleteResult, b: AutocompleteResult) =>
      Number(b.rank) - Number(a.rank),
  );
  return results.slice(0, 5);
}

// ─── «Ціна від …» для сторінок категорій (SEO, 2026-07-23) ──────────────────
// Публічний АГРЕГАТ (мінімальна гуртова ціна по піддереву категорії) — свідоме
// рішення user: точні ціни по товарах лишаються за реєстрацією, а «від X €/кг»
// у заголовку/описі категорії дає цифру в сніпет Google і підігріває лід.

export interface CategoryMinPrice {
  amount: number;
  unit: "kg" | "pair" | "piece";
}

const MIN_PRICE_UNITS = ["kg", "pair", "piece"] as const;

/**
 * Мінімальна активна гуртова ціна серед in-stock товарів категорії + її
 * прямих підкатегорій. Повертає першу знайдену за пріоритетом одиниці
 * (кг → пара → шт). null — коли товарів з цінами немає.
 */
export async function getCategoryMinPrice(
  categoryIds: string[],
): Promise<CategoryMinPrice | null> {
  for (const unit of MIN_PRICE_UNITS) {
    const agg = await prisma.price.aggregate({
      _min: { amount: true },
      where: {
        priceType: "wholesale",
        amount: { gt: 0 },
        validTo: null,
        product: {
          inStock: true,
          categoryId: { in: categoryIds },
          priceUnit: unit,
        },
      },
    });
    if (agg._min.amount != null) {
      return { amount: agg._min.amount, unit };
    }
  }
  return null;
}

/** Людський суфікс одиниці для «від X €/…». */
export function minPriceUnitLabel(unit: CategoryMinPrice["unit"]): string {
  return unit === "kg" ? "кг" : unit === "pair" ? "пару" : "шт";
}
