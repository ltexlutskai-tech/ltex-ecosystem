import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
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
        take: 20,
        include: {
          author: { select: { id: true, fullName: true } },
        },
      },
      assignments: {
        include: { user: { select: { id: true, fullName: true } } },
      },
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  return NextResponse.json({
    client: {
      id: client.id,
      code1C: client.code1C,
      uid1C: client.uid1C,
      name: client.name,
      phonePrimary: client.phonePrimary,
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
      licenseExpiresAt: client.licenseExpiresAt,
      isOwn: client.isOwn,
      notDirectInput: client.notDirectInput,
      debt: client.debt.toString(),
      overdueDebt: client.overdueDebt.toString(),
      daysSinceLastPurchase: client.daysSinceLastPurchase,
      lastPurchaseAt: client.lastPurchaseAt,
      hasNewMessage: client.hasNewMessage,
      isViberLinked: client.isViberLinked,
      dialogStatus: client.dialogStatus,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      lastSyncedAt: client.lastSyncedAt,
      statusGeneral: serializeStatus(client.statusGeneral),
      statusOperational: serializeStatus(client.statusOperational),
      searchChannel: client.searchChannel
        ? {
            code: client.searchChannel.code,
            label: client.searchChannel.label,
          }
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
      primaryRoute: client.primaryRoute
        ? { id: client.primaryRoute.id, name: client.primaryRoute.name }
        : null,
      primaryAssortment: client.primaryAssortment
        ? {
            code: client.primaryAssortment.code,
            label: client.primaryAssortment.label,
          }
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
        licenseExpiresAt: w.licenseExpiresAt,
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
        lastOrderedAt: a.lastOrderedAt,
      })),
      timeline: client.timeline.map((t) => ({
        id: t.id,
        kind: t.kind,
        body: t.body,
        occurredAt: t.occurredAt,
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
    },
  });
}

function serializeStatus(
  s: { code: string; label: string; colorHex: string } | null,
) {
  return s ? { code: s.code, label: s.label, colorHex: s.colorHex } : null;
}
