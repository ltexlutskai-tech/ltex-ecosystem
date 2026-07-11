import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getReservedBagsForOrder } from "@/lib/manager/route-sheet-loading";

/**
 * GET /api/v1/manager/route-sheets/[id]/reserved-bags?orderId=
 *
 * Список заброньованих мішків на клієнта замовлення (для кнопки «Додати
 * заброньовані» на екрані складу). Працівник обирає мішок зі списку і вантажить
 * без скану. Деталі мішка — як у прайсі (ШК, вага, к-сть, відео, сектор, комент).
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
  const orderId = new URL(req.url).searchParams.get("orderId")?.trim() ?? "";
  if (!orderId) {
    return NextResponse.json({ error: "Не вказано orderId" }, { status: 400 });
  }

  const bags = await getReservedBagsForOrder(id, orderId, new Date());
  return NextResponse.json({ bags });
}
