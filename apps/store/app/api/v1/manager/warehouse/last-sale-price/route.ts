import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/warehouse/last-sale-price?productId=...
 *
 * Повертає поточну продажну ціну (priceType='wholesale') для товару — для
 * автопідстановки у форму поступлення (правки 2026-06-05).
 *
 * Доступ: admin/owner (warehouse не бачить ціни взагалі).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "owner") {
    return NextResponse.json({ price: null });
  }
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? "";
  if (!productId) {
    return NextResponse.json({ price: null });
  }
  const price = await prisma.price.findFirst({
    where: {
      productId,
      priceType: "wholesale",
      OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
    },
    orderBy: { validFrom: "desc" },
    select: { amount: true, validFrom: true },
  });
  if (!price) return NextResponse.json({ price: null });
  return NextResponse.json({
    price: price.amount,
    validFrom: price.validFrom,
  });
}
