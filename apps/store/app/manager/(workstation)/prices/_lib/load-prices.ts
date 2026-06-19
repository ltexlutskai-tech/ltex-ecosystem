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
import { getProductClaimsSummaries } from "@/lib/manager/product-claims";
import {
  collectCategorySubtreeIds,
  collectHiddenCategoryIds,
  type CategoryNode,
} from "@/lib/manager/category-tree";

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
        slug: true,
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
  const baseItems = rows
    .map((r) => deriveProductRow(r, now))
    .filter((row) => (p.onSale ? row.salePrice !== null : true));

  // Активні замовлення (Етап 1) — один батч-запит на всю сторінку.
  const claimMap = await getProductClaimsSummaries(baseItems.map((r) => r.id));
  const items: PriceRow[] = baseItems.map((r) => ({
    ...r,
    claim: claimMap.get(r.id) ?? null,
  }));

  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

/** Вузол дерева категорій для ієрархічного select (з відступами за глибиною). */
export interface CategoryTreeOption {
  id: string;
  name: string;
  /** Глибина у дереві (0 = корінь) — для відступів у select. */
  depth: number;
}

/**
 * Завантажує усі категорії й повертає їх у порядку обходу дерева (батько перед
 * нащадками) з глибиною — для ієрархічного select у тулбарі/адмінці. Сироти
 * (parentId вказує на неіснуючу категорію) трактуються як корені.
 */
export async function loadCategoriesForFilter(): Promise<CategoryTreeOption[]> {
  const rows = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, parentId: true },
  });
  return buildCategoryTreeOptions(rows);
}

/** Чиста збірка плаского дерева (DFS, відсортовано по name на кожному рівні). */
export function buildCategoryTreeOptions(
  rows: { id: string; name: string; parentId: string | null }[],
): CategoryTreeOption[] {
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string, typeof rows>();
  for (const r of rows) {
    // Сирота (parent поза набором) → трактуємо як корінь.
    const key = r.parentId && ids.has(r.parentId) ? r.parentId : "__root__";
    const arr = byParent.get(key);
    if (arr) arr.push(r);
    else byParent.set(key, [r]);
  }
  const out: CategoryTreeOption[] = [];
  const visited = new Set<string>();
  const walk = (parentKey: string, depth: number): void => {
    const children = byParent.get(parentKey) ?? [];
    for (const c of children) {
      if (visited.has(c.id)) continue; // захист від циклів
      visited.add(c.id);
      out.push({ id: c.id, name: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk("__root__", 0);
  return out;
}

/**
 * Завантажує пласкі вузли дерева (id/parentId/hiddenForRoles) — для обчислення
 * піддерева обраної категорії та прихованих для ролі категорій. Один запит.
 */
export async function loadCategoryNodes(): Promise<CategoryNode[]> {
  return prisma.category.findMany({
    select: { id: true, parentId: true, hiddenForRoles: true },
  });
}

/** Ролі з повним доступом (bypass deny-list). */
const FULL_ACCESS_ROLES = new Set(["admin", "owner"]);

/**
 * Обчислює фільтри-набори за деревом категорій для одного запиту прайсу:
 *   • `categorySubtreeIds` — піддерево обраної категорії (категорія + нащадки);
 *   • `hiddenCategoryIds`  — приховані для ролі (deny-list зі спадковістю).
 * admin/owner → hiddenCategoryIds порожній (bypass).
 */
export function resolveCategoryAccess(
  nodes: CategoryNode[],
  opts: { categoryId?: string; role: string },
): { categorySubtreeIds?: string[]; hiddenCategoryIds?: string[] } {
  const categorySubtreeIds = opts.categoryId
    ? Array.from(collectCategorySubtreeIds(opts.categoryId, nodes))
    : undefined;
  const hiddenCategoryIds = FULL_ACCESS_ROLES.has(opts.role)
    ? undefined
    : Array.from(collectHiddenCategoryIds(opts.role, nodes));
  return {
    categorySubtreeIds,
    hiddenCategoryIds:
      hiddenCategoryIds && hiddenCategoryIds.length > 0
        ? hiddenCategoryIds
        : undefined,
  };
}
