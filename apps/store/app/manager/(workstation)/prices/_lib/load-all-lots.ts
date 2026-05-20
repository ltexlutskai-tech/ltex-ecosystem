import { prisma } from "@ltex/db";
import {
  buildLotsOrderBy,
  buildLotsWhere,
  groupLotsByProduct,
  lotRowSelect,
  serializeLotRow,
  type BuildLotsWhereParams,
  type LotGroup,
  type LotsListSort,
  type LotsListSortDir,
} from "@/lib/manager/lots-list";

export interface LoadAllLotsParams extends BuildLotsWhereParams {
  sort: LotsListSort;
  dir: LotsListSortDir;
  page: number;
  pageSize: number;
  /** id поточного менеджера — для фільтра «моя бронь» + флагів дисплею. */
  viewerUserId: string;
}

export interface LoadAllLotsResult {
  groups: LotGroup[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function loadAllLots(
  p: LoadAllLotsParams,
): Promise<LoadAllLotsResult> {
  const now = new Date();
  const where = buildLotsWhere({ ...p, viewerUserId: p.viewerUserId, now });
  const orderBy = buildLotsOrderBy(p.sort, p.dir);

  const [total, rows] = await Promise.all([
    prisma.lot.count({ where }),
    prisma.lot.findMany({
      where,
      orderBy,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      select: lotRowSelect,
    }),
  ]);

  const items = rows.map((r) => serializeLotRow(r, p.viewerUserId, now));
  const groups = groupLotsByProduct(items);

  return {
    groups,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

/** Назва товару для префільтру productId (для заголовка/чипа). */
export async function loadProductLabel(
  productId: string,
): Promise<{ id: string; name: string; articleCode: string | null } | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, articleCode: true },
  });
  return product;
}
