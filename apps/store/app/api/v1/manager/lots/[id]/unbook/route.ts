import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canRemoveReservation } from "@/lib/manager/lot-booking";
import {
  lotCardInclude,
  serializeLotCard,
} from "@/lib/manager/lot-card-serialize";

/**
 * Manager «Прайс» — Stage 4: POST /api/v1/manager/lots/[id]/unbook.
 *
 * Знімає/вилучає бронь. Дозволено лише менеджеру, вказаному у броні
 * (`reservedByUserId`, включно з протермінованою — щоб чистити хвости), та
 * admin/owner (будь-чию). Іншим — 403. Очищає reserved* + status="free".
 * Лишає запис у timeline клієнта про зняття броні (у тій самій транзакції).
 */

const ADMIN_ROLES = ["admin", "owner"];

const lotInclude = lotCardInclude;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const lot = await prisma.lot.findUnique({ where: { id } });
  if (!lot) {
    return NextResponse.json({ error: "Лот не знайдено" }, { status: 404 });
  }

  const now = new Date();

  // Вилучити бронь може лише менеджер, вказаний у броні, або admin/owner.
  if (
    !canRemoveReservation(
      {
        status: lot.status,
        reservedByUserId: lot.reservedByUserId,
        reservedForClientId: lot.reservedForClientId,
        reservedForName: lot.reservedForName,
        reservedUntil: lot.reservedUntil,
      },
      { id: user.id, isAdmin: ADMIN_ROLES.includes(user.role) },
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Вилучити бронь може лише менеджер, вказаний у броні, або адміністратор",
      },
      { status: 403 },
    );
  }

  const clientId = lot.reservedForClientId;
  const reservedForName = lot.reservedForName;

  const updated = await prisma.$transaction(async (tx) => {
    const lotUpdated = await tx.lot.update({
      where: { id },
      data: {
        status: "free",
        reservedForClientId: null,
        reservedForName: null,
        reservedByUserId: null,
        reservedByName: null,
        reservedUntil: null,
      },
      include: lotInclude,
    });

    if (clientId) {
      await tx.mgrClientTimelineEntry.create({
        data: {
          clientId,
          kind: "lot_booking",
          body: `Знято бронь лоту ${lot.barcode}${
            reservedForName ? ` (${reservedForName})` : ""
          }.`,
          occurredAt: now,
          authorUserId: user.id,
          metadata: { lotId: lot.id, barcode: lot.barcode, action: "unbook" },
        },
      });
    }

    return lotUpdated;
  });

  return NextResponse.json({ lot: serializeLotCard(updated, user.id, now) });
}
