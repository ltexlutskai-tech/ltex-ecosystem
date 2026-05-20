import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { lotPatchSchema, pickEditableLotData } from "@/lib/manager/lot-edit";

/**
 * Manager «Прайс» — Stage 3a lot card endpoint.
 *
 * GET  — детальна картка лоту (товар-власник + штрих-коди + менеджерські поля
 *        + бронь-дисплей). Лише читання.
 * PATCH — оновлює ЛИШЕ менеджерські поля (сектор / відкрито / коментар / опис
 *         / ціль / дата відео). Поля з 1С (вага/залишок/статус/штрихкод/дата
 *         приходу/ціна/відео-URL) ІГНОРУЮТЬСЯ — `pickEditableLotData` лишає
 *         тільки whitelist. Auth: будь-який залогінений менеджер.
 */

const lotInclude = {
  product: { select: { id: true, name: true, slug: true } },
  barcodes: { select: { id: true, code: true, type: true } },
} satisfies Prisma.LotInclude;

type LoadedLot = Prisma.LotGetPayload<{ include: typeof lotInclude }>;

function serializeLot(lot: LoadedLot) {
  // Штрих-коди: окрема таблиця Barcode (їх може бути кілька) + основний
  // Lot.barcode. Основний завжди першим, без дублів.
  const extraCodes = lot.barcodes
    .filter((b) => b.code !== lot.barcode)
    .map((b) => ({ id: b.id, code: b.code, type: b.type }));
  const barcodes = [
    { id: "primary", code: lot.barcode, type: "EAN13" },
    ...extraCodes,
  ];

  return {
    id: lot.id,
    product: {
      id: lot.product.id,
      name: lot.product.name,
      slug: lot.product.slug,
    },
    // ── read-only (дані з 1С) ──
    barcode: lot.barcode,
    barcodes,
    weight: lot.weight,
    quantity: lot.quantity,
    status: lot.status,
    priceEur: lot.priceEur,
    videoUrl: lot.videoUrl,
    arrivalIso: (lot.arrivalDate ?? lot.createdAt).toISOString(),
    // ── менеджерські (редаговані) ──
    sector: lot.sector,
    isOpen: lot.isOpen,
    comment: lot.comment,
    description: lot.description,
    isTarget: lot.isTarget,
    videoDateIso: lot.videoDate ? lot.videoDate.toISOString() : null,
    // ── бронь (лише ПОКАЗ; дію бронювання — Етап 4) ──
    reservation: {
      isReserved: lot.status === "reserved",
      // Поля reserved* (на кого / до якої дати) з'являться у Етапі 4.
      reservedForClient: null as string | null,
      reservedUntilIso: null as string | null,
    },
  };
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

  return NextResponse.json({ lot: serializeLot(lot) });
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
    return NextResponse.json({ lot: serializeLot(updated) });
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
