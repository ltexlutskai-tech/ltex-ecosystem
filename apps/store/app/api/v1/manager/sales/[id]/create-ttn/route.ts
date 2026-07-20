import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canViewSale } from "@/lib/manager/sale-ownership";
import { createTtnForSale } from "@/lib/delivery/create-ttn-for-sale";

/**
 * POST /api/v1/manager/sales/[id]/create-ttn
 *
 * Ручне (повторне) створення ТТН Нової Пошти для реалізації. Використовується
 * кнопкою «Повторити», коли авто-створення при проведенні впало (Sale.ttnError).
 * Ідемпотентно: якщо ТТН уже є (`ttnRef`), нічого не робимо, повертаємо поточний
 * стан. Best-effort хук сам пише результат/помилку у Sale — ми повертаємо стан.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const ok = await canViewSale(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  await createTtnForSale(id);

  const sale = await prisma.sale.findUnique({
    where: { id },
    select: { ttnRef: true, expressWaybill: true, ttnError: true },
  });
  if (!sale) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ttnRef: sale.ttnRef,
    ttnNumber: sale.expressWaybill,
    ttnError: sale.ttnError,
    ok: Boolean(sale.ttnRef) && !sale.ttnError,
  });
}
