import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { MIN_ORDER_KG } from "@ltex/shared";
import { z } from "zod";

const orderSchema = z.object({
  customer: z.object({
    name: z.string().min(1, "Ім'я обов'язкове").max(200),
    phone: z.string().min(10, "Невірний номер телефону").max(20),
    telegram: z.string().max(100).optional(),
  }),
  items: z
    .array(
      z.object({
        lotId: z.string().min(1),
        productId: z.string().min(1),
        priceEur: z.number().positive(),
        weight: z.number().positive(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Додайте хоча б один лот"),
  notes: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Невалідний JSON" },
      { status: 400 },
    );
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

  // Verify all lots are still free
  const lotIds = items.map((i) => i.lotId);
  const lots = await prisma.lot.findMany({
    where: { id: { in: lotIds }, status: "free" },
  });
  if (lots.length !== lotIds.length) {
    return NextResponse.json(
      { error: "Деякі лоти вже зарезервовані" },
      { status: 409 },
    );
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
              lotId: i.lotId,
              productId: i.productId,
              priceEur: i.priceEur,
              weight: i.weight,
              quantity: i.quantity,
            })),
          },
        },
      });

      await tx.lot.updateMany({
        where: { id: { in: lotIds } },
        data: { status: "reserved" },
      });

      return ord;
    });

    return NextResponse.json({ orderId: order.id }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Помилка створення замовлення. Спробуйте пізніше." },
      { status: 500 },
    );
  }
}
