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

const bodySchema = z.object({
  npCityRef: z.string().min(1).max(120),
  npCityName: z.string().max(160).nullable().optional(),
  npWarehouseRef: z.string().min(1).max(120),
  npWarehouseName: z.string().max(200).nullable().optional(),
});

/**
 * POST /api/v1/manager/warehouse-tasks/[id]/recipient-warehouse
 *
 * Склад змінює відділення-отримувача НП прямо при підготовці (напр. коли через
 * «ручну обробку» потрібне вантажне відділення). Оновлює реф-и отримувача у
 * реалізації і одразу оновлює ТТН у Новій Пошті (працює, поки ТТН — «Чернетка»;
 * якщо ТТН уже в дорозі — НП відхилить, повертаємо помилку).
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
      { error: "Оберіть місто й відділення НП" },
      { status: 400 },
    );
  }

  const task = await prisma.warehouseTask.findUnique({
    where: { id },
    select: {
      saleId: true,
      seats: {
        orderBy: { position: "asc" },
        select: {
          weight: true,
          lengthCm: true,
          widthCm: true,
          heightCm: true,
          manualHandling: true,
        },
      },
    },
  });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }

  // Оновлюємо отримувача у реалізації.
  await prisma.sale.update({
    where: { id: task.saleId },
    data: {
      npCityRef: parsed.data.npCityRef,
      npCityName: parsed.data.npCityName ?? null,
      npWarehouseRef: parsed.data.npWarehouseRef,
      npWarehouseName: parsed.data.npWarehouseName ?? null,
      // Знімок відділення у завданні складу — для показу без запиту.
    },
  });
  await prisma.warehouseTask.updateMany({
    where: { saleId: task.saleId },
    data: {
      novaPoshtaBranch:
        parsed.data.npWarehouseName ?? parsed.data.npWarehouseRef,
    },
  });

  // Оновлюємо ТТН новим відділенням (best-effort — повертаємо результат).
  const seats: SeatDims[] = task.seats.map((s) => ({
    weight: s.weight,
    lengthCm: s.lengthCm,
    widthCm: s.widthCm,
    heightCm: s.heightCm,
    manualHandling: s.manualHandling,
  }));
  const ttn = await updateTtnForSale(task.saleId, seats);

  revalidatePath(`/manager/warehouse-tasks/${id}`);
  return NextResponse.json({ ok: true, ttn });
}
