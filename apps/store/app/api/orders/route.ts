import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { MIN_ORDER_KG } from "@ltex/shared";
import { orderSchema } from "@/lib/validations";
import { notifyNewOrder } from "@/lib/notifications";
import {
  sendOrderConfirmationEmail,
  type OrderEmailLineItem,
} from "@/lib/email";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Rate limit: 5 orders per minute per IP
  const ip = getClientIp(request);
  const limit = rateLimit(`orders:${ip}`, { windowMs: 60_000, max: 5 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Забагато запитів. Спробуйте через хвилину." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Помилка валідації";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { customer, items, notes } = parsed.data;

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight < MIN_ORDER_KG) {
    return NextResponse.json(
      { error: `Мінімальне замовлення від ${MIN_ORDER_KG} кг` },
      { status: 400 },
    );
  }

  // Verify all concrete lots are still free (general items skip this check —
  // manager picks an available lot when confirming the order).
  const lotIds = items
    .map((i) => i.lotId)
    .filter((id): id is string => Boolean(id));
  if (lotIds.length > 0) {
    const lots = await prisma.lot.findMany({
      where: { id: { in: lotIds }, status: "free" },
    });
    if (lots.length !== lotIds.length) {
      return NextResponse.json(
        { error: "Деякі лоти вже зарезервовані" },
        { status: 409 },
      );
    }
  }

  // Find or create customer
  let dbCustomer = await prisma.customer.findFirst({
    where: { phone: customer.phone },
  });
  if (!dbCustomer) {
    dbCustomer = await prisma.customer.create({
      data: {
        name: customer.name,
        phone: customer.phone,
        telegram: customer.telegram ?? null,
      },
    });
  }

  const totalEur = items.reduce((sum, i) => sum + i.priceEur, 0);

  // Get latest EUR → UAH rate
  const latestRate = await prisma.exchangeRate.findFirst({
    where: { currencyFrom: "EUR", currencyTo: "UAH" },
    orderBy: { date: "desc" },
  });
  const rate = latestRate?.rate ?? 0;
  const totalUah = Math.round(totalEur * rate * 100) / 100;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const ord = await tx.order.create({
        data: {
          customerId: dbCustomer.id,
          status: "pending",
          totalEur,
          totalUah,
          exchangeRate: rate,
          notes: notes ?? null,
          items: {
            create: items.map((i) => ({
              lotId: i.lotId ?? null,
              productId: i.productId,
              priceEur: i.priceEur,
              weight: i.weight,
              quantity: i.quantity,
            })),
          },
        },
      });

      if (lotIds.length > 0) {
        await tx.lot.updateMany({
          where: { id: { in: lotIds } },
          data: { status: "reserved" },
        });
      }

      return ord;
    });

    // Send notifications (non-blocking, doesn't affect response)
    notifyNewOrder({
      orderId: order.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      totalEur,
      totalUah,
      itemCount: items.length,
      totalWeight,
    }).catch(() => {});

    // Send confirmation email to customer (if email provided)
    if (dbCustomer.email) {
      // Hydrate email line-items with product names + barcodes for the
      // two-section template ("Конкретні лоти" + "Загальні позиції").
      const productIds = Array.from(new Set(items.map((i) => i.productId)));
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      });
      const lotMap = new Map<string, string>();
      if (lotIds.length > 0) {
        const lotsForEmail = await prisma.lot.findMany({
          where: { id: { in: lotIds } },
          select: { id: true, barcode: true },
        });
        for (const lot of lotsForEmail) lotMap.set(lot.id, lot.barcode);
      }
      const productNameMap = new Map(products.map((p) => [p.id, p.name]));

      const emailItems: OrderEmailLineItem[] = items.map((i) => ({
        productName: productNameMap.get(i.productId) ?? "Товар",
        barcode: i.lotId ? (lotMap.get(i.lotId) ?? null) : null,
        weight: i.weight,
        quantity: i.quantity,
        priceEur: i.priceEur,
      }));

      sendOrderConfirmationEmail({
        orderId: order.id,
        customerName: customer.name,
        customerEmail: dbCustomer.email,
        totalEur,
        totalUah,
        itemCount: items.length,
        totalWeight,
        items: emailItems,
      }).catch(() => {});
    }

    return NextResponse.json({ orderId: order.id }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Помилка створення замовлення. Спробуйте пізніше." },
      { status: 500 },
    );
  }
}
