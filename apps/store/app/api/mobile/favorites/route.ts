import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { mobileFavoriteSchema } from "@/lib/validations";
import { requireMobileSession } from "@/lib/mobile-auth";
import {
  mapMobileProduct,
  mobileProductInclude,
} from "@/lib/mobile-product-shape";

/**
 * Mobile wishlist/favorites. customerId is always derived from the bearer token.
 *
 * GET    /api/mobile/favorites                 — list favorited products
 * POST   /api/mobile/favorites  { productId }  — add to favorites
 * DELETE /api/mobile/favorites  { productId }  — remove from favorites
 */
export async function GET(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  const favorites = await prisma.favorite.findMany({
    where: { customerId },
    include: { product: { include: mobileProductInclude } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    favorites: favorites.map((f) => ({
      id: f.id,
      productId: f.productId,
      addedAt: f.createdAt,
      product: mapMobileProduct(f.product),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mobileFavoriteSchema.safeParse({
    ...(body as Record<string, unknown>),
    customerId,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const { productId } = parsed.data;

  const favorite = await prisma.favorite.upsert({
    where: { customerId_productId: { customerId, productId } },
    create: { customerId, productId },
    update: {},
  });

  return NextResponse.json({ id: favorite.id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = mobileFavoriteSchema.safeParse({
    ...(body as Record<string, unknown>),
    customerId,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const { productId } = parsed.data;

  await prisma.favorite.deleteMany({ where: { customerId, productId } });
  return NextResponse.json({ success: true });
}
