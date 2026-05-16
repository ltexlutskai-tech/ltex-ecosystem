import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/products/search?q=...
 *
 * Autocomplete endpoint для UI form створення замовлення.
 * Search by name OR slug OR articleCode OR code1C (case-insensitive).
 *
 * Returns minimal product shape — id/name/articleCode/code1C/priceUnit/averageWeight —
 * Worker UI form використовує для item-row.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ items: [] });

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
        { articleCode: { contains: q, mode: "insensitive" } },
        { code1C: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
    select: {
      id: true,
      code1C: true,
      articleCode: true,
      name: true,
      slug: true,
      priceUnit: true,
      averageWeight: true,
      inStock: true,
    },
  });

  return NextResponse.json({
    items: products.map((p) => ({
      id: p.id,
      code1C: p.code1C,
      articleCode: p.articleCode,
      name: p.name,
      slug: p.slug,
      priceUnit: p.priceUnit,
      averageWeight: p.averageWeight,
      inStock: p.inStock,
    })),
  });
}
