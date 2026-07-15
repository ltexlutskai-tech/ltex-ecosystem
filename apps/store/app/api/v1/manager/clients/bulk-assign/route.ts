import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { bulkAssignSchema } from "@/lib/validations/manager-clients";

/**
 * POST — групова зміна менеджера для кількох клієнтів одразу (аналог «групової
 * обробки» в 1С). Лише admin. `userId=null` знімає прив'язку. Дзеркалить логіку
 * одиничного `/clients/[id]/assign`, але у транзакції по всіх обраних клієнтах.
 */
export async function POST(req: NextRequest) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bulkAssignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const { clientIds, userId } = parsed.data;

  // Лишаємо тільки реально наявних клієнтів (ігноруємо неіснуючі id).
  const existing = await prisma.mgrClient.findMany({
    where: { id: { in: clientIds } },
    select: { id: true },
  });
  const ids = existing.map((c) => c.id);
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Жодного клієнта не знайдено" },
      { status: 404 },
    );
  }

  if (userId === null) {
    await prisma.clientAssignment.deleteMany({
      where: { customerId: { in: ids } },
    });
    return NextResponse.json({ updated: ids.length, assignedManager: null });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, isActive: true },
  });
  if (!targetUser || !targetUser.isActive) {
    return NextResponse.json(
      { error: "Користувача не знайдено або неактивний" },
      { status: 404 },
    );
  }

  await prisma.$transaction([
    prisma.clientAssignment.deleteMany({ where: { customerId: { in: ids } } }),
    prisma.clientAssignment.createMany({
      data: ids.map((customerId) => ({ userId, customerId })),
    }),
  ]);

  return NextResponse.json({
    updated: ids.length,
    assignedManager: { id: targetUser.id, fullName: targetUser.fullName },
  });
}
