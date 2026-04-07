import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { mobileFavoriteSchema } from "@/lib/validations";

/**
 * GET /api/mobile/favorites?customerId=xxx
 * Returns list of favorited products.
 *
 * POST /api/mobile/favorites — add to favorites
 * Body: { customerId, productId }
 *
 * DELETE /api/mobile/favorites — remove from favorites
 * Body: { customerId, productId }
 */
export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  const favorites = await prisma.favorite.findMany({
    where: { customerId },
    include: {
      product: {
        include: {
          images: { take: 1, orderBy: { position: "asc" } },
          prices: { where: { priceType: "wholesale" }, take: 1 },
          _count: { select: { lots: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    favorites: favorites.map((f) => ({
      id: f.id,
      productId: f.productId,
      addedAt: f.createdAt,
      product: {
        id: f.product.id,
        name: f.product.name,
        slug: f.product.slug,
        quality: f.product.quality,
        priceUnit: f.product.priceUnit,
        videoUrl: f.product.videoUrl,
        imageUrl: f.product.images[0]?.url ?? null,
        price: f.product.prices[0]?.amount ?? null,
        lotCount: f.product._count.lots,
      },
    })),
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mobileFavoriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Невірні дані" }, { status: 400 });
  }
  const { customerId, productId } = parsed.data;

  const favorite = await prisma.favorite.upsert({
    where: { customerId_productId: { customerId, productId } },
    create: { customerId, productId },
    update: {},
  });

  return NextResponse.json({ id: favorite.id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mobileFavoriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Невірні дані" }, { status: 400 });
  }
  const { customerId, productId } = parsed.data;

  await prisma.favorite.deleteMany({ where: { customerId, productId } });
  return NextResponse.json({ success: true });
}
