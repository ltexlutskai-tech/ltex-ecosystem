import { prisma } from "@ltex/db";
import type { ClientDetail } from "../_components/types";

export async function loadClientDetail(
  id: string,
): Promise<ClientDetail | null> {
  const client = await prisma.mgrClient.findUnique({
    where: { id },
    include: {
      statusGeneral: true,
      statusOperational: true,
      searchChannel: true,
      categoryTT: true,
      deliveryMethod: true,
      primaryRoute: true,
      primaryAssortment: true,
      phones: { orderBy: { sortOrder: "asc" } },
      messengers: true,
      warehouses: true,
      routes: { include: { route: true } },
      assortmentItems: { orderBy: { lastOrderedAt: "desc" } },
      timeline: {
        orderBy: { occurredAt: "desc" },
        take: 50,
        include: { author: { select: { id: true, fullName: true } } },
      },
      assignments: {
        include: { user: { select: { id: true, fullName: true } } },
      },
    },
  });
  if (!client) return null;
  return {
    id: client.id,
    code1C: client.code1C,
    name: client.name,
    phonePrimary: client.phonePrimary,
    city: client.city,
    region: client.region,
    street: client.street,
    house: client.house,
    novaPoshtaBranch: client.novaPoshtaBranch,
    websiteUrl: client.websiteUrl,
    monthlyVolume: client.monthlyVolume
      ? client.monthlyVolume.toString()
      : null,
    licenseExpiresAt: client.licenseExpiresAt?.toISOString() ?? null,
    isOwn: client.isOwn,
    debt: client.debt.toString(),
    overdueDebt: client.overdueDebt.toString(),
    daysSinceLastPurchase: client.daysSinceLastPurchase,
    lastPurchaseAt: client.lastPurchaseAt?.toISOString() ?? null,
    hasNewMessage: client.hasNewMessage,
    isViberLinked: client.isViberLinked,
    dialogStatus: client.dialogStatus,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    lastSyncedAt: client.lastSyncedAt?.toISOString() ?? null,
    statusGeneral: client.statusGeneral
      ? {
          code: client.statusGeneral.code,
          label: client.statusGeneral.label,
          colorHex: client.statusGeneral.colorHex,
        }
      : null,
    statusOperational: client.statusOperational
      ? {
          code: client.statusOperational.code,
          label: client.statusOperational.label,
          colorHex: client.statusOperational.colorHex,
        }
      : null,
    searchChannel: client.searchChannel
      ? { code: client.searchChannel.code, label: client.searchChannel.label }
      : null,
    categoryTT: client.categoryTT
      ? { code: client.categoryTT.code, label: client.categoryTT.label }
      : null,
    deliveryMethod: client.deliveryMethod
      ? {
          code: client.deliveryMethod.code,
          label: client.deliveryMethod.label,
        }
      : null,
    primaryAssortment: client.primaryAssortment
      ? {
          code: client.primaryAssortment.code,
          label: client.primaryAssortment.label,
        }
      : null,
    primaryRoute: client.primaryRoute
      ? { id: client.primaryRoute.id, name: client.primaryRoute.name }
      : null,
    phones: client.phones.map((p) => ({
      id: p.id,
      phone: p.phone,
      label: p.label,
      messenger: p.messenger,
    })),
    messengers: client.messengers.map((m) => ({
      id: m.id,
      network: m.network,
      handle: m.handle,
      url: m.url,
      comment: m.comment,
    })),
    warehouses: client.warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      city: w.city,
      region: w.region,
      novaPoshtaBranch: w.novaPoshtaBranch,
      licenseExpiresAt: w.licenseExpiresAt?.toISOString() ?? null,
      comment: w.comment,
    })),
    routes: client.routes.map((r) => ({
      id: r.id,
      routeId: r.routeId,
      name: r.route.name,
      isActive: r.route.isActive,
    })),
    assortmentItems: client.assortmentItems.map((a) => ({
      id: a.id,
      productCode: a.productCode,
      productName: a.productName,
      lastOrderedAt: a.lastOrderedAt?.toISOString() ?? null,
    })),
    timeline: client.timeline.map((t) => ({
      id: t.id,
      kind: t.kind,
      body: t.body,
      occurredAt: t.occurredAt.toISOString(),
      author: t.author
        ? { id: t.author.id, fullName: t.author.fullName }
        : null,
      metadata: t.metadata,
    })),
    assignedManager: client.assignments[0]?.user
      ? {
          id: client.assignments[0].user.id,
          fullName: client.assignments[0].user.fullName,
        }
      : null,
  };
}
