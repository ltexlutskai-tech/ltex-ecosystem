import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

/**
 * GET /api/mobile/payments?customerId=xxx — Payment history
 * GET /api/mobile/payments?orderId=xxx — Payments for specific order
 *
 * POST /api/mobile/payments — Record a payment
 * Body: { orderId, method, amount, currency?, externalId? }
 */
export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  const orderId = request.nextUrl.searchParams.get("orderId");

  if (orderId) {
    const payments = await prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ payments });
  }

  if (!customerId) {
    return NextResponse.json({ error: "customerId or orderId required" }, { status: 400 });
  }

  const payments = await prisma.payment.findMany({
    where: { order: { customerId } },
    include: {
      order: { select: { id: true, code1C: true, status: true, totalEur: true, totalUah: true } },
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

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { orderId, method, amount, currency, externalId } = body as {
    orderId: string;
    method: string;
    amount: number;
    currency?: string;
    externalId?: string;
  };

  if (!orderId || !method || !amount) {
    return NextResponse.json({ error: "orderId, method, amount required" }, { status: 400 });
  }

  const validMethods = ["cash", "card", "bank_transfer", "online"];
  if (!validMethods.includes(method)) {
    return NextResponse.json({ error: `method must be one of: ${validMethods.join(", ")}` }, { status: 400 });
  }

  const payment = await prisma.payment.create({
    data: {
      orderId,
      method,
      amount,
      currency: currency ?? "UAH",
      externalId: externalId ?? null,
      status: method === "online" ? "pending" : "completed",
      paidAt: method !== "online" ? new Date() : null,
    },
  });

  return NextResponse.json({ id: payment.id, status: payment.status }, { status: 201 });
}
