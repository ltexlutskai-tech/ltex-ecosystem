import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  updateTtnForSale,
  type SeatDims,
} from "@/lib/delivery/create-ttn-for-sale";

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

const seatSchema = z.object({
  weight: z.number().nonnegative().max(2000),
  lengthCm: z.number().nonnegative().max(1000),
  widthCm: z.number().nonnegative().max(1000),
  heightCm: z.number().nonnegative().max(1000),
  note: z.string().max(200).nullable().optional(),
});

const bodySchema = z.object({
  seats: z.array(seatSchema).max(100),
});

/**
 * POST /api/v1/manager/warehouse-tasks/[id]/seats
 *
 * Склад задає ФАКТИЧНІ місця відправлення (мініпалета/палета/коробка) з вагою й
 * габаритами. Замінює всі місця завдання й одразу оновлює ТТН у Новій Пошті
 * (`InternetDocument.update`: SeatsAmount + OptionsSeat). Повертає результат
 * оновлення ТТН, щоб UI показав нову вагу/номер або помилку.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!WAREHOUSE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані місць", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const task = await prisma.warehouseTask.findUnique({
    where: { id },
    select: { id: true, saleId: true },
  });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }

  const seats: SeatDims[] = parsed.data.seats.map((s) => ({
    weight: s.weight,
    lengthCm: s.lengthCm,
    widthCm: s.widthCm,
    heightCm: s.heightCm,
  }));

  // Заміна місць (replace-all) у транзакції.
  await prisma.$transaction([
    prisma.warehouseTaskSeat.deleteMany({ where: { taskId: id } }),
    prisma.warehouseTaskSeat.createMany({
      data: parsed.data.seats.map((s, i) => ({
        taskId: id,
        position: i,
        weight: s.weight,
        lengthCm: s.lengthCm,
        widthCm: s.widthCm,
        heightCm: s.heightCm,
        note: s.note ?? null,
      })),
    }),
  ]);

  // Оновлюємо ТТН фактичними місцями (best-effort — повертаємо результат).
  const ttn = await updateTtnForSale(task.saleId, seats);

  revalidatePath(`/manager/warehouse-tasks/${id}`);
  return NextResponse.json({ ok: true, ttn });
}
