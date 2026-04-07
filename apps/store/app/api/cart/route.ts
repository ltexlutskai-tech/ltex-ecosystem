import { prisma } from "@ltex/db";
import { NextRequest, NextResponse } from "next/server";

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
      lotId: item.lotId,
      productId: item.productId,
      productName: item.product.name,
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

  const { sessionId, items } = body as {
    sessionId: string;
    items: Array<{
      lotId: string;
      productId: string;
      productName?: string;
      priceEur: number;
      weight: number;
      quantity: number;
    }>;
  };

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }

  try {
    // Upsert cart
    const cart = await prisma.cart.upsert({
      where: { sessionId },
      create: { sessionId },
      update: { updatedAt: new Date() },
    });

    // Delete existing items and recreate
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    if (items.length > 0) {
      await prisma.cartItem.createMany({
        data: items.map((item) => ({
          cartId: cart.id,
          lotId: item.lotId,
          productId: item.productId,
          priceEur: item.priceEur,
          weight: item.weight,
          quantity: item.quantity,
        })),
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update cart" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sessionId, lotId } = body as { sessionId: string; lotId: string };

  if (!sessionId || !lotId) {
    return NextResponse.json({ error: "sessionId and lotId are required" }, { status: 400 });
  }

  try {
    const cart = await prisma.cart.findUnique({ where: { sessionId } });
    if (!cart) {
      return NextResponse.json({ success: true });
    }

    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id, lotId },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to remove item" }, { status: 500 });
  }
}
