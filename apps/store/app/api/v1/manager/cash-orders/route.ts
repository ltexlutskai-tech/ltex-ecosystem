import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/sale-ownership";
import { createCashOrderWithChange } from "@/lib/manager/cash-order";
import { createCashOrderSchema } from "@/lib/validations/manager-cash-order";

/**
 * Блок «Реалізація» — Етап 4. Створення касового ордера (оплати) по реалізації.
 *
 * Сума до оплати = round(Sale.totalEur × Sale.exchangeRateEur) грн. Здача
 * рахується через курси-знімок реалізації (EUR/USD), при здачі > 0
 * авто-створюється ордер-розхід.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createCashOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const sale = await prisma.sale.findUnique({
    where: { id: input.saleId },
    select: {
      id: true,
      totalEur: true,
      exchangeRateEur: true,
      exchangeRateUsd: true,
      cashOnDelivery: true,
      customer: { select: { code1C: true } },
    },
  });
  if (!sale) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  // Ownership: manager — лише свої клієнти; admin — будь-кого.
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (!sale.customer.code1C || !myCodes.includes(sale.customer.code1C)) {
      return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
    }
  }

  const rates = { eur: sale.exchangeRateEur, usd: sale.exchangeRateUsd };
  const dueUah = Math.round(sale.totalEur * sale.exchangeRateEur);

  try {
    const { income, change } = await createCashOrderWithChange({
      saleId: sale.id,
      type: "income",
      amounts: {
        uah: input.amountUah,
        eur: input.amountEur,
        usd: input.amountUsd,
        uahCashless: input.amountUahCashless,
      },
      bankAccount: input.bankAccount ?? null,
      cashFlowArticle: input.cashFlowArticle ?? null,
      comment: input.comment ?? null,
      changeCurrency: input.changeCurrency,
      dueUah,
      rates,
      agentUserId: user.id,
    });

    return NextResponse.json({ income, change }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідна реалізація" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Cash order create failed", {
      saleId: input.saleId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка створення оплати" },
      { status: 500 },
    );
  }
}
