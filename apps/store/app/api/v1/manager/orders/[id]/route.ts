import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canViewOrder } from "@/lib/manager/order-ownership";
import { isOrderLocked, isTransitionAllowed } from "@/lib/manager/order-status";
import { updateOrderSchema } from "@/lib/validations/manager-order";
import { updateOrderWithItems } from "@/lib/manager/order-create";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  // Ownership: manager — лише свої замовлення; admin — будь-яке.
  const ok = await canViewOrder(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  // Проведене в 1С замовлення (`posted`) заблоковане для будь-яких змін.
  if (isOrderLocked(existing.status)) {
    return NextResponse.json(
      { error: "Замовлення проведено в 1С — редагування заборонено" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = updateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Якщо змінюється статус — перевіряємо дозволеність переходу.
  let nextStatus: string | undefined;
  if (input.status && input.status !== existing.status) {
    if (!isTransitionAllowed(existing.status, input.status)) {
      return NextResponse.json(
        {
          error: `Перехід «${existing.status}» → «${input.status}» не дозволено`,
        },
        { status: 409 },
      );
    }
    nextStatus = input.status;
  }

  try {
    const order = await updateOrderWithItems(
      id,
      input,
      { userId: user.id },
      { nextStatus },
    );
    return NextResponse.json({
      id: order.id,
      code1C: order.code1C,
      status: order.status,
      totalEur: order.totalEur,
      totalUah: order.totalUah,
      exchangeRate: order.exchangeRate,
      notes: order.notes,
      priceTypeId: order.priceTypeId,
      deliveryMethod: order.deliveryMethod,
      cashOnDelivery: order.cashOnDelivery,
      assignedAgentUserId: order.assignedAgentUserId,
      exportTo1C: order.exportTo1C,
      updatedAt: order.updatedAt.toISOString(),
      customer: order.customer,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        lotId: i.lotId,
        priceEur: i.priceEur,
        weight: i.weight,
        quantity: i.quantity,
      })),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідний product/lot у items" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Order update failed", {
      orderId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка оновлення замовлення" },
      { status: 500 },
    );
  }
}
