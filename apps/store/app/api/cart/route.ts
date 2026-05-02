import { prisma } from "@ltex/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const cartItemSchema = z.object({
  lotId: z.string().min(1).optional(),
  productId: z.string().min(1),
  productName: z.string().optional(),
  barcode: z.string().optional(),
  priceEur: z.number().nonnegative(),
  weight: z.number().nonnegative(),
  quantity: z.number().int().positive(),
});

const cartPostSchema = z.object({
  sessionId: z.string().min(1),
  items: z.array(cartItemSchema),
});

const cartDeleteSchema = z.object({
  sessionId: z.string().min(1),
  // Either a lotId (concrete lot) or a productId-prefixed key for general items.
  key: z.string().min(1).optional(),
  // Backward-compat with old clients that send lotId directly.
  lotId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ items: [] });
  }

  try {
    const cart = await prisma.cart.findUnique({
      where: { sessionId },
      include: {
        items: {
          include: {
            product: { select: { name: true } },
            lot: { select: { barcode: true } },
          },
        },
      },
    });

    if (!cart) {
      return NextResponse.json({ items: [] });
    }

    const items = cart.items.map((item) => ({
      id: item.id,
      lotId: item.lotId ?? undefined,
      productId: item.productId,
      productName: item.product.name,
      barcode: item.lot?.barcode,
      priceEur: item.priceEur,
      weight: item.weight,
      quantity: item.quantity,
    }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Failed to load cart" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = cartPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { sessionId, items } = parsed.data;

  try {
    const cart = await prisma.cart.upsert({
      where: { sessionId },
      create: { sessionId },
      update: { updatedAt: new Date() },
    });

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    if (items.length > 0) {
      await prisma.cartItem.createMany({
        data: items.map((item) => ({
          cartId: cart.id,
          lotId: item.lotId ?? null,
          productId: item.productId,
          priceEur: item.priceEur,
          weight: item.weight,
          quantity: item.quantity,
        })),
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update cart" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = cartDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 },
    );
  }

  const { sessionId, key, lotId } = parsed.data;
  const target = key ?? lotId;
  if (!target) {
    return NextResponse.json(
      { error: "key or lotId is required" },
      { status: 400 },
    );
  }

  try {
    const cart = await prisma.cart.findUnique({ where: { sessionId } });
    if (!cart) {
      return NextResponse.json({ success: true });
    }

    if (target.startsWith("product-")) {
      // General item: dedupe by productId, no lot.
      const productId = target.slice("product-".length);
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id, productId, lotId: null },
      });
    } else {
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id, lotId: target },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove item" },
      { status: 500 },
    );
  }
}
