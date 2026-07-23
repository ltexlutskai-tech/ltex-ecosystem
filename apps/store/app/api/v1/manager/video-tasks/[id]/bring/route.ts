import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { bringVideoTaskSchema } from "@/lib/validations/video-task";
import { isActiveReservation } from "@/lib/manager/lot-booking";
import { endOfTomorrow, videoReservationData } from "@/lib/manager/video-task";
import { buildBronEventBody } from "@/lib/manager/client-timeline";

/**
 * POST /api/v1/manager/video-tasks/[id]/bring
 *
 * Склад фізично бере будь-який вільний мішок цього товару й СКАНУЄ його штрихкод
 * (система не диктує, який мішок брати). Лот прикріплюється до завдання, статус →
 * `filming`, і лот ОДРАЗУ бронюється на клієнта завдання до 23:59 наступного дня
 * (щоб його не продали, поки відеозона знімає). Відеозона далі бачить конкретне
 * завдання по конкретному лоту. Гейт: склад / admin / owner.
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
  // Мішок треба саме відсканувати (ШК) або обрати конкретний лот — «навмання»
  // склад не передає, бере фізично будь-який і сканує.
  if (!parsed.data.barcode && !parsed.data.lotId) {
    return NextResponse.json(
      { error: "Відскануйте штрихкод мішка" },
      { status: 400 },
    );
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

  const lot = parsed.data.lotId
    ? await prisma.lot.findUnique({ where: { id: parsed.data.lotId } })
    : await prisma.lot.findFirst({ where: { barcode: parsed.data.barcode } });

  if (!lot) {
    return NextResponse.json({ error: "Мішок не знайдено" }, { status: 404 });
  }
  if (lot.productId !== task.productId) {
    return NextResponse.json(
      { error: "Цей мішок належить іншому товару" },
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
    return NextResponse.json(
      {
        error: lot.reservedForName
          ? `Мішок заброньовано (${lot.reservedForName})`
          : "Мішок заброньовано",
      },
      { status: 409 },
    );
  }

  const until = endOfTomorrow(now);

  await prisma.$transaction(async (tx) => {
    // Прикріпити лот до завдання + перевести у зйомку + зафіксувати ваги/склад.
    await tx.mgrVideoTask.update({
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

    // Одразу забронювати лот на клієнта завдання (до 23:59 наступного дня).
    await tx.lot.update({
      where: { id: lot.id },
      data: videoReservationData(task, until),
    });

    if (task.clientId) {
      await tx.mgrClientTimelineEntry.create({
        data: {
          clientId: task.clientId,
          kind: "bron",
          body: buildBronEventBody(lot.barcode, until),
          occurredAt: now,
          authorUserId: user.id,
          metadata: {
            lotId: lot.id,
            barcode: lot.barcode,
            weight: lot.weight,
            reservedUntil: until.toISOString(),
            videoTaskId: task.id,
          },
        },
      });
    }
  });

  return NextResponse.json({ ok: true, barcode: lot.barcode });
}
