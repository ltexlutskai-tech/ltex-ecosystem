import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { ownershipWhere } from "@/lib/manager/client-visibility";
import { enqueueClientUpdate } from "@/lib/sync/enqueue";
import { listQuerySchema } from "@/lib/validations/manager-clients";
import { mgrClientCreateSchema } from "@/lib/validations/mgr-client";

// Префікси імен сміттєвих контрагентів з 1С — "1111111 ()", "777777 ()" тощо.
// Prisma не підтримує regex matches, тому вирізаємо найчастіші numeric-only префікси.
const TRASH_NAME_PREFIXES = [
  "1111",
  "2222",
  "3333",
  "5555",
  "7777",
  "8888",
  "9999",
];

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні параметри",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }
  const q = parsed.data;

  const andClauses: Prisma.MgrClientWhereInput[] = [];

  // Search OR
  if (q.search) {
    const term = q.search;
    andClauses.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { phonePrimary: { contains: term } },
        { city: { contains: term, mode: "insensitive" } },
        { phones: { some: { phone: { contains: term } } } },
        { keywords: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  // ─── M1.3a legacy single (`status`, `channel`, `deliveryMethod`) ─────────
  // використовуємо як fallback коли *Id multi не передано.
  if (q.statusId && q.statusId.length > 0) {
    andClauses.push({ statusGeneralId: { in: q.statusId } });
  } else if (q.status) {
    andClauses.push({ statusGeneral: { code: q.status } });
  }

  if (q.channelId && q.channelId.length > 0) {
    andClauses.push({ searchChannelId: { in: q.channelId } });
  } else if (q.channel) {
    andClauses.push({ searchChannel: { code: q.channel } });
  }

  if (q.deliveryMethodId && q.deliveryMethodId.length > 0) {
    andClauses.push({ deliveryMethodId: { in: q.deliveryMethodId } });
  } else if (q.deliveryMethod) {
    andClauses.push({ deliveryMethod: { code: q.deliveryMethod } });
  }

  // ─── M1.3e multi-select FK ────────────────────────────────────────────────
  if (q.statusOperationalId && q.statusOperationalId.length > 0) {
    andClauses.push({ statusOperationalId: { in: q.statusOperationalId } });
  }
  if (q.categoryTTId && q.categoryTTId.length > 0) {
    andClauses.push({ categoryTTId: { in: q.categoryTTId } });
  }
  if (q.priceTypeId && q.priceTypeId.length > 0) {
    andClauses.push({ priceTypeId: { in: q.priceTypeId } });
  }
  if (q.primaryAssortmentId && q.primaryAssortmentId.length > 0) {
    andClauses.push({ primaryAssortmentId: { in: q.primaryAssortmentId } });
  }
  if (q.primaryRouteId && q.primaryRouteId.length > 0) {
    andClauses.push({ primaryRouteId: { in: q.primaryRouteId } });
  }
  if (q.agentUserId && q.agentUserId.length > 0) {
    andClauses.push({ agentUserId: { in: q.agentUserId } });
  }

  // ─── Text LIKE ────────────────────────────────────────────────────────────
  if (q.region) {
    andClauses.push({
      region: { contains: q.region, mode: "insensitive" },
    });
  }
  if (q.city) {
    andClauses.push({ city: { contains: q.city, mode: "insensitive" } });
  }
  if (q.dialogStatus) {
    andClauses.push({
      dialogStatus: { equals: q.dialogStatus, mode: "insensitive" },
    });
  }

  // ─── Numeric ranges (мають пріоритет над hasDebt/hasOverpayment bool) ────
  if (q.debtMin !== undefined || q.debtMax !== undefined) {
    const debt: Prisma.DecimalFilter = {};
    if (q.debtMin !== undefined) debt.gte = q.debtMin;
    if (q.debtMax !== undefined) debt.lte = q.debtMax;
    andClauses.push({ debt });
  } else if (q.hasDebt) {
    andClauses.push({ debt: { gt: 0 } });
  } else if (q.hasOverpayment) {
    andClauses.push({ debt: { lt: 0 } });
  }

  if (q.overdueDebtMin !== undefined || q.overdueDebtMax !== undefined) {
    const od: Prisma.DecimalFilter = {};
    if (q.overdueDebtMin !== undefined) od.gte = q.overdueDebtMin;
    if (q.overdueDebtMax !== undefined) od.lte = q.overdueDebtMax;
    andClauses.push({ overdueDebt: od });
  }

  if (q.monthlyVolumeMin !== undefined || q.monthlyVolumeMax !== undefined) {
    const mv: Prisma.DecimalNullableFilter = {};
    if (q.monthlyVolumeMin !== undefined) mv.gte = q.monthlyVolumeMin;
    if (q.monthlyVolumeMax !== undefined) mv.lte = q.monthlyVolumeMax;
    andClauses.push({ monthlyVolume: mv });
  }

  if (q.daysSinceMin !== undefined || q.daysSinceMax !== undefined) {
    const ds: Prisma.IntNullableFilter = {};
    if (q.daysSinceMin !== undefined) ds.gte = q.daysSinceMin;
    if (q.daysSinceMax !== undefined) ds.lte = q.daysSinceMax;
    andClauses.push({ daysSinceLastPurchase: ds });
  }

  // ─── Date filters ─────────────────────────────────────────────────────────
  if (q.licenseExpiresBefore) {
    andClauses.push({
      licenseExpiresAt: { lte: new Date(q.licenseExpiresBefore) },
    });
  }
  if (q.createdFrom || q.createdTo) {
    const created: Prisma.DateTimeFilter = {};
    if (q.createdFrom) created.gte = new Date(q.createdFrom);
    if (q.createdTo) created.lte = new Date(q.createdTo);
    andClauses.push({ createdAt: created });
  }

  // ─── Bool exact ───────────────────────────────────────────────────────────
  if (q.hasNewMessage !== undefined) {
    andClauses.push({ hasNewMessage: q.hasNewMessage });
  }
  if (q.isViberLinked !== undefined) {
    andClauses.push({ isViberLinked: q.isViberLinked });
  }

  // ─── Assignment + trash ───────────────────────────────────────────────────
  // `onlyMine` URL-param лише для admin-а. Менеджер завжди enforced до своїх
  // через `ownershipWhere` нижче (URL bypass-ів немає).
  if (user.role === "admin" && q.onlyMine) {
    andClauses.push({
      OR: [
        { agentUserId: user.id },
        { assignments: { some: { userId: user.id } } },
      ],
    });
  }
  if (q.hideTrash) {
    for (const prefix of TRASH_NAME_PREFIXES) {
      andClauses.push({ NOT: { name: { startsWith: prefix } } });
    }
  }

  // ─── M1.3f visibility scope (server-enforced) ────────────────────────────
  // Manager — лише свої клієнти (agentUserId OR assignment). Admin — усі.
  const ownership = ownershipWhere(user);
  if (Object.keys(ownership).length > 0) {
    andClauses.push(ownership);
  }

  const where: Prisma.MgrClientWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {};

  const [total, items] = await Promise.all([
    prisma.mgrClient.count({ where }),
    prisma.mgrClient.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        statusGeneral: true,
        statusOperational: true,
        searchChannel: true,
        deliveryMethod: true,
        agent: { select: { id: true, fullName: true } },
        assignments: {
          include: {
            user: { select: { id: true, fullName: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    items: items.map((c) => ({
      id: c.id,
      code1C: c.code1C,
      name: c.name,
      phonePrimary: c.phonePrimary,
      city: c.city,
      region: c.region,
      debt: c.debt.toString(),
      overdueDebt: c.overdueDebt.toString(),
      daysSinceLastPurchase: c.daysSinceLastPurchase,
      lastPurchaseAt: c.lastPurchaseAt,
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
      agent: c.agent ? { id: c.agent.id, fullName: c.agent.fullName } : null,
      assignedManager: c.assignments[0]?.user
        ? {
            id: c.assignments[0].user.id,
            fullName: c.assignments[0].user.fullName,
          }
        : null,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = mgrClientCreateSchema.safeParse(body);
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

  if (data.agentUserId && user.role !== "admin") {
    return NextResponse.json(
      { error: "Тільки адміністратор може призначати торгового агента" },
      { status: 403 },
    );
  }

  const createData: Prisma.MgrClientCreateInput = {
    name: data.name,
    code1C: data.code1C || null,
    phonePrimary: data.phonePrimary || null,
    tradePointName: data.tradePointName || null,
    region: data.region || null,
    city: data.city || null,
  };

  if (data.priceTypeId) {
    createData.priceType = { connect: { id: data.priceTypeId } };
  }
  // Якщо admin не призначив агента — за замовчуванням сам non-admin creator стає
  // власником клієнта (інакше manager не побачить власного нового клієнта).
  const agentId =
    data.agentUserId ?? (user.role !== "admin" ? user.id : undefined);
  if (agentId) {
    createData.agent = { connect: { id: agentId } };
  }

  try {
    const created = await prisma.mgrClient.create({
      data: createData,
      include: {
        statusGeneral: true,
        statusOperational: true,
        categoryTT: true,
        searchChannel: true,
        deliveryMethod: true,
        priceType: true,
        primaryAssortment: true,
        primaryRoute: true,
        agent: true,
      },
    });

    // М3.5 — best-effort sync до 1С (mock або real залежно від SYNC_MOCK_MODE).
    enqueueClientUpdate(created, "create").catch((e: unknown) => {
      console.warn("[L-TEX] Failed to enqueue new-client sync", {
        clientId: created.id,
        error: e instanceof Error ? e.message : String(e),
      });
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: "Клієнт з таким code1C вже існує" },
          { status: 409 },
        );
      }
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невірне значення довідника" },
          { status: 400 },
        );
      }
    }
    throw err;
  }
}
