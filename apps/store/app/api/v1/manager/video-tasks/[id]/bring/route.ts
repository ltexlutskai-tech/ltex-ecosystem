import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { bringVideoTaskSchema } from "@/lib/validations/video-task";
import { isActiveReservation } from "@/lib/manager/lot-booking";

/**
 * POST /api/v1/manager/video-tasks/[id]/bring
 *
 * Склад приносить мішок для відеозйомки. Обирає конкретний лот (`lotId`/
 * `barcode`) АБО — якщо нічого не передано — система бере рандомний вільний лот
 * товару. Лот прикріплюється до завдання, статус → `filming` (мішок у відеозоні).
 * Гейт: склад / admin / owner.
 */

const BRING_ROLES = ["warehouse", "admin", "owner"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!BRING_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = bringVideoTaskSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  const task = await prisma.mgrVideoTask.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }
  if (task.status !== "new") {
    return NextResponse.json({ error: "Мішок уже принесено" }, { status: 409 });
  }

  const now = new Date();

  // Знайти лот: за ШК / lotId, або рандомний вільний лот товару.
  let lot: {
    id: string;
    barcode: string;
    productId: string;
    weight: number;
    status: string;
    reservedByUserId: string | null;
    reservedUntil: Date | null;
  } | null = null;

  // ШК/lotId беремо ЛИШЕ якщо склад передав явно (пре-заповнений
  // `requestedBarcode` — це підказка в UI, а не примус: «Взяти будь-який»
  // має брати рандом навіть коли менеджер просив конкретний мішок).
  if (parsed.data.lotId) {
    lot = await prisma.lot.findUnique({ where: { id: parsed.data.lotId } });
  } else if (parsed.data.barcode) {
    lot = await prisma.lot.findFirst({
      where: { barcode: parsed.data.barcode },
    });
  } else {
    // Рандомний вільний лот товару (без активної броні).
    const candidates = await prisma.lot.findMany({
      where: {
        productId: task.productId,
        status: "free",
        OR: [{ reservedUntil: null }, { reservedUntil: { lt: now } }],
      },
      take: 20,
      orderBy: { createdAt: "asc" },
    });
    lot = candidates.length > 0 ? candidates[0]! : null;
  }

  if (!lot) {
    return NextResponse.json(
      { error: "Вільний мішок цього товару не знайдено" },
      { status: 404 },
    );
  }
  if (lot.productId !== task.productId) {
    return NextResponse.json(
      { error: "Мішок належить іншому товару" },
      { status: 409 },
    );
  }
  if (
    isActiveReservation(
      {
        status: lot.status,
        reservedByUserId: lot.reservedByUserId,
        reservedUntil: lot.reservedUntil,
      },
      now,
    )
  ) {
    return NextResponse.json({ error: "Мішок заброньовано" }, { status: 409 });
  }

  await prisma.mgrVideoTask.update({
    where: { id },
    data: {
      status: "filming",
      lotId: lot.id,
      barcode: lot.barcode,
      lotWeightKg: task.lotWeightKg ?? lot.weight,
      broughtAt: now,
      broughtByUserId: user.id,
      broughtByName: user.fullName,
    },
  });

  return NextResponse.json({ ok: true, barcode: lot.barcode });
}
