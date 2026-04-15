import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireMobileSession } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/payments — payment history for the authenticated customer.
 * GET /api/mobile/payments?orderId=xxx — payments for a specific order (must belong to the customer).
 *
 * Auth: Bearer <mobile token>. customerId is derived from the token, never from the query.
 *
 * Payment creation is handled by 1C/admin — L-TEX does not accept online payments.
 */
export async function GET(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  const orderId = request.nextUrl.searchParams.get("orderId");

  if (orderId) {
    // Ensure the order belongs to the authenticated customer
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const payments = await prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ payments });
  }

  const payments = await prisma.payment.findMany({
    where: { order: { customerId } },
    include: {
      order: {
        select: {
          id: true,
          code1C: true,
          status: true,
          totalEur: true,
          totalUah: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const totalPaid = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount, 0);

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      orderCode: p.order.code1C ?? p.order.id.slice(0, 8),
      method: p.method,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    })),
    totalPaid,
  });
}
