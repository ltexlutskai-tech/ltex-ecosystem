import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canViewOrder } from "@/lib/manager/order-ownership";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const ok = await canViewOrder(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, code1C: true, phone: true, city: true },
      },
      items: {
        include: {
          product: { select: { id: true, name: true, slug: true } },
          lot: { select: { id: true, barcode: true } },
        },
      },
      shipments: true,
      payments: true,
    },
  });
  if (!order) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    order: {
      id: order.id,
      code1C: order.code1C,
      status: order.status,
      totalEur: order.totalEur,
      totalUah: order.totalUah,
      exchangeRate: order.exchangeRate,
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      customer: order.customer,
      items: order.items.map((i) => ({
        id: i.id,
        weight: i.weight,
        quantity: i.quantity,
        priceEur: i.priceEur,
        product: i.product,
        lot: i.lot,
      })),
      shipments: order.shipments,
      payments: order.payments,
    },
  });
}
