import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { notifyNewOrder } from "@/lib/notifications";
import {
  sendOrderConfirmationEmail,
  type OrderEmailLineItem,
} from "@/lib/email";

const quickOrderSchema = z.object({
  customer: z.object({
    name: z.string().min(2, "Ім'я обов'язкове").max(100),
    phone: z.string().min(8, "Невірний номер телефону").max(30),
  }),
  lotId: z.string().min(1),
  productId: z.string().min(1),
  priceEur: z.number().positive(),
  weight: z.number().positive(),
  quantity: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`quick-order:${ip}`, {
    windowMs: 60_000,
    max: 3,
  });
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

  const parsed = quickOrderSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Помилка валідації";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { customer, lotId, productId, priceEur, weight, quantity } =
    parsed.data;

  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    select: { id: true, status: true, barcode: true },
  });
  if (!lot) {
    return NextResponse.json({ error: "Лот не знайдено" }, { status: 404 });
  }
  if (lot.status !== "free" && lot.status !== "on_sale") {
    return NextResponse.json(
      { error: "Лот вже зарезервовано" },
      { status: 409 },
    );
  }

  // Customer.phone is NOT @unique in the schema — use findFirst + create.
  let dbCustomer = await prisma.customer.findFirst({
    where: { phone: customer.phone },
  });
  if (!dbCustomer) {
    dbCustomer = await prisma.customer.create({
      data: { name: customer.name, phone: customer.phone },
    });
  }

  const latestRate = await prisma.exchangeRate.findFirst({
    where: { currencyFrom: "EUR", currencyTo: "UAH" },
    orderBy: { date: "desc" },
  });
  const rate = latestRate?.rate ?? 0;
  const totalUah = Math.round(priceEur * rate * 100) / 100;

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const ord = await tx.order.create({
        data: {
          customerId: dbCustomer.id,
          status: "pending",
          totalEur: priceEur,
          totalUah,
          exchangeRate: rate,
          notes: "Швидке замовлення з картки лоту",
          items: {
            create: [
              {
                lotId,
                productId,
                priceEur,
                weight,
                quantity,
              },
            ],
          },
        },
      });
      await tx.lot.update({
        where: { id: lotId },
        data: { status: "reserved" },
      });
      return ord;
    });
  } catch {
    return NextResponse.json(
      { error: "Помилка створення замовлення. Спробуйте пізніше." },
      { status: 500 },
    );
  }

  notifyNewOrder({
    orderId: order.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    totalEur: priceEur,
    totalUah,
    itemCount: 1,
    totalWeight: weight,
  }).catch((e) => console.error("[L-TEX] notifyNewOrder failed:", e));

  if (dbCustomer.email) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    const items: OrderEmailLineItem[] = [
      {
        productName: product?.name ?? "Товар",
        barcode: lot.barcode,
        weight,
        quantity,
        priceEur,
      },
    ];
    sendOrderConfirmationEmail({
      orderId: order.id,
      customerName: customer.name,
      customerEmail: dbCustomer.email,
      totalEur: priceEur,
      totalUah,
      itemCount: 1,
      totalWeight: weight,
      items,
    }).catch((e) =>
      console.error("[L-TEX] sendOrderConfirmationEmail failed:", e),
    );
  }

  return NextResponse.json({ orderId: order.id }, { status: 201 });
}
