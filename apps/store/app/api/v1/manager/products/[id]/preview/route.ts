import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { computeStockSummaryByProduct } from "@/lib/manager/product-stock-summary";

/**
 * GET /api/v1/manager/products/[id]/preview
 *
 * Дані для «швидкого перегляду» товару у вікні підбору: фото, опис,
 * характеристики, ціни та складський залишок (вільні лоти: кг/шт/лотів).
 * Тільки читання — повний перегляд/редагування у картці `/manager/prices/[id]`.
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

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      code1C: true,
      articleCode: true,
      name: true,
      slug: true,
      description: true,
      priceUnit: true,
      averageWeight: true,
      quality: true,
      season: true,
      country: true,
      gender: true,
      sizes: true,
      producer: true,
      unitsPerKg: true,
      unitWeight: true,
      videoUrl: true,
      images: {
        orderBy: { position: "asc" },
        take: 8,
        select: { url: true, alt: true },
      },
      prices: {
        // Лише актуальні ціни (без історії): validTo == null, найсвіжіші першими.
        where: { validTo: null },
        orderBy: { validFrom: "desc" },
        select: { priceType: true, amount: true, currency: true },
      },
    },
  });
  if (!product) {
    return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });
  }

  // Дедуп: одна (найсвіжіша) актуальна ціна на кожен тип.
  const seenTypes = new Set<string>();
  const currentPrices = product.prices.filter((pr) => {
    if (seenTypes.has(pr.priceType)) return false;
    seenTypes.add(pr.priceType);
    return true;
  });
  // Ефективна ціна продажу: акція → опт (wholesale) → перша актуальна. Менеджеру
  // показуємо саме її (як і дефолт у підборі), без історичної «полотнини» цін.
  const effectivePrice =
    currentPrices.find((p) => p.priceType === "akciya") ??
    currentPrices.find((p) => p.priceType === "wholesale") ??
    currentPrices[0] ??
    null;

  const stockMap = await computeStockSummaryByProduct([product.id]);
  const stock = stockMap.get(product.id) ?? {
    lots: 0,
    weightKg: 0,
    quantityPcs: 0,
  };

  return NextResponse.json({
    id: product.id,
    code1C: product.code1C,
    articleCode: product.articleCode,
    name: product.name,
    slug: product.slug,
    description: product.description,
    priceUnit: product.priceUnit,
    averageWeight: product.averageWeight,
    videoUrl: product.videoUrl,
    characteristics: {
      quality: product.quality || null,
      season: product.season || null,
      country: product.country || null,
      gender: product.gender,
      sizes: product.sizes,
      producer: product.producer,
      unitsPerKg: product.unitsPerKg,
      unitWeight: product.unitWeight,
    },
    images: product.images.map((im) => ({ url: im.url, alt: im.alt })),
    // Одна актуальна ціна продажу для менеджера (без історії/зайвих типів).
    effectivePrice: effectivePrice
      ? {
          amount: effectivePrice.amount,
          currency: effectivePrice.currency,
          isAkciya: effectivePrice.priceType === "akciya",
        }
      : null,
    stock,
  });
}
