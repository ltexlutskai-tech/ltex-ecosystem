import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

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
    take: 50,
    select: {
      id: true,
      name: true,
      warehouseId: true,
    },
  });
  return NextResponse.json({ items: sectors });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
  warehouseId: z.string().optional().nullable(),
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
  // Idempotent: повертаємо існуючий якщо є
  const existing = await prisma.warehouseSector.findFirst({
    where: {
      name: parsed.data.name,
      warehouseId: parsed.data.warehouseId ?? null,
    },
  });
  if (existing) {
    return NextResponse.json({ sector: existing });
  }
  const created = await prisma.warehouseSector.create({
    data: {
      name: parsed.data.name,
      warehouseId: parsed.data.warehouseId ?? null,
    },
  });
  return NextResponse.json({ sector: created }, { status: 201 });
}
