import { Prisma, prisma } from "@ltex/db";
import type { ClientListItem } from "../_components/types";

const TRASH_NAME_PREFIXES = [
  "1111",
  "2222",
  "3333",
  "5555",
  "7777",
  "8888",
  "9999",
];

export interface LoadClientsParams {
  userId: string;
  search?: string;
  status?: string;
  channel?: string;
  deliveryMethod?: string;
  hasDebt?: boolean;
  hasOverpayment?: boolean;
  onlyMine?: boolean;
  page: number;
  pageSize: number;
  hideTrash?: boolean;
}

export interface LoadClientsResult {
  items: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function loadClients(
  params: LoadClientsParams,
): Promise<LoadClientsResult> {
  const andClauses: Prisma.MgrClientWhereInput[] = [];
  if (params.search) {
    andClauses.push({
      OR: [
        { name: { contains: params.search, mode: "insensitive" } },
        { phonePrimary: { contains: params.search } },
        { city: { contains: params.search, mode: "insensitive" } },
        { phones: { some: { phone: { contains: params.search } } } },
      ],
    });
  }
  if (params.status)
    andClauses.push({ statusGeneral: { code: params.status } });
  if (params.channel)
    andClauses.push({ searchChannel: { code: params.channel } });
  if (params.deliveryMethod) {
    andClauses.push({ deliveryMethod: { code: params.deliveryMethod } });
  }
  if (params.hasDebt) andClauses.push({ debt: { gt: 0 } });
  if (params.hasOverpayment) andClauses.push({ debt: { lt: 0 } });
  if (params.onlyMine) {
    andClauses.push({ assignments: { some: { userId: params.userId } } });
  }
  if (params.hideTrash !== false) {
    for (const prefix of TRASH_NAME_PREFIXES) {
      andClauses.push({ NOT: { name: { startsWith: prefix } } });
    }
  }
  const where: Prisma.MgrClientWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {};

  const [total, rows] = await Promise.all([
    prisma.mgrClient.count({ where }),
    prisma.mgrClient.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        statusGeneral: true,
        statusOperational: true,
        searchChannel: true,
        deliveryMethod: true,
        assignments: {
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    }),
  ]);

  return {
    items: rows.map((c) => ({
      id: c.id,
      code1C: c.code1C,
      name: c.name,
      phonePrimary: c.phonePrimary,
      city: c.city,
      region: c.region,
      debt: c.debt.toString(),
      overdueDebt: c.overdueDebt.toString(),
      daysSinceLastPurchase: c.daysSinceLastPurchase,
      lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
      statusGeneral: c.statusGeneral
        ? {
            code: c.statusGeneral.code,
            label: c.statusGeneral.label,
            colorHex: c.statusGeneral.colorHex,
          }
        : null,
      statusOperational: c.statusOperational
        ? {
            code: c.statusOperational.code,
            label: c.statusOperational.label,
            colorHex: c.statusOperational.colorHex,
          }
        : null,
      searchChannel: c.searchChannel
        ? { code: c.searchChannel.code, label: c.searchChannel.label }
        : null,
      deliveryMethod: c.deliveryMethod
        ? { code: c.deliveryMethod.code, label: c.deliveryMethod.label }
        : null,
      assignedManager: c.assignments[0]?.user
        ? {
            id: c.assignments[0].user.id,
            fullName: c.assignments[0].user.fullName,
          }
        : null,
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export async function loadDictionariesSnapshot() {
  const [statuses, channels, deliveries] = await Promise.all([
    prisma.mgrClientStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrSearchChannel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrDeliveryMethod.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return {
    statuses: statuses.map((s) => ({
      code: s.code,
      label: s.label,
      colorHex: s.colorHex,
    })),
    channels: channels.map((c) => ({ code: c.code, label: c.label })),
    deliveries: deliveries.map((d) => ({ code: d.code, label: d.label })),
  };
}
