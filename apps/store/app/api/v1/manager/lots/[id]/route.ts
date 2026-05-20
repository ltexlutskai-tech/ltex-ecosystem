import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { lotPatchSchema, pickEditableLotData } from "@/lib/manager/lot-edit";
import {
  serializeLotCard,
  type LotCardSource,
} from "@/lib/manager/lot-card-serialize";

/**
 * Manager «Прайс» — Stage 3a lot card endpoint (+ бронь-поля у GET, Етап 4).
 *
 * GET  — детальна картка лоту (товар-власник + штрих-коди + менеджерські поля
 *        + бронь: на кого / до якої дати / isMine / isActive). Лише читання.
 * PATCH — оновлює ЛИШЕ менеджерські поля (сектор / відкрито / коментар / опис
 *         / ціль / дата відео). Поля з 1С (вага/залишок/статус/штрихкод/дата
 *         приходу/ціна/відео-URL) ІГНОРУЮТЬСЯ — `pickEditableLotData` лишає
 *         тільки whitelist. Дію бронювання — окремі /book + /unbook. Auth:
 *         будь-який залогінений менеджер.
 */

const lotInclude = {
  product: { select: { id: true, name: true, slug: true } },
  barcodes: { select: { id: true, code: true, type: true } },
} satisfies Prisma.LotInclude;

function serializeLot(lot: LotCardSource, viewerUserId: string, now: Date) {
  return serializeLotCard(lot, viewerUserId, now);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const lot = await prisma.lot.findUnique({
    where: { id },
    include: lotInclude,
  });

  if (!lot) {
    return NextResponse.json({ error: "Лот не знайдено" }, { status: 404 });
  }

  return NextResponse.json({ lot: serializeLot(lot, user.id, new Date()) });
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

  const body = await req.json().catch(() => null);
  const parsed = lotPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  // Whitelist: лишаємо тільки менеджерські поля. weight/quantity/status/
  // barcode/arrivalDate/priceEur/videoUrl — фізично неможливо записати.
  const data = pickEditableLotData(parsed.data);

  try {
    const updated = await prisma.lot.update({
      where: { id },
      data,
      include: lotInclude,
    });
    return NextResponse.json({
      lot: serializeLot(updated, user.id, new Date()),
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Лот не знайдено" }, { status: 404 });
    }
    throw err;
  }
}
