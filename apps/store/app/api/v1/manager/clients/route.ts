import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { listQuerySchema } from "@/lib/validations/manager-clients";

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

  if (q.search) {
    const term = q.search;
    andClauses.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { phonePrimary: { contains: term } },
        { city: { contains: term, mode: "insensitive" } },
        { phones: { some: { phone: { contains: term } } } },
      ],
    });
  }
  if (q.status) andClauses.push({ statusGeneral: { code: q.status } });
  if (q.channel) andClauses.push({ searchChannel: { code: q.channel } });
  if (q.deliveryMethod) {
    andClauses.push({ deliveryMethod: { code: q.deliveryMethod } });
  }
  if (q.hasDebt) andClauses.push({ debt: { gt: 0 } });
  if (q.hasOverpayment) andClauses.push({ debt: { lt: 0 } });
  if (q.onlyMine) {
    andClauses.push({ assignments: { some: { userId: user.id } } });
  }
  if (q.hideTrash) {
    for (const prefix of TRASH_NAME_PREFIXES) {
      andClauses.push({ NOT: { name: { startsWith: prefix } } });
    }
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
