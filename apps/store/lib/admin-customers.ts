import { prisma } from "@ltex/db";
import type { Prisma } from "@ltex/db";

export type CustomerListSort =
  | "first_seen_desc"
  | "last_order_desc"
  | "orders_count_desc"
  | "name_asc";

export interface CustomerListFilter {
  hasOrders?: boolean;
  search?: string;
  sort?: CustomerListSort;
  page?: number;
  pageSize?: number;
}

export interface CustomerListItem {
  id: string;
  phone: string | null;
  name: string;
  email: string | null;
  telegram: string | null;
  city: string | null;
  notes: string | null;
  ordersCount: number;
  ordersTotalUah: number;
  lastOrderAt: Date | null;
  firstSeenAt: Date;
  lastUpdatedAt: Date;
}

export const CUSTOMER_LIST_PAGE_SIZE_DEFAULT = 50;

export function buildCustomerWhere(
  filter: CustomerListFilter,
): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};
  const search = filter.search?.trim();
  if (search) {
    where.OR = [
      { phone: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (filter.hasOrders === true) {
    where.orders = { some: {} };
  } else if (filter.hasOrders === false) {
    where.orders = { none: {} };
  }
  return where;
}

type CustomerWithCount = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  city: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { orders: number };
};

async function fetchPageByLastOrder(
  filter: CustomerListFilter,
  pageSize: number,
  skip: number,
): Promise<CustomerWithCount[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const search = filter.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      `(c.name ILIKE $${paramIdx} OR c.phone ILIKE $${paramIdx} OR c.email ILIKE $${paramIdx})`,
    );
    params.push(pattern);
    paramIdx++;
  }
  if (filter.hasOrders === true) {
    conditions.push(`EXISTS (SELECT 1 FROM orders WHERE customer_id = c.id)`);
  } else if (filter.hasOrders === false) {
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM orders WHERE customer_id = c.id)`,
    );
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT c.id
    FROM customers c
    ${whereSql}
    ORDER BY (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) DESC NULLS LAST,
             c.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;
  params.push(pageSize, skip);

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(sql, ...params);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const found = await prisma.customer.findMany({
    where: { id: { in: ids } },
    include: { _count: { select: { orders: true } } },
  });
  const orderMap = new Map(ids.map((id, i) => [id, i]));
  return found.sort(
    (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
  );
}

export async function listCustomers(
  filter: CustomerListFilter = {},
): Promise<{ items: CustomerListItem[]; total: number }> {
  const sort: CustomerListSort = filter.sort ?? "first_seen_desc";
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.max(
    1,
    filter.pageSize ?? CUSTOMER_LIST_PAGE_SIZE_DEFAULT,
  );
  const skip = (page - 1) * pageSize;
  const where = buildCustomerWhere(filter);

  const total = await prisma.customer.count({ where });

  let customers: CustomerWithCount[];
  if (sort === "last_order_desc") {
    customers = await fetchPageByLastOrder(filter, pageSize, skip);
  } else {
    let orderBy: Prisma.CustomerOrderByWithRelationInput;
    switch (sort) {
      case "orders_count_desc":
        orderBy = { orders: { _count: "desc" } };
        break;
      case "name_asc":
        orderBy = { name: "asc" };
        break;
      case "first_seen_desc":
      default:
        orderBy = { createdAt: "desc" };
        break;
    }
    customers = await prisma.customer.findMany({
      where,
      include: { _count: { select: { orders: true } } },
      orderBy,
      skip,
      take: pageSize,
    });
  }

  if (customers.length === 0) return { items: [], total };

  const customerIds = customers.map((c) => c.id);

  const [sumAggregates, lastOrderAggregates] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: customerIds },
        status: { not: "cancelled" },
      },
      _sum: { totalUah: true },
    }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: { customerId: { in: customerIds } },
      _max: { createdAt: true },
    }),
  ]);

  const sumMap = new Map(
    sumAggregates.map((a) => [a.customerId, a._sum.totalUah ?? 0]),
  );
  const lastOrderMap = new Map(
    lastOrderAggregates.map((a) => [a.customerId, a._max.createdAt]),
  );

  const items: CustomerListItem[] = customers.map((c) => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    email: c.email,
    telegram: c.telegram,
    city: c.city,
    notes: c.notes,
    ordersCount: c._count.orders,
    ordersTotalUah: sumMap.get(c.id) ?? 0,
    lastOrderAt: lastOrderMap.get(c.id) ?? null,
    firstSeenAt: c.createdAt,
    lastUpdatedAt: c.updatedAt,
  }));

  return { items, total };
}

export interface CustomerListSummary {
  total: number;
  withOrders: number;
  leadsOnly: number;
}

export async function getCustomerListSummary(
  search?: string,
): Promise<CustomerListSummary> {
  const baseWhere = buildCustomerWhere({ search });
  const withOrdersWhere: Prisma.CustomerWhereInput = {
    ...baseWhere,
    orders: { some: {} },
  };
  const leadsWhere: Prisma.CustomerWhereInput = {
    ...baseWhere,
    orders: { none: {} },
  };

  const [total, withOrders, leadsOnly] = await Promise.all([
    prisma.customer.count({ where: baseWhere }),
    prisma.customer.count({ where: withOrdersWhere }),
    prisma.customer.count({ where: leadsWhere }),
  ]);

  return { total, withOrders, leadsOnly };
}
