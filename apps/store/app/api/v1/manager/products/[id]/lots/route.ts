import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/products/[id]/lots — вільні лоти для product.
 *
 * Used у UI form створення замовлення (item-row z lot-bound option) та у
 * підборі лотів для реалізації (двокроковий picker).
 * Filter: status='free' (вільні лоти, не зарезервовані і не продані).
 *
 * Опційний `?q=` (additive): фільтрує вільні лоти за частковим штрихкодом АБО
 * за вагою (числовий збіг по `weight`). Якщо `q` не передано — поведінка
 * незмінна (усі вільні лоти). Endpoint спільний із замовленнями, тож без `q`
 * нічого не змінюється.
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

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

  const where: Prisma.LotWhereInput = { productId: id, status: "free" };
  if (q) {
    const or: Prisma.LotWhereInput[] = [
      { barcode: { contains: q, mode: "insensitive" } },
    ];
    // Числовий ввід «20» / «20.5» — додаємо збіг за вагою (точний/у діапазоні
    // округлення до 1 кг, щоб «20» зловило 19.8–20.4).
    const num = Number(q.replace(",", "."));
    if (Number.isFinite(num) && num > 0) {
      or.push({ weight: { gte: num - 0.5, lt: num + 0.5 } });
    }
    where.OR = or;
  }

  const lots = await prisma.lot.findMany({
    where,
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
