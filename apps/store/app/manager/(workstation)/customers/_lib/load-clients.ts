import { Prisma, prisma } from "@ltex/db";
import { ownershipWhere } from "@/lib/manager/client-visibility";
import type { CurrentManager } from "@/lib/auth/manager-auth";
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
  /**
   * Роль поточного користувача. Manager-у завжди застосовується
   * ownership scope (тільки свої клієнти, незалежно від onlyMine URL-парам).
   * Admin бачить усіх; може опційно фільтрувати через `onlyMine`.
   * M1.3f.
   */
  userRole: CurrentManager["role"];
  // existing
  search?: string;
  status?: string; // legacy single code
  channel?: string;
  deliveryMethod?: string;
  hasDebt?: boolean;
  hasOverpayment?: boolean;
  onlyMine?: boolean;
  page: number;
  pageSize: number;
  hideTrash?: boolean;
  // M1.3e multi-select FK
  statusIds?: string[];
  statusOperationalIds?: string[];
  channelIds?: string[];
  deliveryMethodIds?: string[];
  categoryTTIds?: string[];
  priceTypeIds?: string[];
  primaryAssortmentIds?: string[];
  primaryRouteIds?: string[];
  agentUserIds?: string[];
  // M1.3e text/number/date/bool
  region?: string;
  city?: string;
  dialogStatus?: string;
  debtMin?: number;
  debtMax?: number;
  overdueDebtMin?: number;
  overdueDebtMax?: number;
  monthlyVolumeMin?: number;
  monthlyVolumeMax?: number;
  daysSinceMin?: number;
  daysSinceMax?: number;
  licenseExpiresBefore?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  hasNewMessage?: boolean;
  isViberLinked?: boolean;
}

export interface LoadClientsResult {
  items: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function loadClients(
  p: LoadClientsParams,
): Promise<LoadClientsResult> {
  const andClauses: Prisma.MgrClientWhereInput[] = [];

  if (p.search) {
    andClauses.push({
      OR: [
        { name: { contains: p.search, mode: "insensitive" } },
        { phonePrimary: { contains: p.search } },
        { city: { contains: p.search, mode: "insensitive" } },
        { phones: { some: { phone: { contains: p.search } } } },
      ],
    });
  }

  if (p.statusIds && p.statusIds.length > 0) {
    andClauses.push({ statusGeneralId: { in: p.statusIds } });
  } else if (p.status) {
    andClauses.push({ statusGeneral: { code: p.status } });
  }

  if (p.channelIds && p.channelIds.length > 0) {
    andClauses.push({ searchChannelId: { in: p.channelIds } });
  } else if (p.channel) {
    andClauses.push({ searchChannel: { code: p.channel } });
  }

  if (p.deliveryMethodIds && p.deliveryMethodIds.length > 0) {
    andClauses.push({ deliveryMethodId: { in: p.deliveryMethodIds } });
  } else if (p.deliveryMethod) {
    andClauses.push({ deliveryMethod: { code: p.deliveryMethod } });
  }

  if (p.statusOperationalIds && p.statusOperationalIds.length > 0) {
    andClauses.push({ statusOperationalId: { in: p.statusOperationalIds } });
  }
  if (p.categoryTTIds && p.categoryTTIds.length > 0) {
    andClauses.push({ categoryTTId: { in: p.categoryTTIds } });
  }
  if (p.priceTypeIds && p.priceTypeIds.length > 0) {
    andClauses.push({ priceTypeId: { in: p.priceTypeIds } });
  }
  if (p.primaryAssortmentIds && p.primaryAssortmentIds.length > 0) {
    andClauses.push({ primaryAssortmentId: { in: p.primaryAssortmentIds } });
  }
  if (p.primaryRouteIds && p.primaryRouteIds.length > 0) {
    andClauses.push({ primaryRouteId: { in: p.primaryRouteIds } });
  }
  if (p.agentUserIds && p.agentUserIds.length > 0) {
    andClauses.push({ agentUserId: { in: p.agentUserIds } });
  }

  if (p.region) {
    andClauses.push({
      region: { contains: p.region, mode: "insensitive" },
    });
  }
  if (p.city) {
    andClauses.push({ city: { contains: p.city, mode: "insensitive" } });
  }
  if (p.dialogStatus) {
    andClauses.push({
      dialogStatus: { equals: p.dialogStatus, mode: "insensitive" },
    });
  }

  if (p.debtMin !== undefined || p.debtMax !== undefined) {
    const f: Prisma.DecimalFilter = {};
    if (p.debtMin !== undefined) f.gte = p.debtMin;
    if (p.debtMax !== undefined) f.lte = p.debtMax;
    andClauses.push({ debt: f });
  } else if (p.hasDebt) {
    andClauses.push({ debt: { gt: 0 } });
  } else if (p.hasOverpayment) {
    andClauses.push({ debt: { lt: 0 } });
  }

  if (p.overdueDebtMin !== undefined || p.overdueDebtMax !== undefined) {
    const f: Prisma.DecimalFilter = {};
    if (p.overdueDebtMin !== undefined) f.gte = p.overdueDebtMin;
    if (p.overdueDebtMax !== undefined) f.lte = p.overdueDebtMax;
    andClauses.push({ overdueDebt: f });
  }
  if (p.monthlyVolumeMin !== undefined || p.monthlyVolumeMax !== undefined) {
    const f: Prisma.DecimalNullableFilter = {};
    if (p.monthlyVolumeMin !== undefined) f.gte = p.monthlyVolumeMin;
    if (p.monthlyVolumeMax !== undefined) f.lte = p.monthlyVolumeMax;
    andClauses.push({ monthlyVolume: f });
  }
  if (p.daysSinceMin !== undefined || p.daysSinceMax !== undefined) {
    const f: Prisma.IntNullableFilter = {};
    if (p.daysSinceMin !== undefined) f.gte = p.daysSinceMin;
    if (p.daysSinceMax !== undefined) f.lte = p.daysSinceMax;
    andClauses.push({ daysSinceLastPurchase: f });
  }

  if (p.licenseExpiresBefore) {
    andClauses.push({ licenseExpiresAt: { lte: p.licenseExpiresBefore } });
  }
  if (p.createdFrom || p.createdTo) {
    const f: Prisma.DateTimeFilter = {};
    if (p.createdFrom) f.gte = p.createdFrom;
    if (p.createdTo) f.lte = p.createdTo;
    andClauses.push({ createdAt: f });
  }

  if (p.hasNewMessage !== undefined) {
    andClauses.push({ hasNewMessage: p.hasNewMessage });
  }
  if (p.isViberLinked !== undefined) {
    andClauses.push({ isViberLinked: p.isViberLinked });
  }

  // `onlyMine` URL-toggle лише для admin-а. Менеджеру ownership scope
  // enforced серверно через `ownershipWhere` нижче (URL bypass-у нема).
  if (p.userRole === "admin" && p.onlyMine) {
    andClauses.push({
      OR: [
        { agentUserId: p.userId },
        { assignments: { some: { userId: p.userId } } },
      ],
    });
  }
  if (p.hideTrash !== false) {
    for (const prefix of TRASH_NAME_PREFIXES) {
      andClauses.push({ NOT: { name: { startsWith: prefix } } });
    }
  }

  // M1.3f visibility scope. Admin → no filter; manager → лише свої.
  const ownership = ownershipWhere({ id: p.userId, role: p.userRole });
  if (Object.keys(ownership).length > 0) {
    andClauses.push(ownership);
  }

  const where: Prisma.MgrClientWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {};

  const [total, rows] = await Promise.all([
    prisma.mgrClient.count({ where }),
    prisma.mgrClient.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: {
        statusGeneral: true,
        statusOperational: true,
        searchChannel: true,
        deliveryMethod: true,
        categoryTT: true,
        priceType: true,
        primaryAssortment: true,
        primaryRoute: true,
        agent: { select: { id: true, fullName: true } },
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
      tradePointName: c.tradePointName,
      phonePrimary: c.phonePrimary,
      city: c.city,
      region: c.region,
      debt: c.debt.toString(),
      overdueDebt: c.overdueDebt.toString(),
      monthlyVolume: c.monthlyVolume?.toString() ?? null,
      daysSinceLastPurchase: c.daysSinceLastPurchase,
      lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
      licenseExpiresAt: c.licenseExpiresAt?.toISOString() ?? null,
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
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
      categoryTT: c.categoryTT
        ? { code: c.categoryTT.code, label: c.categoryTT.label }
        : null,
      priceType: c.priceType
        ? { code: c.priceType.code, label: c.priceType.label }
        : null,
      primaryAssortment: c.primaryAssortment
        ? {
            code: c.primaryAssortment.code,
            label: c.primaryAssortment.label,
          }
        : null,
      primaryRoute: c.primaryRoute
        ? {
            code: c.primaryRoute.code1C ?? c.primaryRoute.id,
            label: c.primaryRoute.name,
          }
        : null,
      agent: c.agent ? { id: c.agent.id, fullName: c.agent.fullName } : null,
      assignedManager: c.assignments[0]?.user
        ? {
            id: c.assignments[0].user.id,
            fullName: c.assignments[0].user.fullName,
          }
        : null,
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

export async function loadDictionariesSnapshot() {
  const [
    statuses,
    statusesOperational,
    channels,
    deliveries,
    categoriesTT,
    priceTypes,
    assortmentCodes,
    routes,
    agents,
  ] = await Promise.all([
    prisma.mgrClientStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrClientStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrSearchChannel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrDeliveryMethod.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrCategoryTT.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrPriceType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrAssortmentCode.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrRoute.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: { in: ["manager", "admin"] }, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  return {
    statuses: statuses.map((s) => ({
      id: s.id,
      code: s.code,
      label: s.label,
      colorHex: s.colorHex,
    })),
    statusesOperational: statusesOperational.map((s) => ({
      id: s.id,
      code: s.code,
      label: s.label,
      colorHex: s.colorHex,
    })),
    channels: channels.map((c) => ({ id: c.id, code: c.code, label: c.label })),
    deliveries: deliveries.map((d) => ({
      id: d.id,
      code: d.code,
      label: d.label,
    })),
    categoriesTT: categoriesTT.map((c) => ({
      id: c.id,
      code: c.code,
      label: c.label,
    })),
    priceTypes: priceTypes.map((p) => ({
      id: p.id,
      code: p.code,
      label: p.label,
    })),
    assortmentCodes: assortmentCodes.map((a) => ({
      id: a.id,
      code: a.code,
      label: a.label,
    })),
    routes: routes.map((r) => ({ id: r.id, name: r.name })),
    agents: agents.map((u) => ({ id: u.id, fullName: u.fullName })),
  };
}
