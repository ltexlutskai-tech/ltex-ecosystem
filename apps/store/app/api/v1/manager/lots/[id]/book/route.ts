import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { bookLotSchema, canBook } from "@/lib/manager/lot-booking";
import {
  lotCardInclude,
  serializeLotCard,
} from "@/lib/manager/lot-card-serialize";

/**
 * Manager «Прайс» — Stage 4: POST /api/v1/manager/lots/[id]/book.
 *
 * Бронює лот на клієнта (MgrClient) до вказаної дати. Перевірки:
 *  • auth (будь-який залогінений менеджер);
 *  • Zod (clientId + until ≥ сьогодні);
 *  • лот існує (404);
 *  • лот вільний АБО з протермінованою бронню (інакше 409 «зайнятий чужою/
 *    активною бронню»);
 *  • клієнт існує (404).
 *
 * Транзакція: оновити Lot (reserved* + reservedByUserId/Name = поточний user +
 * status="reserved") + додати запис у timeline клієнта. Денормалізуємо імена
 * (без FK) — як 1С зберігає бронь рядком.
 */

const lotInclude = lotCardInclude;

function formatDateUkr(d: Date): string {
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = bookLotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const lot = await prisma.lot.findUnique({ where: { id } });
  if (!lot) {
    return NextResponse.json({ error: "Лот не знайдено" }, { status: 404 });
  }

  const now = new Date();

  // Лот зайнятий активною (ще діючою) бронню — перебронювати не можна.
  if (
    !canBook(
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
          ? `Лот уже заброньовано (${lot.reservedForName})`
          : "Лот уже заброньовано",
      },
      { status: 409 },
    );
  }

  const client = await prisma.mgrClient.findUnique({
    where: { id: parsed.data.clientId },
    select: { id: true, name: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const until = new Date(parsed.data.until);

  const updated = await prisma.$transaction(async (tx) => {
    const lotUpdated = await tx.lot.update({
      where: { id },
      data: {
        status: "reserved",
        reservedForClientId: client.id,
        reservedForName: client.name,
        reservedByUserId: user.id,
        reservedByName: user.fullName,
        reservedUntil: until,
      },
      include: lotInclude,
    });

    await tx.mgrClientTimelineEntry.create({
      data: {
        clientId: client.id,
        kind: "lot_booking",
        body: `Бронь лоту ${lot.barcode}, вага ${lot.weight} кг, до ${formatDateUkr(until)}.`,
        occurredAt: now,
        authorUserId: user.id,
        metadata: {
          lotId: lot.id,
          barcode: lot.barcode,
          weight: lot.weight,
          reservedUntil: until.toISOString(),
        },
      },
    });

    return lotUpdated;
  });

  return NextResponse.json({ lot: serializeLotCard(updated, user.id, now) });
}
