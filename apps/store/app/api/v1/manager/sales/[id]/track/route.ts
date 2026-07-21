import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canViewSale } from "@/lib/manager/sale-ownership";
import { trackTtn } from "@/lib/delivery/nova-poshta";

/**
 * GET /api/v1/manager/sales/[id]/track
 *
 * Статус трекінгу конкретної ТТН цієї реалізації (щоб показувати прямо в нашій
 * системі, а не відкривати сайт НП). Повертає статус + орієнтовну дату доставки.
 */
export async function GET(
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

  const sale = await prisma.sale.findUnique({
    where: { id },
    select: { expressWaybill: true },
  });
  const number = sale?.expressWaybill;
  if (!number) {
    return NextResponse.json({ error: "ТТН відсутня" }, { status: 400 });
  }

  const tracking = await trackTtn(number);
  if (!tracking) {
    return NextResponse.json(
      { error: "Не вдалося отримати статус ТТН" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    number,
    status: tracking.status,
    statusCode: tracking.statusCode,
    scheduledDeliveryDate: tracking.scheduledDeliveryDate,
    warehouseRecipient: tracking.warehouseRecipient,
  });
}
