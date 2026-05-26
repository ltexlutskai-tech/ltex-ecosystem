import { prisma } from "@ltex/db";
import {
  getViewerOwnership,
  maskClientForForeign,
} from "@/lib/manager/client-visibility";
import type { CurrentManager } from "@/lib/auth/manager-auth";
import type { ClientDetail, ViewerOwnership } from "../_components/types";

export async function loadClientDetail(
  id: string,
  user?: Pick<CurrentManager, "id" | "role">,
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
      priceType: true,
      agent: { select: { id: true, fullName: true } },
      phones: { orderBy: { sortOrder: "asc" } },
      messengers: true,
      warehouses: true,
      routes: { include: { route: true }, orderBy: { sortOrder: "asc" } },
      assortmentItems: { orderBy: { lastOrderedAt: "desc" } },
      presentations: { orderBy: { lastPresentedAt: "desc" } },
      bankAccounts: { orderBy: { accountNumber: "asc" } },
      reminders: {
        orderBy: { remindAt: "asc" },
        include: { owner: { select: { id: true, fullName: true } } },
      },
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

  // M1.3f: визначаємо ownership scope; admin → full, manager-own → full,
  // manager-foreign → masked. Якщо user не передано (generateMetadata) →
  // консервативно як "foreign" (metadata не leak-ить sensitive).
  const viewerOwnership: ViewerOwnership = user
    ? await getViewerOwnership(user, id)
    : "foreign";

  const full: ClientDetail = {
    viewerOwnership,
    id: client.id,
    code1C: client.code1C,
    name: client.name,
    tradePointName: client.tradePointName,
    phonePrimary: client.phonePrimary,
    viberContact: client.viberContact,
    city: client.city,
    region: client.region,
    street: client.street,
    house: client.house,
    novaPoshtaBranch: client.novaPoshtaBranch,
    geolocation: client.geolocation,
    websiteUrl: client.websiteUrl,
    monthlyVolume: client.monthlyVolume
      ? client.monthlyVolume.toString()
      : null,
    licenseExpiresAt: client.licenseExpiresAt?.toISOString() ?? null,
    isOwn: client.isOwn,
    debt: client.debt.toString(),
    overdueDebt: client.overdueDebt.toString(),
    tovDebt: client.tovDebt?.toString() ?? null,
    tovOverdueDebt: client.tovOverdueDebt?.toString() ?? null,
    sessionRemainder: client.sessionRemainder?.toString() ?? null,
    daysSinceLastPurchase: client.daysSinceLastPurchase,
    lastPurchaseAt: client.lastPurchaseAt?.toISOString() ?? null,
    hasNewMessage: client.hasNewMessage,
    isViberLinked: client.isViberLinked,
    dialogStatus: client.dialogStatus,
    keywords: client.keywords,
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
    statusGeneralId: client.statusGeneralId,
    statusOperational: client.statusOperational
      ? {
          code: client.statusOperational.code,
          label: client.statusOperational.label,
          colorHex: client.statusOperational.colorHex,
        }
      : null,
    statusOperationalId: client.statusOperationalId,
    searchChannel: client.searchChannel
      ? { code: client.searchChannel.code, label: client.searchChannel.label }
      : null,
    searchChannelId: client.searchChannelId,
    categoryTT: client.categoryTT
      ? { code: client.categoryTT.code, label: client.categoryTT.label }
      : null,
    categoryTTId: client.categoryTTId,
    deliveryMethod: client.deliveryMethod
      ? {
          code: client.deliveryMethod.code,
          label: client.deliveryMethod.label,
        }
      : null,
    deliveryMethodId: client.deliveryMethodId,
    primaryAssortment: client.primaryAssortment
      ? {
          code: client.primaryAssortment.code,
          label: client.primaryAssortment.label,
        }
      : null,
    primaryAssortmentId: client.primaryAssortmentId,
    priceType: client.priceType
      ? { code: client.priceType.code, label: client.priceType.label }
      : null,
    priceTypeId: client.priceTypeId,
    primaryRoute: client.primaryRoute
      ? { id: client.primaryRoute.id, name: client.primaryRoute.name }
      : null,
    primaryRouteId: client.primaryRouteId,
    agent: client.agent
      ? { id: client.agent.id, fullName: client.agent.fullName }
      : null,
    agentUserId: client.agentUserId,
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
      browserUrl: m.browserUrl,
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
      notDirectInput: a.notDirectInput,
    })),
    presentations: client.presentations.map((p) => ({
      id: p.id,
      productCode: p.productCode,
      productName: p.productName,
      lastPresentedAt: p.lastPresentedAt?.toISOString() ?? null,
      notDirectInput: p.notDirectInput,
    })),
    bankAccounts: client.bankAccounts.map((b) => ({
      id: b.id,
      accountNumber: b.accountNumber,
      bankName: b.bankName,
      mfo: b.mfo,
      comment: b.comment,
      isHidden: b.isHidden,
    })),
    reminders: client.reminders.map((r) => ({
      id: r.id,
      body: r.body,
      remindAt: r.remindAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      snoozedUntilAt: r.snoozedUntilAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      owner: r.owner ? { id: r.owner.id, fullName: r.owner.fullName } : null,
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

  return viewerOwnership === "foreign" ? maskClientForForeign(full) : full;
}
