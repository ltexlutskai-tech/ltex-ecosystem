import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = request.nextUrl.searchParams.get("since");
  const statusFilter = request.nextUrl.searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (since) {
    where.updatedAt = { gte: new Date(since) };
  }
  if (statusFilter) {
    where.status = statusFilter;
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: true,
      items: {
        include: {
          lot: { select: { barcode: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const exported = orders.map((order) => ({
    id: order.id,
    code1C: order.code1C,
    status: order.status,
    customer: {
      code1C: order.customer.code1C,
      name: order.customer.name,
      phone: order.customer.phone,
      email: order.customer.email,
      telegram: order.customer.telegram,
    },
    totalEur: order.totalEur,
    totalUah: order.totalUah,
    exchangeRate: order.exchangeRate,
    notes: order.notes,
    items: order.items.map((item) => ({
      barcode: item.lot.barcode,
      productId: item.productId,
      priceEur: item.priceEur,
      weight: item.weight,
      quantity: item.quantity,
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }));

  // Log the export
  await prisma.syncLog.create({
    data: {
      entity: "order_export",
      action: "export",
      payload: { count: exported.length, since, status: statusFilter },
    },
  });

  return NextResponse.json({ orders: exported, count: exported.length });
}
