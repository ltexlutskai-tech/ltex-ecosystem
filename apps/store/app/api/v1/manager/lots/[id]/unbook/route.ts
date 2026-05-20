import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canUnbook } from "@/lib/manager/lot-booking";
import { serializeLotCard } from "@/lib/manager/lot-card-serialize";

/**
 * Manager «Прайс» — Stage 4: POST /api/v1/manager/lots/[id]/unbook.
 *
 * Знімає бронь. Дозволено ЛИШЕ свою активну бронь (`canUnbook`) — чужу активну
 * зняти не можна (403). Очищає reserved* + status="free". Лишає запис у timeline
 * клієнта про зняття броні (best-effort у тій самій транзакції).
 */

const lotInclude = {
  product: { select: { id: true, name: true, slug: true } },
  barcodes: { select: { id: true, code: true, type: true } },
} satisfies Prisma.LotInclude;

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

  // Зняти можна лише СВОЮ активну бронь. Чужу активну → 403.
  if (
    !canUnbook(
      {
        status: lot.status,
        reservedByUserId: lot.reservedByUserId,
        reservedUntil: lot.reservedUntil,
      },
      user.id,
      now,
    )
  ) {
    return NextResponse.json(
      { error: "Можна зняти лише власну активну бронь" },
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
