import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getProductClaims } from "@/lib/manager/product-claims";

/**
 * GET /api/v1/manager/products/[id]/active-claims
 *
 * Сумарна кількість активних замовлень («претензій») по товару + перелік
 * замовлень з менеджерами/клієнтами. Використовується у картці товару у
 * Прайсі (`/manager/prices/[id]`), у списку Прайсу та у формі створення
 * замовлення, щоб менеджери розуміли хто і на яку кількість претендує
 * (← аналог 1С-мобільного «кількість замовлених лотів»).
 *
 * «Активне» = статус НЕ posted/cancelled/delivered AND archived = false.
 * Деталі — див. `lib/manager/product-claims.ts`.
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
  const claims = await getProductClaims(id, user.id);
  return NextResponse.json(claims);
}
