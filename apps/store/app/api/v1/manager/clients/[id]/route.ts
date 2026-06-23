import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  getViewerOwnership,
  maskClientForForeign,
} from "@/lib/manager/client-visibility";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { enqueueClientUpdate } from "@/lib/sync/enqueue";
import { mgrClientPatchSchema } from "@/lib/validations/mgr-client";

const clientInclude = {
  statusGeneral: true,
  statusOperational: true,
  searchChannel: true,
  categoryTT: true,
  deliveryMethod: true,
  primaryRoute: true,
  primaryAssortment: true,
  priceType: true,
  agent: { select: { id: true, fullName: true, code1C: true } },
  phones: { orderBy: { sortOrder: "asc" } },
  messengers: true,
  warehouses: true,
  routes: { include: { route: true }, orderBy: { sortOrder: "asc" } },
  assortmentItems: { orderBy: { lastOrderedAt: "desc" } },
  presentations: { orderBy: { lastPresentedAt: "desc" } },
  bankAccounts: { orderBy: { accountNumber: "asc" } },
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
} satisfies Prisma.MgrClientInclude;

type LoadedMgrClient = Prisma.MgrClientGetPayload<{
  include: typeof clientInclude;
}>;

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
    include: clientInclude,
  });

  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  // M1.3f: визначаємо чи бачить юзер картку як «свого»
  const viewerOwnership = await getViewerOwnership(user, id);
  const serialized = serializeMgrClient(client);
  const payload =
    viewerOwnership === "foreign"
      ? maskClientForForeign(serialized)
      : serialized;

  return NextResponse.json({
    client: { ...payload, viewerOwnership },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = mgrClientPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  if (data.agentUserId !== undefined && user.role !== "admin") {
    return NextResponse.json(
      {
        error: "Тільки адміністратор може змінювати торгового агента",
      },
      { status: 403 },
    );
  }

  const updateData: Prisma.MgrClientUpdateInput = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.tradePointName !== undefined)
    updateData.tradePointName = data.tradePointName;
  if (data.region !== undefined) updateData.region = data.region;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.street !== undefined) updateData.street = data.street;
  if (data.house !== undefined) updateData.house = data.house;
  if (data.novaPoshtaBranch !== undefined)
    updateData.novaPoshtaBranch = data.novaPoshtaBranch;
  if (data.geolocation !== undefined) updateData.geolocation = data.geolocation;
  if (data.viberContact !== undefined)
    updateData.viberContact = data.viberContact;
  if (data.dialogStatus !== undefined)
    updateData.dialogStatus = data.dialogStatus;
  if (data.hasNewMessage !== undefined)
    updateData.hasNewMessage = data.hasNewMessage;
  if (data.isViberLinked !== undefined)
    updateData.isViberLinked = data.isViberLinked;
  if (data.keywords !== undefined) {
    updateData.keywords =
      data.keywords === null || data.keywords === "" ? null : data.keywords;
  }

  if (data.websiteUrl !== undefined) {
    updateData.websiteUrl =
      data.websiteUrl === "" || data.websiteUrl === null
        ? null
        : data.websiteUrl;
  }
  if (data.email !== undefined) {
    updateData.email =
      data.email === "" || data.email === null ? null : data.email;
  }
  if (data.legalType !== undefined) updateData.legalType = data.legalType;
  if (data.inn !== undefined) updateData.inn = data.inn;
  if (data.edrpou !== undefined) updateData.edrpou = data.edrpou;
  if (data.fullName !== undefined) updateData.fullName = data.fullName;
  if (data.comment !== undefined) updateData.comment = data.comment;
  if (data.additionalDescription !== undefined)
    updateData.additionalDescription = data.additionalDescription;
  if (data.workingHours !== undefined)
    updateData.workingHours = data.workingHours;
  if (data.parentCode1C !== undefined)
    updateData.parentCode1C = data.parentCode1C;
  if (data.monthlyVolume !== undefined) {
    updateData.monthlyVolume =
      data.monthlyVolume === null
        ? null
        : new Prisma.Decimal(data.monthlyVolume);
  }
  if (data.debtTermDays !== undefined)
    updateData.debtTermDays = data.debtTermDays;
  if (data.licenseExpiresAt !== undefined) {
    updateData.licenseExpiresAt =
      data.licenseExpiresAt && data.licenseExpiresAt.length > 0
        ? new Date(data.licenseExpiresAt)
        : null;
  }

  // FK relations — use connect/disconnect for cleanliness
  applyFkRelation(updateData, "statusGeneral", data.statusGeneralId);
  applyFkRelation(updateData, "statusOperational", data.statusOperationalId);
  applyFkRelation(updateData, "categoryTT", data.categoryTTId);
  applyFkRelation(updateData, "priceType", data.priceTypeId);
  applyFkRelation(updateData, "primaryAssortment", data.primaryAssortmentId);
  applyFkRelation(updateData, "deliveryMethod", data.deliveryMethodId);
  applyFkRelation(updateData, "searchChannel", data.searchChannelId);
  applyFkRelation(updateData, "primaryRoute", data.primaryRouteId);
  if (data.agentUserId !== undefined) {
    updateData.agent =
      data.agentUserId === null
        ? { disconnect: true }
        : { connect: { id: data.agentUserId } };
  }

  try {
    const updated = await prisma.mgrClient.update({
      where: { id },
      data: updateData,
      include: clientInclude,
    });

    // M1.5: enqueue write-back до 1С — best-effort, не блокує response.
    enqueueClientUpdate(updated, "update").catch((e: unknown) => {
      console.warn("[L-TEX] Failed to enqueue client sync", {
        clientId: updated.id,
        error: e instanceof Error ? e.message : String(e),
      });
    });

    return NextResponse.json({ client: serializeMgrClient(updated) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json(
          { error: "Клієнта не знайдено" },
          { status: 404 },
        );
      }
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: "Невірне значення довідника (FK constraint)" },
          { status: 400 },
        );
      }
    }
    throw err;
  }
}

function applyFkRelation(
  updateData: Prisma.MgrClientUpdateInput,
  relationName:
    | "statusGeneral"
    | "statusOperational"
    | "categoryTT"
    | "priceType"
    | "primaryAssortment"
    | "deliveryMethod"
    | "searchChannel"
    | "primaryRoute",
  value: string | null | undefined,
): void {
  if (value === undefined) return;
  (updateData as Record<string, unknown>)[relationName] =
    value === null ? { disconnect: true } : { connect: { id: value } };
}

function serializeStatus(
  s: { code: string; label: string; colorHex: string } | null,
) {
  return s ? { code: s.code, label: s.label, colorHex: s.colorHex } : null;
}

function serializeMgrClient(client: LoadedMgrClient) {
  return {
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
    debtTermDays: client.debtTermDays,
    licenseExpiresAt: client.licenseExpiresAt,
    isOwn: client.isOwn,
    email: client.email,
    legalType: client.legalType,
    inn: client.inn,
    edrpou: client.edrpou,
    fullName: client.fullName,
    comment: client.comment,
    additionalDescription: client.additionalDescription,
    workingHours: client.workingHours,
    parentCode1C: client.parentCode1C,
    notDirectInput: client.notDirectInput,
    tradePointName: client.tradePointName,
    viberContact: client.viberContact,
    debt: client.debt.toString(),
    overdueDebt: client.overdueDebt.toString(),
    tovDebt: client.tovDebt?.toString() ?? null,
    tovOverdueDebt: client.tovOverdueDebt?.toString() ?? null,
    sessionRemainder: client.sessionRemainder?.toString() ?? null,
    daysSinceLastPurchase: client.daysSinceLastPurchase,
    lastPurchaseAt: client.lastPurchaseAt,
    hasNewMessage: client.hasNewMessage,
    isViberLinked: client.isViberLinked,
    dialogStatus: client.dialogStatus,
    keywords: client.keywords,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    lastSyncedAt: client.lastSyncedAt,
    statusGeneral: serializeStatus(client.statusGeneral),
    statusGeneralId: client.statusGeneralId,
    statusOperational: serializeStatus(client.statusOperational),
    statusOperationalId: client.statusOperationalId,
    searchChannel: client.searchChannel
      ? {
          code: client.searchChannel.code,
          label: client.searchChannel.label,
        }
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
    primaryRoute: client.primaryRoute
      ? { id: client.primaryRoute.id, name: client.primaryRoute.name }
      : null,
    primaryRouteId: client.primaryRouteId,
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
      notDirectInput: a.notDirectInput,
    })),
    presentations: client.presentations.map((p) => ({
      id: p.id,
      productCode: p.productCode,
      productName: p.productName,
      lastPresentedAt: p.lastPresentedAt,
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
  };
}
