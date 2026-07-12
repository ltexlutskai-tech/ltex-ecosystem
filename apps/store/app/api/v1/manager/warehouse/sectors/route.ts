import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { generateSectorBarcode } from "@/lib/warehouse/sector-barcode";

/**
 * GET  /api/v1/manager/warehouse/sectors[?q=&warehouseId=]
 * POST /api/v1/manager/warehouse/sectors  { name, warehouseId? }
 *
 * Довідник секторів складу (Хвиля 2 правок). Використовується як autocomplete
 * у формі поступлення. Авто-створення: якщо при збереженні рядка надходить
 * sector який ще не існує — створюємо запис тут (через окремий виклик POST).
 *
 * Аналог 1С довідника `Сектори` (InformationRegisters/Сектори.xml).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const warehouseId = url.searchParams.get("warehouseId") ?? undefined;

  const where: Record<string, unknown> = { isActive: true };
  if (warehouseId) {
    where.OR = [{ warehouseId }, { warehouseId: null }];
  }
  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }

  const sectors = await prisma.warehouseSector.findMany({
    where,
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      warehouseId: true,
      barcode: true,
    },
  });
  return NextResponse.json({ items: sectors });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
  warehouseId: z.string().optional().nullable(),
  // Власний ШК (скан наявної етикетки). Порожньо → згенерувати автоматично.
  barcode: z.string().trim().max(64).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (
    user.role !== "admin" &&
    user.role !== "owner" &&
    user.role !== "warehouse"
  ) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }
  // Idempotent: повертаємо існуючий якщо є (та добираємо ШК, якщо його бракує).
  const existing = await prisma.warehouseSector.findFirst({
    where: {
      name: parsed.data.name,
      warehouseId: parsed.data.warehouseId ?? null,
    },
  });
  if (existing) {
    if (!existing.barcode) {
      const barcode = parsed.data.barcode || (await generateSectorBarcode());
      const updated = await prisma.warehouseSector
        .update({ where: { id: existing.id }, data: { barcode } })
        .catch(() => existing);
      return NextResponse.json({ sector: updated });
    }
    return NextResponse.json({ sector: existing });
  }
  // Новий сектор — власний ШК або авто-генерація (з повтором на випадок гонки).
  const wantBarcode = parsed.data.barcode || null;
  let created = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const barcode = wantBarcode || (await generateSectorBarcode());
    created = await prisma.warehouseSector
      .create({
        data: {
          name: parsed.data.name,
          warehouseId: parsed.data.warehouseId ?? null,
          barcode,
        },
      })
      .catch(() => null);
    if (wantBarcode) break; // власний ШК не перегенеровуємо
  }
  if (!created)
    return NextResponse.json(
      { error: "Не вдалося створити сектор (ШК зайнятий)" },
      { status: 409 },
    );
  return NextResponse.json({ sector: created }, { status: 201 });
}
