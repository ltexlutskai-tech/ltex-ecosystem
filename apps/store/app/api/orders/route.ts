import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { MIN_ORDER_KG } from "@ltex/shared";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { customer, items, notes } = body as {
    customer: { name: string; phone: string; telegram?: string };
    items: {
      lotId: string;
      productId: string;
      priceEur: number;
      weight: number;
      quantity: number;
    }[];
    notes?: string;
  };

  if (!customer?.name || !customer?.phone || !items?.length) {
    return NextResponse.json(
      { error: "Заповніть обов'язкові поля" },
      { status: 400 },
    );
  }

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

  // Create order + reserve lots in transaction
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

    // Reserve lots
    await tx.lot.updateMany({
      where: { id: { in: lotIds } },
      data: { status: "reserved" },
    });

    return ord;
  });

  return NextResponse.json({ orderId: order.id }, { status: 201 });
}
