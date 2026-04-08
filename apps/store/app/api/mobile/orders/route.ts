import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

/**
 * GET /api/mobile/orders?customerId=xxx — Full order history with items, shipments, payments
 * GET /api/mobile/orders?customerId=xxx&orderId=yyy — Single order detail
 */
export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  const orderId = request.nextUrl.searchParams.get("orderId");

  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  // Single order detail
  if (orderId) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        items: true,
        shipments: true,
        payments: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Fetch product names
    const productIds = [...new Set(order.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, slug: true, quality: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const paidAmount = order.payments
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + p.amount, 0);

    return NextResponse.json({
      order: {
        id: order.id,
        code1C: order.code1C,
        status: order.status,
        totalEur: order.totalEur,
        totalUah: order.totalUah,
        exchangeRate: order.exchangeRate,
        notes: order.notes,
        createdAt: order.createdAt,
        items: order.items.map((i) => ({
          id: i.id,
          lotId: i.lotId,
          productId: i.productId,
          productName: productMap.get(i.productId)?.name ?? "?",
          productSlug: productMap.get(i.productId)?.slug,
          quality: productMap.get(i.productId)?.quality,
          priceEur: i.priceEur,
          weight: i.weight,
          quantity: i.quantity,
        })),
        shipments: order.shipments.map((s) => ({
          id: s.id,
          trackingNumber: s.trackingNumber,
          carrier: s.carrier,
          status: s.status,
          statusText: s.statusText,
          estimatedDate: s.estimatedDate,
          recipientCity: s.recipientCity,
          recipientBranch: s.recipientBranch,
        })),
        payments: order.payments.map((p) => ({
          id: p.id,
          method: p.method,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          paidAt: p.paidAt,
        })),
        paidAmount,
        remainingAmount: order.totalUah - paidAmount,
      },
    });
  }

  // Order list
  const orders = await prisma.order.findMany({
    where: { customerId },
    include: {
      _count: { select: { items: true } },
      shipments: {
        select: { trackingNumber: true, status: true, statusText: true },
      },
      payments: { select: { amount: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    orders: orders.map((o) => {
      const paidAmount = o.payments
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + p.amount, 0);

      return {
        id: o.id,
        code1C: o.code1C,
        status: o.status,
        totalEur: o.totalEur,
        totalUah: o.totalUah,
        itemCount: o._count.items,
        createdAt: o.createdAt,
        shipment: o.shipments[0] ?? null,
        paidAmount,
        isPaid: paidAmount >= o.totalUah,
      };
    }),
  });
}
