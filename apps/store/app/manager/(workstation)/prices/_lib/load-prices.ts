import { prisma } from "@ltex/db";
import {
  buildPricesOrderBy,
  buildPricesWhere,
  deriveProductRow,
  priceRowInclude,
  type BuildPricesWhereParams,
  type PriceRow,
  type PriceSort,
  type SortDir,
} from "@/lib/manager/prices";

export interface LoadPricesParams extends BuildPricesWhereParams {
  sort: PriceSort;
  dir: SortDir;
  page: number;
  pageSize: number;
}

export interface LoadPricesResult {
  items: PriceRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function loadPrices(
  p: LoadPricesParams,
): Promise<LoadPricesResult> {
  const where = buildPricesWhere(p);
  const orderBy = buildPricesOrderBy(p.sort, p.dir);

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      select: {
        id: true,
        articleCode: true,
        name: true,
        description: true,
        priceUnit: true,
        videoUrl: true,
        inStock: true,
        createdAt: true,
        ...priceRowInclude,
      },
    }),
  ]);

  const now = new Date();
  const items = rows
    .map((r) => deriveProductRow(r, now))
    .filter((row) => (p.onSale ? row.salePrice !== null : true));

  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

export async function loadCategoriesForFilter(): Promise<
  { id: string; name: string }[]
> {
  const rows = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows;
}
