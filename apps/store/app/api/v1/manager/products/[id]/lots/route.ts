import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/products/[id]/lots — вільні лоти для product.
 *
 * Used у UI form створення замовлення (item-row z lot-bound option).
 * Filter: status='free' (вільні лоти, не зарезервовані і не продані).
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

  const lots = await prisma.lot.findMany({
    where: { productId: id, status: "free" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      barcode: true,
      weight: true,
      quantity: true,
      priceEur: true,
      status: true,
    },
  });

  return NextResponse.json({ items: lots });
}
